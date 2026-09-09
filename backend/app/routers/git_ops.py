from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import git_manager, github_client, models, schemas
from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..deps import get_owned_workspace

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["git"])


@router.post("/commit", response_model=schemas.CommitOut)
def commit(
    payload: schemas.CommitRequest,
    current_user: models.User = Depends(get_current_user),
    ws: models.Workspace = Depends(get_owned_workspace),
    db: Session = Depends(get_db),
):
    try:
        sha = git_manager.commit_all(
            Path(ws.worktree_path), payload.message, current_user.name, current_user.github_author_email
        )
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))
    db.add(models.CommitLog(workspace_id=ws.id, commit_sha=sha, message=payload.message))
    db.commit()
    return schemas.CommitOut(commit_sha=sha)


@router.post("/push-pr", response_model=schemas.PullRequestOut)
def push_and_open_pr(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    task = db.get(models.Task, ws.task_id)
    repo_url = task.project.repo_url if task.project else settings.UPSTREAM_REPO_URL

    try:
        git_manager.push_branch(Path(ws.worktree_path), ws.branch_name, repo_url)
    except git_manager.GitError as e:
        raise HTTPException(400, f"Push failed: {e}")

    existing = db.query(models.PullRequest).filter_by(workspace_id=ws.id, status="open").first()
    if existing:
        return existing  # branch already has an open PR -- this push just added commits to it

    commits = db.query(models.CommitLog).filter_by(workspace_id=ws.id).order_by(models.CommitLog.id).all()
    body = github_client.render_pr_body(task, commits)
    import re
    def parse_github_url(url: str) -> tuple[str, str]:
        m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
        if m:
            return m.group(1), m.group(2)
        return None, None

    repo_url = task.project.repo_url if task.project else settings.UPSTREAM_REPO_URL
    base_branch = task.project.base_branch if task.project else settings.BASE_BRANCH
    owner, repo_name = parse_github_url(repo_url)
    if not owner or not repo_name:
        owner = settings.GITHUB_REPO_OWNER
        repo_name = settings.GITHUB_REPO_NAME

    try:
        pr = github_client.open_pull_request(
            branch=ws.branch_name, title=f"[{task.track}] {task.title}", body=body,
            base=base_branch, owner=owner, repo_name=repo_name
        )
    except Exception as e:
        # Code is safely pushed. Return a dummy PR so the frontend knows to show a warning.
        rec = models.PullRequest(
            workspace_id=ws.id, github_pr_number=0, github_pr_url="error:missing_token", status="open",
            repo_owner=owner, repo_name=repo_name
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return rec

    rec = models.PullRequest(
        workspace_id=ws.id,
        github_pr_number=pr.number,
        github_pr_url=pr.html_url,
        status="open",
        repo_owner=owner,
        repo_name=repo_name
    )
    db.add(rec)
    task.status = "pr_open"
    db.commit()
    db.refresh(rec)

    return rec


@router.get("/pr-status", response_model=schemas.PullRequestOut)
def pr_status(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    rec = db.query(models.PullRequest).filter_by(workspace_id=ws.id).first()
    if not rec:
        raise HTTPException(404, "No PR has been opened for this workspace yet")
    try:
        fresh_status = github_client.get_pr_status(rec.github_pr_number, rec.repo_owner, rec.repo_name)
        if fresh_status != rec.status:
            rec.status = fresh_status
            task = db.get(models.Task, ws.task_id)
            if fresh_status == "closed":
                task.status = "in_progress"
            elif fresh_status == "merged":
                task.status = "merged"
            db.commit()
            db.refresh(rec)
    except Exception:
        pass  # fall back to last-known status rather than failing the request
    return rec


@router.post("/sync")
def sync_workspace(ws: models.Workspace = Depends(get_owned_workspace), db: Session = Depends(get_db)):
    task = db.get(models.Task, ws.task_id)
    project_id = task.project_id
    repo_url = task.project.repo_url if task.project else ""
    base_branch = task.project.base_branch if task.project else settings.BASE_BRANCH
    
    try:
        git_manager.merge_base_branch(Path(ws.worktree_path), base_branch, project_id, repo_url)
    except git_manager.GitError as e:
        raise HTTPException(400, str(e))
    
    # Optional: Log the sync
    db.add(models.CommitLog(workspace_id=ws.id, commit_sha="SYNC", message="Merged base branch into workspace"))
    db.commit()
    return {"status": "synced"}
