"""腾讯位置服务(WebService) REST 直连封装

不引入 uvx/MCP 进程,直接走 httpx 调 Tencent LBS WebService REST 接口。
统一超时/重试/日志,并统一返回为项目内的结构化模型(Location/TransitPlan 等)。

上游文档: 腾讯位置服务 WebService - 公交换乘
    GET https://apis.map.qq.com/ws/direction/v1/transit/
    from/to 支持"纬度,经度"坐标(GCJ02)或地址文本;city/cityd 为起/终点城市。
"""

from typing import Any, Dict, List, Optional

import httpx

from ..config import get_settings
from ..models.schemas import Location, TransitPlan, TransitSegment, TransitStep

# 腾讯位置服务 WebService 公交换乘接口
TRANSIT_API_URL = "https://apis.map.qq.com/ws/direction/v1/transit/"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 2


def _pp(a: Any) -> str:
    """兼容 Address 组件: city 可能为空数组或 None,统一转成空串。"""
    if isinstance(a, list):
        return ""
    return str(a or "")


class TencentMapService:
    """腾讯位置服务封装(httpx 直连)"""

    def __init__(self, transport: Optional[httpx.BaseTransport] = None) -> None:
        self.api_key = get_settings().tencent_map_key
        # 测试注入点: 传 httpx.MockTransport 即可本地模拟上游, 不发起真实网络请求
        self._transport = transport

    # ---------- 公交换乘 ----------

    def transit_plan(
        self,
        origin: str,
        destination: str,
        city: Optional[str] = None,
        cityd: Optional[str] = None,
    ) -> List[TransitPlan]:
        """起终坐标→公交换乘方案列表。

        Args:
            origin: 起点, 支持 "纬度,经度"(GCJ02) 或地址
            destination: 终点, 同 origin
            city: 起点城市 (空则不做城市限定)
            cityd: 终点城市 (空则与 city 相同)

        Returns:
            换乘方案列表(按推荐度排序), 空/异常时兜底返回 []。
        """
        if not self.api_key:
            raise ValueError("腾讯位置服务 Key 未配置, 请在 .env 中设置 TENCENT_MAP_KEY")

        params: Dict[str, Any] = {
            "from": origin,
            "to": destination,
            "key": self.api_key,
            "output": "json",
        }
        if city:
            params["city"] = _pp(city)
        if cityd:
            params["cityd"] = _pp(cityd)
        elif city:
            params["cityd"] = _pp(city)

        resp_json = self._get(TRANSIT_API_URL, params)

        # 上游业务失败(status!=0)按空结果兜底, 并留日志便于排查
        status = resp_json.get("status")
        if status not in (0, "0"):
            print(f"⚠️ 公交换乘上游返回非 0: status={status} message={resp_json.get('message')}")
            return []

        routes = (
            resp_json.get("result", {})
            .get("routes", [])
            if isinstance(resp_json.get("result"), dict)
            else []
        )
        if not isinstance(routes, list):
            return []

        return [self._parse_route(r) for r in routes]

    # ---------- 内部工具 ----------

    def _get(self, url: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """带重试的 GET, 网络/HTTP 错误统一抛 httpx.HTTPError 由调用方兜底。"""
        last_err: Optional[Exception] = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS, transport=self._transport) as client:
                    resp = client.get(url, params=params)
                    resp.raise_for_status()
                    return resp.json()
            except (httpx.HTTPError, ValueError) as e:
                last_err = e
                if attempt < MAX_RETRIES:
                    print(f"⚠️ 腾讯地图请求失败(第{attempt + 1}次): {e}")
                    continue
                print(f"❌ 腾讯地图请求最终失败: {e}")
        raise last_err or httpx.HTTPError("腾讯地图请求失败")

    def _parse_route(self, route: Any) -> TransitPlan:
        """把上游单条 route 惰性解析为项目 TransitPlan, 字段缺失/异常字段全部兜底。"""
        if not isinstance(route, dict):
            return TransitPlan(distance=0.0, duration=0, transfer_count=0, segments=[])
        steps = route.get("steps") if isinstance(route.get("steps"), list) else []
        segments: List[TransitSegment] = []

        for step in steps:
            if not isinstance(step, dict):
                continue
            seg = self._parse_step(step)
            if seg is not None:
                segments.append(seg)

        return TransitPlan(
            distance=self._to_float(route.get("distance")),
            duration=self._to_int(route.get("duration")),
            transfer_count=self._to_int(route.get("transfer_count")),
            segments=segments,
        )

    def _parse_step(self, step: Dict[str, Any]) -> Optional[TransitSegment]:
        """把上游单步(mode in WALKING/TRANSIT/RAILWAY/TAXI)解析为 TransitSegment。"""
        mode_raw = _pp(step.get("mode", ""))
        mode = _map_mode(mode_raw)
        if not mode:
            return None

        sub = TransitStep(
            mode=mode,
            type=_pp(step.get("type")),
            line=_pp(step.get("line", {}).get("title") if isinstance(step.get("line"), dict) else ""),
            from_station=_read_station_name(step.get("from")),
            to_station=_read_station_name(step.get("to")),
            stations=_read_stations(step.get("stations") or step.get("stationIds")),
            distance=self._to_float(step.get("distance")),
            duration=self._to_int(step.get("duration")),
            first_bus_time=_pp(step.get("first_bus_time")),
            last_bus_time=_pp(step.get("last_bus_time")),
            path=self._read_path(step.get("polyline")),
        )

        # 按段类型落到 segment 对应槽位
        data: Dict[str, Any] = {"distance": sub.distance, "duration": sub.duration}
        data[mode] = sub
        return TransitSegment(**data)

    @staticmethod
    def _to_int(v: Any) -> int:
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _to_float(v: Any) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    def _read_path(self, polyline: Any) -> List[Location]:
        """polyline 为 "经度,纬度;经度,纬度;..." 字符串, 解析为 Location 列表。"""
        if not isinstance(polyline, str) or not polyline:
            return []
        points: List[Location] = []
        for pair in polyline.split(";"):
            parts = pair.split(",")
            if len(parts) < 2:
                continue
            lng, lat = parts[0], parts[1]
            try:
                points.append(Location(longitude=float(lng), latitude=float(lat)))
            except (TypeError, ValueError):
                continue
        return points


def _map_mode(mode_raw: str) -> Optional[str]:
    """上游 mode 字段(WALKING/TRANSIT/RAILWAY/TAXI)映射为项目内小写命名。"""
    up = mode_raw.upper()
    if up.startswith("WALK"):
        return "walking"
    if up == "TAXI":
        return "taxi"
    if up == "RAILWAY":
        return "railway"
    if up == "TRANSIT":
        return "transit"
    return None


def _read_station_name(station: Any) -> str:
    """from/to 可能为地址对象或纯地址文本, 兼容取 title。"""
    if isinstance(station, dict):
        return _pp(station.get("title"))
    return _pp(station)


def _read_stations(stations: Any) -> List[str]:
    """stations 可能为 [{title,...}] 或纯文本列表, 统一取标题。"""
    if not isinstance(stations, list):
        return []
    result: List[str] = []
    for s in stations:
        result.append(_read_station_name(s))
    return result


# 全局服务实例
_tencent_map_service: Optional[TencentMapService] = None


def get_tencent_map_service() -> TencentMapService:
    """获取腾讯位置服务实例(单例模式)。"""
    global _tencent_map_service
    if _tencent_map_service is None:
        _tencent_map_service = TencentMapService()
    return _tencent_map_service