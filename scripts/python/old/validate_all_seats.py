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
    query = ('SELECT id FROM games WHERE id = 103419 ORDER BY id')
else:
    query = ('SELECT id FROM games ORDER BY id')
cursor.execute(query)

game_ids = []
for (game_id,) in cursor:
    game_ids.append(game_id)

cursor.close()
print('LOADED ' + str(len(game_ids)) + ' GAME IDS!', flush=True)

# For each game, check to see if the person in seat index 0 matches the "first turn" text message
user_id_to_username = {}
username_to_user_id = {}
repair_queries_for_game_participants = []
repair_queries_for_game_actions = []
num_inspected = 0
for game_id in game_ids:
    num_inspected += 1
    if num_inspected % 2000 == 0:
        print("SEARCHING THROUGH GAMES, ON GAME ID: " + str(game_id), flush=True)

    cursor = cnx.cursor()
    query = ('SELECT user_id, seat FROM game_participants WHERE game_id = %s ORDER BY seat')
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

    cursor = cnx.cursor()
    query = ('SELECT action FROM game_actions WHERE game_id = %s ORDER BY id')
    cursor.execute(query, (game_id,))

    # Get the actions for this game
    game_actions = []
    for (action,) in cursor:
        action_dict = json.loads(action)
        game_actions.append(action_dict)
    cursor.close()

    # Derive the first player from the first "text" message
    for action in game_actions:
        if action['type'] == 'text':
            # I verified and there are no users that contain "goes first" in the username
            match = re.search(r'^(.+) goes first$', action['text'])
            if not match: 
                print('ERROR: FAILED TO PARSE THE "goes first" TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                sys.exit(1)

            first_turn_username = match.group(1)
            if first_turn_username not in username_to_user_id:
                found = False
                for username in username_to_user_id:
                    if username.lower() == first_turn_username.lower():
                        found = True
                        first_turn_username = username
                        break
                if not found:
                    print('ERROR: PLAYER USERNAME OF "' + first_turn_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                    sys.exit(1)

            first_turn_user_id = username_to_user_id[first_turn_username]
            if first_turn_user_id not in seats:
                print('ERROR: USER ID ' + str(first_turn_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                sys.exit(1)

            break

    orig_seat = seats[first_turn_user_id]
    if orig_seat == 0:
        # This game has a correct mapping of the person who goes first to the 0th seat
        continue

    # The person who goes first is not at seat 0, so fix this
    seat_shift = orig_seat
    seat_transition_map = {}
    for user_id, seat in seats.items():
        old_seat = seats[user_id]
        new_seat = seats[user_id] - seat_shift
        if new_seat < 0:
            new_seat += len(seats)
        repair_queries_for_game_participants.append((game_id, user_id, new_seat))
        repair_queries_for_game_actions.append((game_id, old_seat, new_seat))

num_updated = 0
for repair_query in repair_queries_for_game_participants:
    cursor = cnx.cursor()
    query = ('UPDATE game_participants SET seat = %s WHERE game_id = %s AND user_id = %s')
    cursor.execute(query, (repair_query[2], repair_query[0], repair_query[1]))
    cursor.close()

    num_updated += 1
    if num_updated % 1000 == 0:
        print("UPDATED RECORDS SO FAR:", num_updated, flush=True)

num_updated = 0
for repair_query in repair_queries_for_game_actions:
    cursor = cnx.cursor()
    query = ('UPDATE game_actions2 SET target = %s WHERE game_id = %s AND target = %s AND (type = 2 OR type = 3)')
    cursor.execute(query, (repair_query[2], repair_query[0], repair_query[1]))
    cursor.close()

    num_updated += 1
    if num_updated % 1000 == 0:
        print("UPDATED RECORDS SO FAR:", num_updated, flush=True)

cnx.commit()
cnx.close()
print('TOTAL UPDATED:', num_updated, flush=True)
