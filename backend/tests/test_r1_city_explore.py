"""城市探索契约测试（docs/r1/CONTRACT.md §5）

与 §2 附近站点成对：那边验「米级半径内的站点」，这边验「整座城市的去处」。

fixtures 是腾讯真实响应（已剔除 request_id），不是手写 mock —— §5 的几个关键
口径（region 检索不带 _distance、结果混着附属设施、同名他市行政区）只有真响应能暴露。
"""

import asyncio
import json
import pathlib

import pytest

from app.models.schemas import CityExploreResponse, Location
from app.services import tencent_map_service as svc

FIXTURES = pathlib.Path(__file__).parent / "fixtures" / "tencent"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


HANGZHOU = Location(longitude=120.210792, latitude=30.246026)


# ============ 城市解析 ============

def test_city_center_from_address_geocode():
    """geocoder/v1 的地址检索 → 城市名 + 中心坐标"""
    center = svc.parse_city_center(load("geocoder_city_ok.json"))
    assert center is not None
    assert center.name == "杭州市"
    assert center.location.longitude == pytest.approx(120.210792, abs=1e-4)
    assert center.location.latitude == pytest.approx(30.246026, abs=1e-4)


def test_city_center_rejects_low_reliability():
    """reliability < 7 是模糊匹配（如把「杭州道街道」当杭州），宁可不给也不猜"""
    payload = load("geocoder_city_ok.json")
    payload["result"]["reliability"] = 3
    assert svc.parse_city_center(payload) is None


def test_reverse_geocode_returns_city_name_only():
    """坐标 → 城市名，用于「我在哪座城市」

    只回名字不回坐标：逆地理编码的 `result.location` 是传入坐标本身，
    不是城市中心，拿它当检索原点会污染 distance/score（契约 §5）。
    """
    assert svc.parse_reverse_city_name(load("geocoder_reverse_ok.json")) == "杭州市"


def test_reverse_geocode_falls_back_to_province():
    """直辖市/城市名为空时退回 province"""
    payload = load("geocoder_reverse_ok.json")
    payload["result"]["address_component"]["city"] = ""
    payload["result"]["address_component"]["province"] = "北京市"
    assert svc.parse_reverse_city_name(payload) == "北京市"


def test_reverse_geocode_without_city_name_returns_none():
    payload = load("geocoder_reverse_ok.json")
    payload["result"]["address_component"]["city"] = ""
    payload["result"]["address_component"]["province"] = ""
    assert svc.parse_reverse_city_name(payload) is None


def test_resolve_city_from_coord_uses_city_center_not_user_location():
    """坐标路径必须两跳：反查城市名 → 再查城市中心

    直接拿逆地理编码的 location 当原点，会让同城所有用户共用第一个请求者的
    位置（缓存键只有 (城市, 类别)），并把「城市探索」退化成「附近」。
    """
    from app.services.tencent_map_client import TencentMapService

    reverse_payload = load("geocoder_reverse_ok.json")
    center_payload = load("geocoder_city_ok.json")
    calls = []

    service = TencentMapService(key="dummy")

    async def fake_get(path, params):
        calls.append((path, dict(params)))
        if "location" in params:
            return reverse_payload
        return center_payload

    service._get = fake_get  # type: ignore[method-assign]

    # 用户坐标故意选在离杭州中心 12 km 外的位置
    center = asyncio.run(service._resolve_city(None, 120.300000, 30.350000))

    assert center is not None
    assert center.name == "杭州市"
    # 原点是城市中心（geocoder_city_ok 的坐标），不是传进来的用户坐标
    assert center.location.longitude == pytest.approx(120.210792, abs=1e-6)
    assert center.location.latitude == pytest.approx(30.246026, abs=1e-6)
    assert calls[0][1].get("location") == "30.35,120.3"
    assert calls[1][1].get("address") == "杭州市"


def test_resolve_city_prefers_city_name_over_coord():
    """城市名与坐标同传时以城市名为准：少打一次上游，也不会反查到别的城市

    小程序主流程就是两个都传，之前后端优先取坐标，等于恒走反查路径。
    """
    from app.services.tencent_map_client import TencentMapService

    calls = []
    service = TencentMapService(key="dummy")

    async def fake_get(path, params):
        calls.append((path, dict(params)))
        return load("geocoder_city_ok.json")

    service._get = fake_get  # type: ignore[method-assign]

    center = asyncio.run(service._resolve_city("杭州", 116.407400, 39.904200))

    assert center is not None and center.name == "杭州市"
    assert len(calls) == 1, "有城市名时不该再按坐标反查"
    assert calls[0][1].get("address") == "杭州"


def test_resolve_city_without_name_and_coord_returns_none():
    """既没城市名也没坐标 → 没有检索原点，不猜一个城市"""
    from app.services.tencent_map_client import TencentMapService

    service = TencentMapService(key="dummy")
    assert asyncio.run(service._resolve_city(None, None, None)) is None


def test_city_center_missing_location_returns_none():
    payload = load("geocoder_city_ok.json")
    payload["result"].pop("location")
    assert svc.parse_city_center(payload) is None


# ============ 合并 / 去重 / 过滤 ============

def test_city_spots_distance_computed_by_us():
    """region 检索的上游响应里**没有** _distance（fixture 可证），距离必须我方自算"""
    raw = load("place_city_spots_ok.json")
    assert all("_distance" not in poi for poi in raw["data"]), "上游 region 检索本就不给距离"

    spots = svc.merge_city_spots([raw], "spot", HANGZHOU)
    assert spots
    for spot in spots:
        assert isinstance(spot.distance, int)
        assert spot.distance > 0
        # 杭州西湖到城市中心约 9 km，量级必须在市内
        assert spot.distance < 200_000


def test_city_spots_merged_across_keywords_dedup_by_id():
    """同一 POI 被两个关键词同时命中时只保留一条（按上游 id 去重）"""
    raw = load("place_city_spots_ok.json")
    once = svc.merge_city_spots([raw], "spot", HANGZHOU, limit=50)
    twice = svc.merge_city_spots([raw, raw], "spot", HANGZHOU, limit=50)

    assert len(once) == len(twice)
    ids = [s.id for s in twice]
    assert len(ids) == len(set(ids))


def test_city_spots_filters_service_facilities():
    """服务中心 / 售票处 / 停车场这类附属设施不是「去处」，必须过滤"""
    raw = load("place_city_spots_ok.json")
    # 真实响应里本来就混着这类 POI，先确认过滤后一条不剩
    spots = svc.merge_city_spots([raw], "spot", HANGZHOU, limit=50)
    for spot in spots:
        assert "服务中心" not in spot.name
        assert "售票" not in spot.name
        assert "停车场" not in spot.name
        assert "交通设施" not in spot.category


def test_city_spots_never_empty_list_for_known_city():
    """杭州是知名城市，真实响应必须能捞出去处（防止过滤规则过严把真景点也删了）"""
    spots = svc.merge_city_spots([load("place_city_spots_ok.json")], "spot", HANGZHOU, limit=20)
    assert len(spots) >= 10, [s.name for s in spots]
    names = " ".join(s.name for s in spots)
    assert "西湖" in names, "西湖是杭州最标志性的去处，不应被过滤"


def test_city_spots_sorted_by_score_desc_then_distance():
    spots = svc.merge_city_spots([load("place_city_spots_ok.json")], "spot", HANGZHOU, limit=20)
    for prev, cur in zip(spots, spots[1:]):
        assert prev.score > cur.score or (
            prev.score == cur.score and prev.distance <= cur.distance
        )


def test_city_spots_respect_limit():
    spots = svc.merge_city_spots([load("place_city_spots_ok.json")], "spot", HANGZHOU, limit=3)
    assert len(spots) == 3


def test_score_prefers_high_grade_category_over_nearby_minor():
    """打分不能退化成「按距离排序」：国家级景点在 9 km 应压过 0.8 km 的普通风景名胜"""
    far_high = svc.score_city_spot("旅游景点:国家级景点", 9000)
    near_low = svc.score_city_spot("旅游景点:风景名胜", 800)
    assert far_high > near_low


def test_score_decays_with_distance():
    near = svc.score_city_spot("旅游景点:风景名胜", 1000)
    far = svc.score_city_spot("旅游景点:风景名胜", 100_000)
    assert near > far


# ============ 美食类别 ============

def test_food_kind_keeps_restaurants():
    spots = svc.merge_city_spots(
        [load("place_city_food_ok.json")], "food", HANGZHOU, limit=20
    )
    assert len(spots) >= 10
    for spot in spots:
        assert spot.kind == "food"
        assert "美食" in spot.category


# ============ 降级 ============

def test_degraded_city_explore_never_fakes_places():
    resp = svc.degraded_city_explore("Key 未配置")
    assert isinstance(resp, CityExploreResponse)
    assert resp.degraded is True
    assert resp.success is False
    assert resp.data == []
    assert resp.city is None


def test_unknown_kind_rejected_as_bad_param():
    """未知类别是调用方错误 → 400，不是降级"""
    from app.services.tencent_map_client import TencentMapService

    service = TencentMapService(key="dummy")
    import asyncio

    with pytest.raises(svc.TencentError) as exc:
        asyncio.run(service.city_explore(kind="nightlife", city="杭州"))
    assert exc.value.is_bad_param


def test_missing_key_degrades_without_upstream_call():
    from app.services.tencent_map_client import TencentMapService

    service = TencentMapService(key="")
    import asyncio

    resp = asyncio.run(service.city_explore(kind="spot", city="杭州"))
    assert resp.degraded is True
    assert resp.data == []
    assert "Key 未配置" in resp.message


def test_missing_city_and_coord_degrades():
    """既没城市名也没坐标 → 无法定位检索原点，降级而不是默认北京"""
    from app.services.tencent_map_client import TencentMapService

    service = TencentMapService(key="dummy")
    import asyncio

    resp = asyncio.run(service.city_explore(kind="spot"))
    assert resp.degraded is True
    assert resp.data == []


def test_cache_hit_still_honours_limit():
    """缓存键不含 limit：先要 10 条再要 5 条，第二次必须只回 5 条"""
    from app.services import tencent_map_client as client_mod

    client_mod._city_cache.clear()
    center = svc.parse_city_center(load("geocoder_city_ok.json"))
    payloads = [load("place_city_spots_ok.json")]
    spots = svc.merge_city_spots(payloads, "spot", center.location, client_mod.CITY_EXPLORE_CACHE_SIZE)
    full = CityExploreResponse(success=True, degraded=False, message="", city=center, data=spots)
    client_mod._city_cache[(center.name, "spot")] = (__import__("time").monotonic(), full)

    cached = client_mod._city_cache[(center.name, "spot")][1]
    assert len(cached.model_copy(update={"data": cached.data[:5]}).data) == 5
    client_mod._city_cache.clear()
