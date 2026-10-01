"""GET /api/map/transit 公交换乘路由的单元测试

覆盖:
- 路由已注册, 参数为 origin/destination/city/cityd
- 服务端解析上游响应 → TransitResponse 结构化结果
- 降级兜底: 上游 error/garbage/空 + Key 未配置均不崩溃

通过 httpx.MockTransport 模拟腾讯 WebService, 不发起真实网络请求。
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import main
from app.services import tencent_map_service as tms
from app.services.tencent_map_service import get_tencent_map_service

REAL_RESPONSE = {
    "status": 0,
    "message": "query ok",
    "result": {
        "routes": [
            {
                "distance": 8230,
                "duration": 3200,
                "transfer_count": 1,
                "steps": [
                    {"mode": "WALKING", "distance": 150, "duration": 120,
                     "from": {"title": "A起点"}, "to": {"title": "B站"},
                     "polyline": "116.30,39.98;116.31,39.98"},
                    {"mode": "TRANSIT", "line": {"title": "地铁1号线"}, "distance": 5000,
                     "duration": 1500, "from": {"title": "B站"}, "to": {"title": "C站"},
                     "stations": [{"title": "B站"}, {"title": "C站"}],
                     "first_bus_time": "05:00", "last_bus_time": "23:00"},
                    {"mode": "WALKING", "distance": 200, "duration": 180,
                     "from": {"title": "C站"}, "to": {"title": "D终点"},
                     "polyline": "116.32,39.98;116.33,39.98;116.34,39.97"},
                ],
            }
        ]
    },
}


def _service_with(payload, status_code=200):
    """构建一个注入了 MockTransport 的全局腾讯服务单例。"""
    svc = get_tencent_map_service()
    svc.api_key = "test-key"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=payload)

    svc._transport = httpx.MockTransport(handler)
    return svc


@pytest.fixture()
def client() -> TestClient:
    return TestClient(main.app)


def test_route_registered_and_params():
    """路由已注册, 参数名与前端约定一致。"""
    spec = main.app.openapi()
    op = spec["paths"]["/api/map/transit"]["get"]
    assert [p["name"] for p in op["parameters"]] == ["origin", "destination", "city", "cityd"]


def test_transit_happy_path(client):
    """正常响应解析为结构化换乘方案。"""
    _service_with(REAL_RESPONSE)
    resp = client.get("/api/map/transit", params={
        "origin": "39.984154,116.307490",
        "destination": "39.90923,116.397428",
        "city": "北京",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    plans = body["data"]
    assert len(plans) == 1
    plan = plans[0]
    assert plan["distance"] == 8230
    assert plan["duration"] == 3200
    assert plan["transfer_count"] == 1
    seq_modes = []
    for seg in plan["segments"]:
        for k in ("walking", "transit", "railway", "taxi"):
            if seg.get(k):
                seq_modes.append(k)
    # 三段: 步行→轨道→步行
    assert seq_modes == ["walking", "transit", "walking"]
    transit = plan["segments"][1]["transit"]
    assert transit["line"] == "地铁1号线"
    assert transit["from_station"] == "B站"
    assert transit["to_station"] == "C站"
    assert transit["stations"] == ["B站", "C站"]
    assert transit["first_bus_time"] == "05:00"
    assert transit["last_bus_time"] == "23:00"
    # 步行段轨迹解析为坐标点
    assert len(plan["segments"][0]["walking"]["path"]) == 2


def test_transit_upstream_error_returns_empty(client):
    """上游 status!=0 → 200 + 空方案, 不报错。"""
    _service_with({"status": 311, "message": "线路查询失败"})
    resp = client.get("/api/map/transit", params={"origin": "a", "destination": "b"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["data"] == []


def test_transit_garbage_returns_empty(client):
    """上游返回结构异常 → 200 + 空方案。"""
    _service_with({"status": 0, "result": {"routes": "not-a-list"}})
    assert client.get("/api/map/transit", params={"origin": "a", "destination": "b"}).json()["data"] == []

    _service_with({"status": 0, "result": {"routes": [{}, None, {"distance": "abc"}]}})
    resp = client.get("/api/map/transit", params={"origin": "a", "destination": "b"})
    assert resp.status_code == 200
    assert all(p["distance"] == 0.0 for p in resp.json()["data"])


def test_missing_key_returns_500_helpful(client):
    """Key 未配置 → 500 + 明确提示, 不崩溃。"""
    svc = get_tencent_map_service()
    svc.api_key = ""
    resp = client.get("/api/map/transit", params={"origin": "a", "destination": "b"})
    assert resp.status_code == 500
    assert "TENCENT_MAP_KEY" in resp.json()["detail"]


def test_upstream_http_error_returns_502(client):
    """上游网络失败 → 502 兜底。"""
    def handler(request):
        raise httpx.ConnectError("network down")
    svc = get_tencent_map_service()
    svc.api_key = "test-key"
    svc._transport = httpx.MockTransport(handler)
    resp = client.get("/api/map/transit", params={"origin": "a", "destination": "b"})
    assert resp.status_code == 502