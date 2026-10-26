"""R1 地图服务（HTTP 调用 + 降级）

职责边界：
  - tencent_map_service.py  纯解析/换算，不碰网络，可单测
  - 本模块                  发请求、限流、降级，依赖上游

契约见 docs/r1/CONTRACT.md。
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..config import get_settings
from ..models.schemas import (
    CityCenter,
    CityExploreResponse,
    Location,
    NavLink,
    NearbyStationResponse,
    TransitResponse,
)
from . import tencent_map_service as adapter

BASE_URL = "https://apis.map.qq.com/ws"
TIMEOUT_SECONDS = 8.0

# 契约 §1.4：上游 limit_qps=10，留余量压到 8
MAX_QPS = 8
# 附近站点短时缓存（同一坐标 60s 内复用，保护日 PV 11000 的额度）
NEARBY_CACHE_TTL = 60.0

# 极简令牌桶：单进程内限流，避免打爆上游 QPS
_last_call_at = 0.0
_rate_lock = asyncio.Lock()


async def _throttle() -> None:
    global _last_call_at
    min_interval = 1.0 / MAX_QPS
    async with _rate_lock:
        now = time.monotonic()
        wait = _last_call_at + min_interval - now
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at = time.monotonic()


_nearby_cache: Dict[Tuple[float, float, int, str], Tuple[float, NearbyStationResponse]] = {}

# 城市探索缓存：同一 (城市, 类别) 5 分钟内复用。
# 城市级检索一次要打 2 个关键词，而这是「打开首页就会触发」的接口，
# 不缓存的话日 PV 11000 会被一个人反复切类别就吃光。
CITY_EXPLORE_CACHE_TTL = 300.0
# 缓存里存多少条：够覆盖接口 limit 上限（50）即可，避免「先要 5 条再要 50 条」时拿不全
CITY_EXPLORE_CACHE_SIZE = 50
_city_cache: Dict[Tuple[str, str], Tuple[float, CityExploreResponse]] = {}


class TencentMapService:
    """腾讯位置服务封装"""

    def __init__(self, key: Optional[str] = None, referer: Optional[str] = None):
        settings = get_settings()
        self.key = key if key is not None else settings.tencent_map_key
        self.referer = referer or settings.tencent_map_referer

    @property
    def configured(self) -> bool:
        return bool(self.key)

    async def _get(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        params = {**params, "key": self.key}
        await _throttle()
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            resp = await client.get(f"{BASE_URL}{path}", params=params)
            resp.raise_for_status()
            return resp.json()

    async def nearby_station(
        self,
        longitude: float,
        latitude: float,
        radius: int = 1000,
        keyword: str = "地铁站",
        city: Optional[str] = None,
    ) -> NearbyStationResponse:
        """附近站点检索（契约 §2）

        多关键词（英文逗号分隔）逐个打上游再合并：腾讯 place/v1/search 的 keyword
        是单串精确匹配，实测传 "地铁站,公交站" 只回公交站、地铁站整类丢失。
        """
        if not self.configured:
            return adapter.degraded_nearby(
                "腾讯位置服务 Key 未配置，请在 .env 设置 TENCENT_MAP_KEY"
            )

        cache_key = (round(longitude, 4), round(latitude, 4), radius, keyword)
        cached = _nearby_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < NEARBY_CACHE_TTL:
            return cached[1]

        center = Location(longitude=longitude, latitude=latitude)
        keywords = [k.strip() for k in keyword.split(",") if k.strip()] or ["地铁站"]

        merged: Dict[str, Any] = {}
        for kw in keywords:
            try:
                part = await self._search_stations(kw, center, radius, city)
            except (httpx.HTTPError, ValueError) as e:
                return adapter.degraded_nearby(f"腾讯位置服务请求失败，已降级: {e}")
            except adapter.TencentError as e:
                if e.is_bad_param:
                    raise
                return adapter.degraded_nearby(
                    f"腾讯位置服务返回错误，已降级: {e.message}"
                )
            # 按上游 POI id 去重：同一站点可能被多个关键词同时命中
            for station in part.data:
                merged.setdefault(station.id or f"{station.name}@{station.distance}", station)

        result = NearbyStationResponse(
            success=True,
            degraded=False,
            message="",
            data=sorted(merged.values(), key=lambda s: s.distance),
        )
        _nearby_cache[cache_key] = (time.monotonic(), result)
        return result

    async def _search_stations(
        self,
        keyword: str,
        center: Location,
        radius: int,
        city: Optional[str],
    ) -> NearbyStationResponse:
        """单关键词检索，返回已解析的站点列表"""
        params: Dict[str, Any] = {
            "keyword": keyword,
            "boundary": f"nearby({adapter.to_coord(center)},{radius},0)",
            "page_size": adapter.PLACE_PAGE_SIZE_MAX,
            "orderby": "_distance",
        }
        if city and radius <= 0:
            params["boundary"] = f"region({city},0)"

        payload = await self._get("/place/v1/search", params)
        return adapter.parse_nearby_stations(payload)

    async def transit(
        self,
        origin: Location,
        destination: Location,
    ) -> TransitResponse:
        """公交换乘（契约 §3）"""
        if not self.configured:
            return adapter.degraded_transit(
                "腾讯位置服务 Key 未配置，请在 .env 设置 TENCENT_MAP_KEY"
            )

        params = {
            "from": adapter.to_coord(origin),
            "to": adapter.to_coord(destination),
        }
        try:
            payload = await self._get("/direction/v1/transit/", params)
        except (httpx.HTTPError, ValueError) as e:
            return adapter.degraded_transit(f"腾讯位置服务请求失败，已降级: {e}")

        try:
            return adapter.parse_transit(payload)
        except adapter.TencentError as e:
            if e.is_bad_param:
                raise
            return adapter.degraded_transit(f"腾讯位置服务返回错误，已降级: {e.message}")

    def nav_link(
        self,
        mode: str,
        destination: str,
        to_location: Optional[Location] = None,
    ) -> NavLink:
        """一键导航链接（契约 §4）——全项目唯一实现"""
        return NavLink(
            mode=mode,
            destination=destination,
            provider="tencent",
            url=adapter.build_nav_url(
                mode, destination, to_location, referer=self.referer
            ),
        )

    async def city_explore(
        self,
        kind: str,
        city: Optional[str] = None,
        longitude: Optional[float] = None,
        latitude: Optional[float] = None,
        limit: int = 20,
    ) -> CityExploreResponse:
        """当前城市探索（契约 §5）

        检索原点二选一：
          - 给了坐标（前端刚定过位）→ 用它反查城市名，原点仍取**城市中心**而不是
            用户坐标。取用户坐标会让「城市探索」退化成「附近有什么」，
            而 §2 已经负责附近了；这里要的是整座城市的去处。
          - 没给坐标 → 直接用 city 名查中心。

        城市名解析失败（reliability 不足）时降级，**不猜一个城市**：
        拿错城市检索出来的景点列表看起来完全正常，用户不会察觉。
        """
        if not self.configured:
            return adapter.degraded_city_explore(
                "腾讯位置服务 Key 未配置，请在 .env 设置 TENCENT_MAP_KEY"
            )

        if kind not in adapter.CITY_EXPLORE_KEYWORDS:
            raise adapter.TencentError(
                adapter.STATUS_BAD_PARAM,
                f"未知类别 {kind}，可选：{', '.join(adapter.CITY_EXPLORE_KINDS)}",
            )

        try:
            center = await self._resolve_city(city, longitude, latitude)
        except (httpx.HTTPError, ValueError) as e:
            return adapter.degraded_city_explore(f"城市解析失败，已降级: {e}")
        except adapter.TencentError as e:
            if e.is_bad_param:
                raise
            return adapter.degraded_city_explore(f"城市解析失败，已降级: {e.message}")

        if center is None:
            return adapter.degraded_city_explore(
                f"无法解析城市「{city or '当前位置'}」，请检查城市名或稍后重试"
            )

        # 缓存键只含 (城市, 类别)：limit 是**展示条数**，不该影响要不要打上游。
        # 缓存里存全量，按本次 limit 切片 —— 否则先请求 10 条再请求 5 条会拿到 10 条。
        cache_key = (center.name, kind)
        cached = _city_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < CITY_EXPLORE_CACHE_TTL:
            return cached[1].model_copy(update={"data": cached[1].data[:limit]})

        payloads: List[Dict[str, Any]] = []
        for keyword in adapter.CITY_EXPLORE_KEYWORDS[kind]:
            try:
                payloads.append(
                    await self._get(
                        "/place/v1/search",
                        {
                            "keyword": keyword,
                            "boundary": f"region({center.name},0)",
                            "page_size": adapter.PLACE_PAGE_SIZE_MAX,
                        },
                    )
                )
            except (httpx.HTTPError, ValueError) as e:
                return adapter.degraded_city_explore(f"腾讯位置服务请求失败，已降级: {e}")
            except adapter.TencentError as e:
                if e.is_bad_param:
                    raise
                return adapter.degraded_city_explore(
                    f"腾讯位置服务返回错误，已降级: {e.message}"
                )

        try:
            # 缓存里一律存上限条数，展示时再切
            spots = adapter.merge_city_spots(
                payloads, kind, center.location, max(limit, CITY_EXPLORE_CACHE_SIZE)
            )
        except adapter.TencentError as e:
            if e.is_bad_param:
                raise
            return adapter.degraded_city_explore(
                f"腾讯位置服务返回错误，已降级: {e.message}"
            )

        result = CityExploreResponse(
            success=True, degraded=False, message="", city=center, data=spots
        )
        _city_cache[cache_key] = (time.monotonic(), result)
        return result.model_copy(update={"data": result.data[:limit]})

    async def _resolve_city(
        self,
        city: Optional[str],
        longitude: Optional[float],
        latitude: Optional[float],
    ) -> Optional[CityCenter]:
        """城市名 / 坐标 → 城市中心（契约 §5）"""
        if longitude is not None and latitude is not None:
            payload = await self._get(
                "/geocoder/v1/", {"location": f"{latitude},{longitude}"}
            )
            return adapter.parse_reverse_city(payload)

        name = (city or "").strip()
        if not name:
            return None
        payload = await self._get("/geocoder/v1/", {"address": name})
        return adapter.parse_city_center(payload)

    async def geocode(self, address: str, city: Optional[str] = None) -> Optional[Location]:
        """地址 → 坐标（收编 poll-160 的 geocode 能力）"""
        if not self.configured:
            return None
        params: Dict[str, Any] = {"address": address}
        if city:
            params["region"] = city
        try:
            payload = await self._get("/geocoder/v1/", params)
            return adapter.parse_geocode(payload)
        except (httpx.HTTPError, ValueError, adapter.TencentError):
            return None

    async def search_place(
        self,
        keyword: str,
        city: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """关键词检索 POI（收编 poll-160 的 search_poi 能力）"""
        if not self.configured:
            return []
        params: Dict[str, Any] = {
            "keyword": keyword,
            "page_size": min(limit, adapter.PLACE_PAGE_SIZE_MAX),
        }
        if city:
            params["boundary"] = f"region({city},0)"
        try:
            payload = await self._get("/place/v1/search", params)
            return adapter.parse_place_search(payload)
        except (httpx.HTTPError, ValueError, adapter.TencentError):
            return []


_service: Optional[TencentMapService] = None


def get_tencent_map_service() -> TencentMapService:
    global _service
    if _service is None:
        _service = TencentMapService()
    return _service
