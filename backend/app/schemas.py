from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field, EmailStr


# ---- Users / auth ----

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    role: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "intern"
    github_author_email: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class OpenRouterKeyIn(BaseModel):
    api_key: str = Field(min_length=10)


# ---- Tasks ----

class TaskBase(BaseModel):
    title: str
    description: str = ""
    track: str = "full-stack"
    source_ref: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    track: Optional[str] = None
    source_ref: Optional[str] = None
    status: Optional[str] = None

class ProjectPlanImport(BaseModel):
    markdown: str


class TaskAssign(BaseModel):
    user_id: Optional[int] = None


class TaskDependencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    status: str
    identifier: Optional[str] = None

class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str
    assigned_user_id: Optional[int] = None
    identifier: Optional[str] = None
    dependencies: list[TaskDependencyOut] = []


# ---- Workspaces ----

class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    user_id: int
    branch_name: str
    worktree_path: str
    base_commit_sha: Optional[str] = None
    status: str


class PullRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_pr_number: int
    github_pr_url: str
    status: str


class WorkspaceDetail(WorkspaceOut):
    task: TaskOut
    pull_request: Optional[PullRequestOut] = None


class TreeNode(BaseModel):
    name: str
    path: str
    type: str  # "file" | "dir"
    children: Optional[List["TreeNode"]] = None


TreeNode.model_rebuild()


# ---- Files ----

class FileContentOut(BaseModel):
    path: str
    content: str


class FileWrite(BaseModel):
    path: str
    content: str


class FileCreate(BaseModel):
    path: str = Field(min_length=1)
    is_directory: bool = False
    content: Optional[str] = ""


class FileRename(BaseModel):
    old_path: str = Field(min_length=1)
    new_path: str = Field(min_length=1)


class FileDelete(BaseModel):
    path: str = Field(min_length=1)


# ---- Git ops ----

class CommitRequest(BaseModel):
    message: str = Field(min_length=1)


class CommitOut(BaseModel):
    commit_sha: str


# ---- Chat ----

class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    model: str = "openai/gpt-4o-mini"


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: int
    role: str
    content: str
    model_used: Optional[str] = None
    created_at: datetime


# ---- Context ----

class ContextAttach(BaseModel):
    path: str


class ContextSnippetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_path: str
    added_at: datetime


class ContextInspectOut(BaseModel):
    task_title: str
    task_track: str
    system_prompt: str
    bundle: str
    sources: List[str]
    total_characters: int
    estimated_tokens: int
    attached_files: List[dict]
    dependencies: List[dict]


# ---- Project notes ----

class ProjectNoteCreate(BaseModel):
    content: str = Field(min_length=1)


class ProjectNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    content: str
    created_at: datetime


# ---- Admin Metrics & Plan Preview ----

class AdminMetricsOut(BaseModel):
    total_tasks: int
    tasks_by_status: dict
    tasks_by_track: dict
    completion_rate_pct: float
    total_interns: int
    active_worktrees: int
    archived_worktrees: int
    total_commits: int
    prs_open: int
    prs_merged: int
    ai_total_messages: int
    ai_local_messages: int
    ai_cloud_messages: int
    ai_estimated_tokens: int


class PlanTaskPreview(BaseModel):
    title: str
    track: str
    identifier: Optional[str] = None
    source_ref: Optional[str] = None
    description: str = ""
    depends_on: List[str] = []
    assign_to: Optional[str] = None


class ProjectPlanPreviewOut(BaseModel):
    plan_name: str
    repo_url: str
    base_branch: str
    total_tasks: int
    tracks_detected: List[str]
    tasks: List[PlanTaskPreview]
    warnings: List[str]


# ---- Test Runner & Terminal ----

class TestRunRequest(BaseModel):
    command: Optional[str] = "pytest"
    target_file: Optional[str] = None


class TestRunResponse(BaseModel):
    command: str
    exit_code: int
    passed: bool
    stdout: str
    stderr: str
    duration_ms: int


# ---- Task Graph / DAG ----

class TaskGraphNode(BaseModel):
    id: int
    title: str
    identifier: Optional[str] = None
    track: str
    status: str
    source_ref: Optional[str] = None
    assigned_user_id: Optional[int] = None
    assigned_user_name: Optional[str] = None
    is_blocked: bool
    blockers: List[str] = []


class TaskGraphEdge(BaseModel):
    from_id: int
    to_id: int
    is_satisfied: bool


class TaskGraphSummary(BaseModel):
    total_tasks: int
    blocked_count: int
    ready_count: int
    merged_count: int


class TaskGraphOut(BaseModel):
    nodes: List[TaskGraphNode]
    edges: List[TaskGraphEdge]
    summary: TaskGraphSummary


