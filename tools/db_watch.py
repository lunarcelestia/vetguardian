#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import sqlite3
import time
from pathlib import Path


def read_stats(db_path: Path):
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        pets = conn.execute("SELECT COUNT(*) AS c FROM pets").fetchone()["c"]
        cases = conn.execute("SELECT COUNT(*) AS c FROM cases").fetchone()["c"]
        last_users = conn.execute(
            "SELECT id, email, created_at FROM users ORDER BY id DESC LIMIT 5"
        ).fetchall()
    return users, pets, cases, last_users


def print_once(db_path: Path):
    users, pets, cases, last_users = read_stats(db_path)
    print(f"DB: {db_path}")
    print(f"users={users} pets={pets} cases={cases}")
    print("Последние пользователи:")
    for row in last_users:
        print(f"  #{row['id']} {row['email']} ({row['created_at']})")


def main():
    parser = argparse.ArgumentParser(description="Монитор наполнения БД VetGuardian")
    parser.add_argument("--db", default="vetguardian.db", help="Путь к sqlite-файлу")
    parser.add_argument(
        "--watch",
        type=int,
        default=0,
        help="Интервал обновления в секундах (0 = один вывод)",
    )
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if not db_path.exists():
        raise SystemExit(f"БД не найдена: {db_path}")

    if args.watch <= 0:
        print_once(db_path)
        return

    while True:
        print("\n" + "=" * 60)
        print(time.strftime("%Y-%m-%d %H:%M:%S"))
        print_once(db_path)
        time.sleep(args.watch)


if __name__ == "__main__":
    main()
