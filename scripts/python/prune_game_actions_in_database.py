#!/usr/bin/env python

# Imports
import json
import os
import sys
import dotenv
import mysql.connector

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
query = ('SELECT id, action FROM game_actions')
cursor.execute(query)

update_list = []
num_records = 0
for (id, action) in cursor:
    num_records += 1
    action_dict = json.loads(action)

    modified = False

    # Ensure that each action has a type
    if 'type' not in action_dict:
        # By default, assume any action that is missing a type is a text action
        modified = True
        action_dict['type'] = 'text'

    # Ensure that blank action types are converted to text
    if action_dict['type'] == '':
      if 'text' in action_dict and action_dict['text'] != '':
          modified = True
          action_dict['type'] = 'text'
      else:
          print('ERROR: TYPE WAS EMPTY AND TEXT WAS ALSO EMPTY, WEIRD')
          continue

    # Remove fields that are extraneous
    keys_to_delete = []
    if action_dict['type'] == 'draw':
        for key in action_dict:
            if (key != "type" and
                key != "who" and
                key != "rank" and
                key != "suit" and
                key != "order"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'drawSize':
        for key in action_dict:
            if (key != "type" and
                key != "size"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'draw_size':
        # The "draw_size" action type was renamed to "drawSize"
        modified = True
        action_dict['type'] = 'drawSize'

        for key in action_dict:
            if (key != "type" and
                key != "size"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'status':
        for key in action_dict:
            if (key != "type" and
                key != "clues" and
                key != "score" and
                key != "maxScore" and
                key != "doubleDiscard"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'stackDirections':
        for key in action_dict:
            if (key != "type" and
                key != "directions"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'suitDirections':
        # The "suitDirections" action type was renamed to "stackDirections"
        modified = True
        action_dict['type'] = 'stackDirections'

        for key in action_dict:
            if (key != "type" and
                key != "directions"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'text':
        for key in action_dict:
            if (key != "type" and
                key != "text"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'turn':
        for key in action_dict:
            if (key != "type" and
                key != "num" and
                key != "who"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'clue':
        for key in action_dict:
            if (key != "type" and
                key != "clue" and
                key != "giver" and
                key != "list" and
                key != "target" and
                key != "turn"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'play':
        for key in action_dict:
            if (key != "type" and
                key != "which"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'played':
        # The "played" action type was renamed to "play"
        modified = True
        action_dict['type'] = 'play'

        for key in action_dict:
            if (key != "type" and
                key != "which"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'discard':
        for key in action_dict:
            if (key != "type" and
                key != "which"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'reorder':
        for key in action_dict:
            if (key != "type" and
                key != "target" and
                key != "handOrder"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'strike':
        for key in action_dict:
            if (key != "type" and
                key != "num"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'gameOver':
        for key in action_dict:
            if (key != "type" and
                key != "score" and
                key != "loss"):

                keys_to_delete.append(key)

    elif action_dict['type'] == 'game_over':
        # The "game_over" action type was renamed to "gameOver"
        modified = True
        action_dict['type'] = 'gameOver'

        for key in action_dict:
            if (key != "type" and
                key != "score" and
                key != "loss"):

                keys_to_delete.append(key)

    else:
        print("ERROR, UNKNOWN ACTION TYPE:", action_dict)

    # Push the update query to the list of things to update
    if modified or len(keys_to_delete) > 0:
        for key in keys_to_delete:
            action_dict.pop(key, None)
        new_action = json.dumps(action_dict, separators=(',',':')) # We provide the separators to minify the output
        update_list.append((id, new_action))

cursor.close()
print("LOADED", num_records, "RECORDS!!")

for thing in update_list:
    cursor = cnx.cursor()
    query = ('UPDATE game_actions SET action = %s WHERE id = %s')
    cursor.execute(query, (thing[1], thing[0]))
    cursor.close()
    print('UPDATED ID:', thing[0], thing[1])

cnx.commit()
cnx.close()
