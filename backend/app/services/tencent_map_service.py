"""腾讯位置服务适配层（R1 契约的唯一实现）

上游文档与真实响应存在多处口径差异，本模块负责一次性抹平，
上层（service / route）不得再自行换算。契约见 docs/r1/CONTRACT.md。

关键口径（均已用真实 Key 实测，证据在 tests/fixtures/tencent/）：
  - direction/v1/* 的 duration 单位是**分钟**；distance/v1/matrix 是**秒**
  - price 单位是**分**，-1 表示无票价
  - TRANSIT 段的 distance/duration 在 step 层为 null，真实值在 lines[] 内
  - 上游坐标为 "lat,lng"，与本项目 Location(longitude, latitude) 顺序相反
  - status != 0 一律是失败，不得降级成空列表冒充成功
"""

from typing import Any, Dict, List, Optional, Tuple

from ..models.schemas import (
    Location,
    NearbyStation,
    NearbyStationResponse,
    TransitResponse,
    TransitRoute,
    TransitStep,
)

# 腾讯业务状态码（实测）
STATUS_OK = 0
STATUS_NO_KEY = 301
STATUS_BAD_KEY = 311
STATUS_BAD_PARAM = 348
STATUS_NO_AUTH = 113

# 未授权/Key 问题归为"降级"；参数错误归为"调用方错误"，不降级
DEGRADABLE_STATUS = {STATUS_NO_KEY, STATUS_BAD_KEY, STATUS_NO_AUTH}

# place/v1/search 单页硬上限（实测：传 21 返回 20，传 50 报 113）
PLACE_PAGE_SIZE_MAX = 20

# 站点类型推导：上游 category 形如 "基础设施:交通设施:地铁站"
_METRO_HINTS = ("地铁站", "轨道交通", "轻轨")
_BUS_HINTS = ("公交车站", "公交站", "快速公交")


class TencentError(Exception):
    """腾讯上游业务失败（status != 0）"""

    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(f"腾讯位置服务错误 status={status} message={message}")

    @property
    def degradable(self) -> bool:
        """是否属于可用降级兜底的错误（Key/权限问题）"""
        return self.status in DEGRADABLE_STATUS

    @property
    def is_bad_param(self) -> bool:
        """调用方入参错误，应回 400 而非降级"""
        return self.status == STATUS_BAD_PARAM


def to_location(raw: Optional[Dict[str, Any]]) -> Optional[Location]:
    """上游 {'lat': .., 'lng': ..} → Location(longitude, latitude)"""
    if not raw:
        return None
    lat, lng = raw.get("lat"), raw.get("lng")
    if lat is None or lng is None:
        return None
    return Location(longitude=float(lng), latitude=float(lat))


def to_coord(location: Location) -> str:
    """Location → 上游 'lat,lng' 字符串（注意顺序与字段相反）"""
    return f"{location.latitude},{location.longitude}"


def parse_status(payload: Dict[str, Any]) -> None:
    """校验上游 status，非 0 抛 TencentError"""
    status = payload.get("status")
    if status in (STATUS_OK, "0"):
        return
    try:
        code = int(status)
    except (TypeError, ValueError):
        code = -1
    raise TencentError(code, str(payload.get("message") or ""))


def _classify_station(category: str) -> str:
    """上游 category → metro/bus/other"""
    text = category or ""
    if any(h in text for h in _METRO_HINTS):
        return "metro"
    if any(h in text for h in _BUS_HINTS):
        return "bus"
    return "other"


def _split_lines(address: str) -> List[str]:
    """腾讯把途经线路塞在 address 里，逗号切分"""
    if not address:
        return []
    parts = [p.strip() for p in address.replace("，", ",").split(",")]
    return [p for p in parts if p]


def parse_nearby_stations(payload: Dict[str, Any]) -> NearbyStationResponse:
    """place/v1/search 响应 → NearbyStationResponse

    data 恒为数组；无结果时 success=True 且 data=[]（这是真实"附近没有"，
    与 degraded 不同）。
    """
    parse_status(payload)

    stations: List[NearbyStation] = []
    for poi in payload.get("data") or []:
        loc = to_location(poi.get("location"))
        if loc is None:
            # 无坐标的 POI 无法用于地图展示，直接丢弃而不是给 0,0
            continue
        address = str(poi.get("address") or "")
        stations.append(
            NearbyStation(
                id=str(poi.get("id") or ""),
                name=str(poi.get("title") or ""),
                type=_classify_station(str(poi.get("category") or "")),
                address=address,
                location=loc,
                distance=int(round(float(poi.get("_distance") or 0))),
                lines=_split_lines(address),
            )
        )

    stations.sort(key=lambda s: s.distance)
    return NearbyStationResponse(
        success=True,
        degraded=False,
        message="",
        data=stations,
    )


def degraded_nearby(message: str) -> NearbyStationResponse:
    """降级响应：degraded=true 且 data=[]，绝不伪造站点"""
    return NearbyStationResponse(success=False, degraded=True, message=message, data=[])


def _minutes_to_seconds(value: Any) -> int:
    """direction/v1/* 的 duration 是分钟 → 秒（契约统一输出秒）"""
    if value is None or value == "":
        return 0
    try:
        return int(round(float(value) * 60))
    except (TypeError, ValueError):
        return 0


def _fen_to_yuan(value: Any) -> Optional[float]:
    """price 单位分 → 元；-1 或非法值返回 None"""
    if value is None or value == "":
        return None
    try:
        fen = int(value)
    except (TypeError, ValueError):
        return None
    if fen < 0:
        return None
    return round(fen / 100, 2)


def _int_or_zero(value: Any) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return 0


def _parse_walking_step(step: Dict[str, Any]) -> TransitStep:
    """WALKING 段：distance/duration 在 step 层，指引在嵌套 steps[].instruction"""
    instructions = [
        str(sub.get("instruction") or "")
        for sub in (step.get("steps") or [])
        if sub.get("instruction")
    ]
    return TransitStep(
        mode="WALKING",
        distance=_int_or_zero(step.get("distance")),
        duration=_minutes_to_seconds(step.get("duration")),
        line="",
        from_name="",
        to_name="",
        instruction="；".join(instructions[:3]),
    )


def _parse_transit_step(step: Dict[str, Any]) -> Optional[TransitStep]:
    """TRANSIT 段：step 层 distance/duration 为 null，必须从 lines[0] 取"""
    lines = step.get("lines") or []
    if not lines:
        return None
    line = lines[0]  # 上游按推荐排序，取首条；多线路备选不进入本契约
    geton = line.get("geton") or {}
    getoff = line.get("getoff") or {}
    return TransitStep(
        mode="TRANSIT",
        distance=_int_or_zero(line.get("distance")),
        duration=_minutes_to_seconds(line.get("duration")),
        line=str(line.get("title") or ""),
        from_name=str(geton.get("title") or ""),
        to_name=str(getoff.get("title") or ""),
        instruction="",
    )


def _parse_route(raw: Dict[str, Any]) -> TransitRoute:
    steps: List[TransitStep] = []
    for step in raw.get("steps") or []:
        mode = str(step.get("mode") or "").upper()
        if mode == "WALKING":
            steps.append(_parse_walking_step(step))
        else:
            parsed = _parse_transit_step(step)
            if parsed is not None:
                steps.append(parsed)

    ride_count = sum(1 for s in steps if s.mode != "WALKING")
    return TransitRoute(
        distance=_int_or_zero(raw.get("distance")),
        duration=_minutes_to_seconds(raw.get("duration")),
        transfers=max(ride_count - 1, 0),
        fare=_fen_to_yuan(raw.get("price")),
        steps=steps,
    )


def parse_transit(payload: Dict[str, Any]) -> TransitResponse:
    """direction/v1/transit 响应 → TransitResponse（data 为多方案数组）"""
    parse_status(payload)

    routes = [
        _parse_route(raw)
        for raw in ((payload.get("result") or {}).get("routes") or [])
    ]
    return TransitResponse(success=True, degraded=False, message="", data=routes)


def degraded_transit(message: str) -> TransitResponse:
    return TransitResponse(success=False, degraded=True, message=message, data=[])


def build_nav_url(
    mode: str,
    destination: str,
    to_location: Optional[Location] = None,
    referer: str = "roamly",
) -> str:
    """生成腾讯 Web 导航链接（全项目唯一实现，前端不得自行拼接）"""
    from urllib.parse import quote

    nav_type = {"walk": "walk", "drive": "drive", "transit": "bus"}.get(mode, "walk")
    url = (
        "https://apis.map.qq.com/uri/v1/routeplan"
        f"?type={nav_type}"
        f"&to={quote(destination)}"
    )
    if to_location is not None:
        url += f"&tocoord={to_location.latitude},{to_location.longitude}"
    url += f"&referer={quote(referer)}"
    return url
