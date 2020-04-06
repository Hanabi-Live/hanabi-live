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
if debug:
    query = ('SELECT id, speedrun FROM games WHERE id = 2906 ORDER BY id')
else:
    query = ('SELECT id, speedrun FROM games ORDER BY id')
cursor.execute(query)

game_ids = []
speedrun_dict = {}
for (game_id, speedrun) in cursor:
    game_ids.append(game_id)
    speedrun_dict[game_id] = speedrun

cursor.close()
print('LOADED ' + str(len(game_ids)) + ' GAME IDS!', flush=True)

# For each game, check to see if all of the game participants have a seat of 0
user_id_to_username = {}
username_to_user_id = {}
repair_queries = []
delete_queries = []
num_inspected = 0
for game_id in game_ids:
    num_inspected += 1
    if num_inspected % 2000 == 0:
        print("SEARCHING THROUGH GAMES, ON GAME ID: " + str(game_id), flush=True)

    cursor = cnx.cursor()
    query = ('SELECT user_id, seat FROM game_participants WHERE game_id = %s')
    cursor.execute(query, (game_id,))

    allSeatsAreZero = True
    user_ids = []
    for (user_id, seat) in cursor:
        user_ids.append(user_id)
        if seat != 0:
            allSeatsAreZero = False
    cursor.close()

    if not allSeatsAreZero:
        continue

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

    # Start a dict for the seat assignments, which will be filled in as we figure them out
    seats = {}
    for user_id in user_ids:
        seats[user_id] = None

    # Derive the player seats from "play", "discard", and "clue" actions
    looking_for = ''
    num_actions = 0
    identifiedEveryPlayer = False
    for action in game_actions:
        if action['type'] == 'play':
            looking_for = 'play'
            play_index = action['which']['index']
            num_actions += 1
        elif action['type'] == 'discard':
            looking_for = 'discard'
            discard_index = action['which']['index']
            num_actions += 1
        elif action['type'] == 'clue':
            looking_for = 'clue'
            giver = action['giver']
            target = action['target']
            num_actions += 1
        elif action['type'] == 'text':
            if looking_for == 'play':
                if ' plays ' not in action['text']:
                    print('ERROR: "plays" NOT IN TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)

                # Parse the text message
                # (note that there are no users in the database that have a name containing the string of "plays")
                match = re.search(r'^(.+?) plays (.+?) ', action['text'])
                if not match:
                    print('ERROR: FAILED TO PARSE PLAY TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
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
                if seats[player_user_id] == None:
                    seats[player_user_id] = play_index
                elif seats[player_user_id] != play_index:
                    print('ERROR: CONFLICT FOUND FOR "' + player_username + '" IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    print(seats[player_user_id], 'DOES NOT MATCH', play_index)
                    sys.exit(1)

                looking_for = ''

            elif looking_for == 'discard':
                if ' discards ' not in action['text'] and ' fails to play ' not in action['text'] and ' plays a card ' not in action['text']:
                    print('ERROR: "discards" AND "fails to play" NOT IN TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)

                # Parse the text message
                # (note that there are no users in the database that have a name containing the string of "discards")
                match = re.search(r'^(.+?) discards ', action['text'])
                if not match:
                    match = re.search(r'^(.+?) fails to play ', action['text'])
                    if not match:
                        match = re.search(r'^(.+?) plays a card ', action['text'])
                        if not match:
                            print('ERROR: FAILED TO PARSE DISCARD TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                            sys.exit(1)

                discarder_username = match.group(1)
                if discarder_username not in username_to_user_id:
                    found = False
                    for username in username_to_user_id:
                        if username.lower() == discarder_username.lower():
                            found = True
                            discarder_username = username
                            break
                    if not found:
                        print('ERROR: DISCARDER USERNAME OF "' + discarder_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                        print(user_ids)
                        sys.exit(1)
                discarder_user_id = username_to_user_id[discarder_username]
                if discarder_user_id not in seats:
                    print('ERROR: USER ID ' + str(discarder_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                if seats[discarder_user_id] == None:
                    seats[discarder_user_id] = discard_index
                elif seats[discarder_user_id] != discard_index:
                    print('ERROR: CONFLICT FOUND FOR "' + discarder_username + '" IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)

                looking_for = ''

            elif looking_for == 'clue':
                if ' tells ' not in action['text'] and ' quacks at ' not in action['text'] and ' moos at ' not in action['text'] and ' oinks at ' not in action['text']:
                    print('ERROR: "tells" NOT IN TEXT MESSAGE FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)

                # Parse the text message
                # (note that there are no users in the database that have a name containing the string of "tells")
                # (we need to parse differently for empty clues)
                match = re.search(r'^(.+?) tells (.+?) about ', action['text'])
                if not match:
                    match = re.search(r'^(.+?) quacks at (.+?)\'s* slot ', action['text'])
                    if not match:
                        match = re.search(r'^(.+?) moos at (.+?)\'s* slot ', action['text'])
                        if not match:
                            match = re.search(r'^(.+?) oinks at (.+?)\'s* slot ', action['text'])
                            if not match:
                                print('ERROR: FAILED TO PARSE CLUE TEXT FOR GAME ID ' + str(game_id) + ': ' + action['text'])
                                sys.exit(1)

                giver_username = match.group(1)
                if giver_username not in username_to_user_id:
                    found = False
                    for username in username_to_user_id:
                        if username.lower() == giver_username.lower():
                            found = True
                            giver_username = username
                            break
                    if not found:
                        print('ERROR: GIVER USERNAME OF "' + giver_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                        print(user_ids)
                        sys.exit(1)
                giver_user_id = username_to_user_id[giver_username]
                if giver_user_id not in seats:
                    print('ERROR: USER ID ' + str(giver_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                if seats[giver_user_id] == None:
                    seats[giver_user_id] = giver
                elif seats[giver_user_id] != giver:
                    print('ERROR: CONFLICT FOUND FOR "' + giver_username + '" IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    print(seats[giver_user_id], 'DOES NOT MATCH', giver)
                    sys.exit(1)

                target_username = match.group(2)
                if target_username not in username_to_user_id:
                    found = False
                    for username in username_to_user_id:
                        if username.lower() == target_username.lower():
                            found = True
                            target_username = username
                            break
                    if not found:
                        print('ERROR: TARGET USERNAME OF "' + target_username + '" NOT IN THE USERNAME DICT FOR GAME ID ' + str(game_id))
                        print(user_ids)
                        sys.exit(1)
                target_user_id = username_to_user_id[target_username]
                if target_user_id not in seats:
                    print('ERROR: USER ID ' + str(target_user_id) + ' WAS NEVER ADDED TO SEATS IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    sys.exit(1)
                if seats[target_user_id] == None:
                    seats[target_user_id] = target
                elif seats[target_user_id] != target:
                    print('ERROR: CONFLICT FOUND FOR "' + giver_username + '" IN GAME ID ' + str(game_id) + ': ' + action['text'])
                    print(seats[target_user_id], 'DOES NOT MATCH', target)
                    sys.exit(1)

                looking_for = ''

    # Check if we identified every player
    unidentifiedPlayers = []
    for user_id, seat in seats.items():
        if seat == None:
            unidentifiedPlayers.append(user_id)

    # If we are missing 1 player, we can infer their seat position
    if len(unidentifiedPlayers) == 1:
        unidentifiedPlayerID = unidentifiedPlayers[0]
        for i in range(0, len(user_ids)):
            if i not in seats.values():
                seats[unidentifiedPlayerID] = i
                unidentifiedPlayers = []
                break

    if len(unidentifiedPlayers) == 0:
        for user_id, seat in seats.items():
            if seat == None:
                print('ERROR: FAILED TO GET THE SEAT FOR USER ' + str(user_id) + ' OF GAME ' + str(game_id))
                sys.exit(1)
            repair_queries.append((game_id, user_id, seat))

    else:
        if num_actions <= 4 or speedrun_dict[game_id] == 1 or 'test' in usernames or 'test2' in usernames:
            delete_queries.append(game_id)
        else:
            print('ERROR: UNABLE TO IDENTIFY THE SEAT FOR PLAYER "' + user_id_to_username[user_id] + '" FOR GAME ID ' + str(game_id))
            print('num_actions:', num_actions)
            sys.exit(1)

num_updated = 0
for repair_query in repair_queries:
    cursor = cnx.cursor()
    query = ('UPDATE game_participants SET seat = %s WHERE game_id = %s AND user_id = %s')
    cursor.execute(query, (repair_query[2], repair_query[0], repair_query[1]))
    cursor.close()

    num_updated += 1
    if num_updated % 1000 == 0:
        print("UPDATED RECORDS SO FAR:", num_updated, flush=True)

num_deleted = 0
for game_id in delete_queries:
    cursor = cnx.cursor()
    query = ('DELETE FROM games WHERE id = %s')
    cursor.execute(query, (game_id,))
    cursor.close()

    num_deleted += 1
    if num_deleted % 1000 == 0:
        print("DELETED RECORDS SO FAR:", num_deleted, flush=True)

cnx.commit()
cnx.close()
print('TOTAL UPDATED:', num_updated, flush=True)
print('TOTAL DELETED:', num_deleted, flush=True)
