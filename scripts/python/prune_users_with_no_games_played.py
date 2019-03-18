#!/usr/bin/env python3
# (the "dotenv" module does not work in Python 2)

import sys
if sys.version_info < (3, 0):
    print("This script requires Python 3.x.")
    sys.exit(1)

# Imports
import os
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

# Get all users
cursor = cnx.cursor()
query = ('SELECT id, username FROM users')
cursor.execute(query)

users = []
for (user_id, username) in cursor:
    users.append((user_id, username))
cursor.close()

for user in users:
    cursor = cnx.cursor()
    query = ('SELECT COUNT(id) FROM game_participants WHERE user_id = %s')
    cursor.execute(query, (user[0],))
    for (count) in cursor:
        num_games = count[0]
    cursor.close()

    if num_games == 0:
        cursor = cnx.cursor()
        query = ('DELETE FROM users WHERE id = %s')
        cursor.execute(query, (user[0],))
        print('Deleted user:', user[0], user[1])

cnx.commit()
cnx.close()
