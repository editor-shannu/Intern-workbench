"""
Central app configuration, loaded from environment variables / a local .env file.

SECRET_KEY and MASTER_KEY are intentionally required (no default) so the app
refuses to start with an insecure default in production. Generate them with
the commands in .env.example.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "Intern AI-Coding Workbench"

    # --- Auth secrets (required) ---
    SECRET_KEY: str
    MASTER_KEY: str  # base64url-encoded 32 raw bytes, used for AES-256-GCM
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    # --- Seed admin account (required, used once by seed.py) ---
    ADMIN_NAME: str
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    # --- Database ---
    DATABASE_URL: str = "sqlite:///./workbench.db"

    # --- Git / GitHub ---
    UPSTREAM_REPO_URL: str = ""  # e.g. https://github.com/Gayatri-Education/Gayatri-AI.git or file:///path/to/repo.git
    GITHUB_REPO_OWNER: str = "Gayatri-Education"
    GITHUB_REPO_NAME: str = "Gayatri-AI"
    BASE_BRANCH: str = "main"
    GITHUB_TOKEN: str = ""  # service-account PAT; repo-scoped, write access

    GIT_ROOT: str = "./data/repo-mirror.git"
    WORKSPACES_ROOT: str = "./data/workspaces"

    # --- OpenRouter ---
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # --- App / networking ---
    CORS_ORIGINS: str = "http://localhost:5173"
    PR_POLL_INTERVAL_SECONDS: int = 120
    FRONTEND_DIST_DIR: str = "../frontend/dist"


settings = Settings()
