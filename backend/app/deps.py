"""
Shared dependencies. get_owned_workspace is the enforcement point for
per-intern isolation (spec Section 9): an intern may only touch a workspace
they own; admins may view any workspace.
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from . import models
from .auth import get_current_user
from .database import get_db


def get_owned_workspace(
    workspace_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Workspace:
    ws = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "This workspace belongs to someone else")
    return ws
