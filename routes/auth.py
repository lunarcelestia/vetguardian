# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
import jwt
from datetime import datetime, timedelta

from config import Config

# Временная отладка конфигурации ключа
print("AUTH SECRET_KEY (len):", repr(Config.SECRET_KEY), len(Config.SECRET_KEY))
from database import get_connection
from auth_utils import hash_password, verify_password

auth_bp = Blueprint("auth", __name__)

def encode_token(user_id: int) -> str:
    token = jwt.encode(
        {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=7)},
        Config.SECRET_KEY,
        algorithm="HS256",
    )
    # PyJWT 1.x возвращает bytes, 2.x — str
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    print("ISSUED TOKEN FOR", user_id, ":", token[:60], "...")
    return token

def decode_token(token: str):
    try:
        payload = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        print("DECODED TOKEN PAYLOAD:", payload)
        return payload
    except Exception as e:
        print("DECODE TOKEN ERROR:", e)
        return None

@auth_bp.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    if not email or not password:
        return jsonify({"ok": False, "error": "Укажите email и пароль"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "error": "Пароль не менее 6 символов"}), 400
    try:
        with get_connection() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                (email, hash_password(password), name or None),
            )
            user_id = cur.lastrowid
        token = encode_token(user_id)
        return jsonify({"ok": True, "token": token, "user_id": user_id})
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"ok": False, "error": "Такой email уже зарегистрирован"}), 400
        return jsonify({"ok": False, "error": str(e)}), 500

@auth_bp.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"ok": False, "error": "Укажите email и пароль"}), 400
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "Неверный email или пароль"}), 401
    if not verify_password(password, row["password_hash"]):
        return jsonify({"ok": False, "error": "Неверный email или пароль"}), 401
    token = encode_token(row["id"])
    return jsonify({"ok": True, "token": token, "user_id": row["id"]})

def get_user_from_request():
    auth = request.headers.get("Authorization") or ""
    print("AUTH HEADER:", repr(auth))
    if auth.startswith("Bearer "):
        token = auth[7:]
        payload = decode_token(token)
        if payload:
            sub = payload.get("sub")
            try:
                return int(sub)
            except (TypeError, ValueError):
                return None
    return None
