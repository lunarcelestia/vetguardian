# -*- coding: utf-8 -*-
import json
from pathlib import Path

from flask import Blueprint, request, jsonify

from config import Config
from database import get_connection
from knowledge_engine import evaluate
from openai_proxy_service import get_ai_report, get_quick_check_brief
from llama_service import quick_check_scores_and_chart
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
            kb_conditions = kb_result.get("conditions", []) or []

            # Для записи "сырого" анамнеза в БД (пока используем названия состояний).
            symptoms = [c.get("name", "") for c in kb_conditions if c.get("name")]

            # Для графиков используем систему органов (labels из UI).
            # Это исправляет ситуацию, когда в disease_frequency/complications_frequency
            # накапливались названия медицинских состояний (вроде "Гастрит..."),
            # из-за чего графики искажались.
            condition_to_chart_system = {
                # ЖКТ
                "poisoning": "Гастроэнтерология",
                "gastritis": "Гастроэнтерология",
                "mild_gi_upset": "Гастроэнтерология",
                "gastroenteritis_acute_petsure": "Гастроэнтерология",
                "young_pet_gi_petsure": "Гастроэнтерология",
                "colitis_mucus": "Гастроэнтерология",
                "foreign_body": "Гастроэнтерология",
                "hemorrhagic_gastro": "Гастроэнтерология",
                "bloat_gdv_suspect": "Гастроэнтерология",
                "constipation_severe": "Гастроэнтерология",
                # Поджелудочная/печень
                "hepatobiliary_hint": "Гепатология/Панкреатология",
                "pancreatitis_suspect": "Гепатология/Панкреатология",

                # Кожа/аллергия
                "allergy_skin": "Дерматология",
                "skin_infection_petsure": "Дерматология",

                # Паразиты
                "parasites": "Инфекции и паразитарные болезни",

                # Мочевыделительная система
                "uti": "Нефрология/Урология",
                "blockage_urinary": "Нефрология/Урология",
                "kidney_concern": "Нефрология/Урология",

                # Дыхание / ЛОР
                "respiratory_infection": "Пульмонология",
                "dyspnea": "Пульмонология",
                "boas_brachycephalic_petsure": "Пульмонология",
                "upper_respiratory_complex": "Оториноларингология (ЛОР)",

                # Сердце
                "cardiac_respiratory_pattern": "Кардиология",

                # Неврология
                "stress_behavior": "Неврология",
                "epilepsy_seizure": "Неврология",

                # Глаза
                "conjunctivitis": "Офтальмология",
                "eye_condition_severe": "Офтальмология",

                # Опорно-двигательный аппарат
                "wound_infection": "Травматология/Ортопедия",
                "trauma_ortho": "Травматология/Ортопедия",
                "trauma_general_petsure": "Травматология/Ортопедия",
                "arthritis_degenerative_petsure": "Травматология/Ортопедия",
                "ivdd_spinal_issue_petsure": "Травматология/Ортопедия",

                # Эндокринология
                "diabetes_concern": "Эндокринология",
                "cushing_like_pattern": "Эндокринология",

                # Онкология
                "neoplasia_senior_petsure": "Онкология",
                "skin_masses_petsure": "Онкология",
            }

            chart_systems = []
            seen_sys = set()
            for c in kb_conditions:
                cid = c.get("id") or ""
                sys = condition_to_chart_system.get(cid)
                if sys and sys not in seen_sys:
                    chart_systems.append(sys)
                    seen_sys.add(sys)

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
            if breed and chart_systems:
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
                    # В исходных данных frequency часто "проценты" на базе 100 случаев.
                    # Чтобы наши +1 инкременты начали масштабироваться корректно,
                    # считаем базовый знаменатель равным 100, если он ещё не инициализирован.
                    if total_cases == 0:
                        total_cases = 100
                    total_cases += 1
                    for sys in chart_systems:
                        if not sys:
                            continue
                        freq[sys] = freq.get(sys, 0) + 1
                    conn.execute(
                        "UPDATE breed_stats SET disease_frequency = ?, total_cases = ?, updated_at = CURRENT_TIMESTAMP WHERE breed_name = ?",
                        (json.dumps(freq, ensure_ascii=False), total_cases, breed),
                    )

            # --- Инкрементальное обновление статистики по возрасту ---
            if age_group and chart_systems:
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
                    if age_total == 0:
                        age_total = 100
                    age_total += 1
                    for sys in chart_systems:
                        if not sys:
                            continue
                        freq_age[sys] = freq_age.get(sys, 0) + 1
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


@api_bp.route("/api/quick-check", methods=["POST"])
def quick_check():
    """
    Быстрый опрос: Llama рассчитывает шкалы и данные для радиальной диаграммы,
    ProxyAPI возвращает короткую справку.
    """
    data = request.get_json() or {}
    answers = data.get("answers") or data.get("quick_answers") or {}
    if isinstance(answers, str):
        try:
            answers = json.loads(answers)
        except Exception:
            answers = {}

    # ожидаем keys: q1..q10
    expected = [f"q{i}" for i in range(1, 11)]
    missing = [k for k in expected if not answers.get(k)]
    if missing:
        return jsonify({"ok": False, "error": "Не заполнены ответы быстрого опроса."}), 400

    llama_result = {}
    try:
        llama_result = quick_check_scores_and_chart(answers)
    except Exception as e:
        llama_result = {}

    # Fallback: если Llama не вернула ожидаемую структуру, оценим грубо по текстам.
    def _contains_any(s: str, parts) -> bool:
        ss = (s or "").lower()
        return any((p or "").lower() in ss for p in parts if p)

    def _score_from_q1(v: str) -> float:
        if _contains_any(v, ["идеальном", "прощупываются", "талия", "ребра прощупываются"]):
            return 10.0
        if _contains_any(v, ["Небольшие отклонения", "с легким трудом", "легким трудом"]):
            return 8.0
        if _contains_any(v, ["Умеренное отклонение", "с трудом", "талия выражена слабо"]):
            return 6.0
        if _contains_any(v, ["Критично", "ребра не прощупываются", "видны ребра и кости"]):
            return 3.0
        return 6.0

    # простые эвристики для 5 шкал
    q1 = answers.get("q1", "")
    q2 = answers.get("q2", "")
    q3 = answers.get("q3", "")
    q4 = answers.get("q4", "")
    q5 = answers.get("q5", "")
    q6 = answers.get("q6", "")
    q7 = answers.get("q7", "")
    q8 = answers.get("q8", "")
    q9 = answers.get("q9", "")
    q10 = answers.get("q10", "")

    physical_form = _score_from_q1(q1)

    def _score_from_appetite(v: str) -> float:
        if _contains_any(v, ["Отказ от еды более суток", "отказ от еды более суток", "отказ от еды"]):
            return 3.0
        if _contains_any(v, ["Аппетит заметно усилен", "заметно усилен", "просит еду чаще", "быстрее съедает"]):
            return 6.0
        if _contains_any(v, ["Аппетит немного снизился", "немного снизился", "ест меньше", "но в целом порцию съедает"]):
            return 8.0
        if _contains_any(v, ["Без изменений", "ест стабильно", "как обычно"]):
            return 10.0
        return 6.0

    appetite_score = _score_from_appetite(q2)
    vomiting_diarrhea_score = (
        3.0
        if _contains_any(q3, ["несколько раз в неделю", "регулярно/тяжело", "требуется помощь", "обезвоживания"])
        else 4.0
        if _contains_any(q3, ["примерно 1 раз в неделю", "часте", "иногда требуется коррекция питания"])
        else 7.0
        if _contains_any(q3, ["1–2 раза в месяц", "эпизодически", "проходит самостоятельно"])
        else 10.0
    )

    water_score = (
        10.0
        if _contains_any(q6, ["Пьет умеренно", "привычное количество"])
        else 7.0
        if _contains_any(q6, ["Пьет заметно больше", "заметно больше", "Пьет заметно меньше", "заметно меньше"])
        else 3.0
        if _contains_any(q6, ["очень мало", "отказывается от воды"])
        else 6.0
    )

    digestion_hydration = (appetite_score + vomiting_diarrhea_score + water_score) / 3.0

    energy_score = (
        10.0
        if _contains_any(q4, ["Активен", "играет", "обычные нагрузки"])
        else 8.0
        if _contains_any(q4, ["Немного снизилась активность", "но нагрузки переносит", "стал меньше играть"])
        else 6.0
        if _contains_any(q4, ["Быстрее устает", "заметно меньше играет"])
        else 3.0
    )

    pain_score = (
        10.0
        if _contains_any(q8, ["Движется свободно", "без скованности"])
        else 8.0
        if _contains_any(q8, ["Легкая скованность после сна", "после сна", "проходит через несколько минут"])
        else 6.0
        if _contains_any(q8, ["после нагрузки", "после разминки двигается нормально"])
        else 3.0
    )
    energy_mobility = (energy_score + pain_score) / 2.0

    external_fur = (
        10.0
        if _contains_any(q5, ["Шерсть гладкая", "без залысин", "кожа чистая"])
        else 8.0
        if _contains_any(q5, ["Легкие изменения", "единичная перхоть", "зуд минимальный"])
        else 6.0
        if _contains_any(q5, ["Умеренные проблемы", "сухость", "корки", "периодический зуд"])
        else 3.0
    )

    external_eyes = (
        10.0
        if _contains_any(q9, ["Чистые", "без выделений", "без покраснений"])
        else 8.0
        if _contains_any(q9, ["Легкие изменения", "без гноя"])
        else 6.0
        if _contains_any(q9, ["Умеренные выделения", "возможен зуд", "частое трение лапой"])
        else 3.0
    )
    external_state = (external_fur + external_eyes) / 2.0

    urination_score = (
        10.0
        if _contains_any(q7, ["Без изменений", "режим привычный"])
        else 7.0
        if _contains_any(q7, ["чаще проситься", "мочится чаще", "без крови"])
        else 5.0
        if _contains_any(q7, ["мало мочи", "частые позывы", "как будто не может нормально помочиться"])
        else 3.0
    )

    behavior_score = (
        10.0
        if _contains_any(q10, ["Без изменений", "прежние"])
        else 8.0
        if _contains_any(q10, ["Немного изменилось", "но ориентируется и реагирует"])
        else 6.0
        if _contains_any(q10, ["Заметные изменения", "выраженная тревожность", "отстраненность"])
        else 3.0
    )
    behavior_nervous = (urination_score + behavior_score) / 2.0

    computed_parameters = {
        "physical_form": {"score": round(physical_form, 1), "hint": ""},
        "digestion_hydration": {"score": round(digestion_hydration, 1), "hint": ""},
        "energy_mobility": {"score": round(energy_mobility, 1), "hint": ""},
        "external_state": {"score": round(external_state, 1), "hint": ""},
        "behavior_nervous": {"score": round(behavior_nervous, 1), "hint": ""},
    }
    computed_overall = round(sum(p["score"] for p in computed_parameters.values()) / 5.0, 1)
    computed_danger = "green" if computed_overall >= 8 else "yellow" if computed_overall >= 5 else "red"
    computed_chart = {
        "type": "radar",
        "labels": [
            "Физическая форма",
            "Пищеварение и водный баланс",
            "Энергия и подвижность",
            "Внешнее состояние",
            "Поведение и нервная система",
        ],
        "values": [
            computed_parameters["physical_form"]["score"],
            computed_parameters["digestion_hydration"]["score"],
            computed_parameters["energy_mobility"]["score"],
            computed_parameters["external_state"]["score"],
            computed_parameters["behavior_nervous"]["score"],
        ],
    }

    danger_level = (llama_result or {}).get("danger_level") or computed_danger
    parameters = (llama_result or {}).get("parameters") or computed_parameters
    overall_score = (llama_result or {}).get("overall_score") or computed_overall
    chart = (llama_result or {}).get("chart") or computed_chart

    # Короткий текст — ProxyAPI (желательно).
    ai_brief = {"success": False, "text": "", "urgency_level": None, "error": None}
    try:
        ai_brief = get_quick_check_brief(
            answers,
            danger_hint=danger_level,
            overall_score=overall_score,
            parameters=parameters,
        )
    except Exception:
        ai_brief = {"success": False, "text": "", "urgency_level": None, "error": "quick brief failed"}

    ai_text = ai_brief.get("text") or ""
    if not ai_text:
        ai_text = "По итогам быстрого опроса стоит обратить внимание на указанные параметры. При ухудшении симптомов или появлении крови/резкого отказа от воды — обратитесь к ветеринару срочно."

    return jsonify(
        {
            "ok": True,
            "danger_level": danger_level,
            "overall_score": overall_score,
            "parameters": parameters,
            "chart": chart,
            "ai_text": ai_text,
        }
    )


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
                      typical_diseases, disease_frequency, trait_frequency, total_cases
               FROM breed_stats ORDER BY breed_name""",
        ).fetchall()
    items = []
    for r in rows:
        denom = r["total_cases"] or 0
        if denom == 0:
            denom = 100
        disease_freq_counts = json.loads(r["disease_frequency"] or "{}")
        disease_freq_percent = {
            k: (float(v) / float(denom)) * 100.0 for k, v in disease_freq_counts.items()
        }
        items.append({
            "id": r["id"],
            "breed_name": r["breed_name"],
            "description": r["description"],
            "common_issues": r["common_issues"],
            "typical_diseases": json.loads(r["typical_diseases"] or "[]"),
            "disease_frequency": disease_freq_percent,
            "trait_frequency": json.loads(r["trait_frequency"] or "{}"),
        })
    return jsonify({"ok": True, "items": items})


@api_bp.route("/api/breed/<int:breed_id>", methods=["GET"])
def breed_detail(breed_id: int):
    with get_connection() as conn:
        r = conn.execute(
            """SELECT id, breed_name, description, common_issues,
                      typical_diseases, disease_frequency, trait_frequency, total_cases
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
        "disease_frequency": (lambda counts, denom: {k: (float(v) / float(denom)) * 100.0 for k, v in counts.items()})(
            json.loads(r["disease_frequency"] or "{}"),
            (r["total_cases"] or 0) or 100
        ),
        "trait_frequency": json.loads(r["trait_frequency"] or "{}"),
    }
    return jsonify({"ok": True, "item": item})


@api_bp.route("/api/ages", methods=["GET"])
def ages():
    """Статьи и статистика по возрасту."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, age_group, description, care_recommendations,
                      common_problems, complications_frequency, diseases_by_care, total_cases
               FROM age_stats ORDER BY id""",
        ).fetchall()
    items = []
    for r in rows:
        denom = r["total_cases"] or 0
        if denom == 0:
            denom = 100
        comp_counts = json.loads(r["complications_frequency"] or "{}")
        comp_percent = {k: (float(v) / float(denom)) * 100.0 for k, v in comp_counts.items()}
        items.append({
            "id": r["id"],
            "age_group": r["age_group"],
            "description": r["description"],
            "care_recommendations": r["care_recommendations"],
            "common_problems": r["common_problems"],
            "complications_frequency": comp_percent,
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
