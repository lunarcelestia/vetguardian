# -*- coding: utf-8 -*-
"""
Сервис для локального Llama через Ollama.

Цель:
- получить от Llama строго-JSON данные для графика (радиальная диаграмма)
- вычислить общий score и danger_level

Подключение:
- Ollama должен быть запущен
- доступен HTTP API (по умолчанию http://localhost:11434)
"""

import json
import re
from typing import Any, Dict

import requests

from config import Config


QUICK_QUIZ_PARAMETER_DEFS = [
    {
        "key": "physical_form",
        "label": "Физическая форма",
        "source_questions": [1],
    },
    {
        "key": "digestion_hydration",
        "label": "Пищеварение и водный баланс",
        "source_questions": [2, 3, 6],
    },
    {
        "key": "energy_mobility",
        "label": "Энергия и подвижность",
        "source_questions": [4, 8],
    },
    {
        "key": "external_state",
        "label": "Внешнее состояние",
        "source_questions": [5, 9],
    },
    {
        "key": "behavior_nervous",
        "label": "Поведение и нервная система",
        "source_questions": [7, 10],
    },
]


def _extract_json_object(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    # На случай, если модель добавила вводный текст/заключение.
    m = re.search(r"\{[\s\S]*\}\s*$", text.strip())
    if not m:
        # Попытка вырезать первый JSON-объект.
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return {}
        candidate = text[start : end + 1]
    else:
        candidate = m.group(0)
    return json.loads(candidate)


def quick_check_scores_and_chart(quick_answers: Dict[str, Any]) -> Dict[str, Any]:
    """
    quick_answers ожидается формата:
      {
        "q1": "...вариант ответа 1...",
        ...
        "q10": "...вариант ответа 10..."
      }
    """
    base_url = Config.OLLAMA_BASE_URL
    model = Config.OLLAMA_MODEL

    prompt_lines = [
        "Ты — ветеринарный ассистент VetGuardian.",
        "",
        "Задача: по ответам владельца на быстрый опрос оценить интегральные параметры здоровья собаки (5 шкал),",
        "вернуть JSON для фронтенда и короткое пояснение по каждой шкале.",
        "",
        "Параметры (шкала 0..10, где 10 — оптимально):",
    ]
    for p in QUICK_QUIZ_PARAMETER_DEFS:
        prompt_lines.append(f"- {p['label']} (источник: вопросы {', '.join(map(str, p['source_questions']))})")

    prompt_lines += [
        "",
        "Правила danger_level:",
        "overall_score = среднее пяти шкал (0..10).",
        "overall_score >= 8 => green",
        "overall_score >= 5 и < 8 => yellow",
        "overall_score < 5 => red",
        "",
        "Ответ должен быть строго JSON (без markdown, без лишнего текста).",
        "Схема JSON:",
        "{",
        '  "overall_score": number,',
        '  "danger_level": "green"|"yellow"|"red",',
        '  "parameters": {',
        '     "physical_form": {"score": number, "hint": string},',
        '     "digestion_hydration": {"score": number, "hint": string},',
        '     "energy_mobility": {"score": number, "hint": string},',
        '     "external_state": {"score": number, "hint": string},',
        '     "behavior_nervous": {"score": number, "hint": string}',
        "  },",
        '  "chart": {"type":"radar","labels":[string,...],"values":[number,...]}',
        "}",
        "",
        "Ответ формируй только по предоставленным ответам. Не выдумывай симптомы.",
        "",
        "Ответы владельца:",
    ]

    for k in sorted((quick_answers or {}).keys()):
        prompt_lines.append(f"{k}: {quick_answers.get(k)}")

    prompt = "\n".join(prompt_lines)

    url = f"{base_url}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2},
    }

    r = requests.post(url, json=payload, timeout=90)
    r.raise_for_status()
    data = r.json()
    raw = data.get("response") or ""

    parsed = _extract_json_object(raw)
    if not parsed:
        raise ValueError("Llama returned empty/invalid JSON")
    return parsed

