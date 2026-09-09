from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint, Table
from sqlalchemy.orm import relationship
from .database import Base

task_dependencies = Table(
    "task_dependencies",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
    Column("depends_on_task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="intern")  # "intern" | "admin"
    github_author_email = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class OpenRouterKey(Base):
    __tablename__ = "openrouter_keys"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    encrypted_key = Column(Text, nullable=False)
    encrypted_nonce = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    identifier = Column(String, nullable=True) # e.g. "db-schema"
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    track = Column(String, default="full-stack")  # ai-ml | data | full-stack | rpa
    source_ref = Column(String, nullable=True)  # e.g. "Day 5" from the conversion plan
    status = Column(String, default="unassigned")  # unassigned | in_progress | pr_open | merged
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("project_plans.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (UniqueConstraint("project_id", "identifier", name="ix_tasks_project_identifier"),)
    
    project = relationship("ProjectPlan", back_populates="tasks")
    
    dependencies = relationship(
        "Task",
        secondary=task_dependencies,
        primaryjoin=id == task_dependencies.c.task_id,
        secondaryjoin=id == task_dependencies.c.depends_on_task_id,
        backref="required_by"
    )


class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    branch_name = Column(String, nullable=False)
    worktree_path = Column(String, nullable=False)
    base_commit_sha = Column(String, nullable=True)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_workspace_task_user"),)


class ContextSnippet(Base):
    __tablename__ = "context_snippets"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    source_path = Column(String, nullable=False)
    content = Column(Text, default="")
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    role = Column(String, nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    model_used = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FileEdit(Base):
    __tablename__ = "file_edits"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    file_path = Column(String, nullable=False)
    diff = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CommitLog(Base):
    __tablename__ = "commits_log"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    commit_sha = Column(String, nullable=False)
    message = Column(Text, default="")
    pushed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PullRequest(Base):
    __tablename__ = "pull_requests"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), unique=True, nullable=False)
    repo_owner = Column(String, nullable=True)
    repo_name = Column(String, nullable=True)
    github_pr_number = Column(Integer, nullable=False)
    github_pr_url = Column(String, nullable=False)
    status = Column(String, default="open")  # open | merged | closed
    opened_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ProjectNote(Base):
    __tablename__ = "project_notes"
    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ProjectPlan(Base):
    __tablename__ = "project_plans"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    raw_markdown = Column(Text, nullable=False)
    repo_url = Column(String, nullable=False, default="")
    base_branch = Column(String, nullable=False, default="main")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tasks = relationship("Task", back_populates="project")
