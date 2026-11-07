#!/usr/bin/env python3

import sys

from database import connect

# Subroutines
def is_ascii(s):
    return all(ord(c) < 128 for c in s)


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

# Prompt for the new username
new_username = input("Enter the new username: ")
if len(new_username) == 0:
    print("You cannot enter a blank username.")
    sys.exit(1)

# Check for non-ASCII characters
if not is_ascii(new_username):
    print(
        'The username of "'
        + new_username
        + '" contains non-ASCII characters. Transliteration to ASCII is required; see server/src/accounts/normalization.rs.'
    )
    sys.exit(1)

new_username_normalized = new_username.lower()

# Check to see if the new username exists already
cursor = conn.cursor()
cursor.execute(
    "SELECT COUNT(id) FROM users WHERE normalized_username = %s",
    (new_username_normalized,),
)
row = cursor.fetchone()
cursor.close()
count = row[0]
if count != 0:
    print(
        'The normalized username of "'
        + new_username_normalized
        + '" already exists in the database, so you cannot rename someone else to that username.'
    )
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
