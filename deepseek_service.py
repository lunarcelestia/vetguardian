# -*- coding: utf-8 -*-
"""
Интеграция с DeepSeek API для анализа анамнеза и рекомендаций.
"""
import json
import re

import requests

from config import Config

SYSTEM_PROMPT = """Ты — ветеринарный ассистент VetGuardian. Твоя задача — анализировать состояние животного по предоставленным данным и определять уровень опасности.

Входные данные содержат:
1. Информацию о питомце (вид, порода, возраст, вес, хронические заболевания)
2. Ответы на опросник по текущим симптомам
3. Дополнительную информацию от владельца (и при наличии — упоминание о приложенных фото)

На основе этих данных:
- Оцени уровень опасности по трёхцветной шкале. В начале ответа обязательно напиши ровно одну строку в формате: УРОВЕНЬ: КРАСНЫЙ или УРОВЕНЬ: ЖЕЛТЫЙ или УРОВЕНЬ: ЗЕЛЕНЫЙ
- После этой строки объясни, почему сделан такой вывод (укажи ключевые симптомы)
- Дай конкретные пошаговые инструкции, что делать до визита к врачу

ВАЖНО: Не ставь окончательный диагноз! Твоя задача — только оценка срочности и рекомендации по первой помощи. Всегда рекомендуй обратиться к ветеринару при серьёзных симптомах. Пиши кратко и по делу."""

API_URL = "https://api.deepseek.com/v1/chat/completions"


def _format_answers_for_prompt(answers: dict) -> str:
    """Формирует читаемый текст из ответов опросника для промпта."""
    lines = []
    block_labels = {
        "b1_": "О питомце",
        "b2_": "Образ жизни",
        "b3_": "Симптомы",
        "b4_": "История проблемы",
    }
    current_block = None
    for k, v in sorted(answers.items()):
        if not k or v is None or str(v).strip() == "":
            continue
        for prefix, label in block_labels.items():
            if k.startswith(prefix):
                if current_block != label:
                    current_block = label
                    lines.append(f"\n--- {label} ---")
                lines.append(f"  {k}: {v}")
                break
    return "\n".join(lines).strip() if lines else "Нет данных"


def _user_friendly_error(api_error: str) -> str:
    """Преобразует ответ API в понятное сообщение для пользователя."""
    err_lower = (api_error or "").lower()
    if "insufficient balance" in err_lower or "balance" in err_lower:
        return (
            "На счёте DeepSeek недостаточно средств (Insufficient Balance). "
            "Пополните баланс в личном кабинете https://platform.deepseek.com — тогда анализ через ИИ снова будет доступен. "
            "Ниже приведён результат по встроенной базе знаний."
        )
    if "invalid" in err_lower and "key" in err_lower:
        return "Неверный API-ключ DeepSeek. Проверьте DEEPSEEK_API_KEY в настройках. Ниже — результат по встроенной базе знаний."
    return f"Сервис ИИ временно недоступен: {api_error}. Ниже — результат по встроенной базе знаний."


def _parse_danger_level(text: str) -> str:
    """Извлекает уровень опасности из ответа ИИ (красный/жёлтый/зелёный)."""
    if not text:
        return "yellow"
    text_upper = text.upper()
    if "УРОВЕНЬ: КРАСНЫЙ" in text_upper or "КРАСНЫЙ" in text_upper[:100]:
        return "red"
    if "УРОВЕНЬ: ЖЕЛТЫЙ" in text_upper or "ЖЕЛТЫЙ" in text_upper[:100]:
        return "yellow"
    if "УРОВЕНЬ: ЗЕЛЕНЫЙ" in text_upper or "ЗЕЛЕНЫЙ" in text_upper[:100]:
        return "green"
    m = re.search(r"УРОВЕНЬ\s*:\s*(КРАСНЫЙ|ЖЕЛТЫЙ|ЗЕЛЕНЫЙ)", text_upper)
    if m:
        return "red" if "КРАСНЫЙ" in m.group(1) else "yellow" if "ЖЕЛТЫЙ" in m.group(1) else "green"
    return "yellow"


def analyze_anamese(answers: dict, extra_text: str = "", photos_base64: list = None) -> dict:
    """
    Отправляет данные в DeepSeek и возвращает результат.
    answers — словарь ответов опросника,
    extra_text — доп. информация от пользователя,
    photos_base64 — список base64-строк фото (для текстового описания в промпте; передача изображений в API при необходимости добавляется отдельно).

    Возвращает: {"success": bool, "danger_level": str, "summary": str, "error": str|None}
    """
    api_key = getattr(Config, "DEEPSEEK_API_KEY", None) or ""
    if not api_key:
        return {
            "success": False,
            "danger_level": "yellow",
            "summary": "Сервис анализа временно недоступен. Проверьте настройку DEEPSEEK_API_KEY.",
            "error": "DEEPSEEK_API_KEY not set",
        }

    survey_text = _format_answers_for_prompt(answers)
    user_parts = [f"Данные опросника:\n{survey_text}"]
    if extra_text and extra_text.strip():
        user_parts.append(f"\nДополнительная информация от владельца:\n{extra_text.strip()}")
    if photos_base64:
        user_parts.append(f"\nПользователь приложил {len(photos_base64)} фото животного/проблемной зоны для оценки.")
    user_content = "\n".join(user_parts)

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 2000,
        "temperature": 0.3,
    }

    try:
        r = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        danger_level = _parse_danger_level(content)
        return {
            "success": True,
            "danger_level": danger_level,
            "summary": content.strip(),
            "error": None,
        }
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "danger_level": "yellow",
            "summary": "Превышено время ожидания ответа от сервиса анализа. Попробуйте позже.",
            "error": "timeout",
        }
    except requests.exceptions.RequestException as e:
        err_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.json()
                err_msg = err_body.get("error", {}).get("message", err_msg) or err_msg
            except Exception:
                pass
        summary_user = _user_friendly_error(err_msg)
        return {
            "success": False,
            "danger_level": "yellow",
            "summary": summary_user,
            "error": err_msg,
        }
    except Exception as e:
        return {
            "success": False,
            "danger_level": "yellow",
            "summary": f"Неожиданная ошибка: {e}",
            "error": str(e),
        }
