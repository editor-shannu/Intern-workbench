from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, hash_password, require_admin
from ..crypto import encrypt_secret
from ..database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.name).all()


@router.post("", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(400, "A user with that email already exists")
    if payload.role not in ("intern", "admin"):
        raise HTTPException(400, "role must be 'intern' or 'admin'")
    user = models.User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        github_author_email=payload.github_author_email or payload.email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


from .. import openrouter_client

@router.post("/me/openrouter-key")
async def save_openrouter_key(
    payload: schemas.OpenRouterKeyIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_valid = await openrouter_client.verify_key(payload.api_key)
    if not is_valid:
        raise HTTPException(400, "Invalid or inactive OpenRouter API Key")

    ciphertext, nonce = encrypt_secret(payload.api_key)
    existing = db.query(models.OpenRouterKey).filter_by(user_id=current_user.id).first()
    if existing:
        existing.encrypted_key = ciphertext
        existing.encrypted_nonce = nonce
    else:
        db.add(models.OpenRouterKey(user_id=current_user.id, encrypted_key=ciphertext, encrypted_nonce=nonce))
    db.commit()
    return {"status": "saved"}

@router.get("/me/openrouter-models")
async def get_openrouter_models(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    from ..crypto import decrypt_secret
    key_rec = db.query(models.OpenRouterKey).filter_by(user_id=current_user.id).first()
    if not key_rec:
        raise HTTPException(400, "No OpenRouter API key on file")
    
    api_key = decrypt_secret(key_rec.encrypted_key, key_rec.encrypted_nonce)
    try:
        models_list = await openrouter_client.get_models(api_key)
        return models_list
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch models: {e}")


@router.get("/me/openrouter-key/status")
def openrouter_key_status(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    exists = db.query(models.OpenRouterKey).filter_by(user_id=current_user.id).first() is not None
    return {"has_key": exists}


@router.delete("/me/openrouter-key")
def delete_openrouter_key(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    db.query(models.OpenRouterKey).filter_by(user_id=current_user.id).delete()
    db.commit()
    return {"status": "deleted"}
