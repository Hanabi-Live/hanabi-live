#!/usr/bin/env python3

# The "dotenv" module does not work in Python 2
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

# Subroutines
def is_json(myjson):
    try:
        json_object = json.loads(myjson)
    except ValueError as e:
        return False
    return True

# Connect to the MySQL database
cnx = mysql.connector.connect(
    user=user,
    password=password,
    host=host,
    database=database
)

# Get all database records
cursor = cnx.cursor()
query_string = 'SELECT id, notes FROM game_participants ORDER BY id ASC'
if debug:
    query_string += ' LIMIT 100'
query = (query_string)
cursor.execute(query)

update_list = []
num_records = 0
for (id, notes_json) in cursor:
    num_records += 1

    if not is_json(notes_json):
        continue

    notes = json.loads(notes_json)
    if len(notes) == 0:
        continue

    order = 0
    for note in notes:
        if note == '' or note == None:
            continue
        update_list.append((id, order, note))
        order += 1

cursor.close()
print('LOADED ' + str(num_records) + ' RECORDS!')

count = 0
for thing in update_list:
    cursor = cnx.cursor()
    query = ('INSERT INTO game_participant_notes (game_participant_id, card_order, note) VALUES (%s, %s, %s)')
    cursor.execute(query, (thing[0], thing[1], thing[2]))
    cursor.close()

    count += 1
    if count % 1000 == 0:
        print("on query number:", count)

cnx.commit()
cnx.close()
