"""R1 地图契约测试

验证 docs/r1/CONTRACT.md 与 backend/app/services/tencent_map_service.py 一致。
全部使用 fixtures/tencent/ 下的**腾讯真实响应**，不 mock 上游结构——
这是本轮的核心要求：契约必须由真实响应验证，而不是由想象验证。
"""

import json
import pathlib

import pytest

from app.models.schemas import NearbyStationResponse, TransitResponse
from app.services import tencent_map_service as svc

FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "tencent"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# ============ 附近站点 ============

def test_nearby_data_is_array_not_object():
    """POLL-158 曾把 data 改成对象，前端 Array.isArray 会失败。契约要求数组。"""
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    assert isinstance(resp.data, list)
    assert isinstance(resp, NearbyStationResponse)


def test_nearby_fields_complete():
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    assert len(resp.data) > 0
    for s in resp.data:
        assert s.id, "站点缺 id"
        assert s.name, "站点缺 name"
        assert s.type in ("metro", "bus", "other")
        assert s.location.longitude > 100 and s.location.latitude > 0
        assert s.distance >= 0


def test_nearby_type_classified_from_category():
    """category '基础设施:交通设施:地铁站' 应识别为 metro"""
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    assert all(s.type == "metro" for s in resp.data), [s.type for s in resp.data]


def test_nearby_lines_split_from_address():
    """腾讯把途经线路放在 address，需切分成 lines"""
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    assert any(s.lines for s in resp.data)


def test_nearby_sorted_by_distance():
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    distances = [s.distance for s in resp.data]
    assert distances == sorted(distances)


def test_nearby_distance_is_int_meters():
    """上游 _distance 是浮点（如 732.46），契约要求整数米"""
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    for s in resp.data:
        assert isinstance(s.distance, int)


def test_nearby_coord_order_is_lng_lat():
    """上游 'lat,lng'，我方 Location 必须 longitude/latitude 不串位"""
    raw = load("place_metro_ok.json")["data"][0]
    resp = svc.parse_nearby_stations(load("place_metro_ok.json"))
    first = resp.data[0]
    # 按距离排序后第一条未必是上游第一条，按 id 找
    matched = next(s for s in resp.data if s.id == str(raw["id"]))
    assert matched.location.latitude == pytest.approx(raw["location"]["lat"])
    assert matched.location.longitude == pytest.approx(raw["location"]["lng"])


# ============ 公交换乘 ============

def test_transit_data_is_array():
    """POLL-149 的 data 是单对象；上游返回多方案，契约要求数组"""
    resp = svc.parse_transit(load("transit_ok.json"))
    assert isinstance(resp.data, list)
    assert len(resp.data) >= 1
    assert isinstance(resp, TransitResponse)


def test_transit_duration_converted_minutes_to_seconds():
    """direction/v1 的 duration 是分钟。17835m/80min → 4800s。
    若按秒理解则速度 223 m/s，物理不可能——这是本契约最关键的一条。"""
    raw = load("transit_ok.json")
    resp = svc.parse_transit(raw)
    first_raw = raw["result"]["routes"][0]
    assert first_raw["duration"] == 80  # 上游确实是分钟
    assert resp.data[0].duration == 80 * 60


def test_transit_fare_converted_fen_to_yuan():
    """price 单位分，500 → 5.00 元"""
    raw = load("transit_ok.json")
    resp = svc.parse_transit(raw)
    assert raw["result"]["routes"][0]["price"] == 500
    assert resp.data[0].fare == 5.0


def test_transit_transit_step_distance_not_zero():
    """TRANSIT 段在 step 层的 distance/duration 为 null，
    必须从 lines[0] 取，否则该段长度为 0（POLL-152/153 都会踩）。"""
    resp = svc.parse_transit(load("transit_ok.json"))
    transit_steps = [s for r in resp.data for s in r.steps if s.mode == "TRANSIT"]
    assert transit_steps, "应至少有一个 TRANSIT 段"
    for s in transit_steps:
        assert s.distance > 0, f"TRANSIT 段距离为 0: {s}"
        assert s.duration > 0, f"TRANSIT 段耗时为 0: {s}"
        assert s.line, "TRANSIT 段缺线路名"
        assert s.from_name and s.to_name


def test_transit_walking_step_has_instruction():
    resp = svc.parse_transit(load("transit_ok.json"))
    walking = [s for r in resp.data for s in r.steps if s.mode == "WALKING"]
    assert walking
    assert any(s.instruction for s in walking)


def test_transit_transfers_equals_ride_segments_minus_one():
    resp = svc.parse_transit(load("transit_ok.json"))
    for route in resp.data:
        rides = [s for s in route.steps if s.mode != "WALKING"]
        assert route.transfers == max(len(rides) - 1, 0)


def test_transit_segment_sum_matches_total():
    """各段距离之和应接近路线总距离（允许上游四舍五入误差）"""
    resp = svc.parse_transit(load("transit_ok.json"))
    route = resp.data[0]
    total_steps = sum(s.distance for s in route.steps)
    assert abs(total_steps - route.distance) <= max(50, route.distance * 0.02)


# ============ 错误处理 ============

def test_bad_key_raises_and_is_degradable():
    with pytest.raises(svc.TencentError) as e:
        svc.parse_nearby_stations(load("err_bad_key.json"))
    assert e.value.status == svc.STATUS_BAD_KEY
    assert e.value.degradable


def test_no_auth_raises_and_is_degradable():
    """page_size=50 实测返回 113 此功能未被授权"""
    with pytest.raises(svc.TencentError) as e:
        svc.parse_nearby_stations(load("err_no_auth.json"))
    assert e.value.status == svc.STATUS_NO_AUTH
    assert e.value.degradable


def test_bad_coord_is_not_degradable():
    """纬度越界是调用方错误，应回 400 而不是静默降级"""
    with pytest.raises(svc.TencentError) as e:
        svc.parse_nearby_stations(load("err_bad_coord.json"))
    assert e.value.status == svc.STATUS_BAD_PARAM
    assert e.value.is_bad_param
    assert not e.value.degradable


def test_degraded_response_never_fakes_stations():
    resp = svc.degraded_nearby("Key 未配置")
    assert resp.degraded is True
    assert resp.data == []
    assert resp.success is False


def test_degraded_transit_never_fakes_routes():
    resp = svc.degraded_transit("上游失败")
    assert resp.degraded is True
    assert resp.data == []


# ============ 导航链接 ============

def test_nav_url_provider_and_coord_order():
    from app.models.schemas import Location

    url = svc.build_nav_url("walk", "故宫", Location(longitude=116.397, latitude=39.916))
    assert "apis.map.qq.com/uri/v1/routeplan" in url
    assert "type=walk" in url
    # 腾讯 tocoord 是 lat,lng
    assert "tocoord=39.916,116.397" in url


def test_nav_url_mode_mapping():
    assert "type=drive" in svc.build_nav_url("drive", "X")
    assert "type=bus" in svc.build_nav_url("transit", "X")
