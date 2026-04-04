"""旅行规划API路由 - 异步轮询模式"""

import asyncio
import time
import uuid
from fastapi import APIRouter, HTTPException
from ...models.schemas import (
    TripRequest,
    TripPlanResponse,
    ErrorResponse
)
from ...agents.trip_planner_agent import get_trip_planner_agent
from ...services.knowledge_graph_service import build_knowledge_graph

router = APIRouter(prefix="/trip", tags=["旅行规划"])

# 内存任务存储
_tasks: dict = {}

# 任务配置
TASK_TTL_SECONDS = 1800       # 任务最大保留时间 30 分钟
TASK_TIMEOUT_SECONDS = 600    # 单次任务最大执行时间 10 分钟
CLEANUP_INTERVAL_SECONDS = 300  # 清理间隔 5 分钟

_cleanup_task = None


async def _cleanup_stale_tasks():
    """后台定期清理过期任务"""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        now = time.time()
        stale_keys = [
            k for k, v in _tasks.items()
            if now - v.get("created_at", now) > TASK_TTL_SECONDS
        ]
        for k in stale_keys:
            del _tasks[k]
        if stale_keys:
            print(f"🧹 已清理 {len(stale_keys)} 个过期任务")


def start_cleanup_loop():
    """启动清理循环（由 lifespan 调用）"""
    global _cleanup_task
    if _cleanup_task is None:
        _cleanup_task = asyncio.create_task(_cleanup_stale_tasks())


@router.post(
    "/plan",
    summary="提交旅行规划任务",
    description="异步提交旅行规划请求，立即返回 task_id，通过 /trip/status/{task_id} 轮询结果"
)
async def plan_trip(request: TripRequest):
    """提交旅行规划任务（立即返回 task_id）"""
    task_id = str(uuid.uuid4())[:8]

    print(f"\n{'='*60}")
    print(f"📥 收到旅行规划请求 (task_id={task_id}):")
    print(f"   城市: {request.city}")
    print(f"   日期: {request.start_date} - {request.end_date}")
    print(f"   天数: {request.travel_days}")
    print(f"{'='*60}\n")

    _tasks[task_id] = {
        "status": "processing",
        "progress": "正在初始化智能体...",
        "created_at": time.time(),
    }

    asyncio.create_task(_run_trip_planning(task_id, request))

    return {"task_id": task_id, "status": "processing", "message": "任务已提交，请轮询 /api/trip/status/" + task_id}


async def _run_trip_planning(task_id: str, request: TripRequest):
    """后台执行旅行规划（带超时保护）"""
    try:
        async def _do_planning():
            _tasks[task_id]["progress"] = "正在获取多智能体系统实例..."
            agent = get_trip_planner_agent()

            _tasks[task_id]["progress"] = "AI 正在规划行程，请稍候..."
            trip_plan = await agent.plan_trip(request)

            _tasks[task_id]["progress"] = "正在构建知识图谱..."
            graph_data = build_knowledge_graph(trip_plan)

            return trip_plan, graph_data

        trip_plan, graph_data = await asyncio.wait_for(
            _do_planning(),
            timeout=TASK_TIMEOUT_SECONDS
        )

        print(f"✅ 任务 {task_id} 完成")

        _tasks[task_id] = {
            "status": "completed",
            "created_at": _tasks.get(task_id, {}).get("created_at", time.time()),
            "result": TripPlanResponse(
                success=True,
                message="旅行计划生成成功",
                data=trip_plan,
                graph_data=graph_data
            )
        }

    except asyncio.TimeoutError:
        print(f"⏰ 任务 {task_id} 超时 (>{TASK_TIMEOUT_SECONDS}s)")
        _tasks[task_id] = {
            "status": "failed",
            "created_at": _tasks.get(task_id, {}).get("created_at", time.time()),
            "error": f"任务执行超时（超过 {TASK_TIMEOUT_SECONDS // 60} 分钟）"
        }

    except Exception as e:
        print(f"❌ 任务 {task_id} 失败: {e}")
        import traceback
        traceback.print_exc()
        _tasks[task_id] = {
            "status": "failed",
            "created_at": _tasks.get(task_id, {}).get("created_at", time.time()),
            "error": str(e)
        }


@router.get(
    "/status/{task_id}",
    summary="查询任务状态",
    description="轮询旅行规划任务的执行状态和结果"
)
async def get_task_status(task_id: str):
    """查询任务执行状态"""
    if task_id not in _tasks:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    task = _tasks[task_id]

    if task["status"] == "completed":
        result = task["result"]
        del _tasks[task_id]
        return {
            "status": "completed",
            "result": result
        }
    elif task["status"] == "failed":
        error = task["error"]
        del _tasks[task_id]
        return {
            "status": "failed",
            "error": error
        }
    else:
        return {
            "status": "processing",
            "progress": task.get("progress", "处理中...")
        }


@router.get(
    "/health",
    summary="健康检查",
    description="检查旅行规划服务是否正常"
)
async def health_check():
    """健康检查"""
    try:
        agent = get_trip_planner_agent()
        return {
            "status": "healthy",
            "service": "trip-planner",
            "agent_name": agent.agent.name if hasattr(agent, 'agent') else "MultiAgentTripPlanner",
            "active_tasks": len(_tasks)
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"服务不可用: {str(e)}"
        )
