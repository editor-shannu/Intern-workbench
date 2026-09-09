import asyncio
import logging

from . import github_client, models
from .config import settings
from .database import SessionLocal

logger = logging.getLogger("pr_poller")
_task: asyncio.Task | None = None


async def _poll_once() -> None:
    if not settings.GITHUB_TOKEN:
        return  # no PAT configured (e.g. local dev) -- nothing to poll
    db = SessionLocal()
    try:
        open_prs = db.query(models.PullRequest).filter(models.PullRequest.status == "open").all()
        for pr in open_prs:
            try:
                new_status = github_client.get_pr_status(pr.github_pr_number, pr.repo_owner, pr.repo_name)
            except Exception as e:
                logger.warning("PR poll failed for #%s: %s", pr.github_pr_number, e)
                continue
            if new_status != pr.status:
                pr.status = new_status
                ws = db.get(models.Workspace, pr.workspace_id)
                if ws:
                    task = db.get(models.Task, ws.task_id)
                    if task:
                        if new_status == "merged":
                            task.status = "merged"
                        elif new_status == "closed":
                            task.status = "in_progress"
                db.commit()
    finally:
        db.close()


async def _poll_loop() -> None:
    while True:
        try:
            await _poll_once()
        except Exception as e:
            logger.warning("PR poll loop error: %s", e)
        await asyncio.sleep(settings.PR_POLL_INTERVAL_SECONDS)


def start_poller() -> None:
    global _task
    if _task is None:
        _task = asyncio.create_task(_poll_loop())
