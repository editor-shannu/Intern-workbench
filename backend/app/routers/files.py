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


@router.post("")
def create_file_or_dir(
    payload: schemas.FileCreate,
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    try:
        safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))

    if safe == Path(ws.worktree_path).resolve():
        raise HTTPException(400, "Cannot create workspace root")

    if safe.exists():
        raise HTTPException(400, f"Path already exists: {payload.path}")

    if payload.is_directory:
        safe.mkdir(parents=True, exist_ok=True)
    else:
        safe.parent.mkdir(parents=True, exist_ok=True)
        content = payload.content or ""
        safe.write_text(content)
        if content:
            diff = git_manager.unified_diff("", content, payload.path)
            db.add(models.FileEdit(workspace_id=ws.id, file_path=payload.path, diff=diff))
            db.commit()

    return {"status": "created", "path": payload.path, "is_directory": payload.is_directory}


@router.delete("")
def delete_file_or_dir(
    payload: schemas.FileDelete,
    ws: models.Workspace = Depends(get_owned_workspace),
):
    import shutil

    try:
        safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))

    if safe == Path(ws.worktree_path).resolve():
        raise HTTPException(400, "Cannot delete workspace root")

    if not safe.exists():
        raise HTTPException(404, f"Path not found: {payload.path}")

    if safe.is_dir():
        shutil.rmtree(safe)
    else:
        safe.unlink()

    return {"status": "deleted", "path": payload.path}


@router.patch("/rename")
def rename_file_or_dir(
    payload: schemas.FileRename,
    ws: models.Workspace = Depends(get_owned_workspace),
):
    try:
        old_safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.old_path)
        new_safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.new_path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))

    if old_safe == Path(ws.worktree_path).resolve() or new_safe == Path(ws.worktree_path).resolve():
        raise HTTPException(400, "Cannot rename workspace root")

    if not old_safe.exists():
        raise HTTPException(404, f"Source path not found: {payload.old_path}")

    if new_safe.exists():
        raise HTTPException(400, f"Target path already exists: {payload.new_path}")

    new_safe.parent.mkdir(parents=True, exist_ok=True)
    old_safe.rename(new_safe)

    return {"status": "renamed", "old_path": payload.old_path, "new_path": payload.new_path}
