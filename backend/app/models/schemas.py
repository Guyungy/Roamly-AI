"""数据模型定义"""

from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator
from datetime import date


# ============ 请求模型 ============

class TripRequest(BaseModel):
    """旅行规划请求"""
    city: str = Field(..., description="目的地城市", example="北京")
    start_date: str = Field(..., description="开始日期 YYYY-MM-DD", example="2025-06-01")
    end_date: str = Field(..., description="结束日期 YYYY-MM-DD", example="2025-06-03")
    travel_days: int = Field(..., description="旅行天数", ge=1, le=30, example=3)
    transportation: str = Field(..., description="交通方式", example="公共交通")
    accommodation: str = Field(..., description="住宿偏好", example="经济型酒店")
    preferences: List[str] = Field(default=[], description="旅行偏好标签", example=["历史文化", "美食"])
    free_text_input: Optional[str] = Field(default="", description="额外要求", example="希望多安排一些博物馆")
    
    class Config:
        json_schema_extra = {
            "example": {
                "city": "北京",
                "start_date": "2025-06-01",
                "end_date": "2025-06-03",
                "travel_days": 3,
                "transportation": "公共交通",
                "accommodation": "经济型酒店",
                "preferences": ["历史文化", "美食"],
                "free_text_input": "希望多安排一些博物馆"
            }
        }


class POISearchRequest(BaseModel):
    """POI搜索请求"""
    keywords: str = Field(..., description="搜索关键词", example="故宫")
    city: str = Field(..., description="城市", example="北京")
    citylimit: bool = Field(default=True, description="是否限制在城市范围内")


class RouteRequest(BaseModel):
    """路线规划请求"""
    origin_address: str = Field(..., description="起点地址", example="北京市朝阳区阜通东大街6号")
    destination_address: str = Field(..., description="终点地址", example="北京市海淀区上地十街10号")
    origin_city: Optional[str] = Field(default=None, description="起点城市")
    destination_city: Optional[str] = Field(default=None, description="终点城市")
    route_type: str = Field(default="walking", description="路线类型: walking/driving/transit")


# ============ 响应模型 ============

class Location(BaseModel):
    """地理位置"""
    longitude: float = Field(..., description="经度")
    latitude: float = Field(..., description="纬度")


class Attraction(BaseModel):
    """景点信息"""
    name: str = Field(..., description="景点名称")
    address: str = Field(..., description="地址")
    location: Location = Field(..., description="经纬度坐标")
    visit_duration: int = Field(..., description="建议游览时间(分钟)")
    description: str = Field(..., description="景点描述")
    category: Optional[str] = Field(default="景点", description="景点类别")
    rating: Optional[float] = Field(default=None, description="评分")
    photos: Optional[List[str]] = Field(default_factory=list, description="景点图片URL列表")
    poi_id: Optional[str] = Field(default="", description="POI ID")
    image_url: Optional[str] = Field(default=None, description="图片URL")
    ticket_price: int = Field(default=0, description="门票价格(元)")


class Meal(BaseModel):
    """餐饮信息"""
    type: str = Field(..., description="餐饮类型: breakfast/lunch/dinner/snack")
    name: str = Field(..., description="餐饮名称")
    address: Optional[str] = Field(default=None, description="地址")
    location: Optional[Location] = Field(default=None, description="经纬度坐标")
    description: Optional[str] = Field(default=None, description="描述")
    estimated_cost: int = Field(default=0, description="预估费用(元)")


class Hotel(BaseModel):
    """酒店信息"""
    name: str = Field(..., description="酒店名称")
    address: str = Field(default="", description="酒店地址")
    location: Optional[Location] = Field(default=None, description="酒店位置")
    price_range: str = Field(default="", description="价格范围")
    rating: str = Field(default="", description="评分")
    distance: str = Field(default="", description="距离景点距离")
    type: str = Field(default="", description="酒店类型")
    estimated_cost: int = Field(default=0, description="预估费用(元/晚)")


class DayPlan(BaseModel):
    """单日行程"""
    date: str = Field(..., description="日期 YYYY-MM-DD")
    day_index: int = Field(..., description="第几天(从0开始)")
    description: str = Field(..., description="当日行程描述")
    transportation: str = Field(..., description="交通方式")
    accommodation: str = Field(..., description="住宿")
    hotel: Optional[Hotel] = Field(default=None, description="推荐酒店")
    attractions: List[Attraction] = Field(default=[], description="景点列表")
    meals: List[Meal] = Field(default=[], description="餐饮列表")


class WeatherInfo(BaseModel):
    """天气信息"""
    date: str = Field(..., description="日期 YYYY-MM-DD")
    day_weather: str = Field(default="", description="白天天气")
    night_weather: str = Field(default="", description="夜间天气")
    day_temp: Union[int, str] = Field(default=0, description="白天温度")
    night_temp: Union[int, str] = Field(default=0, description="夜间温度")
    wind_direction: str = Field(default="", description="风向")
    wind_power: str = Field(default="", description="风力")

    @field_validator('day_temp', 'night_temp', mode='before')
    @classmethod
    def parse_temperature(cls, v):
        """解析温度,移除°C等单位"""
        if isinstance(v, str):
            # 移除°C, ℃等单位符号
            v = v.replace('°C', '').replace('℃', '').replace('°', '').strip()
            try:
                return int(v)
            except ValueError:
                return 0
        return v


class Budget(BaseModel):
    """预算信息"""
    total_attractions: int = Field(default=0, description="景点门票总费用")
    total_hotels: int = Field(default=0, description="酒店总费用")
    total_meals: int = Field(default=0, description="餐饮总费用")
    total_transportation: int = Field(default=0, description="交通总费用")
    total: int = Field(default=0, description="总费用")


class TripPlan(BaseModel):
    """旅行计划"""
    city: str = Field(..., description="目的地城市")
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")
    days: List[DayPlan] = Field(..., description="每日行程")
    weather_info: List[WeatherInfo] = Field(default=[], description="天气信息")
    overall_suggestions: str = Field(..., description="总体建议")
    budget: Optional[Budget] = Field(default=None, description="预算信息")


# ============ 知识图谱数据模型 ============

class GraphNode(BaseModel):
    """图谱节点"""
    id: str = Field(..., description="节点ID")
    name: str = Field(..., description="节点名称")
    category: int = Field(default=0, description="分类索引")
    symbolSize: int = Field(default=30, description="节点大小")
    itemStyle: Optional[dict] = Field(default=None, description="节点样式")
    value: Optional[str] = Field(default="", description="附加信息")


class GraphEdge(BaseModel):
    """图谱边"""
    source: str = Field(..., description="源节点ID")
    target: str = Field(..., description="目标节点ID")
    label: str = Field(default="", description="关系标签")


class GraphCategory(BaseModel):
    """图谱分类"""
    name: str = Field(..., description="分类名称")


class KnowledgeGraphData(BaseModel):
    """知识图谱数据"""
    nodes: List[GraphNode] = Field(default=[], description="节点列表")
    edges: List[GraphEdge] = Field(default=[], description="边列表")
    categories: List[GraphCategory] = Field(default=[], description="分类列表")


class TripPlanResponse(BaseModel):
    """旅行计划响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: Optional[TripPlan] = Field(default=None, description="旅行计划数据")
    graph_data: Optional[KnowledgeGraphData] = Field(default=None, description="知识图谱数据")


class POIInfo(BaseModel):
    """POI信息"""
    id: str = Field(..., description="POI ID")
    name: str = Field(..., description="名称")
    type: str = Field(..., description="类型")
    address: str = Field(..., description="地址")
    location: Location = Field(..., description="经纬度坐标")
    tel: Optional[str] = Field(default=None, description="电话")


class POISearchResponse(BaseModel):
    """POI搜索响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: List[POIInfo] = Field(default=[], description="POI列表")


class RouteInfo(BaseModel):
    """路线信息"""
    distance: float = Field(..., description="距离(米)")
    duration: int = Field(..., description="时间(秒)")
    route_type: str = Field(..., description="路线类型")
    description: str = Field(..., description="路线描述")


class RouteResponse(BaseModel):
    """路线规划响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: Optional[RouteInfo] = Field(default=None, description="路线信息")


class WeatherResponse(BaseModel):
    """天气查询响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: List[WeatherInfo] = Field(default=[], description="天气信息")


# ============ R1 地图契约（唯一事实源，见 docs/r1/CONTRACT.md）============
#
# 本段是公交换乘 / 附近站点 / 一键导航的唯一定义。
# 分支 poll-153 的 TransitPlan/TransitSegment、poll-158 的 NearbyStationData
# 均已废弃，合并时删除，不得保留别名。

class NearbyStation(BaseModel):
    """附近公交/地铁站点（R1 契约 §2）"""
    id: str = Field(default="", description="腾讯 POI ID")
    name: str = Field(..., description="站点名称，如 '中关村[地铁站]'")
    type: str = Field(default="other", description="站点类型: metro/bus/other")
    address: str = Field(default="", description="上游 address 字段（腾讯放途经线路）")
    location: Location = Field(..., description="站点坐标(GCJ02)")
    distance: int = Field(default=0, ge=0, description="与检索点距离(整数米)")
    lines: List[str] = Field(default=[], description="途经线路，由上游 address 切分")


class NearbyStationResponse(BaseModel):
    """附近站点响应（R1 契约 §2）

    data 恒为数组，前端以 Array.isArray(payload.data) 判定可用性。
    降级时 degraded=true 且 data=[]，绝不伪造站点。
    """
    success: bool = Field(..., description="是否成功")
    degraded: bool = Field(default=False, description="是否降级(Key 缺失/上游失败/未授权)")
    message: str = Field(default="", description="消息")
    data: List[NearbyStation] = Field(default=[], description="站点列表(距离升序)")


class TransitStep(BaseModel):
    """换乘单段（R1 契约 §3）"""
    mode: str = Field(..., description="段类型: WALKING/TRANSIT/RAILWAY/TAXI")
    distance: int = Field(default=0, description="本段距离(米)")
    duration: int = Field(default=0, description="本段耗时(秒)")
    line: str = Field(default="", description="线路名，步行段为空")
    from_name: str = Field(default="", description="上车站/起点名")
    to_name: str = Field(default="", description="下车站/终点名")
    instruction: str = Field(default="", description="步行导航文字指引")


class TransitRoute(BaseModel):
    """公交换乘方案（R1 契约 §3）"""
    distance: int = Field(default=0, description="总距离(米)")
    duration: int = Field(default=0, description="总耗时(秒)")
    transfers: int = Field(default=0, description="换乘次数 = 乘坐段数 - 1")
    fare: Optional[float] = Field(default=None, description="总票价(元)，无票价时 None")
    steps: List[TransitStep] = Field(default=[], description="换乘段列表(步行与乘坐交错)")


class TransitResponse(BaseModel):
    """公交换乘响应（R1 契约 §3）

    data 为多方案数组（上游默认返回最多 5 条）。
    """
    success: bool = Field(..., description="是否成功")
    degraded: bool = Field(default=False, description="是否降级")
    message: str = Field(default="", description="消息")
    data: List[TransitRoute] = Field(default=[], description="换乘方案列表(按上游推荐序)")


class NavLink(BaseModel):
    """Web 端一键导航链接（R1 契约 §4）"""
    mode: str = Field(..., description="导航方式: walk/drive/transit")
    destination: str = Field(..., description="目的地")
    provider: str = Field(default="tencent", description="地图服务商")
    url: str = Field(..., description="Web 跳转导航链接")


class NavLinkResponse(BaseModel):
    """一键导航链接响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: Optional[NavLink] = Field(default=None, description="导航链接")


class CitySpot(BaseModel):
    """城市探索的一处去处（R1 契约 §5）"""
    id: str = Field(default="", description="腾讯 POI ID")
    name: str = Field(..., description="地点名称")
    category: str = Field(default="", description="上游 category，如 '旅游景点:国家级景点'")
    kind: str = Field(default="other", description="归一化类型: spot/food/park/museum")
    address: str = Field(default="", description="上游 address")
    location: Location = Field(..., description="坐标(GCJ02)")
    distance: int = Field(default=0, ge=0, description="与城市中心的直线距离(米)")
    score: float = Field(default=0.0, description="推荐分，降序排列依据")


class CityCenter(BaseModel):
    """城市中心（契约 §5）—— 城市名解析出来的检索原点"""
    name: str = Field(..., description="规范化城市名，如 '杭州市'")
    location: Location = Field(..., description="城市中心坐标(GCJ02)")


class CityExploreResponse(BaseModel):
    """当前城市探索响应（R1 契约 §5）

    data 恒为数组，与 §2 一致：前端以 Array.isArray 判定。
    降级时 degraded=true 且 data=[]，绝不伪造地点。
    """
    success: bool = Field(..., description="是否成功")
    degraded: bool = Field(default=False, description="是否降级(Key 缺失/上游失败/城市无法解析)")
    message: str = Field(default="", description="消息")
    city: Optional[CityCenter] = Field(default=None, description="解析出的城市中心，降级时为 None")
    data: List[CitySpot] = Field(default=[], description="去处列表(按 score 降序)")


# ============ 错误响应 ============

class ErrorResponse(BaseModel):
    """错误响应"""
    success: bool = Field(default=False, description="是否成功")
    message: str = Field(..., description="错误消息")
    error_code: Optional[str] = Field(default=None, description="错误代码")


# ============ AI 行程问答模型 ============

class ChatMessage(BaseModel):
    """单条对话消息"""
    role: str = Field(..., description="角色: user / assistant")
    content: str = Field(..., description="消息内容")


class TripChatRequest(BaseModel):
    """行程问答请求"""
    message: str = Field(..., description="用户提问内容")
    trip_plan: dict = Field(..., description="当前旅行计划(JSON对象)")
    history: Optional[List[ChatMessage]] = Field(default=[], description="历史对话记录")


class TripChatResponse(BaseModel):
    """行程问答响应"""
    success: bool = Field(default=True, description="是否成功")
    reply: str = Field(..., description="AI回复内容")
