#!/usr/bin/env python3


from database import connect

conn = connect()

# Get all users
cursor = conn.cursor()
cursor.execute("SELECT id, username FROM users WHERE id > 15000")
# (users before 15000 are verified to have at least 1 game played)
rows = cursor.fetchall()
users = []
for row in rows:
    users.append(row)
cursor.close()

print("Loaded " + str(len(users)) + " users.", flush=True)
i = 0
for user in users:
    i += 1
    if i % 1000 == 0:
        print("On user #" + str(i), flush=True)

    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(game_id) FROM game_participants WHERE user_id = %s", (user[0],)
    )
    row = cursor.fetchone()
    cursor.close()
    num_games = row[0]

    if num_games == 0:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = %s", (user[0],))
        cursor.close()
        print("Deleted user:", user[0], flush=True)

conn.commit()
conn.close()
