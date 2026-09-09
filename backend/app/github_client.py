from github import Github, Auth

from .config import settings


def _repo(owner: str = None, repo_name: str = None):
    if not settings.GITHUB_TOKEN:
        raise RuntimeError(
            "GITHUB_TOKEN is not configured. Add a repo-scoped service-account PAT to "
            ".env to enable opening pull requests."
        )
    gh = Github(auth=Auth.Token(settings.GITHUB_TOKEN))
    owner = owner or settings.GITHUB_REPO_OWNER
    repo_name = repo_name or settings.GITHUB_REPO_NAME
    return gh.get_repo(f"{owner}/{repo_name}")


def open_pull_request(branch: str, title: str, body: str, base: str = None, owner: str = None, repo_name: str = None):
    repo = _repo(owner, repo_name)
    return repo.create_pull(title=title, body=body, head=branch, base=base or settings.BASE_BRANCH)


def get_pr_status(pr_number: int, owner: str = None, repo_name: str = None) -> str:
    repo = _repo(owner, repo_name)
    pr = repo.get_pull(pr_number)
    if pr.merged:
        return "merged"
    if pr.state == "closed":
        return "closed"
    return "open"


def render_pr_body(task, commits) -> str:
    lines = [f"**Task:** {task.title}", f"**Track:** {task.track}"]
    if task.source_ref:
        lines.append(f"**Plan reference:** {task.source_ref}")
    lines.append("")
    if task.description:
        lines.append(task.description)
        lines.append("")
    lines.append("**Commits in this PR:**")
    for c in commits:
        lines.append(f"- `{c.commit_sha[:7]}` {c.message}")
    lines.append("")
    lines.append("_Opened automatically by the Intern AI-Coding Workbench._")
    return "\n".join(lines)
