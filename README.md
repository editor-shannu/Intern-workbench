# Intern AI-Coding Workbench

A multi-tenant, dependency-aware web platform designed to manage and execute complex software engineering projects. Admins bulk-upload Markdown project plans, and "Interns" claim tasks, code within isolated Git workspaces, and collaborate with a built-in AI assistant to push Pull Requests automatically.

## ?? Key Features

### 1. Multi-Repo Architecture
The backend dynamically provisions isolated Git bare-mirrors for every project. Admins can manage 50 different tasks across 10 different GitHub repositories from a single dashboard. Code pushes, branch creation, and PR automation route precisely to the correct upstream repository.

### 2. Dependency-Aware Workflows
The platform understands complex dependency graphs. If Task B depends on Task A, the system will:
* Inject **Critical AI Instructions** into the intern's chat window, preventing the AI from writing final code until Task A is merged.
* Provide the intern with a one-click **"Sync from Main"** button to securely fetch and merge upstream dependencies into their active `git worktree` without leaving the browser.

### 3. Smart Bulk-Import & Upserts
Admins upload standard `.md` files containing task blocks. The backend features a robust Two-Pass Regex Parser that extracts `TaskID`, `DependsOn`, `AssignTo`, `Repo`, and `Branch` tags. 
* **Safe Upserts**: Re-uploading a corrected Markdown file updates descriptions, assignments, and dependencies without wiping existing workspaces or duplicating entries in the database.

### 4. Dynamic "Bring-Your-Own-Key" AI Chat
The built-in IDE features a chat interface powered by OpenRouter. 
* **Encrypted-at-Rest**: Intern API keys are AES-256-GCM encrypted in the SQLite database using a central `MASTER_KEY`.
* **Dynamic Model Fetching**: The system performs a live verification of the intern's API key and dynamically fetches their exact allowed LLMs (GPT-4, Claude 3.5, etc.) directly from the OpenRouter API.

### 5. Automated Git Operations & PR Polling
Interns never touch a CLI. The system automatically handles `git fetch`, `git worktree add`, `git commit`, and `git push`. A background asynchronous poller constantly queries the GitHub API to update UI states the moment a Pull Request is merged by a maintainer.

---

## ??? Tech Stack
* **Backend**: Python 3.10+, FastAPI, SQLAlchemy (SQLite), Uvicorn, PyGithub, Httpx.
* **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, React Router.
* **Infrastructure**: Requires system-level `git` to be installed on the host machine.

---

## ?? Getting Started (Local Development)

### 1. Backend Setup
Navigate to the `backend` directory and set up your virtual environment:

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # On Windows
pip install -r requirements.txt
```

**Configure Environment Variables:**
Create a `.env` file in the `backend` directory (refer to `.env.example`).
```env
SECRET_KEY=your_fastapi_jwt_secret
MASTER_KEY=your_base64_32byte_encryption_key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=internpass123
GITHUB_TOKEN=your_github_pat_for_opening_prs
```

**Seed the Database:**
This will create the SQLite database, your Admin account, and two test Interns.
```bash
python seed.py
```

**Start the API Server:**
```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
Open a new terminal and navigate to the `frontend` directory:

```bash
cd frontend
npm install
npm run dev
```

The application will be live at `http://localhost:5173`.

---

## ?? Admin Markdown Plan Format

To create a project, an Admin uploads a `.md` file in the following format. 
* Text before the first `##` header is treated as **Global Context** and given to the AI on every task.
* Each `##` header becomes a separate **Task**.

```markdown
Project context goes here. This explains the goal of the repository.

Repo: https://github.com/your-org/your-repo.git
Branch: main

## Setup Database Schema
TaskID: db-schema
AssignTo: intern1@example.com

Create the SQLAlchemy models.

## Build the API Router
TaskID: api-router
DependsOn: db-schema
AssignTo: intern2@example.com

Create the FastAPI endpoints.
```

---

## ?? The Intern Workflow
1. **Login & Config**: Intern logs in and navigates to `Settings` to securely store their OpenRouter API Key.
2. **Dashboard**: Intern views their assigned tasks. If a task is blocked, they see a warning.
3. **Workspace**: Intern opens the workspace. The backend spins up an isolated `git worktree`.
4. **Chat & Code**: Intern selects a file, chats with the AI, and clicks "Apply" on proposed diffs.
5. **Sync**: If the intern was waiting on a dependency, they click the "Download/Sync" icon in the UI to pull upstream changes into their branch.
6. **Push PR**: The intern clicks "Push & open PR". The backend commits the code, pushes it to the target GitHub repository, and opens a Pull Request using the Admin's configured GitHub PAT.

