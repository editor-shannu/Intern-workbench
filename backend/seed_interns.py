
import os
import sys

# Add backend directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app import models
from app.auth import hash_password
from app.crypto import encrypt_secret

db = SessionLocal()

# Create Intern 1 (With API Key)
intern1 = db.query(models.User).filter_by(email="intern_with_key@gayatri.ai").first()
if not intern1:
    intern1 = models.User(
        email="intern_with_key@gayatri.ai",
        name="Intern With Key",
        password_hash=hash_password("intern123"),
        role="intern",
        github_author_email="intern1@gayatri.ai"
    )
    db.add(intern1)
    db.commit()
    db.refresh(intern1)

# Add API Key for Intern 1
key1 = db.query(models.OpenRouterKey).filter_by(user_id=intern1.id).first()
if not key1:
    enc_key, nonce = encrypt_secret("sk-or-v1-dummy-key-for-testing")
    key_record = models.OpenRouterKey(
        user_id=intern1.id,
        encrypted_key=enc_key,
        encrypted_nonce=nonce
    )
    db.add(key_record)
    db.commit()

# Create Intern 2 (No API Key)
intern2 = db.query(models.User).filter_by(email="intern_no_key@gayatri.ai").first()
if not intern2:
    intern2 = models.User(
        email="intern_no_key@gayatri.ai",
        name="Intern Without Key",
        password_hash=hash_password("intern123"),
        role="intern",
        github_author_email="intern2@gayatri.ai"
    )
    db.add(intern2)
    db.commit()
    db.refresh(intern2)

# Create tasks so they have something to open
task1 = models.Task(
    title="Test Task for Intern 1",
    description="Test the chat functionality.",
    track="full-stack",
    status="in_progress",
    assigned_user_id=intern1.id
)
db.add(task1)

task2 = models.Task(
    title="Test Task for Intern 2",
    description="Test the hidden chat warning.",
    track="full-stack",
    status="in_progress",
    assigned_user_id=intern2.id
)
db.add(task2)

db.commit()

print("Interns successfully seeded!")

