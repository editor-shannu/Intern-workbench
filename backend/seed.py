"""
Creates the admin account (from ADMIN_* env vars) and two test intern accounts.
"""
from app.auth import hash_password
from app.config import settings
from app.database import Base, SessionLocal, engine
from app import models
from app.crypto import encrypt_secret
import os

def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Create Admin
        if not db.query(models.User).filter_by(email=settings.ADMIN_EMAIL).first():
            admin = models.User(
                name=settings.ADMIN_NAME,
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
                github_author_email=settings.ADMIN_EMAIL,
            )
            db.add(admin)
            db.commit()
            print(f"Created admin account: {settings.ADMIN_EMAIL}")

        # Create Intern 1 (With API Key)
        intern1_email = "intern1@example.com"
        intern1 = db.query(models.User).filter_by(email=intern1_email).first()
        if not intern1:
            intern1 = models.User(
                name="Alice Intern",
                email=intern1_email,
                password_hash=hash_password("intern123"),
                role="intern",
                github_author_email=intern1_email,
            )
            db.add(intern1)
            db.commit()
            
            # Set a dummy API key for testing
            ciphertext, nonce = encrypt_secret("sk-or-v1-dummy-key-for-testing")
            db.add(models.OpenRouterKey(user_id=intern1.id, encrypted_key=ciphertext, encrypted_nonce=nonce))
            db.commit()
            print(f"Created Intern 1 (With API key): {intern1_email} / intern123")

        # Create Intern 2 (Without API Key)
        intern2_email = "intern2@example.com"
        if not db.query(models.User).filter_by(email=intern2_email).first():
            intern2 = models.User(
                name="Bob Intern",
                email=intern2_email,
                password_hash=hash_password("intern123"),
                role="intern",
                github_author_email=intern2_email,
            )
            db.add(intern2)
            db.commit()
            print(f"Created Intern 2 (No API key): {intern2_email} / intern123")

    finally:
        db.close()


if __name__ == "__main__":
    run()
