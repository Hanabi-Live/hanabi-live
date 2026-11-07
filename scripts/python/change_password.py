#!/usr/bin/env python3

import sys

from database import connect

conn = connect()

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
print("Their last IP address is:", row[0])

# Prompt for the password hash
password_hash = input("Enter the password hash: ")
if len(password_hash) == 0:
    print("You cannot enter a blank password hash.")
    sys.exit(1)

# Update the password hash
cursor = conn.cursor()
cursor.execute(
    "UPDATE users SET password_hash = %s WHERE username = %s",
    (password_hash, username),
)
cursor.close()
conn.commit()
conn.close()

print("Complete.")
