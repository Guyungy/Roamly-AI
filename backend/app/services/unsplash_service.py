"""Unsplash图片服务 - 异步版本"""

import random
import httpx
from typing import List, Optional
from ..config import get_settings


class UnsplashService:
    """Unsplash图片服务类"""

    def __init__(self):
        settings = get_settings()
        self.access_key = settings.unsplash_access_key
        self.base_url = "https://api.unsplash.com"

    async def search_photos(self, query: str, per_page: int = 5) -> List[dict]:
        """异步搜索图片"""
        try:
            url = f"{self.base_url}/search/photos"
            params = {
                "query": query,
                "per_page": per_page,
                "client_id": self.access_key
            }

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()

            data = response.json()
            results = data.get("results", [])

            photos = []
            for photo in results:
                photos.append({
                    "id": photo.get("id"),
                    "url": photo.get("urls", {}).get("regular"),
                    "thumb": photo.get("urls", {}).get("thumb"),
                    "description": photo.get("description") or photo.get("alt_description"),
                    "photographer": photo.get("user", {}).get("name")
                })

            return photos

        except Exception as e:
            print(f"❌ Unsplash搜索失败: {str(e)}")
            return []

    async def get_photo_url(self, query: str, randomize: bool = False) -> Optional[str]:
        """异步获取单张图片URL"""
        photos = await self.search_photos(query, per_page=10 if randomize else 1)
        if photos:
            if randomize:
                return random.choice(photos).get("url")
            return photos[0].get("url")
        return None


# 全局服务实例
_unsplash_service = None


def get_unsplash_service() -> UnsplashService:
    """获取Unsplash服务实例(单例模式)"""
    global _unsplash_service

    if _unsplash_service is None:
        _unsplash_service = UnsplashService()

    return _unsplash_service
