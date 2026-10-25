"""R1 地图路由：附近站点 / 公交换乘 / 一键导航

契约见 docs/r1/CONTRACT.md。本文件是 R1 的唯一挂载点，
分支 poll-153/poll-158 的同名路由合并时以此为准。
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ...models.schemas import (
    Location,
    NavLinkResponse,
    NearbyStationResponse,
    TransitResponse,
)
from ...services.tencent_map_client import get_tencent_map_service
from ...services.tencent_map_service import TencentError

router = APIRouter(prefix="/map", tags=["地图服务"])


@router.get(
    "/nearby-station",
    response_model=NearbyStationResponse,
    summary="附近站点检索",
    description="检索指定坐标周边的地铁站/公交站。Key 缺失或上游失败时降级返回空列表。",
)
async def nearby_station(
    longitude: float = Query(..., ge=-180, le=180, description="中心点经度(GCJ02)"),
    latitude: float = Query(..., ge=-90, le=90, description="中心点纬度(GCJ02)"),
    radius: int = Query(1000, ge=0, le=5000, description="检索半径(米)"),
    keyword: str = Query("地铁站", description="检索关键词"),
    city: Optional[str] = Query(None, description="城市，可选用于提精度"),
):
    service = get_tencent_map_service()
    try:
        return await service.nearby_station(longitude, latitude, radius, keyword, city)
    except TencentError as e:
        if e.is_bad_param:
            raise HTTPException(status_code=400, detail=f"参数错误: {e.message}")
        raise HTTPException(status_code=502, detail=f"上游错误: {e.message}")


@router.get(
    "/transit",
    response_model=TransitResponse,
    summary="公交换乘方案",
    description="规划两点之间的公交换乘方案，返回多方案列表。",
)
async def transit(
    from_longitude: float = Query(..., ge=-180, le=180, description="起点经度(GCJ02)"),
    from_latitude: float = Query(..., ge=-90, le=90, description="起点纬度(GCJ02)"),
    to_longitude: float = Query(..., ge=-180, le=180, description="终点经度(GCJ02)"),
    to_latitude: float = Query(..., ge=-90, le=90, description="终点纬度(GCJ02)"),
):
    service = get_tencent_map_service()
    origin = Location(longitude=from_longitude, latitude=from_latitude)
    destination = Location(longitude=to_longitude, latitude=to_latitude)
    try:
        return await service.transit(origin, destination)
    except TencentError as e:
        if e.is_bad_param:
            raise HTTPException(status_code=400, detail=f"参数错误: {e.message}")
        raise HTTPException(status_code=502, detail=f"上游错误: {e.message}")


@router.get(
    "/nav-link",
    response_model=NavLinkResponse,
    summary="一键导航链接",
    description="生成 Web 端跳转导航链接。全项目唯一实现，前端不得自行拼接。",
)
async def nav_link(
    destination: str = Query(..., description="目的地名称"),
    mode: str = Query("walk", pattern="^(walk|drive|transit)$", description="导航方式"),
    longitude: Optional[float] = Query(None, ge=-180, le=180, description="目的地经度"),
    latitude: Optional[float] = Query(None, ge=-90, le=90, description="目的地纬度"),
):
    service = get_tencent_map_service()
    to_location = (
        Location(longitude=longitude, latitude=latitude)
        if longitude is not None and latitude is not None
        else None
    )
    return NavLinkResponse(
        success=True,
        message="",
        data=service.nav_link(mode, destination, to_location),
    )
