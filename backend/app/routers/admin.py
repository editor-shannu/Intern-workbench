import re
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/metrics", response_model=schemas.AdminMetricsOut)
def get_admin_metrics(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # 1. Tasks breakdown
    tasks = db.query(models.Task).all()
    total_tasks = len(tasks)

    status_counts = {"unassigned": 0, "in_progress": 0, "pr_open": 0, "merged": 0}
    track_counts = {"full-stack": 0, "ai-ml": 0, "data": 0, "rpa": 0}

    for t in tasks:
        st = t.status if t.status in status_counts else "unassigned"
        status_counts[st] = status_counts.get(st, 0) + 1

        tr = t.track.lower() if t.track else "full-stack"
        track_counts[tr] = track_counts.get(tr, 0) + 1

    merged_count = status_counts.get("merged", 0)
    completion_rate_pct = round((merged_count / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    # 2. Interns & Worktrees
    intern_count = db.query(models.User).filter_by(role="intern").count()
    workspaces = db.query(models.Workspace).all()
    active_worktrees = sum(1 for w in workspaces if w.status == "active")
    archived_worktrees = sum(1 for w in workspaces if w.status == "archived")

    # 3. Commits & PRs
    total_commits = db.query(models.CommitLog).count()
    prs = db.query(models.PullRequest).all()
    prs_open = sum(1 for p in prs if p.status == "open")
    prs_merged = sum(1 for p in prs if p.status == "merged")

    # 4. AI Telemetry
    chat_messages = db.query(models.ChatMessage).all()
    ai_total_messages = len(chat_messages)
    ai_local_messages = sum(1 for m in chat_messages if m.model_used == "workbench-local")
    ai_cloud_messages = ai_total_messages - ai_local_messages
    ai_estimated_tokens = sum(max(1, len(m.content) // 4) for m in chat_messages)

    return schemas.AdminMetricsOut(
        total_tasks=total_tasks,
        tasks_by_status=status_counts,
        tasks_by_track=track_counts,
        completion_rate_pct=completion_rate_pct,
        total_interns=intern_count,
        active_worktrees=active_worktrees,
        archived_worktrees=archived_worktrees,
        total_commits=total_commits,
        prs_open=prs_open,
        prs_merged=prs_merged,
        ai_total_messages=ai_total_messages,
        ai_local_messages=ai_local_messages,
        ai_cloud_messages=ai_cloud_messages,
        ai_estimated_tokens=ai_estimated_tokens,
    )


@router.post("/plan/preview", response_model=schemas.ProjectPlanPreviewOut)
def preview_project_plan(
    payload: schemas.ProjectPlanImport,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    text = payload.markdown

    # 1. Plan metadata
    plan_name = "Untitled Project"
    m_title = re.search(r"^#\s+(.*)$", text, re.MULTILINE)
    if m_title:
        plan_name = m_title.group(1).strip()

    repo_url = ""
    m_repo = re.search(r"^Repo:\s*(.*?)$", text, re.MULTILINE | re.IGNORECASE)
    if m_repo:
        repo_url = m_repo.group(1).strip()
        text = re.sub(r"^Repo:\s*.*?$\n?", "", text, flags=re.MULTILINE | re.IGNORECASE)

    base_branch = "main"
    m_branch = re.search(r"^Branch:\s*(.*?)$", text, re.MULTILINE | re.IGNORECASE)
    if m_branch:
        base_branch = m_branch.group(1).strip()
        text = re.sub(r"^Branch:\s*.*?$\n?", "", text, flags=re.MULTILINE | re.IGNORECASE)

    # 2. Milestones and Tasks parsing
    milestone_chunks = re.split(r"^##\s+", text, flags=re.MULTILINE)
    parsed_tasks: list[schemas.PlanTaskPreview] = []
    tracks_detected: set[str] = set()
    warnings: list[str] = []

    users_map = {u.email.lower(): u for u in db.query(models.User).all()}

    for milestone_text in milestone_chunks[1:]:
        lines = milestone_text.split("\n", 1)
        source_ref = lines[0].strip()
        body = lines[1] if len(lines) > 1 else ""

        task_chunks = re.split(r"^###\s+", body, flags=re.MULTILINE)
        for task_text in task_chunks[1:]:
            t_lines = task_text.split("\n", 1)
            raw_title = t_lines[0].strip()
            desc = t_lines[1].strip() if len(t_lines) > 1 else ""

            # Extract Track
            track = "full-stack"
            m_track = re.search(r"^\[(.*?)\]\s*(.*)$", raw_title)
            if m_track:
                track = m_track.group(1).strip().lower()
                title = m_track.group(2).strip()
            else:
                title = raw_title
            tracks_detected.add(track)

            # Extract TaskID
            identifier = None
            m_id = re.search(r"^TaskID:\s*(.*?)$", desc, re.MULTILINE | re.IGNORECASE)
            if m_id:
                identifier = m_id.group(1).strip()
                desc = re.sub(r"^TaskID:\s*.*?$\n?", "", desc, flags=re.MULTILINE | re.IGNORECASE).strip()

            # Extract DependsOn
            depends_on = []
            m_dep = re.search(r"^DependsOn:\s*(.*?)$", desc, re.MULTILINE | re.IGNORECASE)
            if m_dep:
                depends_on = [d.strip() for d in m_dep.group(1).split(",") if d.strip()]
                desc = re.sub(r"^DependsOn:\s*.*?$\n?", "", desc, flags=re.MULTILINE | re.IGNORECASE).strip()

            # Extract AssignTo
            assign_to = None
            m_assign = re.search(r"^AssignTo:\s*(.*?)$", desc, re.MULTILINE | re.IGNORECASE)
            if m_assign:
                assign_to = m_assign.group(1).strip()
                if assign_to.lower() not in users_map:
                    warnings.append(f"Assignee '{assign_to}' is not yet registered in the system.")
                desc = re.sub(r"^AssignTo:\s*.*?$\n?", "", desc, flags=re.MULTILINE | re.IGNORECASE).strip()

            parsed_tasks.append(
                schemas.PlanTaskPreview(
                    title=title,
                    track=track,
                    identifier=identifier,
                    source_ref=source_ref,
                    description=desc,
                    depends_on=depends_on,
                    assign_to=assign_to,
                )
            )

    return schemas.ProjectPlanPreviewOut(
        plan_name=plan_name,
        repo_url=repo_url,
        base_branch=base_branch,
        total_tasks=len(parsed_tasks),
        tracks_detected=sorted(list(tracks_detected)),
        tasks=parsed_tasks,
        warnings=warnings,
    )
