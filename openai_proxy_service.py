# -*- coding: utf-8 -*-
"""
Интеграция с OpenAI через ProxyAPI (OpenAI-совместимый endpoint).
Поддержка текста и изображений (vision), единая строка срочности для UI.
"""
import re
import requests

from config import Config

SYSTEM_PROMPT = """Ты — ветеринарный ассистент VetGuardian.

Правила ответа:
1) Самая первая строка ответа (без префиксов и без Markdown) должна быть РОВНО в формате:
VETGUARDIAN_URGENCY: green
или
VETGUARDIAN_URGENCY: yellow
или
VETGUARDIAN_URGENCY: red
где green — можно наблюдать дома, yellow — плановый визит к врачу, red — срочно в клинику.
2) Со второй строки — пустая строка, затем развёрнутая справка на русском (несколько абзацев).

Объём и глубина: давай обширный, связный ответ (ориентир — от нескольких абзацев до развёрнутого текста; не сокращай до пары предложений). При этом чётко выделяй главный фокус.

Структура (можно короткими подзаголовками в виде строк с двоеточием, без Markdown-решёток):
— Суть и основная проблема владельца (если указана — развёрнуто).
— Обзор по данным опроса: пройдись по блокам (питомец, образ жизни, симптомы, история проблемы) и свяжи их в целостную картину; не перечисляй сухой список всех полей, но и не игнорируй обследование целиком.
— Разбор в контексте основной жалобы: что может означать, с чем дифференцировать, на что обратить внимание у врача (без окончательного диагноза).
— Сопутствующие симптомы: если в опросе есть важные признаки (в т.ч. хроника, дыхание, острое состояние), оцени их отдельным абзацем; не перетягивай акцент с основной жалобы на второстепенное, если оно не связано с ней.
— Если приложены фото: отдельный абзац — что видно на снимках, область тела, видимые изменения; свяжи с вопросом владельца. Не выдумывай детали, которых на фото не видно.
— Рекомендации до визита к ветеринару и что сообщить врачу.

Не ставь окончательный диагноз. Пиши профессионально, но понятно владельцу."""


URGENCY_LINE = re.compile(
    r"^\s*VETGUARDIAN_URGENCY:\s*(green|yellow|red)\s*(\r?\n|$)",
    re.IGNORECASE | re.MULTILINE,
)


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
    if "413" in err_lower or "too large" in err_lower or "payload" in err_lower:
        return (
            "Запрос слишком большой (часто из‑за фото). Уменьшите размер снимков или приложите меньше файлов. "
            "На сервере в nginx может понадобиться client_max_body_size (например 25m)."
        )
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


def _normalize_image_data_url(b64_or_data: str) -> str:
    s = (b64_or_data or "").strip()
    if not s:
        return ""
    if s.startswith("data:image"):
        return s
    return "data:image/jpeg;base64," + s


def _strip_urgency_line(text: str):
    """Убирает служебную строку срочности из текста для показа пользователю."""
    if not text:
        return "", None
    m = URGENCY_LINE.match(text)
    if not m:
        return text.strip(), None
    urgency = m.group(1).lower()
    rest = text[m.end() :].lstrip()
    return rest, urgency


def get_ai_report(
    answers: dict,
    extra_text: str = "",
    primary_concern: str = "",
    photos_base64=None,
) -> dict:
    """
    Запрос к OpenAI-совместимому API (в т.ч. ProxyAPI).
    При наличии фото — мультимодальный запрос (vision).

    Возвращает: {
        "success": bool,
        "text": str,  # без служебной строки VETGUARDIAN_URGENCY
        "urgency_level": "green"|"yellow"|"red"|None,
        "error": str|None
    }
    """
    photos_base64 = list(photos_base64 or [])
    api_key = getattr(Config, "OPENAI_API_KEY", None) or ""
    base_url = getattr(Config, "OPENAI_API_BASE", "https://openai.api.proxyapi.ru/v1") or "https://openai.api.proxyapi.ru/v1"
    base_url = base_url.rstrip("/")
    if not api_key:
        return {"success": False, "text": "", "urgency_level": None, "error": "OPENAI_API_KEY not set"}

    survey_text = _format_answers_for_prompt(answers)
    parts_text = []
    pc = (primary_concern or "").strip()
    if pc:
        parts_text.append("ОСНОВНАЯ ПРОБЛЕМА (приоритет для ответа):\n" + pc)
    parts_text.append("Данные опросника:\n" + survey_text)
    et = (extra_text or "").strip()
    if et:
        parts_text.append("\nДополнительная информация от владельца:\n" + et)
    if photos_base64:
        parts_text.append(f"\nПриложено фотографий: {len(photos_base64[:4])}. Проанализируй изображения и отрази выводы в справке.")
    user_text = "\n".join(parts_text)

    url = f"{base_url}/chat/completions"
    model = getattr(Config, "OPENAI_API_MODEL", "openai/gpt-4o-mini") or "openai/gpt-4o-mini"
    # gpt-4o-mini и gpt-4o поддерживают vision
    timeout_sec = 180 if photos_base64 else 90

    if photos_base64:
        content = [{"type": "text", "text": user_text}]
        for raw in photos_base64[:4]:
            data_url = _normalize_image_data_url(raw)
            if not data_url:
                continue
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url, "detail": "low"},
                }
            )
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            "max_tokens": 4500,
            "temperature": 0.25,
        }
    else:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text},
            ],
            "max_tokens": 4500,
            "temperature": 0.28,
        }

    try:
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout_sec,
        )
        r.raise_for_status()
        data = r.json()
        raw = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        raw = raw.strip()
        visible, urgency = _strip_urgency_line(raw)
        if urgency is None:
            # fallback: попытка найти строку внутри текста
            m2 = re.search(
                r"VETGUARDIAN_URGENCY:\s*(green|yellow|red)",
                raw,
                re.IGNORECASE,
            )
            if m2:
                urgency = m2.group(1).lower()
                visible = URGENCY_LINE.sub("", raw, count=1).strip()
        return {"success": True, "text": visible.strip(), "urgency_level": urgency, "error": None}
    except requests.exceptions.Timeout:
        return {"success": False, "text": "", "urgency_level": None, "error": "timeout"}
    except requests.exceptions.RequestException as e:
        err_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.json()
                err_msg = err_body.get("error", {}).get("message", err_msg) or err_msg
            except Exception:
                pass
        return {"success": False, "text": "", "urgency_level": None, "error": _user_friendly_error(err_msg)}
    except Exception as e:
        return {"success": False, "text": "", "urgency_level": None, "error": str(e)}
