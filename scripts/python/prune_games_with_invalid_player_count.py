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
password = os.getenv("DB_PASS")
host = os.getenv("DB_HOST")
if host == "":
    host = "localhost"
port = os.getenv("DB_PORT")
if port == "":
    port = "5432"
database = os.getenv("DB_NAME")

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host, port=port, user=user, password=password, database=database,
)

# Get all the games
cursor = conn.cursor()
cursor.execute("SELECT id, num_players FROM games ORDER BY id")
rows = cursor.fetchall()
games = []
for row in rows:
    games.append(row)
cursor.close()
print("Loaded " + str(len(games)) + " games.", flush=True)

# Get the count of game participants for each game ID
i = 0
numInvalidGames = 0
for game in games:
    i += 1
    if i % 1000 == 0:
        print("On user #" + str(i), flush=True)

    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(id) FROM game_participants WHERE game_id = %s", (game[0],)
    )
    row = cursor.fetchone()
    cursor.close()
    num_game_participants = row[0]
    if num_game_participants != game[1]:
        print("Invalid player count found on game: ", game[0])
        numInvalidGames += 1

        cursor = conn.cursor()
        cursor.execute("DELETE FROM games WHERE id = %s", (game[0],))
        cursor.close()

conn.commit()
conn.close()

print("Total invalid rows:", numInvalidGames)
