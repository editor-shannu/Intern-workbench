import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, engine
from .pr_poller import start_poller
from .routers import auth_routes, chat, files, git_ops, tasks, users, workspaces, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.WORKSPACES_ROOT, exist_ok=True)
    os.makedirs(Path(settings.GIT_ROOT).parent, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    start_poller()
    yield


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(tasks.router)
app.include_router(tasks.notes_router)
app.include_router(tasks.plan_router)
app.include_router(workspaces.router)
app.include_router(files.router)
app.include_router(git_ops.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Optional: serve the built frontend (frontend/dist) directly from the backend
# process, for a single-process "production-like" local test. In the normal
# EC2 deployment, nginx serves the frontend build instead (see deploy/).
_frontend_dist = (Path(__file__).resolve().parent.parent / settings.FRONTEND_DIST_DIR).resolve()
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
