#!/usr/bin/env python3

import argparse
import os
import sys

import dotenv
import psycopg2


def parse_args():
    parser = argparse.ArgumentParser(
        description="Print the chat history for a shared replay."
    )
    parser.add_argument("replay_id", type=int, help="shared replay table ID")
    args = parser.parse_args()

    if args.replay_id < 1:
        parser.error("replay_id must be a positive integer")

    return args


def connect_to_database():
    dotenv.load_dotenv(dotenv.find_dotenv())

    return psycopg2.connect(
        host=os.getenv("DB_HOST") or "localhost",
        port=os.getenv("DB_PORT") or "5432",
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


def get_chat_history(conn, replay_id):
    room = f"table{replay_id}"
    sql = """
        SELECT
            chat_log.datetime_sent,
            chat_log.user_id,
            users.username,
            chat_log.discord_name,
            chat_log.message
        FROM chat_log
        LEFT JOIN users ON users.id = chat_log.user_id
        WHERE chat_log.room = %s
        ORDER BY chat_log.datetime_sent, chat_log.id
    """

    with conn.cursor() as cursor:
        cursor.execute(sql, (room,))
        return cursor.fetchall()


def get_sender(user_id, username, discord_name):
    if username is not None:
        return username
    if discord_name is not None:
        return f"{discord_name} (Discord)"
    if user_id == 0:
        return "Server"
    return f"Deleted user #{user_id}"


def main():
    args = parse_args()

    try:
        with connect_to_database() as conn:
            chat_history = get_chat_history(conn, args.replay_id)
    except psycopg2.Error as error:
        print(f"Failed to retrieve chat history: {error}", file=sys.stderr)
        return 1

    for datetime_sent, user_id, username, discord_name, message in chat_history:
        sender = get_sender(user_id, username, discord_name)
        print(f"[{datetime_sent.isoformat()}] {sender}: {message}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
