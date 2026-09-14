import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
notes_router = APIRouter(prefix="/api/project-notes", tags=["project-notes"])
plan_router = APIRouter(prefix="/api/project-plans", tags=["project-plans"])

@plan_router.post("/import")
def import_plan(
    payload: schemas.ProjectPlanImport,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    text = payload.markdown
    
    # 1. Save Project Plan (Global Context)
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
    
    # Fix 3: Prevent Storage Leak by reusing ProjectPlan if name and repo match
    plan = db.query(models.ProjectPlan).filter_by(name=plan_name, repo_url=repo_url).first()
    if plan:
        plan.raw_markdown = text
        plan.base_branch = base_branch
    else:
        plan = models.ProjectPlan(name=plan_name, raw_markdown=text, repo_url=repo_url, base_branch=base_branch)
        db.add(plan)
    db.commit()

    # 2. Parse milestones and tasks (First Pass)
    milestone_chunks = re.split(r"^##\s+", text, flags=re.MULTILINE)
    imported_count = 0
    parsed_tasks = []
    warnings = []

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

            # Extract Assignee
            assigned_user_id = None
            m_assign = re.search(r"^AssignTo:\s*(.*?)$", desc, re.MULTILINE | re.IGNORECASE)
            if m_assign:
                email = m_assign.group(1).strip()
                user = db.query(models.User).filter_by(email=email).first()
                if user:
                    assigned_user_id = user.id
                else:
                    warnings.append(f"Assignee '{email}' not found for task '{title}'")
                desc = re.sub(r"^AssignTo:\s*.*?$\n?", "", desc, flags=re.MULTILINE | re.IGNORECASE).strip()

            # Fix 1: Prevent IntegrityError Crash by upserting
            t = None
            if identifier:
                t = db.query(models.Task).filter_by(identifier=identifier, project_id=plan.id).first()
            
            if t:
                # Update existing task
                t.title = title
                t.description = desc
                t.track = track
                t.source_ref = source_ref
                t.project_id = plan.id
                if assigned_user_id and t.status == "unassigned":
                    t.status = "in_progress"
                t.assigned_user_id = assigned_user_id
            else:
                # Insert new task
                t = models.Task(
                    identifier=identifier,
                    title=title,
                    description=desc,
                    track=track,
                    source_ref=source_ref,
                    status="in_progress" if assigned_user_id else "unassigned",
                    assigned_user_id=assigned_user_id,
                    project_id=plan.id
                )
                db.add(t)
            
            parsed_tasks.append((t, depends_on))
            imported_count += 1

    db.commit()

    # 3. Second Pass: Resolve Dependencies
    id_map = {t.identifier: t for t in db.query(models.Task).filter(models.Task.identifier.isnot(None), models.Task.project_id == plan.id).all()}
    
    for t, deps in parsed_tasks:
        t.dependencies.clear()
        for dep_str in deps:
            if dep_str in id_map:
                dep_task = id_map[dep_str]
                if dep_task not in t.dependencies:
                    t.dependencies.append(dep_task)
            else:
                warnings.append(f"Dependency '{dep_str}' not found for task '{t.title}'")
    
    db.commit()

    return {"status": "ok", "imported": imported_count, "warnings": warnings}


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(models.Task)
    if current_user.role != "admin":
        q = q.filter(models.Task.assigned_user_id == current_user.id)
    return q.order_by(models.Task.id).all()


@router.get("/graph", response_model=schemas.TaskGraphOut)
def get_task_graph(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    all_tasks = db.query(models.Task).order_by(models.Task.id).all()
    users_map = {u.id: u.name for u in db.query(models.User).all()}

    nodes = []
    edges = []
    blocked_count = 0
    ready_count = 0
    merged_count = 0

    for t in all_tasks:
        blockers = []
        is_blocked = False
        for dep in t.dependencies:
            edges.append(
                schemas.TaskGraphEdge(
                    from_id=dep.id,
                    to_id=t.id,
                    is_satisfied=(dep.status == "merged"),
                )
            )
            if dep.status != "merged":
                is_blocked = True
                blockers.append(dep.title or dep.identifier or f"Task #{dep.id}")

        if t.status == "merged":
            merged_count += 1
        elif is_blocked:
            blocked_count += 1
        else:
            ready_count += 1

        nodes.append(
            schemas.TaskGraphNode(
                id=t.id,
                title=t.title,
                identifier=t.identifier,
                track=t.track or "full-stack",
                status=t.status or "unassigned",
                source_ref=t.source_ref,
                assigned_user_id=t.assigned_user_id,
                assigned_user_name=users_map.get(t.assigned_user_id),
                is_blocked=is_blocked,
                blockers=blockers,
            )
        )

    summary = schemas.TaskGraphSummary(
        total_tasks=len(all_tasks),
        blocked_count=blocked_count,
        ready_count=ready_count,
        merged_count=merged_count,
    )
    return schemas.TaskGraphOut(nodes=nodes, edges=edges, summary=summary)


@router.post("", response_model=schemas.TaskOut)
def create_task(
    payload: schemas.TaskCreate, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    task = models.Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/assign", response_model=schemas.TaskOut)
def assign_task(
    task_id: int,
    payload: schemas.TaskAssign,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if payload.user_id is None:
        task.assigned_user_id = None
        task.status = "unassigned"
    else:
        user = db.get(models.User, payload.user_id)
        if not user:
            raise HTTPException(404, "User not found")
        task.assigned_user_id = user.id
        task.status = "in_progress"
    db.commit()
    db.refresh(task)
    return task


@notes_router.get("", response_model=list[schemas.ProjectNoteOut])
def list_notes(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.ProjectNote).order_by(models.ProjectNote.id.desc()).limit(50).all()


@notes_router.post("", response_model=schemas.ProjectNoteOut)
def create_note(
    payload: schemas.ProjectNoteCreate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    note = models.ProjectNote(content=payload.content, created_by=admin.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@notes_router.delete("/{note_id}")
def delete_note(
    note_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    note = db.get(models.ProjectNote, note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}
