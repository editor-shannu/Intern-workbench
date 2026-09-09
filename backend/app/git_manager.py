"""
Wraps the `git` CLI to implement the isolation model from spec Section 2:

    /srv (or ./data locally)
      repo-mirror.git/          <- one bare mirror clone of the upstream repo
      workspaces/
        <intern>__<task-slug>/  <- one `git worktree` per (intern, task)

We shell out to `git` directly rather than using GitPython, because worktree
support via subprocess is more predictable than GitPython's wrapper for it.

Auth model: the service-account PAT (GITHUB_TOKEN) is embedded into the
remote URL only for the duration of a single fetch/push subprocess call — it
is never written into any .git/config on disk, so it can't leak by someone
reading repo metadata later.
"""
import difflib
import re
import subprocess
from pathlib import Path

from .config import settings


class GitError(Exception):
    pass


def _run(args: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise GitError(f"`{' '.join(args)}` failed:\n{result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


def _authed_url(url: str) -> str:
    """Embed the service PAT into an https URL for a single git invocation only."""
    if url.startswith("https://") and settings.GITHUB_TOKEN:
        return url.replace("https://", f"https://x-access-token:{settings.GITHUB_TOKEN}@", 1)
    return url


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:50] or "task"


def get_git_dir(project_id: int | None = None) -> Path:
    if project_id:
        return Path(settings.WORKSPACES_ROOT).parent / "repos" / f"project_{project_id}.git"
    return Path(settings.GIT_ROOT)

def ensure_bare_mirror(project_id: int | None = None, repo_url: str = "", base_branch: str = "") -> None:
    git_dir = get_git_dir(project_id)
    if (git_dir / "HEAD").exists():
        return
        
    url = repo_url or settings.UPSTREAM_REPO_URL
    if not url:
        raise GitError("Repository URL is not configured for this project.")
        
    git_dir.parent.mkdir(parents=True, exist_ok=True)
    _run(["git", "clone", "--bare", _authed_url(url), str(git_dir)])

def fetch_latest(project_id: int | None = None, repo_url: str = "", base_branch: str = "") -> None:
    ensure_bare_mirror(project_id, repo_url, base_branch)
    git_dir = get_git_dir(project_id)
    url = repo_url or settings.UPSTREAM_REPO_URL
    branch = base_branch or settings.BASE_BRANCH
    
    _run(
        [
            "git",
            f"--git-dir={git_dir}",
            "fetch",
            _authed_url(url),
            f"+refs/heads/{branch}:refs/heads/{branch}",
            "--prune",
        ]
    )

def create_worktree(worktree_path: Path, branch: str, base_branch: str, project_id: int | None = None) -> str:
    """Creates (or reuses, if the branch already exists) a worktree; returns the base commit sha."""
    if worktree_path.exists():
        raise GitError(f"Worktree path already exists: {worktree_path}")
    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    git_dir = get_git_dir(project_id)

    existing_branch = _run(["git", f"--git-dir={git_dir}", "branch", "--list", branch])
    if existing_branch:
        _run(["git", f"--git-dir={git_dir}", "worktree", "add", str(worktree_path), branch])
    else:
        _run(
            [
                "git",
                f"--git-dir={git_dir}",
                "worktree",
                "add",
                str(worktree_path),
                "-b",
                branch,
                f"refs/heads/{base_branch}",
            ]
        )
    return _run(["git", "-C", str(worktree_path), "rev-parse", "HEAD"])

def set_identity(worktree_path: Path, name: str, email: str) -> None:
    _run(["git", "-C", str(worktree_path), "config", "user.name", name])
    _run(["git", "-C", str(worktree_path), "config", "user.email", email])

def merge_base_branch(worktree_path: Path, base_branch: str, project_id: int | None = None, repo_url: str = "") -> None:
    """Merges the latest base_branch into the worktree. Aborts if conflicts occur."""
    fetch_latest(project_id, repo_url, base_branch)
    try:
        _run(["git", "-C", str(worktree_path), "merge", f"refs/heads/{base_branch}", "--no-edit"])
    except GitError as e:
        try:
            _run(["git", "-C", str(worktree_path), "merge", "--abort"])
        except GitError:
            pass
        raise GitError(f"Merge failed (likely due to conflicts). Aborted safely. Original error: {e}")


def resolve_safe_path(base: Path, relpath: str) -> Path:
    """Resolves relpath under base, raising GitError on traversal or .git access."""
    base = base.resolve()
    relpath = (relpath or "").strip().lstrip("/")
    candidate = (base / relpath).resolve() if relpath else base
    try:
        rel = candidate.relative_to(base)
    except ValueError:
        raise GitError("Path escapes the workspace root")
    if ".git" in rel.parts:
        raise GitError("Access to .git is not allowed")
    return candidate


EXCLUDED_DIR_NAMES = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", ".pytest_cache"}


def list_tree(base: Path) -> list[dict]:
    base = base.resolve()

    def walk(dir_path: Path) -> list[dict]:
        items = []
        try:
            entries = sorted(dir_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except FileNotFoundError:
            return []
        for entry in entries:
            if entry.name in EXCLUDED_DIR_NAMES:
                continue
            rel = str(entry.relative_to(base))
            if entry.is_dir():
                items.append({"name": entry.name, "path": rel, "type": "dir", "children": walk(entry)})
            else:
                items.append({"name": entry.name, "path": rel, "type": "file"})
        return items

    return walk(base)


def commit_all(worktree_path: Path, message: str, author_name: str, author_email: str) -> str:
    _run(["git", "-C", str(worktree_path), "add", "-A"])
    status = _run(["git", "-C", str(worktree_path), "status", "--porcelain"])
    if not status:
        raise GitError("Nothing to commit — no changes in this workspace")
    _run(
        [
            "git",
            "-C",
            str(worktree_path),
            "commit",
            "-m",
            message,
            f"--author={author_name} <{author_email}>",
        ]
    )
    return _run(["git", "-C", str(worktree_path), "rev-parse", "HEAD"])


def push_branch(worktree_path: Path, branch: str, repo_url: str = "") -> None:
    url_to_use = repo_url or settings.UPSTREAM_REPO_URL
    if not url_to_use:
        raise GitError("Repository URL is not configured")
    if url_to_use.startswith("https://") and not settings.GITHUB_TOKEN:
        raise GitError(
            "GITHUB_TOKEN is not configured, so pushing to a remote https:// repo isn't "
            "possible. Set GITHUB_TOKEN in .env to a repo-scoped PAT with write access."
        )
    url = _authed_url(url_to_use)
    _run(["git", "-C", str(worktree_path), "push", url, f"HEAD:refs/heads/{branch}"])


def unified_diff(old: str, new: str, path: str) -> str:
    diff = difflib.unified_diff(
        old.splitlines(keepends=True),
        new.splitlines(keepends=True),
        fromfile=f"a/{path}",
        tofile=f"b/{path}",
    )
    return "".join(diff)
