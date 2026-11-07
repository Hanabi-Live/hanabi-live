"""Connects to the database in the repository's ".env" file, with the server's defaults."""

import os
from pathlib import Path

import dotenv
import psycopg2


def connect():
    dotenv.load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    return psycopg2.connect(
        host=os.getenv("DB_HOST") or "localhost",
        port=os.getenv("DB_PORT") or "5432",
        user=os.getenv("DB_USER") or "hanabiuser",
        password=os.getenv("DB_PASSWORD") or "1234567890",
        database=os.getenv("DB_NAME") or "hanabi",
    )
