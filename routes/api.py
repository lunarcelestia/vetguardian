# -*- coding: utf-8 -*-
import json
from pathlib import Path

from flask import Blueprint, request, jsonify

from config import Config
from database import get_connection
from knowledge_engine import evaluate
from openai_proxy_service import get_ai_report
from routes.auth import get_user_from_request

api_bp = Blueprint("api", __name__)


def _load_clinics():
    path = getattr(Config, "VET_CLINICS_PATH", None) or Path(__file__).resolve().parent.parent / "data" / "vet_clinics.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _flatten_clinics(raw):
    """
    Приводит данные по клиникам к плоскому списку словарей.
    Защита от ситуаций, когда в JSON случайно оказываются вложенные списки.
    """
    flat = []
    for item in raw or []:
        if isinstance(item, dict):
            flat.append(item)
        elif isinstance(item, list):
            for sub in item:
                if isinstance(sub, dict):
                    flat.append(sub)
    return flat


@api_bp.route("/api/analyze", methods=["POST"])
def analyze():
    """Анализ: оценка по медицинской БД + справка от ИИ (OpenAI/ProxyAPI). Сохранение в историю."""
    data = request.get_json() or {}
    answers = data.get("answers") or {}
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}
    extra_text = (data.get("extra_text") or "").strip()
    primary_concern = (data.get("primary_concern") or "").strip()
    photos = data.get("photos") or []
    if not isinstance(photos, list):
        photos = []

    if not primary_concern:
        return jsonify({"ok": False, "error": "Укажите основную проблему, вызывающую беспокойство."}), 400

    kb_result = evaluate(answers, primary_concern=primary_concern)
    kb_danger_level = kb_result.get("danger_level", "yellow")
    summary = kb_result.get("summary", "")
    conditions = kb_result.get("conditions", [])
    immediate_actions = kb_result.get("immediate_actions", [])

    ai_report = get_ai_report(
        answers,
        extra_text=extra_text,
        primary_concern=primary_concern,
        photos_base64=photos,
    )
    ai_response = ai_report.get("text", "") if ai_report.get("success") else ""
    if not ai_response and ai_report.get("error"):
        ai_response = "Справка от ИИ временно недоступна: " + str(ai_report.get("error", ""))

    # Верхний индикатор срочности совпадает с оценкой ИИ, если она успешно распарсена
    ai_urgency = ai_report.get("urgency_level") if ai_report.get("success") else None
    if ai_urgency in ("green", "yellow", "red"):
        danger_level = ai_urgency
    else:
        danger_level = kb_danger_level

    user_id = get_user_from_request()
    try:
        with get_connection() as conn:
            # сохраняем кейс в историю только для авторизованных пользователей
            if user_id:
                conn.execute(
                    """INSERT INTO cases (user_id, pet_id, symptoms_data, danger_level, result_summary, result_details)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        user_id,
                        data.get("pet_id"),
                        json.dumps(
                            {
                                "answers": answers,
                                "extra_text": extra_text,
                                "primary_concern": primary_concern,
                                "photos_count": len(photos),
                            },
                            ensure_ascii=False,
                        ),
                        danger_level,
                        summary,
                        json.dumps(
                            {
                                "kb": kb_result,
                                "ai_response": ai_response,
                                "kb_danger_level": kb_danger_level,
                                "ai_urgency_level": ai_urgency,
                            },
                            ensure_ascii=False,
                        ),
                    ),
                )

            # извлекаем параметры для статистики
            breed = (answers.get("b1_breed_name") or answers.get("b1_breed") or "").strip()
            age_group = (answers.get("b1_age") or "").strip()
            symptoms = [c.get("name", "") for c in kb_result.get("conditions", []) if c.get("name")]
            behaviors = []  # TODO: заполнить при появлении явных ответов по поведению

            # сохраняем «сырой» кейс для статистики (в том числе анонимных пользователей)
            conn.execute(
                """INSERT INTO anamnesis_cases (breed, age_group, symptoms, behaviors)
                   VALUES (?, ?, ?, ?)""",
                (
                    breed or None,
                    age_group or None,
                    json.dumps(symptoms, ensure_ascii=False),
                    json.dumps(behaviors, ensure_ascii=False),
                ),
            )

            # --- Инкрементальное обновление статистики по породе ---
            if breed and symptoms:
                row = conn.execute(
                    "SELECT disease_frequency, total_cases FROM breed_stats WHERE breed_name = ?",
                    (breed,),
                ).fetchone()
                if row:
                    try:
                        freq = json.loads(row["disease_frequency"] or "{}")
                    except Exception:
                        freq = {}
                    total_cases = row["total_cases"] or 0
                    total_cases += 1
                    for name in symptoms:
                        if not name:
                            continue
                        freq[name] = freq.get(name, 0) + 1
                    conn.execute(
                        "UPDATE breed_stats SET disease_frequency = ?, total_cases = ?, updated_at = CURRENT_TIMESTAMP WHERE breed_name = ?",
                        (json.dumps(freq, ensure_ascii=False), total_cases, breed),
                    )

            # --- Инкрементальное обновление статистики по возрасту ---
            if age_group and symptoms:
                row = conn.execute(
                    "SELECT complications_frequency, total_cases FROM age_stats WHERE age_group = ?",
                    (age_group,),
                ).fetchone()
                if row:
                    try:
                        freq_age = json.loads(row["complications_frequency"] or "{}")
                    except Exception:
                        freq_age = {}
                    age_total = row["total_cases"] or 0
                    age_total += 1
                    for name in symptoms:
                        if not name:
                            continue
                        freq_age[name] = freq_age.get(name, 0) + 1
                    conn.execute(
                        "UPDATE age_stats SET complications_frequency = ?, total_cases = ?, updated_at = CURRENT_TIMESTAMP WHERE age_group = ?",
                        (json.dumps(freq_age, ensure_ascii=False), age_total, age_group),
                    )

            # --- Поведение (будет заполнено позже, когда появятся данные) ---
            # if behaviors:
            #     for b_name in behaviors:
            #         ...

    except Exception:
        pass

    result = {
        "danger_level": danger_level,
        "kb_danger_level": kb_danger_level,
        "summary": summary,
        "conditions": conditions,
        "immediate_actions": immediate_actions,
        "need_vet": danger_level in ("red", "yellow"),
        "ai_response": ai_response,
    }
    return jsonify({"ok": True, "result": result})


@api_bp.route("/api/questionnaire/submit", methods=["POST"])
def questionnaire_submit():
    """Упрощённая отправка без ИИ (только база знаний). Для полного анализа используйте /api/analyze."""
    data = request.get_json() or {}
    answers = data.get("answers") or {}
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}
    primary_concern = (data.get("primary_concern") or "").strip()
    result = evaluate(answers, primary_concern=primary_concern)
    user_id = get_user_from_request()
    if user_id:
        try:
            with get_connection() as conn:
                conn.execute(
                    """INSERT INTO cases (user_id, pet_id, symptoms_data, danger_level, result_summary, result_details)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        user_id,
                        data.get("pet_id"),
                        json.dumps(
                            {"answers": answers, "primary_concern": primary_concern},
                            ensure_ascii=False,
                        ),
                        result.get("danger_level", "green"),
                        result.get("summary", ""),
                        json.dumps(result, ensure_ascii=False),
                    ),
                )
        except Exception:
            pass
    return jsonify({"ok": True, "result": result})

@api_bp.route("/api/clinics", methods=["GET"])
def clinics():
    """Список ветклиник, опционально по городу (city=moscow|spb)."""
    city = (request.args.get("city") or "").strip().lower()
    # Всегда работаем с плоским списком словарей
    all_clinics = _flatten_clinics(_load_clinics())
    if city:
        all_clinics = [c for c in all_clinics if (c.get("city") or "").lower() == city]
    return jsonify({"ok": True, "items": all_clinics})


@api_bp.route("/api/config", methods=["GET"])
def config():
    """Публичная конфигурация для фронта (ключ карт)."""
    return jsonify({
        "ok": True,
        "yandexMapsApiKey": getattr(Config, "YANDEX_MAPS_API_KEY", "") or "",
    })


@api_bp.route("/api/me", methods=["GET"])
def me():
    user_id = get_user_from_request()
    if not user_id:
        return jsonify({"ok": False, "user": None}), 401
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return jsonify({"ok": False, "user": None}), 401
    return jsonify({
        "ok": True,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "created_at": row["created_at"],
        },
    })

@api_bp.route("/api/history", methods=["GET"])
def history():
    user_id = get_user_from_request()
    if not user_id:
        return jsonify({"ok": False, "items": []}), 401
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, pet_id, danger_level, result_summary, result_details, created_at
               FROM cases WHERE user_id = ? ORDER BY created_at DESC LIMIT 50""",
            (user_id,),
        ).fetchall()

    items = []
    for r in rows:
        short = (r["result_summary"] or "").strip()

        # если есть подробности с ИИ, пытаемся взять осмысленную строку «Оценка срочности: …»
        try:
            details = json.loads(r["result_details"] or "{}")
        except Exception:
            details = {}
        ai_text = (details.get("ai_response") or "").strip()
        if ai_text:
            best_line = ""
            for line in ai_text.splitlines():
                s = line.strip()
                if not s:
                    continue
                # пропускаем заголовки и служебные строки
                if s.startswith("#"):
                    continue
                if s.lower().startswith("справка ии".lower()):
                    continue
                if s.lower().startswith("краткая справка".lower()):
                    continue
                # приоритет — строка, начинающаяся с «Оценка срочности»
                if s.lower().startswith("оценка срочности".lower()):
                    best_line = s
                    break
                if not best_line:
                    best_line = s
            if best_line:
                short = best_line

        items.append({
            "id": r["id"],
            "pet_id": r["pet_id"],
            "danger_level": r["danger_level"],
            "summary": short[:200],
            "created_at": r["created_at"],
        })
    return jsonify({"ok": True, "items": items})


@api_bp.route("/api/history/<int:case_id>", methods=["GET"])
def history_item(case_id: int):
    """Полные данные по одному кейсу для повторного просмотра результата."""
    user_id = get_user_from_request()
    if not user_id:
        return jsonify({"ok": False, "item": None}), 401
    with get_connection() as conn:
        row = conn.execute(
            """SELECT id, user_id, pet_id, danger_level, result_summary, result_details, created_at
               FROM cases WHERE id = ? AND user_id = ?""",
            (case_id, user_id),
        ).fetchone()
    if not row:
        return jsonify({"ok": False, "item": None}), 404

    details = {}
    try:
        details = json.loads(row["result_details"] or "{}")
    except Exception:
        details = {}
    kb = details.get("kb") or {}
    ai_response = details.get("ai_response") or ""

    result = {
        "danger_level": row["danger_level"],
        "summary": row["result_summary"] or "",
        "conditions": kb.get("conditions") or [],
        "immediate_actions": kb.get("immediate_actions") or [],
        "need_vet": row["danger_level"] in ("red", "yellow"),
        "ai_response": ai_response,
    }
    return jsonify({
        "ok": True,
        "item": {
            "id": row["id"],
            "pet_id": row["pet_id"],
            "created_at": row["created_at"],
            "result": result,
        },
    })


@api_bp.route("/api/breeds", methods=["GET"])
def breeds():
    """Список пород для раздела «По породе»."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, breed_name, description, common_issues,
                      typical_diseases, disease_frequency, trait_frequency
               FROM breed_stats ORDER BY breed_name""",
        ).fetchall()
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "breed_name": r["breed_name"],
            "description": r["description"],
            "common_issues": r["common_issues"],
            "typical_diseases": json.loads(r["typical_diseases"] or "[]"),
            "disease_frequency": json.loads(r["disease_frequency"] or "{}"),
            "trait_frequency": json.loads(r["trait_frequency"] or "{}"),
        })
    return jsonify({"ok": True, "items": items})


@api_bp.route("/api/breed/<int:breed_id>", methods=["GET"])
def breed_detail(breed_id: int):
    with get_connection() as conn:
        r = conn.execute(
            """SELECT id, breed_name, description, common_issues,
                      typical_diseases, disease_frequency, trait_frequency
               FROM breed_stats WHERE id = ?""",
            (breed_id,),
        ).fetchone()
    if not r:
        return jsonify({"ok": False, "item": None}), 404
    item = {
        "id": r["id"],
        "breed_name": r["breed_name"],
        "description": r["description"],
        "common_issues": r["common_issues"],
        "typical_diseases": json.loads(r["typical_diseases"] or "[]"),
        "disease_frequency": json.loads(r["disease_frequency"] or "{}"),
        "trait_frequency": json.loads(r["trait_frequency"] or "{}"),
    }
    return jsonify({"ok": True, "item": item})


@api_bp.route("/api/ages", methods=["GET"])
def ages():
    """Статьи и статистика по возрасту."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, age_group, description, care_recommendations,
                      common_problems, complications_frequency, diseases_by_care
               FROM age_stats ORDER BY id""",
        ).fetchall()
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "age_group": r["age_group"],
            "description": r["description"],
            "care_recommendations": r["care_recommendations"],
            "common_problems": r["common_problems"],
            "complications_frequency": json.loads(r["complications_frequency"] or "{}"),
            "diseases_by_care": json.loads(r["diseases_by_care"] or "{}"),
        })
    return jsonify({"ok": True, "items": items})


@api_bp.route("/api/behaviors", methods=["GET"])
def behaviors():
    """Статьи и статистика по поведению."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, behavior_type, description, causes, solutions,
                      frequency, total_cases
               FROM behavior_stats ORDER BY id""",
        ).fetchall()
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "behavior_type": r["behavior_type"],
            "description": r["description"],
            "causes": r["causes"],
            "solutions": r["solutions"],
            "frequency": r["frequency"],
            "total_cases": r["total_cases"],
        })
    return jsonify({"ok": True, "items": items})
