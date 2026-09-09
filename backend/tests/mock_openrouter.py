"""
Minimal stand-in for OpenRouter's streaming /chat/completions endpoint, so
the chat feature can be exercised locally without spending real API credits.

Usage:
    python3 tests/mock_openrouter.py            # serves on 127.0.0.1:8090
    # then in backend/.env:
    OPENROUTER_BASE_URL=http://127.0.0.1:8090
    # and save ANY string as your OpenRouter key in Settings -- it isn't checked.
"""
import asyncio
import json
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

CANNED_REPLY = (
    "Sure, here's a small helper function for that.\n\n"
    "<<<FILE: app/new_feature.py>>>\n"
    "def add(a, b):\n"
    '    """Return the sum of a and b."""\n'
    "    return a + b\n"
    "<<<END FILE>>>\n\n"
    "Let me know if you'd like tests for this too."
)


@app.post("/chat/completions")
async def chat_completions(request: Request):
    async def gen():
        for word in CANNED_REPLY.split(" "):
            chunk = {"choices": [{"delta": {"content": word + " "}}]}
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.01)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8090)
