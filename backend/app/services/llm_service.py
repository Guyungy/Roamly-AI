"""LLM服务模块"""

from hello_agents import HelloAgentsLLM
from ..config import get_settings

# 全局LLM实例
_llm_instance = None


def get_llm() -> HelloAgentsLLM:
    """
    获取LLM实例(单例模式)
    
    Returns:
        HelloAgentsLLM实例
    """
    global _llm_instance
    
    if _llm_instance is None:
        settings = get_settings()
        
        # HelloAgentsLLM会自动从环境变量读取配置
        # 包括OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL等
        _llm_instance = HelloAgentsLLM()
        
        # 【关键修复】：针对第三方中转API可能开启了 Cloudflare/WAF 拦截 Python 默认爬虫特征的情况
        # 我们手动覆盖底层的 OpenAI client，加入伪装的浏览器 User-Agent
        from openai import OpenAI
        _llm_instance._client = OpenAI(
            api_key=_llm_instance.api_key,
            base_url=_llm_instance.base_url,
            timeout=_llm_instance.timeout,
            default_headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        
        print(f"✅ LLM服务初始化成功")
        print(f"   提供商: {_llm_instance.provider}")
        print(f"   模型: {_llm_instance.model}")
    
    return _llm_instance


def reset_llm():
    """重置LLM实例(用于测试或重新配置)"""
    global _llm_instance
    _llm_instance = None

