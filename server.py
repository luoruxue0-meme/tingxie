# -*- coding: utf-8 -*-
"""
Thalita 真人女声 TTS 后端 (部署到 Render/Railway 等)
接口: GET /api/tts?text=你好&amp;rate=-12%  →  mp3 音频
"""
import asyncio, hashlib, os, tempfile
import edge_tts
from fastapi import FastAPI, Query, Response, HTTPException

app = FastAPI()

VOICE = os.environ.get("TTS_VOICE", "pt-BR-ThalitaMultilingualNeural")

# Render 免费实例文件系统不持久, 缓存放临时目录即可(内存/磁盘均可, 非必须)
CACHE_DIR = os.path.join(tempfile.gettempdir(), "tts_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_path(text: str, rate: str) -> str:
    key = hashlib.md5(f"{text}|{VOICE}|{rate}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, key + ".mp3")


@app.get("/")
def root():
    return {"status": "ok", "voice": VOICE}


@app.get("/api/tts")
def tts(
    text: str = Query(..., min_length=1, max_length=500),
    rate: str = Query("+0%"),
    pitch: str = Query("+0Hz"),
):
    text = text.strip()
    if not text:
        raise HTTPException(400, "text 不能为空")
    cache_file = _cache_path(text, rate)
    if not os.path.exists(cache_file):
        try:
            com = edge_tts.Communicate(text, voice=VOICE, rate=rate, pitch=pitch)
            asyncio.run(com.save(cache_file))
        except Exception as e:
            raise HTTPException(502, f"合成失败: {e}")
    with open(cache_file, "rb") as f:
        data = f.read()
    return Response(content=data, media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
