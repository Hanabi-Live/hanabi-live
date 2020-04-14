#!/usr/bin/env python3
# (the "dotenv" module does not work in Python 2)

import sys
if sys.version_info < (3, 0):
    print('This script requires Python 3.x.')
    sys.exit(1)

# Imports
import json
import os
import re
import dotenv
import mysql.connector

# Configuration
debug = False
#debug = True
debug_id = 117354

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv('DB_USER')
password = os.getenv('DB_PASS')
host = os.getenv('DB_HOST')
if host == '':
    host = 'localhost'
database = os.getenv('DB_NAME')

# Connect to the MySQL database
cnx = mysql.connector.connect(
    user=user,
    password=password,
    host=host,
    database=database
)

# Get a list of every game ID
cursor = cnx.cursor()
if debug:
    query = ('SELECT id FROM games WHERE id = ' + str(debug_id) + ' ORDER BY id')
else:
    query = ('SELECT id FROM games ORDER BY id')
cursor.execute(query)

game_ids = []
for (game_id,) in cursor:
    game_ids.append(game_id)

cursor.close()
print('LOADED ' + str(len(game_ids)) + ' GAME IDS!', flush=True)

num_inspected = 0
for game_id in game_ids:
    num_inspected += 1
    if num_inspected % 2000 == 0:
        print("SEARCHING THROUGH GAMES, ON GAME ID: " + str(game_id), flush=True)

    cursor = cnx.cursor()
    query = ('SELECT type, target FROM game_actions WHERE game_id = %s ORDER BY turn')
    cursor.execute(query, (game_id,))

    game_actions = []
    for (actionType, target) in cursor:
        game_actions.append((actionType, target))
    cursor.close()

    num_games_fixed = 0
    lastType = -1
    lastTarget = -1
    fixing = False
    turn = -1
    for action in game_actions:
        turn += 1
        if fixing:
            cursor = cnx.cursor()
            query = ('UPDATE game_actions SET turn = %s WHERE game_id = %s AND turn = %s')
            cursor.execute(query, (turn - 1, game_id, turn))
            cursor.close()
            continue

        # If this is a discard and the last action was a play and its on the same card
        if action[0] == 1 and lastType == 0 and action[1] == lastTarget:
            fixing = True
            num_games_fixed += 1
            cursor = cnx.cursor()
            query = ('DELETE FROM game_actions WHERE game_id = %s AND turn = %s')
            cursor.execute(query, (game_id, turn))
            cursor.close()

        lastType = action[0]
        lastTarget = action[1]

cnx.commit()
cnx.close()

print('TOTAL GAMES FIXED:', num_games_fixed, flush=True)
