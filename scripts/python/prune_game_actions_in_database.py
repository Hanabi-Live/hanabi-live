#!/usr/bin/env python3
# (the "dotenv" module does not work in Python 2)

import sys
if sys.version_info < (3, 0):
    print('This script requires Python 3.x.')
    sys.exit(1)

# Imports
import json
import os
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

# Get all database records
cursor = cnx.cursor()
query_string = 'SELECT id, action FROM game_actions ORDER BY id ASC'
if debug:
    query_string += ' LIMIT 1000'
query = (query_string)
cursor.execute(query)

update_list = []
delete_list = []
num_records = 0
for (id, action) in cursor:
    num_records += 1
    action_dict = json.loads(action)

    modified = False

    # Ensure that each action has a type
    if 'type' not in action_dict:
        print('ERROR: ACTION ' + str(id) + ' DOES NOT HAVE A TYPE')
        continue

    # Ensure that blank action types are converted to text
    if action_dict['type'] == '':
        print('ERROR: ACTION ' + str(id) + ' HAS A BLANK TYPE')
        continue

    # Remove fields that are extraneous
    delete_entire_entry = False
    keys_to_delete = []

    # These actions map to what is in the "action.go" file
    if action_dict['type'] == 'draw':
        for key in action_dict:
            if (key != 'type' and
                key != 'who' and
                key != 'rank' and
                key != 'suit' and
                key != 'order'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'status':
        for key in action_dict:
            if (key != 'type' and
                key != 'clues' and
                key != 'score' and
                key != 'maxScore' and
                key != 'doubleDiscard'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'stackDirections':
        for key in action_dict:
            if (key != 'type' and
                key != 'directions'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'text':
        for key in action_dict:
            if (key != 'type' and
                key != 'text'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'turn':
        for key in action_dict:
            if (key != 'type' and
                key != 'num' and
                key != 'who'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'clue':
        for key in action_dict:
            if (key != 'type' and
                key != 'clue' and
                key != 'giver' and
                key != 'list' and
                key != 'target' and
                key != 'turn'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'play':
        for key in action_dict:
            if (key != 'type' and
                key != 'which'):

                keys_to_delete.append(key)

        if 'which' in action_dict:
            for key in action_dict['which']:
                if (key != 'index' and
                    key != 'suit' and
                    key != 'rank' and
                    key != 'order'):

                    modified = True
                    action_dict['which'].pop(key, None)

    elif action_dict['type'] == 'discard':
        for key in action_dict:
            if (key != 'type' and
                key != 'failed' and
                key != 'which'):

                keys_to_delete.append(key)

        if 'which' in action_dict:
            for key in action_dict['which']:
                if (key != 'index' and
                    key != 'suit' and
                    key != 'rank' and
                    key != 'order'):

                    modified = True
                    action_dict['which'].pop(key, None)

    elif action_dict['type'] == 'reorder':
        for key in action_dict:
            if (key != 'type' and
                key != 'target' and
                key != 'handOrder'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'strike':
        for key in action_dict:
            if (key != 'type' and
                key != 'num' and
                key != 'turn' and
                key != 'order'):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'deckOrder':
        for key in action_dict:
            if (key != 'type' and
                key != 'deck'):

                keys_to_delete.append(key)

    else:
        print('ERROR: ACTION ' + str(id) + ' HAS AN UNKNOWN TYPE: ' + action_dict)

    # Push the update query to the list of things to update
    if delete_entire_entry:
        delete_list.append(id)
    elif modified or len(keys_to_delete) > 0:
        for key in keys_to_delete:
            print('DELETING KEY "' + key + '" FROM ID: ' + str(id))
            action_dict.pop(key, None)
        new_action = json.dumps(action_dict, separators=(',',':')) # We provide the separators to minify the output
        update_list.append((id, new_action))

cursor.close()
print('LOADED ' + str(num_records) + ' RECORDS!')

for thing in update_list:
    cursor = cnx.cursor()
    query = ('UPDATE game_actions SET action = %s WHERE id = %s')
    cursor.execute(query, (thing[1], thing[0]))
    cursor.close()
    print('UPDATED ID:', thing[0], thing[1])

for thing in delete_list:
    cursor = cnx.cursor()
    query = ('DELETE FROM game_actions WHERE id = %s')
    cursor.execute(query, (thing,))
    cursor.close()
    print('DELETED ID:', thing)

cnx.commit()
cnx.close()
