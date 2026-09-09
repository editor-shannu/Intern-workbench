"""
AES-256-GCM encryption for secrets-at-rest (OpenRouter API keys).

MASTER_KEY (from settings, i.e. env/.env, never committed) must decode from
base64url to exactly 32 raw bytes. Generate one with:

    python3 -c "import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

Each secret gets its own random 12-byte nonce, stored alongside the
ciphertext (encrypted_key / encrypted_nonce columns) — never reused.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings


class CryptoConfigError(RuntimeError):
    pass


def _master_key_bytes() -> bytes:
    try:
        raw = base64.urlsafe_b64decode(settings.MASTER_KEY)
    except Exception as e:
        raise CryptoConfigError(f"MASTER_KEY is not valid base64url: {e}")
    if len(raw) != 32:
        raise CryptoConfigError(
            f"MASTER_KEY must decode to 32 bytes for AES-256 (got {len(raw)}). "
            "Generate a new one with the command in .env.example."
        )
    return raw


def encrypt_secret(plaintext: str) -> tuple[str, str]:
    """Returns (ciphertext_b64, nonce_b64)."""
    key = _master_key_bytes()
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(ct).decode(), base64.b64encode(nonce).decode()


def decrypt_secret(ciphertext_b64: str, nonce_b64: str) -> str:
    key = _master_key_bytes()
    ct = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    pt = AESGCM(key).decrypt(nonce, ct, None)
    return pt.decode("utf-8")
