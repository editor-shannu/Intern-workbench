"""
Assembles the per-task context bundle injected into the AI system prompt,
mirroring the pattern described for Gayatri-AI's own context_manager.py:

  1. Relevant sections of Gayatri-AI-Tutor-Conversion-Plan.md (if present at
     the repo root of this workspace), chunked by ##/### heading and matched
     against the task's track/title/source_ref.
  2. Files the intern has manually attached from the file tree.
  3. Admin-posted project update notes.

Sizes are capped per-section so a single huge file/plan can't blow the
context window; this is a simple heuristic, not real embedding-based RAG.
"""
import re
from pathlib import Path

from sqlalchemy.orm import Session

from . import models

CONVERSION_PLAN_FILENAME = "Gayatri-AI-Tutor-Conversion-Plan.md"
MAX_SECTION_CHARS = 40000
MAX_NOTES = 20
HEADING_RE = re.compile(r"^(#{2,3})\s+(.*)$", re.MULTILINE)


def _chunk_markdown(text: str) -> list[dict]:
    matches = list(HEADING_RE.finditer(text))
    chunks = []
    
    # Capture text before the first heading (Global Context)
    if matches and matches[0].start() > 0:
        chunks.append({"heading": "", "text": text[0:matches[0].start()].strip()})
    elif not matches:
        chunks.append({"heading": "", "text": text.strip()})

    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunks.append({"heading": m.group(2).strip(), "text": text[start:end].strip()})
    return chunks


def _relevant_chunks(chunks: list[dict], terms: list[str], limit: int = 3) -> list[dict]:
    terms = [t.lower() for t in terms if t]
    scored = []
    for c in chunks:
        haystack = (c["heading"] + " " + c["text"]).lower()
        score = sum(haystack.count(t) for t in terms)
        if score:
            scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:limit]]


def build_context_bundle(
    db: Session, workspace: models.Workspace, task: models.Task, worktree_path: Path
) -> tuple[str, list[str]]:
    sections: list[str] = []
    sources: list[str] = []

    plan = task.project
    if plan:
        text = plan.raw_markdown
        chunks = _chunk_markdown(text)
        terms = [task.track, task.source_ref or "", *task.title.split()]
        relevant = _relevant_chunks(chunks, terms)
        
        # Add the global context (everything before the first ## milestone)
        if chunks and not chunks[0]["heading"]:
            sections.append(f"## Project Context\n{chunks[0]['text'][:MAX_SECTION_CHARS]}")
        
        if relevant:
            body = "\n\n".join(c["text"][:MAX_SECTION_CHARS] for c in relevant)
            sections.append(f"## Relevant project plan sections\n{body}")
            sources.extend(f"{plan.name} \u00a7 {c['heading']}" for c in relevant)
    else:
        sections.append(
            f"## Project plan\n(No Project Plan has been uploaded by the admin yet.)"
        )

    # Inject Dependency Status
    if task.dependencies:
        dep_lines = []
        all_met = True
        for dep in task.dependencies:
            assignee = f" (assigned to user {dep.assigned_user_id})" if dep.assigned_user_id else " (unassigned)"
            if dep.status in ["merged", "closed"]:
                dep_lines.append(f"- [MERGED] {dep.title}")
            else:
                dep_lines.append(f"- [IN PROGRESS] {dep.title}{assignee}")
                all_met = False
        
        status_text = "\n".join(dep_lines)
        if all_met:
            status_text += "\n\n**CRITICAL INSTRUCTION**: All dependencies are met. You may proceed."
        else:
            status_text += "\n\n**CRITICAL INSTRUCTION**: Your required dependencies are NOT yet merged. Inform the intern they must wait for the dependencies to be completed before executing this task. You may help them brainstorm or plan, but do not write final code."
            
        sections.append(f"## Dependency Status\n{status_text}")
        sources.append("task dependencies")

    snippets = db.query(models.ContextSnippet).filter_by(workspace_id=workspace.id).all()
    for s in snippets:
        live_path = worktree_path / s.source_path
        content = live_path.read_text(errors="ignore") if live_path.exists() else "(File no longer exists on disk)"
        sections.append(f"## Attached file: {s.source_path}\n```\n{content[:MAX_SECTION_CHARS]}\n```")
        sources.append(s.source_path)

    notes = db.query(models.ProjectNote).order_by(models.ProjectNote.id.desc()).limit(MAX_NOTES).all()
    if notes:
        body = "\n".join(f"- {n.content}" for n in reversed(notes))
        sections.append(f"## Project update notes\n{body}")
        sources.append("project notes")

    return "\n\n".join(sections), sources


SYSTEM_PROMPT_TEMPLATE = """You are an AI pair-programmer helping an intern implement one specific task \
in the Gayatri-AI codebase, as part of its conversion into the Gayatri Tutor product.

Task: {task_title}
Track: {task_track}
Description: {task_description}

When you want to propose creating or modifying a file, wrap the FULL new file content \
in a block exactly like this (the intern must click "Apply" before it is written to disk \
— never assume a change has already been applied):

<<<FILE: relative/path/to/file.py>>>
...full file content...
<<<END FILE>>>

You may include ordinary explanation text before, between, and after such blocks. Keep \
changes scoped to files relevant to this task.

Context for this task follows:
"""


def inspect_context_bundle(
    db: Session, workspace: models.Workspace, task: models.Task, worktree_path: Path
) -> dict:
    bundle, sources = build_context_bundle(db, workspace, task, worktree_path)
    system_prompt = (
        SYSTEM_PROMPT_TEMPLATE.format(
            task_title=task.title,
            task_track=task.track,
            task_description=task.description or "(none)",
        )
        + "\n"
        + bundle
    )

    snippets = db.query(models.ContextSnippet).filter_by(workspace_id=workspace.id).all()
    attached_files = []
    for s in snippets:
        live_path = worktree_path / s.source_path
        size = live_path.stat().st_size if live_path.exists() else 0
        attached_files.append({"id": s.id, "path": s.source_path, "size_bytes": size})

    dependencies = []
    if task.dependencies:
        for dep in task.dependencies:
            dependencies.append({
                "id": dep.id,
                "title": dep.title,
                "status": dep.status,
                "assigned_user_id": dep.assigned_user_id,
            })

    total_chars = len(system_prompt)
    estimated_tokens = int(total_chars / 4)

    return {
        "task_title": task.title,
        "task_track": task.track,
        "system_prompt": system_prompt,
        "bundle": bundle,
        "sources": sources,
        "total_characters": total_chars,
        "estimated_tokens": estimated_tokens,
        "attached_files": attached_files,
        "dependencies": dependencies,
    }
