#!/usr/bin/env python3

# The "dotenv" module does not work in Python 2
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

# Get all database records
cursor = cnx.cursor()
query_string = 'SELECT id, action FROM game_actions ORDER BY id ASC'
# (the broken game IDs are between these numbers)
if debug:
    query_string += ' LIMIT 1000'
query = (query_string)
cursor.execute(query)

update_list = []
num_records = 0
empty_clue = False
for (id, action) in cursor:
    num_records += 1
    action_dict = json.loads(action)

    modified = False

    if action_dict['type'] == 'clue':
        empty_clue = len(action_dict['list']) == 0
    if action_dict['type'] == 'text' and empty_clue:
        empty_clue = False

        if ' about zero ' in action_dict['text'] or ' oinks ' in action_dict['text'] or ' quacks ' in action_dict['text']:
            continue

        match = re.search(r'^(.+?) tells (.+?) \b((?:1|2|3|4|5|Red|Yellow|Green|Blue|Purple|Black|Brown|Pink|Orange))\b', action_dict['text'])
        if not match:
            print('ERROR: FAILED TO PARSE EMPTY CLUE TEXT ON ACTION ' + str(id) + ': ' + action_dict['text'], flush=True)
            sys.exit(1)

        modified = True
        action_dict['text'] = match.group(1) + ' tells ' + match.group(2) + ' about zero ' + match.group(3) + 's'

    # Push the update query to the list of things to update
    if modified:
        new_action = json.dumps(action_dict, separators=(',',':')) # We provide the separators to minify the output
        update_list.append((id, new_action))

cursor.close()
print('LOADED ' + str(num_records) + ' RECORDS!', flush=True)
print('UPDATING ' + str(len(update_list)) + ' RECORDS!', flush=True)

for thing in update_list:
    cursor = cnx.cursor()
    query = ('UPDATE game_actions SET action = %s WHERE id = %s')
    cursor.execute(query, (thing[1], thing[0]))
    cursor.close()
    print('UPDATED ID:', thing[0], thing[1], flush=True)

cnx.commit()
cnx.close()
