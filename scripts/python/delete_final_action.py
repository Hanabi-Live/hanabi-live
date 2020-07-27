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
game_ids_file = "game_ids.txt"

# Read the IDs
with open(game_ids_file) as f:
    game_ids = f.read().split("\n")

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host, port=port, user=user, password=password, database=database,
)

# Delete the final game action for each game
line_num = 0
num_actions_deleted = 0
for line in game_ids:
    line_num += 1
    if line == "":
        continue

    line_array = line.split(",")
    if len(line_array) != 2:
        print("Line " + str(line_num) + " is invalid:", line)
        sys.exit(1)
    game_id = line_array[0]
    num_actions_to_delete = line_array[1]

    cursor = conn.cursor()
    cursor.execute("SELECT MAX(turn) FROM game_actions WHERE game_id = %s", (game_id,))
    row = cursor.fetchone()
    cursor.close()
    max_turn = row[0]

    for i in range(0, int(num_actions_to_delete)):
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM game_actions WHERE game_id = %s AND turn = %s",
            (game_id, max_turn),
        )
        cursor.close()
        num_actions_deleted += 1

        max_turn -= 1

conn.commit()
conn.close()

print("Total pruned games:", len(game_ids))
print("Total actions deleted:", num_actions_deleted)
