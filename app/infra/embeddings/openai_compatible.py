import aiohttp
import asyncio
from dataclasses import dataclass
from langchain_core.embeddings import Embeddings



@dataclass(frozen=True)
class OpenAICompatibleEmbeddingsConfig:
    base_url: str
    api_key: str = ""
    model: str = ""
    timeout_s: int = 60


class OpenAICompatibleEmbeddings(Embeddings):
    def __init__(self, config: OpenAICompatibleEmbeddingsConfig) -> None:
        self._config = config
        self._session = None

    async def _get_session(self):
        if self._session is None:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self._config.timeout_s))
        return self._session

    async def aclose(self):
        if self._session is not None:
            await self._session.close()
            self._session = None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("embed_documents() called inside running event loop; use await aembed_documents()")
        return asyncio.run(self.aembed_documents(texts))

    def embed_query(self, text: str) -> list[float]:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("embed_query() called inside running event loop; use await aembed_query()")
        return asyncio.run(self.aembed_query(text))

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        session = await self._get_session()
        embeddings = []

        # 逐个请求（因为 API 不支持批量）
        for text in texts:
            payload = {
                "input": text,  # 单个字符串
                "model": self._config.model
            }

            headers = {"Content-Type": "application/json"}
            if self._config.api_key:
                headers["Authorization"] = f"Bearer {self._config.api_key}"

            async with session.post(
                    self._config.base_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Embedding API error: {error_text}")

                data = await response.json()

                # 根据 API 响应格式提取
                if "embedding" in data:
                    embeddings.append(data["embedding"])
                elif "data" in data and len(data["data"]) > 0:
                    embeddings.append(data["data"][0]["embedding"])
                else:
                    raise Exception(f"Unexpected response format: {list(data.keys())}")

        return embeddings
    async def aembed_query(self, text: str) -> list[float]:
        embeddings = await self.aembed_documents([text])
        return embeddings[0]
