#!/usr/bin/env python3

# The "dotenv" module does not work in Python 2
import sys

if sys.version_info < (3, 0):
    print("This script requires Python 3.x.")
    sys.exit(1)

# Imports
import os
import dotenv
import psycopg2

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")
host = os.getenv("DB_HOST")
if host == "":
    host = "localhost"
port = os.getenv("DB_PORT")
if port == "":
    port = "5432"
database = os.getenv("DB_NAME")

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host,
    port=port,
    user=user,
    password=password,
    database=database,
)

# Get all users
cursor = conn.cursor()

# Bricks the server
sql = """
    SELECT
        users.id,
        users.username,
        (
            SELECT COUNT(games.id)
            FROM games
            JOIN game_participants ON games.id = game_participants.game_id
            WHERE game_participants.user_id = users.id
            AND games.speedrun = FALSE
            AND games.num_players >=3
        ) AS num_total_games
    FROM users
    ORDER BY num_total_games DESC
    LIMIT 50
"""
sql = """
    SELECT
        users.id,
        users.username,
        user_stats.num_games
    FROM USERS
    JOIN user_stats
        ON users.id = user_stats.user_id
    WHERE user_stats.variant_id = 0
    ORDER BY user_stats.num_games DESC
    LIMIT 50
"""

cursor.execute()

rows = cursor.fetchall()
users = []
for row in rows:
    users.append(row)
cursor.close()

for user in users:
    print(user[0], user[1], user[2])

conn.close()
