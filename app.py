# -*- coding: utf-8 -*-
"""
VetGuardian — точка входа. Запуск из Visual Studio: установите StartupFile = app.py
и при старте откроется локальный сервер (Flask).
"""
import os

from flask import Flask, send_from_directory

from config import Config
from database import init_db
from routes.auth import auth_bp
from routes.api import api_bp

try:
    from flask_cors import CORS
    _cors_available = True
except ImportError:
    _cors_available = False

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["SECRET_KEY"] = Config.SECRET_KEY
if _cors_available:
    CORS(app, supports_credentials=True)

# Всегда инициализируем БД при старте приложения (в том числе при запуске из VS / wsgi),
# чтобы подтянуть актуальные статьи и статистику из Excel.
init_db()

app.register_blueprint(auth_bp)
app.register_blueprint(api_bp)

# Поддержка временного показа картинок, которые загружены/прикреплены в Cursor-воркспейс
# (папка .cursor/.../assets). Это удобно для локальной проверки визуала.
_CURSOR_ASSETS_DIR = r"C:\Users\Инженер\.cursor\projects\d-projects-VetGuardian-VetGuardian\assets"

@app.route("/cursor-assets/<path:filename>")
def cursor_assets(filename: str):
    return send_from_directory(_CURSOR_ASSETS_DIR, filename)

# Статика и главная страница
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def static_file(path):
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
