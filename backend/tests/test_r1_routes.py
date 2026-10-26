"""R1 路由端到端测试

两种模式：
  1. 无 Key：断言降级行为（degraded=true、data 为空、不伪造）
  2. 有 Key（TENCENT_MAP_KEY 环境变量）：真打腾讯上游，验证契约字段

第 2 种是本轮的核心——之前的 10 个 done 全部只跑 MockTransport，
从未验证过真实响应。这里补上。
"""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.r1_map import router as r1_router

# 只挂 R1 路由，不拉起完整 app（完整 app 依赖 hello_agents/LLM，
# 与本契约无关，不应成为契约测试的前置条件）
app = FastAPI()
app.include_router(r1_router, prefix="/api")

client = TestClient(app)

HAS_KEY = bool(os.getenv("TENCENT_MAP_KEY"))

# 北京中关村 → 天安门，实测有稳定换乘方案
FROM = {"from_longitude": 116.307490, "from_latitude": 39.984154}
TO = {"to_longitude": 116.397499, "to_latitude": 39.908722}


def test_nav_link_always_works_without_key():
    """导航链接纯本地拼接，不依赖 Key"""
    r = client.get("/api/map/nav-link", params={"destination": "故宫", "mode": "walk"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["provider"] == "tencent"
    assert "apis.map.qq.com" in body["data"]["url"]


def test_nav_link_rejects_bad_mode():
    r = client.get("/api/map/nav-link", params={"destination": "X", "mode": "fly"})
    assert r.status_code == 422


def test_nearby_rejects_bad_coord():
    """纬度越界应在 FastAPI 层被挡下（契约 §1.2：348 类错误不回降级）"""
    r = client.get(
        "/api/map/nearby-station",
        params={"longitude": 116.3, "latitude": 999},
    )
    assert r.status_code == 422


@pytest.mark.skipif(HAS_KEY, reason="有 Key 时走真实上游，不测降级")
def test_nearby_degrades_without_key():
    r = client.get(
        "/api/map/nearby-station",
        params={"longitude": 116.307490, "latitude": 39.984154, "radius": 1000},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is True
    assert body["data"] == []


@pytest.mark.skipif(HAS_KEY, reason="有 Key 时走真实上游，不测降级")
def test_transit_degrades_without_key():
    r = client.get("/api/map/transit", params={**FROM, **TO})
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is True
    assert body["data"] == []


# ============ 以下为真实上游验证（需 TENCENT_MAP_KEY）============

@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_nearby_returns_real_stations():
    r = client.get(
        "/api/map/nearby-station",
        params={"longitude": 116.307490, "latitude": 39.984154, "radius": 1000},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert isinstance(body["data"], list) and len(body["data"]) > 0

    for s in body["data"]:
        assert s["id"] and s["name"]
        assert s["type"] in ("metro", "bus", "other")
        assert s["location"]["longitude"] > 100
        assert s["location"]["latitude"] > 0
        assert isinstance(s["distance"], int)
        # 半径内（留 20% 余量，上游按路网距离不按直线）
        assert s["distance"] <= 1200

    distances = [s["distance"] for s in body["data"]]
    assert distances == sorted(distances)


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_transit_units_are_correct():
    r = client.get("/api/map/transit", params={**FROM, **TO})
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert isinstance(body["data"], list) and len(body["data"]) > 0

    route = body["data"][0]
    # 中关村→天安门约 18km，地铁 80 分钟 → 4800 秒
    assert 10_000 < route["distance"] < 30_000
    assert 1800 < route["duration"] < 7200, "duration 必须是秒，不是分钟"
    # 物理合理性：平均速度应在 1~20 m/s（步行到地铁的混合）
    speed = route["distance"] / route["duration"]
    assert 1.0 < speed < 20.0, f"平均速度 {speed:.2f} m/s 不合理，单位可能错了"
    assert route["fare"] is not None and 0 < route["fare"] < 50
    assert route["transfers"] >= 0
    assert len(route["steps"]) > 0

    transit_steps = [s for s in route["steps"] if s["mode"] != "WALKING"]
    assert transit_steps, "应有乘坐段"
    for s in transit_steps:
        assert s["distance"] > 0, "乘坐段距离不能为 0（step 层为 null，需从 lines 取）"
        assert s["duration"] > 0
        assert s["line"]


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_nearby_multi_keyword_merges_metro_and_bus():
    """契约 §1.6：逗号串不能透传给上游，必须逐个检索后合并

    实测上游 keyword 是单串精确匹配：传 "地铁站,公交站" 只回公交站，
    地铁站整类丢失。这条测试锁死合并行为。
    """
    r = client.get(
        "/api/map/nearby-station",
        params={
            "longitude": 116.316478,
            "latitude": 39.984055,
            "radius": 1500,
            "keyword": "地铁站,公交站",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False

    types = {s["type"] for s in body["data"]}
    assert "metro" in types, "多关键词必须带回地铁站"
    assert "bus" in types, "多关键词必须带回公交站"

    # 合并后仍按距离升序、且无重复站点
    distances = [s["distance"] for s in body["data"]]
    assert distances == sorted(distances)
    ids = [s["id"] for s in body["data"] if s["id"]]
    assert len(ids) == len(set(ids)), "合并后不应出现重复站点"


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_nearby_cache_reduces_upstream_calls():
    """同坐标 60s 内应命中缓存，保护日 PV 11000 额度"""
    params = {"longitude": 116.307490, "latitude": 39.984154, "radius": 800}
    first = client.get("/api/map/nearby-station", params=params).json()
    second = client.get("/api/map/nearby-station", params=params).json()
    assert first == second


# ============ 城市探索（契约 §5）============

def test_city_explore_rejects_unknown_kind():
    """未知类别是入参错误 → 422（FastAPI 层拦截），不是降级"""
    r = client.get("/api/map/city-explore", params={"kind": "nightlife", "city": "杭州"})
    assert r.status_code == 422


def test_city_explore_rejects_bad_coord():
    r = client.get(
        "/api/map/city-explore",
        params={"kind": "spot", "longitude": 116.3, "latitude": 999},
    )
    assert r.status_code == 422


@pytest.mark.skipif(HAS_KEY, reason="有 Key 时走真实上游，不测降级")
def test_city_explore_degrades_without_key():
    r = client.get("/api/map/city-explore", params={"kind": "spot", "city": "杭州"})
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is True
    assert body["data"] == []
    assert body["city"] is None


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_city_explore_returns_ranked_spots():
    r = client.get(
        "/api/map/city-explore", params={"kind": "spot", "city": "杭州", "limit": 10}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert body["city"]["name"] == "杭州市"
    assert isinstance(body["data"], list) and len(body["data"]) == 10

    for spot in body["data"]:
        assert spot["id"] and spot["name"]
        assert spot["kind"] == "spot"
        assert spot["location"]["longitude"] > 100
        assert spot["location"]["latitude"] > 0
        assert isinstance(spot["distance"], int) and spot["distance"] > 0

    scores = [s["score"] for s in body["data"]]
    assert scores == sorted(scores, reverse=True), "必须按推荐分降序"

    names = " ".join(s["name"] for s in body["data"])
    assert "服务中心" not in names and "停车场" not in names


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_city_explore_accepts_coordinates():
    """给坐标时应反查城市名，但检索原点取城市中心（不是用户坐标）"""
    r = client.get(
        "/api/map/city-explore",
        params={
            "kind": "spot",
            "longitude": 120.155070,
            "latitude": 30.274085,
            "limit": 5,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert body["city"]["name"] == "杭州市"
    assert len(body["data"]) == 5


@pytest.mark.skipif(not HAS_KEY, reason="需要 TENCENT_MAP_KEY 环境变量")
def test_live_city_explore_cache_reduces_upstream_calls():
    """同城市同类别 5 分钟内应命中缓存（城市级检索一次要打多个关键词）"""
    params = {"kind": "museum", "city": "成都", "limit": 5}
    first = client.get("/api/map/city-explore", params=params).json()
    second = client.get("/api/map/city-explore", params=params).json()
    assert first == second
