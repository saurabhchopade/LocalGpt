import json
import os
from typing import AsyncGenerator, Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2.5:1.5b")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
MODEL_NUM_CTX = int(os.getenv("MODEL_NUM_CTX", "1024"))

app = FastAPI(title="Local GPT Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=0, max_length=8000)


class ChatRequest(BaseModel):
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=128)
    messages: list[ChatMessage] = Field(default_factory=list)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    sanitized_messages = [
        message for message in request.messages if message.content.strip()
    ]

    if not sanitized_messages:
        raise HTTPException(status_code=400, detail="messages must include non-empty content")

    trimmed_messages = sanitized_messages[-MAX_HISTORY_MESSAGES:]

    async def stream_ollama() -> AsyncGenerator[str, None]:
        payload = {
            "model": request.model,
            "stream": True,
            "messages": [message.model_dump() for message in trimmed_messages],
            "options": {
                "num_ctx": MODEL_NUM_CTX,
                "temperature": 0.7,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/chat",
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        detail = await response.aread()
                        message = detail.decode("utf-8", errors="ignore")
                        yield f"Ollama error: {message}"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        text = chunk.get("message", {}).get("content", "")
                        if text:
                            yield text
        except Exception as exc:
            yield f"Streaming failed: {exc}"

    return StreamingResponse(stream_ollama(), media_type="text/plain; charset=utf-8")
