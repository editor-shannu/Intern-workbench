<div align="center">
  <h1>?? Intern AI-Coding Workbench</h1>
  <p><em>A multi-tenant, dependency-aware platform orchestrating AI-assisted software engineering.</em></p>
  
  <a href="https://dbert.online">
    <img src="https://img.shields.io/badge/Developed_under-DBERT_Internship_Program-0052cc?style=for-the-badge" alt="DBERT Internship">
  </a>
  <img src="https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react">
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi">
  <img src="https://img.shields.io/badge/OpenRouter-AI_Integration-8A2BE2?style=for-the-badge&logo=openai">
</div>

<br />

## ?? The DBERT Internship Program

This platform was proudly conceptualized, engineered, and developed under the **[DBERT Internship Program](https://dbert.online)**. 

DBERT bridges the critical gap between academic learning and industry-grade software engineering. By empowering emerging tech talent to tackle real-world architecture challenges, the program cultivates innovation, rigorous development standards, and the hands-on experience necessary to build robust, scalable solutions. This Workbench stands as a testament to the high-caliber engineering fostered within the DBERT ecosystem.

---

## ?? Platform Overview

The **Intern AI-Coding Workbench** is an advanced environment designed to manage complex software projects. Admins bulk-upload Markdown project plans, and "Interns" claim tasks, code within isolated Git workspaces, and collaborate with a built-in AI assistant to seamlessly push Pull Requests to GitHub.

### ? Core Capabilities

*   ??? **Multi-Repo Architecture**: The backend dynamically provisions isolated Git bare-mirrors for every project. Manage 50 different tasks across 10 different GitHub repositories from a single dashboard.
*   ?? **Dependency-Aware Workflows**: The system maps out dependency graphs (`DependsOn`). Interns receive a **"Sync from Main"** button to automatically pull upstream dependencies into their active `git worktree`, and the AI is contextually blocked from writing final code until prerequisites are met.
*   ?? **"Bring-Your-Own-Key" AI Chat**: Integrated with **OpenRouter**. Intern API keys are securely encrypted at rest (AES-256-GCM). The platform dynamically fetches live LLM access lists (GPT-4o, Claude 3.5, etc.) specifically tailored to the intern's credentials.
*   ?? **Smart Bulk-Import Engine**: Admins upload standard `.md` files. A Two-Pass Regex Parser extracts `TaskID`, `AssignTo`, `Repo`, and `Branch` tags, safely performing data "upserts" to prevent database conflicts when correcting plans.
*   ? **Zero-CLI Git Operations**: Interns never touch a terminal. The system orchestrates `git fetch`, `git worktree add`, `git commit`, and `git push` entirely via the UI, backed by a background poller that syncs Pull Request statuses.

---

## ??? System Architecture

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons |
| **Backend API** | Python 3.10+, FastAPI, SQLAlchemy, Uvicorn, Httpx |
| **Database** | SQLite3 (Local file-based) |
| **VCS / Shell** | Native `git` subprocesses, PyGithub for REST PRs |

---

## ?? Getting Started (Local Deployment)

### Prerequisites
*   Node.js (v18+)
*   Python (3.10+)
*   System-level `git` installed on the host machine.

### 1. Backend Initialization
Open a terminal and configure your Python environment:

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # On Windows
pip install -r requirements.txt
```

**Configure Environment Variables (`.env`)**:
```env
SECRET_KEY=your_fastapi_jwt_secret
MASTER_KEY=your_base64_32byte_encryption_key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=internpass123
GITHUB_TOKEN=your_github_pat_for_opening_prs
```

**Seed the SQLite Database**:
This generates the initial schema and creates your Admin/Intern test accounts.
```bash
python seed.py
```

**Start the API Server**:
```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Initialization
In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```
Navigate to **`http://localhost:5173`** to access the Workbench.

---

## ?? Admin: Markdown Plan Format

Admins can instantly generate database tasks by uploading `.md` files in this structure:

```markdown
This text serves as Global AI Context for all tasks below.
Repo: https://github.com/your-org/your-repo.git
Branch: main

## Setup Database Schema
TaskID: db-schema
AssignTo: intern1@example.com

Create the SQLAlchemy models for the new feature.

## Build the API Router
TaskID: api-router
DependsOn: db-schema
AssignTo: intern2@example.com

Develop the FastAPI endpoints.
```

---

<div align="center">
  <p>Engineered with ?? by the <a href="https://dbert.online">DBERT</a> Engineering Team.</p>
</div>

