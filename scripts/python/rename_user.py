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

# Subroutines
def is_ascii(s):
    return all(ord(c) < 128 for c in s)

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    host=host, port=port, user=user, password=password, database=database,
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
    print("The user of \"" + username + "\" does not exist in the database.")
    sys.exit(1)

# Display the last IP address of the user
cursor = conn.cursor()
cursor.execute("SELECT last_ip FROM users WHERE username = %s", (username,))
row = cursor.fetchone()
cursor.close()
print("Their last IP address is:", row[0])

# Prompt for the new username
new_username = input("Enter the new username: ")
if len(new_username) == 0:
    print("You cannot enter a blank username.")
    sys.exit(1)

# Check for non-ASCII characters
if not is_ascii(new_username):
    print("This username contains non-ASCII characters. Transliteration to ASCII is required; see the Go source code for creating a new user.")
    sys.exit(1)

new_username_normalized = new_username.lower()

# Check to see if the new username exists already
cursor = conn.cursor()
cursor.execute("SELECT COUNT(id) FROM users WHERE normalized_username = %s", (new_username_normalized,))
row = cursor.fetchone()
cursor.close()
count = row[0]
if count != 0:
    print("The normalized username of \"" + new_username_normalized + "\" already exists in the database, so you cannot rename someone else to that username.")
    sys.exit(1)

# Update the username
cursor = conn.cursor()
cursor.execute(
    "UPDATE users SET (username, normalized_username) = (%s, %s) WHERE username = %s",
    (new_username, new_username_normalized, username),
)
cursor.close()
conn.commit()
conn.close()

print("Complete.")
