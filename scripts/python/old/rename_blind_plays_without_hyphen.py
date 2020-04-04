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
query_string = 'SELECT id, action FROM game_actions WHERE id > 5000 AND id < 6000 ORDER BY id ASC' # There are only a only a few in this range
if debug:
    query_string += ' LIMIT 1000'
query = (query_string)
cursor.execute(query)

update_list = []
num_records = 0
for (id, action) in cursor:
    num_records += 1
    action_dict = json.loads(action)

    modified = False

    if action_dict['type'] == 'text' and 'blind plays' in action_dict['text']:
        modified = True
        action_dict['text'] = action_dict['text'].replace('blind plays', 'plays')
        action_dict['text'] += ' (blind)'

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

cnx.commit()
cnx.close()

print('UPDATED ' + str(len(update_list)) + ' RECORDS!', flush=True)
