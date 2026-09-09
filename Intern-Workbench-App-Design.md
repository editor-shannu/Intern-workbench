# Intern AI-Coding Workbench — Design Spec

**Purpose:** An internal, EC2-hosted web app that lets each intern (working on the `Gayatri-AI` → Gayatri Tutor conversion, per `Gayatri-AI-Tutor-Conversion-Plan.md`) pick up an assigned task, get AI-assisted code generation (via their own OpenRouter key) scoped to that task's context, edit in a lightweight browser IDE, commit, and open a normal GitHub PR back to `Gayatri-Education/Gayatri-AI` for human review and merge.

This is a **tool to help build the product**, not the product itself. It is deployed once, used by the 8-person team for the 15-day sprint (and beyond).

Decisions locked from discussion with the user:
- **Editor:** lightweight in-browser web IDE (Monaco-based), not raw terminal, not full VS Code Server.
- **PR flow:** the app opens a *normal* GitHub Pull Request; review/merge happens on GitHub itself, by the admin — the app does not gate or auto-merge.
- **OpenRouter keys:** stored **encrypted at rest**, tied to each intern's account (not re-entered every session).

---

## 1. High-level architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          EC2 instance (Ubuntu)                     │
│                                                                     │
│  nginx (reverse proxy, TLS)                                        │
│    │                                                                │
│    ├── / (static)  ──────────────► frontend (React + Monaco)       │
│    │                                                                │
│    └── /api ──────────────────────► backend (FastAPI, Python)      │
│                                        │                            │
│                                        ├── Postgres (or SQLite)     │
│                                        │     users, tasks, workspaces,
│                                        │     api_keys(encrypted),   │
│                                        │     chat_logs, commits_log │
│                                        │                            │
│                                        ├── Git workspace manager    │
│                                        │     (per-intern working    │
│                                        │      dirs under /srv/work) │
│                                        │                            │
│                                        ├── OpenRouter client        │
│                                        │     (per-user key, model   │
│                                        │      picker, streaming)    │
│                                        │                            │
│                                        ├── Context/RAG service      │
│                                        │     (reuses the pattern of │
│                                        │      Gayatri-AI's           │
│                                        │      context_manager.py)   │
│                                        │                            │
│                                        └── GitHub API client        │
│                                              (PyGithub) — one       │
│                                              service-account PAT,   │
│                                              used to push branches  │
│                                              + open PRs             │
└───────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         github.com/Gayatri-Education/Gayatri-AI
         (bare clone lives on EC2; branches pushed here;
          PRs opened here; admin reviews/merges here as normal)
```

**Key design choice — git identity model:** interns are *not* required to have their own GitHub accounts/credentials wired into the box. The app holds **one service-account GitHub Personal Access Token** (repo-scoped, write access) used to push branches and open PRs. Each commit is authored with the intern's own name/email (`git config user.name/user.email` set per-workspace) so GitHub history correctly attributes work to the intern, while the actual push/PR-open call uses the shared service token. This avoids distributing repo-write credentials to interns while keeping attribution honest.
*(Flag: if you'd rather each intern authenticate to GitHub individually — e.g. so PRs show as opened "by" them, not the bot — say so and this changes to a per-intern OAuth App flow instead. Noted as an open assumption.)*

---

## 2. Per-intern isolation

Each intern's active task gets its own **git worktree** off a single bare/mirror clone of `Gayatri-AI` on the EC2 disk:

```
/srv/gayatri-ai.git          ← bare mirror clone, fetched periodically from origin/main
/srv/workspaces/
  ├── intern_priya__task_mastery_engine/     ← git worktree, branch: intern/priya/mastery-engine
  ├── intern_arjun__task_course_loader/      ← git worktree, branch: intern/arjun/course-loader
  └── ...
```

- One workspace = one (intern, task) pair. An intern can have multiple active workspaces if assigned multiple tasks.
- `git worktree add` is cheap (shared object store) and gives full filesystem isolation — no risk of two interns' uncommitted edits colliding, unlike everyone sharing one checkout.
- Backend process runs all git/file operations as a single system user; workspace directories are just chrooted-by-convention (path scoping enforced in the API layer, not OS-level containers, for v1 — see Section 9 for hardening notes).

---

## 3. Data model

| Table | Key columns | Purpose |
|---|---|---|
| `users` | id, name, email, password_hash, role (`intern`/`admin`), github_author_email | Login + git commit attribution |
| `openrouter_keys` | user_id, encrypted_key, encrypted_nonce, created_at | One encrypted key per user (AES-256-GCM, server master key from env/secrets manager) |
| `tasks` | id, title, description, track (`ai-ml`/`data`/`full-stack`/`rpa`), source_ref (e.g. section/day of the conversion plan), status (`unassigned`/`in_progress`/`pr_open`/`merged`), assigned_user_id | Maps 1:1 to items from the 15-day plan |
| `workspaces` | id, task_id, user_id, branch_name, worktree_path, base_commit_sha, status | One per active (intern, task) |
| `context_snippets` | id, workspace_id or task_id, source_path, content, added_at | Project files/docs injected into the AI's context for this task (see Section 5) |
| `chat_messages` | id, workspace_id, role, content, model_used, created_at | Full AI conversation history per workspace, for auditability |
| `file_edits` | id, workspace_id, file_path, diff, created_at | Log of AI-proposed / accepted edits, for audit + undo |
| `commits_log` | id, workspace_id, commit_sha, message, pushed_at | Local commits made through the app |
| `pull_requests` | id, workspace_id, github_pr_number, github_pr_url, opened_at, status | Tracks PR lifecycle, polled/webhooked from GitHub |

---

## 4. Core workflow (end-to-end)

1. **Admin logs in**, creates task entries (seeded initially from the conversion plan's Section 11 day-by-day breakdown — e.g. "Day 5 — `mastery_engine.py` BKT update rules") and assigns each to an intern.
2. **Intern logs in**, sees their assigned task(s) on a dashboard, clicks one to open a **workspace**.
3. On first open, backend:
   - Fetches latest `origin/main` into the bare mirror.
   - Creates a git worktree + branch `intern/<name>/<task-slug>` from `main`.
   - Auto-loads relevant context (Section 5) for that task.
4. Intern lands in the **web IDE**:
   - Left: file tree scoped to the worktree.
   - Center: Monaco editor, opens files, live-editable.
   - Right: AI chat panel — model picker (OpenRouter models), "generate/edit this file," "explain this error," etc. AI responses can propose a diff; intern reviews and clicks **Apply** (never silently overwrites).
5. Intern uses **Commit** (message box → `git add -A && git commit --author "Name <email>"`) as many times as needed.
6. When ready, intern clicks **Push & Open PR**:
   - Backend pushes the branch to `origin` using the service PAT.
   - Backend calls GitHub API to open a PR from `intern/<name>/<task-slug>` → `main`, with a templated description (task title, linked plan section, summary of commits).
   - Task status → `pr_open`.
7. **Normal GitHub review** happens on github.com — admin reviews, requests changes or approves, merges. No app-side gate.
8. A lightweight webhook (or periodic poll, v1) updates `pull_requests.status` / `tasks.status` to `merged` once GitHub reports the merge, so the dashboard reflects reality.

---

## 5. Context/RAG for code generation

Each task gets a **context bundle** assembled automatically, mirroring how `context_manager.py` in Gayatri-AI already attaches markdown context to a chat session:

- The relevant section(s) of `Gayatri-AI-Tutor-Conversion-Plan.md` (chunked by `##`/`###` heading, matched to the task's `track`/`source_ref`).
- The current contents of any files named in the plan's "file-by-file change plan" (Section 9 of the plan doc) that overlap the task — e.g. task "build `mastery_engine.py`" auto-includes `db.py`'s existing session/message patterns and `config.py` for style consistency.
- Any files the intern manually attaches from the worktree (like the existing app's "attach as context" feature).
- Admin-postable **project update notes** (a running log — "Postgres schema finalized," "auth uses JWT now") so context stays current without interns re-reading Slack history.

This bundle is assembled server-side and injected into the system prompt sent to OpenRouter alongside the intern's chat turn — same pattern as the source repo's RAG pipeline, just repointed at "helping write the tutor" instead of "being the tutor."

---

## 6. OpenRouter integration

- Each intern enters their OpenRouter API key once, in account settings.
- Encrypted with AES-256-GCM using a server-side master key (from an environment variable / AWS Secrets Manager — never checked into the repo); stored as `openrouter_keys.encrypted_key`.
- Decrypted in-memory only at request time, never logged, never sent to the frontend after initial save.
- Model picker: a curated dropdown (e.g. a handful of good code models available on OpenRouter) plus a free-text "custom model slug" field, since OpenRouter's catalog changes.
- All AI calls are billed to the intern's own OpenRouter account — the app never proxies through a shared org key.
- Streaming responses (SSE) into the chat panel, same UX pattern as the existing `llm_client.py` streaming.

---

## 7. Task list seeding

Rather than free-form task creation from scratch, the app seeds an initial `tasks` table from the conversion plan's Day 1–15 breakdown (Section 11) and the "New files/modules" table (Section 9), split by track, so the admin can assign real work on day one instead of writing task descriptions manually. Admin can add/edit/reassign tasks afterward.

---

## 8. Tech stack (proposed, for the zip build)

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI** (Python) | Matches the existing `Gayatri-AI` stack; team already Python-fluent |
| DB | **SQLite** (v1) via SQLAlchemy, swappable to Postgres | Small team (8 users), single EC2 box — SQLite is enough and zero extra infra; models written against SQLAlchemy so a Postgres swap later is a connection-string change |
| Frontend | **React (Vite) + Monaco Editor + Tailwind** | Lightweight web IDE without full VS Code Server overhead |
| Auth | JWT, password hashing via `passlib`/bcrypt | Simple, sufficient for ~8 internal accounts |
| Git ops | `GitPython` (or shelling out to `git` CLI) + worktrees | Matches Section 2 isolation model |
| GitHub API | `PyGithub` with one service-account PAT | Push branches, open PRs, poll PR status |
| Encryption | `cryptography` (AES-256-GCM) for API keys | Standard, no external KMS dependency required for v1 |
| Process mgmt | `systemd` units or Docker Compose (backend, and optionally nginx) | Matches the conversion plan's own Docker Compose pattern |
| Reverse proxy | nginx + Let's Encrypt (Certbot) | TLS for the EC2 public endpoint |

---

## 9. Security notes / open hardening items (v1 scope vs. later)

- **v1**: path-scoping in the API layer prevents an intern's requests from touching another intern's worktree path; no OS-level sandboxing.
- **Later hardening** (flagged, not built in v1 unless requested): run each intern's workspace operations inside a per-workspace Docker container or restricted Linux user for filesystem-level isolation, rate-limit AI calls per user, add audit logging export.
- Service GitHub PAT and the encryption master key are read from environment variables (`.env`, not committed) — an `.env.example` will ship in the zip.
- No secrets (OpenRouter keys, PAT, master key) are ever sent to the frontend after initial submission.

---

## 10. What ships in next turn's zip (MVP scope)

To keep the first deliverable buildable and testable quickly, the zip will include:

1. FastAPI backend: auth, task CRUD, workspace create/open, git worktree management, OpenRouter chat proxy (streaming), GitHub push + PR creation, encrypted key storage.
2. React frontend: login, admin task board, intern dashboard, the Monaco-based IDE view with file tree + AI chat panel + commit/push-PR actions.
3. SQLite schema + seed script (seeds tasks from the conversion plan's Day 1–5 items as a starter set).
4. `.env.example`, `README.md` with EC2 setup steps (clone, install, systemd unit or docker-compose, nginx config sample).
5. A basic smoke-test script.

**Explicitly out of scope for the first zip** (documented for later): container-per-intern sandboxing, GitHub webhook (v1 uses polling), per-intern GitHub OAuth, Postgres migration, admin analytics dashboard beyond the task board.

---

## 11. Open assumptions to confirm (won't block the zip, but worth flagging)

- Git identity model (Section 1): service-account PAT pushes on behalf of interns, commits authored with their name — confirm this is acceptable, versus wanting per-intern GitHub accounts wired in.
- SQLite chosen for v1 simplicity given ~8 users on one EC2 box — flag if you already know you want Postgres from day one.
- No sandboxing beyond path-scoping in v1 (Section 9) — acceptable for an internal, trusted 8-person team; would need hardening before opening to a larger/external group.
