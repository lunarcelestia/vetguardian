# -*- coding: utf-8 -*-
import hashlib
import hmac
import os
import secrets

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    p = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8") if isinstance(salt, str) else salt, 100000)
    return f"{salt}${p.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, phash = stored.split("$", 1)
        p = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return hmac.compare_digest(p.hex(), phash)
    except Exception:
        return False
