# -*- coding: utf-8 -*-
"""
Интеграция с OpenAI через ProxyAPI (OpenAI-совместимый endpoint).
Возвращает текст справки от ИИ для блока «Справка от ИИ».
"""
import requests

from config import Config

SYSTEM_PROMPT = """Ты — ветеринарный ассистент VetGuardian. Твоя задача — анализировать состояние животного по предоставленным данным и давать краткую справку.

Входные данные: информация о питомце, ответы на опросник по симптомам, дополнительная информация от владельца.

Дай краткую справку:
- Оценка срочности (насколько срочно нужен ветврач)
- Ключевые симптомы и на что они могут указывать
- Конкретные пошаговые рекомендации, что делать до визита к врачу

ВАЖНО: Не ставь окончательный диагноз. Только оценка срочности и рекомендации по первой помощи. При серьёзных симптомах рекомендуй обратиться к ветеринару. Пиши по делу, на русском."""


def _user_friendly_error(api_error: str) -> str:
    """Понятное сообщение для пользователя при ошибке API."""
    if not api_error:
        return "Сервис ИИ временно недоступен."
    err_lower = api_error.lower()
    if "country" in err_lower and ("not supported" in err_lower or "region" in err_lower or "territory" in err_lower):
        return (
            "Сервис ИИ недоступен в вашем регионе (ограничения провайдера). "
            "Вы можете использовать оценку по медицинской базе знаний выше. "
            "Для справки от ИИ попробуйте VPN или другую сеть."
        )
    if "insufficient balance" in err_lower or "balance" in err_lower:
        return "Недостаточно средств на счёте API. Пополните баланс в личном кабинете провайдера."
    return f"Сервис ИИ временно недоступен: {api_error}"


def _format_answers_for_prompt(answers: dict) -> str:
    lines = []
    block_labels = {"b1_": "О питомце", "b2_": "Образ жизни", "b3_": "Симптомы", "b4_": "История проблемы"}
    current_block = None
    for k, v in sorted((answers or {}).items()):
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


def get_ai_report(answers: dict, extra_text: str = "", photos_count: int = 0) -> dict:
    """
    Запрос к OpenAI-совместимому API (в т.ч. ProxyAPI).
    Возвращает: {"success": bool, "text": str, "error": str|None}
    """
    api_key = getattr(Config, "OPENAI_API_KEY", None) or ""
    base_url = getattr(Config, "OPENAI_API_BASE", "https://openai.api.proxyapi.ru/v1") or "https://openai.api.proxyapi.ru/v1"
    base_url = base_url.rstrip("/")
    if not api_key:
        return {"success": False, "text": "", "error": "OPENAI_API_KEY not set"}

    survey_text = _format_answers_for_prompt(answers)
    user_parts = [f"Данные опросника:\n{survey_text}"]
    if extra_text and extra_text.strip():
        user_parts.append(f"\nДополнительная информация от владельца:\n{extra_text.strip()}")
    if photos_count:
        user_parts.append(f"\nПриложено фото: {photos_count} шт.")
    user_content = "\n".join(user_parts)

    url = f"{base_url}/chat/completions"
    model = getattr(Config, "OPENAI_API_MODEL", "openai/gpt-4o-mini") or "openai/gpt-4o-mini"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 1500,
        "temperature": 0.3,
    }

    try:
        r = requests.post(
            url,
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
        return {"success": True, "text": content.strip(), "error": None}
    except requests.exceptions.Timeout:
        return {"success": False, "text": "", "error": "timeout"}
    except requests.exceptions.RequestException as e:
        err_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.json()
                err_msg = err_body.get("error", {}).get("message", err_msg) or err_msg
            except Exception:
                pass
        return {"success": False, "text": "", "error": _user_friendly_error(err_msg)}
    except Exception as e:
        return {"success": False, "text": "", "error": str(e)}
