#!/usr/bin/env python

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
cursor = cnx.cursor(buffered=True)
query = ('SELECT id, username FROM users')
cursor.execute(query)

users = []
for (user_id, username) in cursor:
    users.append((user_id, username))
cursor.close()

for user in users:
    cursor = cnx.cursor()
    query = ('SELECT id FROM game_participants WHERE user_id = %s')
    cursor.execute(query, (user[0]))

    games = 0
    for (game_id) in cursor:
        games += 1
    cursor.close()

    if games == 0:
        cursor = cnx.cursor()
        query = ('DELETE FROM users WHERE id = %s')
        cursor.execute(query, (user_id))
        print('Deleted user:', user[0], user[1])

cnx.commit()
cnx.close()
