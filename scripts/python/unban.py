#!/usr/bin/env python3

# The "dotenv" module does not work in Python 2
import sys

if sys.version_info < (3, 0):
    print("This script requires Python 3.x.")
    sys.exit(1)

# Imports
import os
import dotenv
import psycopg2

# Import environment variables
dotenv.load_dotenv(dotenv.find_dotenv())

# Variables
user = os.getenv("DB_USER")
password = os.getenv("DB_PASS")
host = os.getenv("DB_HOST")
if host == "":
    host = "localhost"
port = os.getenv("DB_PORT")
if port == "":
    port = "5432"
database = os.getenv("DB_NAME")

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host,
    port=port,
    user=user,
    password=password,
    database=database,
)

# Prompt for the username
username = input("Enter the username: ")
if len(username) == 0:
    print("You cannot enter a blank username.")
    sys.exit(1)

# Check to see if the user exists
cursor = conn.cursor()
cursor.execute("SELECT COUNT(id) FROM users WHERE username = %s", (username,))
row = cursor.fetchone()
cursor.close()
count = row[0]
if count == 0:
    print('The username of "' + username + '" does not exist in the database.')
    sys.exit(1)

# Display the last IP address of the user
cursor = conn.cursor()
cursor.execute("SELECT last_ip FROM users WHERE username = %s", (username,))
row = cursor.fetchone()
cursor.close()
last_ip = row[0]
print("Their last IP address is:", last_ip)

# Check to see if this IP is banned
cursor = conn.cursor()
cursor.execute("SELECT COUNT(id) FROM banned_ips WHERE ip = %s", (last_ip,))
row = cursor.fetchone()
cursor.close()
count = row[0]
if count == 0:
    print('The IP address of "' + last_ip + '" is not banned.')
    sys.exit(1)

# Delete the row for this IP
cursor = conn.cursor()
cursor.execute("DELETE FROM banned_ips WHERE ip = %s", (last_ip,))
cursor.close()
conn.commit()
conn.close()

print("Complete.")
