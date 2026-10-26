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
    CityCenter,
    CityExploreResponse,
    CitySpot,
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


# ============ 地理编码（原 poll-160 的 geocode，收编入契约）============
def parse_geocode(payload: Dict[str, Any]) -> Optional[Location]:
    """geocoder/v1 响应 → Location

    地址无法解析时上游仍返回 status=0，但 result 为空或 reliability<1，
    此时返回 None，由调用方决定是否降级。
    """
    parse_status(payload)
    result = payload.get("result") or {}
    return to_location(result.get("location"))


def parse_place_search(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """place/v1/search 响应 → 精简 POI 列表

    供上层做景点/餐饮检索。只保留契约内字段，不透传上游全量结构。
    """
    parse_status(payload)
    out: List[Dict[str, Any]] = []
    for poi in payload.get("data") or []:
        loc = to_location(poi.get("location"))
        if loc is None:
            continue
        out.append(
            {
                "id": str(poi.get("id") or ""),
                "name": str(poi.get("title") or ""),
                "address": str(poi.get("address") or ""),
                "category": str(poi.get("category") or ""),
                "location": loc,
                "distance": int(round(float(poi.get("_distance") or 0))),
            }
        )
    return out


# ============ 城市探索（契约 §5）============
#
# 与 §2「附近站点」的区别：那边是米级半径内的地铁/公交站，这边是**整座城市**的
# 去处检索（景点/美食/公园/博物馆），检索边界是 region(城市,0) 而不是 nearby。
#
# 三个上游口径（均已用真实 Key 实测）：
#   1. region 检索的 _distance 恒为 None —— 距离必须我方按城市中心自己算
#   2. region 检索不保证按任何有意义的顺序返回，页内顺序是 POI 索引序，
#      直接取前 20 条会得到「按名字拼音排列」这种没有价值的结果
#   3. 结果里混有「XX服务中心 / 售票处 / 停车场」这类附属设施，以及
#      「杭州道街道」这种同名他市行政区，必须过滤，否则城市探索列表会被垃圾填满

# 类别 → 上游关键词。一个类别用多个关键词是因为 keyword 是单串精确匹配（§1.6），
# 实测「景点」与「风景名胜」各自能捞出不同的 POI，必须都打一遍再按 id 去重。
CITY_EXPLORE_KEYWORDS: Dict[str, List[str]] = {
    "spot": ["景点", "风景名胜"],
    "food": ["美食"],
    "park": ["公园"],
    "museum": ["博物馆"],
}

CITY_EXPLORE_KINDS = tuple(CITY_EXPLORE_KEYWORDS)

# 附属设施/服务点：不是「去处」，出现在城市探索列表里只会让人以为景点就长这样
_JUNK_TITLE_HINTS = (
    "服务中心",
    "游客中心",
    "售票",
    "停车场",
    "入口",
    "出口",
    "厕所",
    "洗手间",
    "母婴室",
    "医务室",
    "警务",
    "派出所",
    "办公室",
    "管理处",
    "管理所",
    "咨询处",
    "志愿者",
    "检票",
    "公交站",
    "地铁站",
    "充电站",
    "垃圾分类",
    "驿站",
    "指示牌",
)

# 类别加分：上游 category 的语义等级比名字可靠（「国家级景点」确实比「其它旅游景点」值得去）
_CATEGORY_BOOST = (
    ("世界遗产", 34.0),
    ("国家级景点", 30.0),
    ("博物馆", 24.0),
    ("风景名胜", 20.0),
    ("寺庙", 12.0),
    ("公园", 10.0),
)

# 距离衰减：exp(-d/20km)。选 20 km 是因为实测同城内「值得去」的地方常落在
# 5–20 km（杭州雷峰塔 6.2 km、西湖 9.0 km），而 100 km 外的县市景区不该压过市区景点；
# 同时衰减不能太陡，否则阿勒泰这类地广人稀的城市会把所有真景区都排到后面。
_DISTANCE_DECAY_KM = 20.0
_DISTANCE_WEIGHT = 26.0


def haversine_meters(a: Location, b: Location) -> float:
    """两点球面距离（米）。上游 region 检索不给距离，只能自己算。"""
    import math

    radius = 6371000.0
    lat1 = math.radians(a.latitude)
    lat2 = math.radians(b.latitude)
    dlat = lat2 - lat1
    dlng = math.radians(b.longitude - a.longitude)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def _is_junk_poi(title: str, category: str) -> bool:
    """附属设施 / 非去处过滤"""
    if any(hint in title for hint in _JUNK_TITLE_HINTS):
        return True
    # 交通设施整类排除：地铁站/公交站是 §2 的职责，不属于「城市探索」
    return "交通设施" in category


def score_city_spot(category: str, distance_m: int) -> float:
    """推荐分：类别等级加分 + 距离衰减加分。

    分两层而不是简单按距离排：只看距离会把「市中心最近的公园」排第一，
    而用户点开「城市探索」想看的是这座城市**值得去**的地方。
    """
    import math

    score = 0.0
    for token, weight in _CATEGORY_BOOST:
        if token in category:
            score += weight
    score += _DISTANCE_WEIGHT * math.exp(-(distance_m / 1000.0) / _DISTANCE_DECAY_KM)
    return round(score, 2)


def parse_city_center(payload: Dict[str, Any]) -> Optional[CityCenter]:
    """geocoder/v1 响应（地址 → 坐标）→ CityCenter

    `reliability` < 7 表示上游只是模糊匹配（例如把「杭州道街道」当成杭州），
    这种结果宁可不给，也不能拿一个错的城市中心去检索全城 POI。
    """
    parse_status(payload)
    result = payload.get("result") or {}
    location = to_location(result.get("location"))
    if location is None:
        return None

    try:
        reliability = int(result.get("reliability") or 0)
    except (TypeError, ValueError):
        reliability = 0
    if reliability and reliability < 7:
        return None

    components = result.get("address_components") or {}
    city = str(components.get("city") or "").strip()
    province = str(components.get("province") or "").strip()
    name = city or province
    if not name:
        return None
    return CityCenter(name=name, location=location)


def parse_reverse_city_name(payload: Dict[str, Any]) -> Optional[str]:
    """geocoder/v1 响应（坐标 → 地址）→ 城市名

    用于「我在哪座城市」：直辖市上游把 province/city 都填成「北京市」，
    取 city 即可；city 为空时退回 province。

    **只返回城市名，不返回 CityCenter**：逆地理编码响应里的 `result.location`
    就是**传入的坐标本身**，不是城市中心。拿它当检索原点会让「城市探索」
    退化成「附近有什么」（§2 已负责），并且按第一个请求者的位置污染
    同城所有人的 distance/score。城市中心必须再用城市名查一次（见
    `TencentMapService._resolve_city`）。
    """
    parse_status(payload)
    result = payload.get("result") or {}
    components = result.get("address_component") or {}
    city = str(components.get("city") or "").strip()
    province = str(components.get("province") or "").strip()
    return city or province or None


def merge_city_spots(
    payloads: List[Dict[str, Any]],
    kind: str,
    center: Location,
    limit: int = 20,
) -> List[CitySpot]:
    """把同一类别的多次检索结果合并去重、打分、排序。

    去重按上游 POI id —— 实测「景点」和「风景名胜」两个关键词会捞到同一批 POI，
    按名字去重会把「西湖风景名胜区」和「西湖风景名胜区-断桥」当成两条不同的地方
    （它们确实是两个 POI，名字也不同），所以只能按 id。
    """
    merged: Dict[str, CitySpot] = {}

    for payload in payloads:
        parse_status(payload)
        for poi in payload.get("data") or []:
            location = to_location(poi.get("location"))
            if location is None:
                continue
            title = str(poi.get("title") or "").strip()
            category = str(poi.get("category") or "").strip()
            if not title or _is_junk_poi(title, category):
                continue

            # 上游 _distance 在 region 检索下恒为 None，这里一律按城市中心自算
            distance = int(round(haversine_meters(center, location)))
            poi_id = str(poi.get("id") or f"{title}@{distance}")
            if poi_id in merged:
                continue

            merged[poi_id] = CitySpot(
                id=poi_id,
                name=title,
                category=category,
                kind=kind,
                address=str(poi.get("address") or ""),
                location=location,
                distance=distance,
                score=score_city_spot(category, distance),
            )

    return sorted(merged.values(), key=lambda s: (-s.score, s.distance))[:limit]


def degraded_city_explore(message: str) -> CityExploreResponse:
    """降级响应：degraded=true 且 data=[]，绝不伪造地点（与 §2 同一原则）"""
    return CityExploreResponse(
        success=False, degraded=True, message=message, city=None, data=[]
    )
