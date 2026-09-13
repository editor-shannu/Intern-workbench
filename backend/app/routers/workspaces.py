import sys
import time
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import context_builder, git_manager, models, schemas
from ..auth import get_current_user, require_admin
from ..config import settings
from ..database import get_db
from ..deps import get_owned_workspace

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("/open/{task_id}", response_model=schemas.WorkspaceOut)
def open_workspace(
    task_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.assigned_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "This task isn't assigned to you")

    existing = (
        db.query(models.Workspace).filter_by(task_id=task_id, user_id=current_user.id).first()
    )
    if existing and Path(existing.worktree_path).exists():
        if existing.status == "archived":
            existing.status = "active"
            db.commit()
            db.refresh(existing)
        return existing

    try:
        # Pass the project context down
        project_id = task.project_id
        repo_url = task.project.repo_url if task.project else ""
        base_branch = task.project.base_branch if task.project else settings.BASE_BRANCH
        
        git_manager.fetch_latest(project_id, repo_url, base_branch)
        slug = git_manager.slugify(task.title)
        branch = f"intern/{git_manager.slugify(current_user.name)}/{slug}-{task.id}"
        dirname = f"{git_manager.slugify(current_user.name)}__{slug}_{task.id}"
        worktree_path = Path(settings.WORKSPACES_ROOT) / dirname
        base_sha = git_manager.create_worktree(worktree_path, branch, base_branch, project_id)
        git_manager.set_identity(worktree_path, current_user.name, current_user.github_author_email)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))

    if existing:
        existing.branch_name = branch
        existing.worktree_path = str(worktree_path)
        existing.base_commit_sha = base_sha
        existing.status = "active"
        task.status = "in_progress"
        db.commit()
        db.refresh(existing)
        return existing

    ws = models.Workspace(
        task_id=task.id,
        user_id=current_user.id,
        branch_name=branch,
        worktree_path=str(worktree_path),
        base_commit_sha=base_sha,
        status="active",
    )
    db.add(ws)
    task.status = "in_progress"
    db.commit()
    db.refresh(ws)
    return ws


@router.get("/{workspace_id}", response_model=schemas.WorkspaceDetail)
def get_workspace(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    task = db.get(models.Task, ws.task_id)
    pr = db.query(models.PullRequest).filter_by(workspace_id=ws.id).first()
    return schemas.WorkspaceDetail(
        id=ws.id,
        task_id=ws.task_id,
        user_id=ws.user_id,
        branch_name=ws.branch_name,
        worktree_path=ws.worktree_path,
        base_commit_sha=ws.base_commit_sha,
        status=ws.status,
        task=schemas.TaskOut.model_validate(task),
        pull_request=schemas.PullRequestOut.model_validate(pr) if pr else None,
    )


@router.get("/{workspace_id}/tree", response_model=list[schemas.TreeNode])
def get_tree(ws: models.Workspace = Depends(get_owned_workspace)):
    return git_manager.list_tree(Path(ws.worktree_path))


@router.post("/{workspace_id}/context/attach", response_model=schemas.ContextSnippetOut)
def attach_context(
    payload: schemas.ContextAttach,
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    try:
        safe = git_manager.resolve_safe_path(Path(ws.worktree_path), payload.path)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))
    if not safe.exists() or not safe.is_file():
        raise HTTPException(400, "File not found in this workspace")
    
    existing = db.query(models.ContextSnippet).filter_by(workspace_id=ws.id, source_path=payload.path).first()
    if existing:
        return existing

    content = safe.read_text(errors="ignore")[:20000]
    snip = models.ContextSnippet(workspace_id=ws.id, source_path=payload.path, content=content)
    db.add(snip)
    db.commit()
    db.refresh(snip)
    return snip


@router.get("/{workspace_id}/context", response_model=list[schemas.ContextSnippetOut])
def list_context(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    return db.query(models.ContextSnippet).filter_by(workspace_id=ws.id).all()


@router.delete("/{workspace_id}/context/{snippet_id}")
def remove_context(
    snippet_id: int, ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)
):
    snip = db.query(models.ContextSnippet).filter_by(id=snippet_id, workspace_id=ws.id).first()
    if not snip:
        raise HTTPException(404, "Context snippet not found")
    db.delete(snip)
    db.commit()
    return {"status": "deleted"}


@router.get("/{workspace_id}/context/inspect", response_model=schemas.ContextInspectOut)
def inspect_context(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    task = db.get(models.Task, ws.task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    data = context_builder.inspect_context_bundle(db, ws, task, Path(ws.worktree_path))
    return schemas.ContextInspectOut(**data)


@router.get("", response_model=list[schemas.WorkspaceDetail])
def list_workspaces(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    workspaces = db.query(models.Workspace).all()
    out = []
    for ws in workspaces:
        task = db.get(models.Task, ws.task_id)
        pr = db.query(models.PullRequest).filter_by(workspace_id=ws.id).first()
        out.append(
            schemas.WorkspaceDetail(
                id=ws.id,
                task_id=ws.task_id,
                user_id=ws.user_id,
                branch_name=ws.branch_name,
                worktree_path=ws.worktree_path,
                base_commit_sha=ws.base_commit_sha,
                status=ws.status,
                task=schemas.TaskOut.model_validate(task) if task else None,
                pull_request=schemas.PullRequestOut.model_validate(pr) if pr else None,
            )
        )
    return out


@router.post("/{workspace_id}/prune")
def prune_workspace(
    workspace_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ws = db.get(models.Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    task = db.get(models.Task, ws.task_id)
    project_id = task.project_id if task else None

    # Prune worktree on disk
    git_manager.prune_worktree(Path(ws.worktree_path), project_id)

    ws.status = "archived"
    db.commit()
    db.refresh(ws)
    return {"status": "archived", "workspace_id": ws.id}


@router.post("/{workspace_id}/run-tests", response_model=schemas.TestRunResponse)
def run_workspace_tests(
    payload: schemas.TestRunRequest,
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    raw_path = Path(ws.worktree_path)
    backend_root = Path(__file__).resolve().parent.parent.parent
    worktree_path = raw_path if raw_path.is_absolute() else (backend_root / raw_path)
    if not worktree_path.exists():
        raise HTTPException(404, "Workspace worktree directory not found on disk")

    cmd_raw = (payload.command or "pytest").strip()
    python_exe = sys.executable

    # Construct safe command arguments
    if cmd_raw.startswith("pytest"):
        extra_args = cmd_raw.split()[1:]
        cmd_args = [python_exe, "-m", "pytest"] + extra_args
    elif cmd_raw.startswith("python -m unittest"):
        extra_args = cmd_raw.split()[3:]
        cmd_args = [python_exe, "-m", "unittest"] + extra_args
    elif cmd_raw.startswith("python "):
        script = cmd_raw[7:].strip()
        cmd_args = [python_exe, script]
    elif payload.target_file:
        cmd_args = [python_exe, payload.target_file]
    else:
        cmd_args = [python_exe, "-m", "pytest"]

    start_time = time.time()
    try:
        res = subprocess.run(
            cmd_args,
            cwd=str(worktree_path),
            capture_output=True,
            text=True,
            timeout=25,
        )
        duration_ms = int((time.time() - start_time) * 1000)
        display_cmd = cmd_raw if not payload.target_file else f"python {payload.target_file}"
        return schemas.TestRunResponse(
            command=display_cmd,
            exit_code=res.returncode,
            passed=(res.returncode == 0),
            stdout=res.stdout or "",
            stderr=res.stderr or "",
            duration_ms=duration_ms,
        )
    except subprocess.TimeoutExpired as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return schemas.TestRunResponse(
            command=cmd_raw,
            exit_code=124,
            passed=False,
            stdout=e.stdout or "" if hasattr(e, "stdout") and e.stdout else "",
            stderr="Execution timed out after 25 seconds.",
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return schemas.TestRunResponse(
            command=cmd_raw,
            exit_code=1,
            passed=False,
            stdout="",
            stderr=str(e),
            duration_ms=duration_ms,
        )

