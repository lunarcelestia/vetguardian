# -*- coding: utf-8 -*-
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

class Config:
    # Делаем ключ достаточно длинным для HMAC-SHA256
    _raw_secret = os.environ.get("SECRET_KEY", "dev-secret-key")
    if len(_raw_secret) < 32:
        SECRET_KEY = (_raw_secret + "_change_this_to_long_secret_padding")[:32]
    else:
        SECRET_KEY = _raw_secret
    DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///vetguardian.db")
    DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    OPENAI_API_KEY = (os.environ.get("OPENAI_API_KEY") or "sk-Mg5OoofMHayi2Ery5bGp3WJeSGPUU9u9").strip()
    OPENAI_API_BASE = (os.environ.get("OPENAI_API_BASE", "https://openai.api.proxyapi.ru/v1") or "https://openai.api.proxyapi.ru/v1").rstrip("/")
    OPENAI_API_MODEL = os.environ.get("OPENAI_API_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini"
    if DATABASE_URL.startswith("sqlite"):
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if not db_path.startswith("/"):
            DATABASE_PATH = str(BASE_DIR / db_path)
        else:
            DATABASE_PATH = db_path
    else:
        DATABASE_PATH = None
    KNOWLEDGE_BASE_PATH = BASE_DIR / "data" / "veterinary_knowledge.json"
    VET_CLINICS_PATH = BASE_DIR / "data" / "vet_clinics.json"
    YANDEX_GEOCODER_API_KEY = (os.environ.get("YANDEX_GEOCODER_API_KEY") or "2ff533a1-f8f7-4027-82d1-2fe2bac4c298").strip()
    YANDEX_MAPS_API_KEY = (os.environ.get("YANDEX_API_KEY") or "AQVN1BOz3fAvy-pqoMYYOKAPCFsYH6R_C3b0TV9I").strip()
