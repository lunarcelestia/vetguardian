# -*- coding: utf-8 -*-
"""
Движок вывода по базе знаний: по ответам опросника возвращает
вероятные диагнозы, уровень опасности и рекомендации.
"""
import json
import re
from pathlib import Path

from config import Config


def _tokenize_primary(text: str):
    if not text or not str(text).strip():
        return []
    return [
        w
        for w in re.findall(r"[а-яёa-z0-9]+", str(text).lower())
        if len(w) >= 3
    ]


def _primary_match_score(primary: str, condition: dict) -> float:
    """Насколько состояние из БЗ соответствует тексту «основной проблемы» (0..1)."""
    words = _tokenize_primary(primary)
    if not words:
        return 0.0
    blob = " ".join(
        [
            str(condition.get("id", "")),
            str(condition.get("name", "")),
            str(condition.get("description", "")),
        ]
    ).lower()
    hits = sum(1 for w in words if w in blob)
    return min(1.0, hits / max(len(words), 1))

def load_knowledge_base():
    path = getattr(Config, "KNOWLEDGE_BASE_PATH", None) or Path(__file__).resolve().parent / "data" / "veterinary_knowledge.json"
    if not path.exists():
        return {"conditions": [], "symptom_rules": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _rule_matches(rule: dict, val) -> bool:
    expected = rule.get("value") or rule.get("expected")
    match_type = rule.get("match", "exact")
    if val is None:
        return False
    s = str(val).strip().lower()
    if match_type == "min":
        try:
            return float(val) >= float(expected)
        except (TypeError, ValueError):
            return False
    if match_type == "any" or isinstance(expected, list):
        lst = expected if isinstance(expected, list) else [expected]
        return s in [str(e).strip().lower() for e in lst]
    return s == str(expected).strip().lower()

def score_symptoms(answers: dict, condition: dict) -> float:
    """Оценка совпадения ответов с симптомами состояния. Возвращает 0..1."""
    rules = condition.get("symptom_rules", [])
    if not rules:
        return 0.0
    total = 0.0
    matched = 0.0
    for rule in rules:
        key = rule.get("question_key") or rule.get("key")
        expected = rule.get("value") or rule.get("expected")
        weight = float(rule.get("weight", 1.0))
        total += weight
        val = answers.get(key)
        if _rule_matches(rule, val):
            matched += weight
    return matched / total if total else 0.0

def evaluate(answers: dict, primary_concern: str = "") -> dict:
    """
    answers — плоский словарь ответов опросника (question_key -> value).
    primary_concern — краткий текст «основная проблема»; приоритизирует
    соответствующие состояния из БЗ и ослабляет общее «Наблюдение», если
    указано что-то конкретное.

    Возвращает: {
        "danger_level": "green"|"yellow"|"red",
        "conditions": [{"name", "description", "probability", "recommendations"}],
        "summary": str,
        "immediate_actions": [str],
        "need_vet": bool
    }
    """
    primary = (primary_concern or "").strip()
    kb = load_knowledge_base()
    conditions_list = kb.get("conditions", [])
    results = []
    for cond in conditions_list:
        score = score_symptoms(answers, cond)
        if score <= 0:
            continue
        pm = _primary_match_score(primary, cond)
        cid = cond.get("id") or ""

        if primary:
            # Смешиваем балл по симптомам и соответствие основной проблеме
            combined = 0.5 * score + 0.5 * max(score * 0.35, pm)
            # Общее «Наблюдение» не должно заглушать узкую жалобу
            if cid == "observation" and pm < 0.12:
                combined *= 0.18
            final_p = min(1.0, combined)
        else:
            final_p = score

        results.append({
            "id": cid,
            "name": cond.get("name", "Состояние"),
            "description": cond.get("description", ""),
            "recommendations": cond.get("recommendations", []),
            "danger_level": cond.get("danger_level", "yellow"),
            "probability": round(final_p, 2),
        })

    results.sort(key=lambda x: -x["probability"])

    if not results:
        return {
            "danger_level": "green",
            "conditions": [],
            "summary": "По опросу явных опасных состояний не выявлено. Рекомендуется наблюдение.",
            "immediate_actions": [],
            "need_vet": False,
        }

    top = results[:5]

    danger_level = "green"
    for r in top:
        d = r.get("danger_level", "green")
        if d == "red":
            danger_level = "red"
            break
        if d == "yellow" and danger_level != "red":
            danger_level = "yellow"

    need_vet = danger_level in ("yellow", "red")
    immediate_actions = []
    for r in top:
        immediate_actions.extend(r.get("recommendations", [])[:2])
    immediate_actions = list(dict.fromkeys(immediate_actions))[:5]

    summary_parts = ["Вероятные состояния (медицинская база знаний):\n"]
    for i, r in enumerate(top, 1):
        pct = int(r["probability"] * 100)
        name = r.get("name", "Состояние")
        desc = (r.get("description") or "").strip()
        # Табуляция: колонки «№ + название», «%», описание с отступом
        summary_parts.append(f"{i}.\t{name}\t{pct} %")
        summary_parts.append(f"\t{desc}")
        summary_parts.append("")
    summary = "\n".join(summary_parts).strip() if len(summary_parts) > 1 else (
        "По опросу явных опасных состояний не выявлено. Рекомендуется наблюдение."
    )

    return {
        "danger_level": danger_level,
        "conditions": top,
        "summary": summary,
        "immediate_actions": immediate_actions,
        "need_vet": need_vet,
    }
