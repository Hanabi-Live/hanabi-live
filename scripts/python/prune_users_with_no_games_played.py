#!/usr/bin/env python3

# The "dotenv" module does not work in Python 2
import sys
if sys.version_info < (3, 0):
    print('This script requires Python 3.x.')
    sys.exit(1)

# Imports
import os
import dotenv
import psycopg2

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv('DB_USER')
password = os.getenv('DB_PASS')
host = os.getenv('DB_HOST')
if host == '':
    host = 'localhost'
port = os.getenv('DB_PORT')
if port == '':
    port = '5432'
database = os.getenv('DB_NAME')

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host,
    port=port,
    user=user,
    password=password,
    database=database,
)

# Get all users
cursor = conn.cursor()
cursor.execute('SELECT id, username FROM users')
rows = cursor.fetchall()
users = []
for row in rows:
    print(row[0])
    if row[0] == 1180:
        f = open('demofile2.txt', 'w', encoding='utf-8')
        f.write(row[1])
        f.close()
        pass
    #users.append(row)
    print(row)
cursor.close()

sys.exit(1)
'''
for user in users:
    cursor = cnx.cursor()
    query = ('SELECT COUNT(game_id) FROM game_participants WHERE user_id = %s')
    cursor.execute(query, (user[0], ))
    for (count) in cursor:
        num_games = count[0]
    cursor.close()

    if num_games == 0:
        cursor = cnx.cursor()
        query = ('DELETE FROM users WHERE id = %s')
        cursor.execute(query, (user[0], ))
        print('Deleted user:', user[0])

cnx.commit()
cnx.close()
'''
