#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from pywebpush import WebPushException, webpush

from config import Config


def get_db_path() -> Path:
    if Config.DATABASE_PATH:
        return Path(Config.DATABASE_PATH)
    return Path(__file__).resolve().parent.parent / "vetguardian.db"


def fetch_due_rows(conn: sqlite3.Connection):
    today = date.today()
    rows = conn.execute(
        """
        SELECT
            ce.id AS event_id,
            ce.event_date,
            ce.event_type,
            ce.note,
            p.name AS pet_name,
            us.notify_offset_days,
            ps.id AS subscription_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth
        FROM calendar_events ce
        JOIN pets p ON p.id = ce.pet_id
        JOIN user_notification_settings us ON us.user_id = ce.user_id
        JOIN push_subscriptions ps ON ps.user_id = ce.user_id
        WHERE us.enabled = 1
          AND ps.is_active = 1
        """
    ).fetchall()
    due = []
    for r in rows:
        try:
            event_dt = datetime.strptime(r["event_date"], "%Y-%m-%d").date()
        except Exception:
            continue
        offset_days = int(r["notify_offset_days"] or 7)
        target_day = event_dt - timedelta(days=offset_days)
        if target_day != today:
            continue
        due.append(r)
    return due


def was_sent(conn: sqlite3.Connection, event_id: int, subscription_id: int, scheduled_for: str) -> bool:
    row = conn.execute(
        """
        SELECT id FROM notification_log
        WHERE event_id = ? AND subscription_id = ? AND scheduled_for = ?
        """,
        (event_id, subscription_id, scheduled_for),
    ).fetchone()
    return bool(row)


def mark_sent(conn: sqlite3.Connection, event_id: int, subscription_id: int, scheduled_for: str, status: str, error: str = ""):
    conn.execute(
        """
        INSERT INTO notification_log (event_id, subscription_id, scheduled_for, status, error, sent_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(event_id, subscription_id, scheduled_for) DO NOTHING
        """,
        (event_id, subscription_id, scheduled_for, status, error[:1000]),
    )


def send_push(row):
    event_type_label = "вакцинация" if row["event_type"] == "vaccination" else "сезонная обработка"
    payload = {
        "title": "VetGuardian",
        "body": f"Скоро нужно позаботиться о питомце! На {row['event_date']} запланирована {event_type_label} для {row['pet_name']}.",
        "url": "/",
    }
    subscription_info = {
        "endpoint": row["endpoint"],
        "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
    }
    webpush(
        subscription_info=subscription_info,
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=Config.VAPID_PRIVATE_KEY,
        vapid_claims={"sub": Config.VAPID_CLAIMS_SUBJECT},
    )


def main():
    parser = argparse.ArgumentParser(description="Отправка push-уведомлений календаря VetGuardian")
    parser.add_argument("--dry-run", action="store_true", help="Только показать, что было бы отправлено")
    parser.add_argument(
        "--test-send-now",
        action="store_true",
        help="Тестовый режим: отправить сразу события с notify_offset_days=1, если дата события завтра.",
    )
    args = parser.parse_args()

    if not Config.VAPID_PRIVATE_KEY or not Config.VAPID_PUBLIC_KEY:
        raise SystemExit("Не заданы VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY в окружении.")

    db_path = get_db_path()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        due_rows = fetch_due_rows(conn)
        rows_to_process = list(due_rows)
        if args.test_send_now:
            tomorrow = date.today() + timedelta(days=1)
            test_rows = conn.execute(
                """
                SELECT
                    ce.id AS event_id,
                    ce.event_date,
                    ce.event_type,
                    ce.note,
                    p.name AS pet_name,
                    us.notify_offset_days,
                    ps.id AS subscription_id,
                    ps.endpoint,
                    ps.p256dh,
                    ps.auth
                FROM calendar_events ce
                JOIN pets p ON p.id = ce.pet_id
                JOIN user_notification_settings us ON us.user_id = ce.user_id
                JOIN push_subscriptions ps ON ps.user_id = ce.user_id
                WHERE us.enabled = 1
                  AND us.notify_offset_days = 1
                  AND ps.is_active = 1
                  AND ce.event_date = ?
                """,
                (tomorrow.strftime("%Y-%m-%d"),),
            ).fetchall()
            rows_to_process.extend(test_rows)

        seen = set()
        for row in rows_to_process:
            dedupe_key = (row["event_id"], row["subscription_id"], row["event_date"])
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            scheduled_for = str(date.today())
            if was_sent(conn, row["event_id"], row["subscription_id"], scheduled_for):
                continue
            if args.dry_run:
                print("DRY-RUN:", row["event_id"], row["endpoint"], scheduled_for)
                mark_sent(conn, row["event_id"], row["subscription_id"], scheduled_for, "dry-run", "")
                continue
            try:
                send_push(row)
                mark_sent(conn, row["event_id"], row["subscription_id"], scheduled_for, "sent", "")
            except WebPushException as e:
                mark_sent(conn, row["event_id"], row["subscription_id"], scheduled_for, "error", str(e))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
