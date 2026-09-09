import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import context_builder, models, openrouter_client, schemas
from ..auth import get_current_user
from ..crypto import decrypt_secret
from ..database import SessionLocal, get_db
from ..deps import get_owned_workspace

router = APIRouter(prefix="/api/workspaces/{workspace_id}/chat", tags=["chat"])

FILE_BLOCK_RE = re.compile(
    r"<<<FILE:\s*(?P<path>[^\n>]+?)\s*>>>\n(?P<content>.*?)\n<<<END FILE>>>", re.DOTALL
)


def parse_file_blocks(text: str) -> list[dict]:
    return [{"path": m.group("path").strip(), "content": m.group("content")} for m in FILE_BLOCK_RE.finditer(text)]


@router.get("", response_model=list[schemas.ChatMessageOut])
def history(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    return db.query(models.ChatMessage).filter_by(workspace_id=ws.id).order_by(models.ChatMessage.id).all()


@router.post("")
async def chat(
    payload: schemas.ChatRequest,
    current_user: models.User = Depends(get_current_user),
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    key_row = db.query(models.OpenRouterKey).filter_by(user_id=current_user.id).first()
    if not key_row:
        raise HTTPException(400, "No OpenRouter API key on file. Add one under Settings first.")
    api_key = decrypt_secret(key_row.encrypted_key, key_row.encrypted_nonce)

    task = db.get(models.Task, ws.task_id)
    bundle, _sources = context_builder.build_context_bundle(db, ws, task, Path(ws.worktree_path))
    system_prompt = (
        context_builder.SYSTEM_PROMPT_TEMPLATE.format(
            task_title=task.title, task_track=task.track, task_description=task.description or "(none)"
        )
        + "\n"
        + bundle
    )

    prior = db.query(models.ChatMessage).filter_by(workspace_id=ws.id).order_by(models.ChatMessage.id).all()
    messages = [{"role": "system", "content": system_prompt}]
    for m in prior[-20:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": payload.message})

    # Capture plain values now: the request-scoped `db` session (and anything
    # loaded through it, like `ws`) is closed by FastAPI as soon as this
    # function returns the StreamingResponse -- well before the generator
    # body below actually runs. Touching `ws.*` inside the generator raises
    # sqlalchemy.orm.exc.DetachedInstanceError.
    workspace_id = ws.id
    model_used = payload.model

    db.add(models.ChatMessage(workspace_id=workspace_id, role="user", content=payload.message, model_used=model_used))
    db.commit()

    async def event_gen():
        full_text = ""
        try:
            async for raw in openrouter_client.stream_chat(api_key, model_used, messages):
                delta = openrouter_client.extract_delta(raw)
                if delta:
                    full_text += delta
                    yield f"data: {json.dumps({'delta': delta})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        # Fresh session: the request-scoped one is already closed by now.
        db2 = SessionLocal()
        try:
            msg = models.ChatMessage(
                workspace_id=workspace_id, role="assistant", content=full_text, model_used=model_used
            )
            db2.add(msg)
            db2.commit()
            db2.refresh(msg)
            blocks = parse_file_blocks(full_text)
            yield f"data: {json.dumps({'done': True, 'message_id': msg.id, 'proposed_edits': blocks})}\n\n"
        finally:
            db2.close()

    return StreamingResponse(event_gen(), media_type="text/event-stream")
