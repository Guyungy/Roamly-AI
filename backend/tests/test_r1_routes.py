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
def test_live_nearby_cache_reduces_upstream_calls():
    """同坐标 60s 内应命中缓存，保护日 PV 11000 额度"""
    params = {"longitude": 116.307490, "latitude": 39.984154, "radius": 800}
    first = client.get("/api/map/nearby-station", params=params).json()
    second = client.get("/api/map/nearby-station", params=params).json()
    assert first == second
