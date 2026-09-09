from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import git_manager, models, schemas
from ..database import get_db
from ..deps import get_owned_workspace

router = APIRouter(prefix="/api/workspaces/{workspace_id}/files", tags=["files"])


@router.get("", response_model=schemas.FileContentOut)
def read_file(path: str, ws: models.Workspace = Depends(get_owned_workspace)):
    try:
        safe = git_manager.resolve_safe_path(Path(ws.worktree_path), path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))
    content = safe.read_text(errors="ignore") if safe.exists() and safe.is_file() else ""
    return schemas.FileContentOut(path=path, content=content)


@router.put("")
def write_file(
    payload: schemas.FileWrite,
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    try:
        safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))
    old_content = safe.read_text(errors="ignore") if safe.exists() and safe.is_file() else ""
    safe.parent.mkdir(parents=True, exist_ok=True)
    safe.write_text(payload.content)

    diff = git_manager.unified_diff(old_content, payload.content, payload.path)
    db.add(models.FileEdit(workspace_id=ws.id, file_path=payload.path, diff=diff))
    db.commit()
    return {"status": "saved"}
