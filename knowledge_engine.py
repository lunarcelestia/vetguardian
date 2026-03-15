# -*- coding: utf-8 -*-
"""
Движок вывода по базе знаний: по ответам опросника возвращает
вероятные диагнозы, уровень опасности и рекомендации.
"""
import json
from pathlib import Path

from config import Config

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

def evaluate(answers: dict) -> dict:
    """
    answers — плоский словарь ответов опросника (question_key -> value).
    Возвращает: {
        "danger_level": "green"|"yellow"|"red",
        "conditions": [{"name", "description", "probability", "recommendations"}],
        "summary": str,
        "immediate_actions": [str],
        "need_vet": bool
    }
    """
    kb = load_knowledge_base()
    conditions_list = kb.get("conditions", [])
    results = []
    for cond in conditions_list:
        score = score_symptoms(answers, cond)
        if score > 0:
            results.append({
                "id": cond.get("id"),
                "name": cond.get("name", "Состояние"),
                "description": cond.get("description", ""),
                "recommendations": cond.get("recommendations", []),
                "danger_level": cond.get("danger_level", "yellow"),
                "probability": round(score, 2),
            })
    results.sort(key=lambda x: -x["probability"])
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

    summary_parts = []
    for r in top:
        summary_parts.append(f"{r['name']} (вероятность {int(r['probability']*100)}%): {r['description'][:200]}")
    summary = " ".join(summary_parts) if summary_parts else "По опросу явных опасных состояний не выявлено. Рекомендуется наблюдение."

    return {
        "danger_level": danger_level,
        "conditions": top,
        "summary": summary,
        "immediate_actions": immediate_actions,
        "need_vet": need_vet,
    }
