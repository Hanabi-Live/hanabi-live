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
query = ('SELECT id FROM games WHERE id < 1000 ORDER BY id') # There are only 2 games that have this class of error
cursor.execute(query)

game_ids = []
for (game_id,) in cursor:
    game_ids.append(game_id)

cursor.close()
print('LOADED ' + str(len(game_ids)) + ' GAME IDS!', flush=True)

# For each game, check to see if all of the game participants have a seat of 0
num_games_examined = 0
repair_queries = []
for game_id in game_ids:
    cursor = cnx.cursor()
    query = ('SELECT action FROM game_actions WHERE game_id = %s ORDER BY id')
    cursor.execute(query, (game_id,))

    last_turn = -1
    last_action_is_players_lose = False
    for (action,) in cursor:
        action_dict = json.loads(action)
        if action_dict['type'] == 'turn':
            last_turn = action_dict['num']
        if action_dict['type'] == 'text' and action_dict['text'] == 'Players lose':
            last_action_is_players_lose = True
        else:
            last_action_is_players_lose = False
    cursor.close()
    if last_action_is_players_lose:
        repair_queries.append((game_id, last_turn + 1))
    
    num_games_examined += 1
    if num_games_examined % 1000 == 0:
        print('on track to update: ' + str(len(repair_queries)) + ' / ' + str(num_games_examined), flush=True)

num_updated = 0
for repair_query in repair_queries:
    cursor = cnx.cursor()
    query = ('INSERT INTO game_actions (game_id, action) VALUES (%s, %s)')
    turn_action = '{"type":"turn","num":' + str(repair_query[1]) + ',"who":-1}'
    cursor.execute(query, (repair_query[0], turn_action))
    cursor.close()

    num_updated += 1
    if num_updated % 1000 == 0:
        print("UPDATED RECORDS:", num_updated, flush=True)

cnx.commit()
cnx.close()
