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
