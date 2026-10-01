"""地图服务API路由"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from ...models.schemas import (
    POISearchRequest,
    POISearchResponse,
    RouteRequest,
    RouteResponse,
    TransitResponse,
    WeatherResponse
)
from ...services.amap_service import get_amap_service
from ...services.tencent_map_service import get_tencent_map_service

router = APIRouter(prefix="/map", tags=["地图服务"])


@router.get(
    "/poi",
    response_model=POISearchResponse,
    summary="搜索POI",
    description="根据关键词搜索POI(兴趣点)"
)
async def search_poi(
    keywords: str = Query(..., description="搜索关键词", example="故宫"),
    city: str = Query(..., description="城市", example="北京"),
    citylimit: bool = Query(True, description="是否限制在城市范围内")
):
    """
    搜索POI
    
    Args:
        keywords: 搜索关键词
        city: 城市
        citylimit: 是否限制在城市范围内
        
    Returns:
        POI搜索结果
    """
    try:
        # 获取服务实例
        service = get_amap_service()
        
        # 搜索POI
        pois = service.search_poi(keywords, city, citylimit)
        
        return POISearchResponse(
            success=True,
            message="POI搜索成功",
            data=pois
        )
        
    except Exception as e:
        print(f"❌ POI搜索失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"POI搜索失败: {str(e)}"
        )


@router.get(
    "/weather",
    response_model=WeatherResponse,
    summary="查询天气",
    description="查询指定城市的天气信息"
)
async def get_weather(
    city: str = Query(..., description="城市名称", example="北京")
):
    """
    查询天气
    
    Args:
        city: 城市名称
        
    Returns:
        天气信息
    """
    try:
        # 获取服务实例
        service = get_amap_service()
        
        # 查询天气
        weather_info = service.get_weather(city)
        
        return WeatherResponse(
            success=True,
            message="天气查询成功",
            data=weather_info
        )
        
    except Exception as e:
        print(f"❌ 天气查询失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"天气查询失败: {str(e)}"
        )


@router.post(
    "/route",
    response_model=RouteResponse,
    summary="规划路线",
    description="规划两点之间的路线"
)
async def plan_route(request: RouteRequest):
    """
    规划路线
    
    Args:
        request: 路线规划请求
        
    Returns:
        路线信息
    """
    try:
        # 获取服务实例
        service = get_amap_service()
        
        # 规划路线
        route_info = service.plan_route(
            origin_address=request.origin_address,
            destination_address=request.destination_address,
            origin_city=request.origin_city,
            destination_city=request.destination_city,
            route_type=request.route_type
        )
        
        return RouteResponse(
            success=True,
            message="路线规划成功",
            data=route_info
        )
        
    except Exception as e:
        print(f"❌ 路线规划失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"路线规划失败: {str(e)}"
        )


@router.get(
    "/transit",
    response_model=TransitResponse,
    summary="公交换乘方案",
    description="根据起终点坐标查询公交换乘方案(腾讯位置服务 REST 直连)"
)
async def get_transit(
    origin: str = Query(..., description="起点, 支持'纬度,经度'(GCJ02)或地址", example="39.984154,116.307490"),
    destination: str = Query(..., description="终点, 同 origin 格式", example="39.90923,116.397428"),
    city: Optional[str] = Query(None, description="起点城市", example="北京"),
    cityd: Optional[str] = Query(None, description="终点城市, 缺省同起点城市")
):
    """
    公交换乘方案

    Args:
        origin: 起点坐标 "纬度,经度"(GCJ02)或地址
        destination: 终点坐标
        city: 起点城市
        cityd: 终点城市

    Returns:
        换乘方案列表
    """
    try:
        service = get_tencent_map_service()
        plans = service.transit_plan(
            origin=origin,
            destination=destination,
            city=city,
            cityd=cityd,
        )
        return TransitResponse(
            success=True,
            message="公交换乘方案查询成功",
            data=plans
        )
    except ValueError as e:
        # Key 未配置等参数级错误 → 500 提示缺失配置
        print(f"❌ 公交换乘参数错误: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    except Exception as e:
        print(f"❌ 公交换乘方案查询失败: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail=f"公交换乘方案查询失败: {str(e)}"
        )


@router.get(
    "/reverse-geocode",
    summary="逆地理编码",
    description="根据经纬度获取城市名称"
)
async def reverse_geocode(
    longitude: float = Query(..., description="经度", example=116.397428),
    latitude: float = Query(..., description="纬度", example=39.90923)
):
    """
    逆地理编码 — 经纬度转城市名

    小程序获取定位后调用此接口获取所在城市名称，
    后端使用高德 Web API Key 调用，避免前端暴露 Key。
    """
    import httpx
    from ...config import get_settings

    settings = get_settings()
    amap_key = settings.vite_amap_web_key

    if not amap_key:
        raise HTTPException(status_code=500, detail="高德地图 API Key 未配置")

    try:
        url = "https://restapi.amap.com/v3/geocode/regeo"
        params = {
            "location": f"{longitude},{latitude}",
            "key": amap_key,
            "extensions": "base",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()

        data = resp.json()

        if data.get("status") != "1":
            raise HTTPException(status_code=502, detail=f"高德API错误: {data.get('info', '未知')}")

        component = data.get("regeocode", {}).get("addressComponent", {})
        city = component.get("city", "")
        # 直辖市 city 为空数组，取 province
        if not city or (isinstance(city, list) and len(city) == 0):
            city = component.get("province", "")

        if isinstance(city, list):
            city = ""

        city_name = str(city).replace("市", "").replace("省", "")
        district = str(component.get("district", ""))
        formatted_address = data.get("regeocode", {}).get("formatted_address", "")

        return {
            "success": True,
            "data": {
                "city": city_name,
                "district": district,
                "address": formatted_address,
                "province": str(component.get("province", "")).replace("省", ""),
            }
        }

    except httpx.HTTPError as e:
        print(f"❌ 逆地理编码请求失败: {e}")
        raise HTTPException(status_code=502, detail=f"地图服务请求失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 逆地理编码失败: {e}")
        raise HTTPException(status_code=500, detail=f"逆地理编码失败: {str(e)}")


@router.get(
    "/health",
    summary="健康检查",
    description="检查地图服务是否正常"
)
async def health_check():
    """健康检查"""
    try:
        # 检查服务是否可用
        service = get_amap_service()
        
        return {
            "status": "healthy",
            "service": "map-service",
            "mcp_tools_count": len(service.mcp_tool._available_tools)
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"服务不可用: {str(e)}"
        )

