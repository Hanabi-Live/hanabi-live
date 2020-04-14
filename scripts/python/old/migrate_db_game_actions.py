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
debug_id = 100005

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv('DB_USER')
password = os.getenv('DB_PASS')
host = os.getenv('DB_HOST')
if host == '':
    host = 'localhost'
database = os.getenv('DB_NAME')

# More variables and subroutines
turn_dict = {}
def get_and_append_turn(game_id):
    if game_id not in turn_dict:
        turn_dict[game_id] = 0
        return 0

    turn = turn_dict[game_id]
    turn += 1
    turn_dict[game_id] = turn
    return turn

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

user_id_to_username = {}
username_to_user_id = {}
repair_queries = []
num_inspected = 0
for game_id in game_ids:
    num_inspected += 1
    if num_inspected % 2000 == 0:
        print("SEARCHING THROUGH GAMES, ON GAME ID: " + str(game_id), flush=True)

    cursor = cnx.cursor()
    query = ('SELECT user_id, seat FROM game_participants WHERE game_id = %s')
    cursor.execute(query, (game_id,))

    user_ids = []
    seats = {}
    for (user_id, seat) in cursor:
        user_ids.append(user_id)
        seats[user_id] = seat
    cursor.close()

    # Get the username for each game participant, if we don't have it already
    usernames = []
    for user_id in user_ids:
        if user_id in user_id_to_username:
            usernames.append(user_id_to_username[user_id])
            continue
        cursor = cnx.cursor()
        query = ('SELECT username FROM users WHERE id = %s')
        cursor.execute(query, (user_id,))
        found_username = False
        for (username,) in cursor:
            found_username = True
            user_id_to_username[user_id] = username
            username_to_user_id[username] = user_id
            usernames.append(username)
        cursor.close()
        if not found_username:
            print('ERROR: FAILED TO FIND USERNAME FOR USER ID ' + str(user_id) + ' OF GAME ID ' + str(game_id))
            sys.exit(1)

    # Get the actions for this game
    cursor = cnx.cursor()
    query = ('SELECT action FROM game_actions WHERE game_id = %s ORDER BY id')
    cursor.execute(query, (game_id,))

    game_actions = []
    for (action,) in cursor:
        action_dict = json.loads(action)
        game_actions.append(action_dict)
    cursor.close()

    for action in game_actions:
        if action['type'] == 'play':
            turn = get_and_append_turn(game_id)
            action_type = 0
            target = action['which']['order']

            repair_queries.append((game_id, turn, action_type, target, 0))

        elif action['type'] == 'discard':
            turn = get_and_append_turn(game_id)
            if 'failed' in action and action['failed'] == True:
                action_type = 0
            else:
                action_type = 1
            target = action['which']['order']

            repair_queries.append((game_id, turn, action_type, target, 0))

        elif action['type'] == 'clue':
            turn = get_and_append_turn(game_id)
            if action['clue']['type'] == 0: # Rank
                action_type = 3
            elif action['clue']['type'] == 1: # Color
                action_type = 2
            else:
                print('ERROR: ACTION ' + str(id) + ' HAS AN INVALID CLUE TYPE', flush=True)
                sys.exit(1)
            target = action['target']
            value = action['clue']['value']

            repair_queries.append((game_id, turn, action_type, target, value))

        elif action['type'] == 'text':
            if 'ran out of time' in action['text']:
                match = re.search(r'^(.+) ran out of time!', action['text'])
                if not match:
                    print('ERROR: FAILED TO PARSE "ran out of time" TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                player_username = match.group(1)
                if player_username not in username_to_user_id:
                    found = False
                    for username in username_to_user_id:
                        if username.lower() == player_username.lower():
                            found = True
                            player_username = username
                            break
                    if not found:
                        print('ERROR: PLAYER USERNAME OF "' + player_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                        sys.exit(1)
                player_user_id = username_to_user_id[player_username]
                if player_user_id not in seats:
                    print('ERROR: USER ID ' + str(player_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                seat = seats[player_user_id]

                turn = get_and_append_turn(game_id)
                action_type = 4
                target = seat
                value = 3 # See constants.go

                repair_queries.append((game_id, turn, action_type, target, value))

            elif 'terminated the game' in action['text']:
                match = re.search(r'^(.+) terminated the game!', action['text'])
                if not match:
                    print('ERROR: FAILED TO PARSE "terminated the game" TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                player_username = match.group(1)
                if player_username not in username_to_user_id:
                    found = False
                    for username in username_to_user_id:
                        if username.lower() == player_username.lower():
                            found = True
                            player_username = username
                            break
                    if not found:
                        print('ERROR: PLAYER USERNAME OF "' + player_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                        sys.exit(1)
                player_user_id = username_to_user_id[player_username]
                if player_user_id not in seats:
                    print('ERROR: USER ID ' + str(player_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                seat = seats[player_user_id]

                turn = get_and_append_turn(game_id)
                action_type = 4
                target = seat
                value = 4 # See constants.go

                repair_queries.append((game_id, turn, action_type, target, value))

            elif 'Players were idle for too long' in action['text']:
                turn = get_and_append_turn(game_id)
                action_type = 4
                target = 0
                value = 6 # See constants.go

                repair_queries.append((game_id, turn, action_type, target, value))

num_updated = 0
for repair_query in repair_queries:
    cursor = cnx.cursor()
    query = ('INSERT INTO game_actions2 (game_id, turn, type, target, value) VALUES (%s, %s, %s, %s, %s)')
    cursor.execute(query, (repair_query[0], repair_query[1], repair_query[2], repair_query[3], repair_query[4]))
    cursor.close()

    num_updated += 1
    if num_updated % 50000 == 0:
        print("UPDATED RECORDS SO FAR:", num_updated, flush=True)

cnx.commit()
cnx.close()

print('TOTAL RECORDS UPDATED:', num_updated, flush=True)
