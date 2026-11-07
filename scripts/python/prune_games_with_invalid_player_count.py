#!/usr/bin/env python3


from database import connect

conn = connect()

# Get all the games
cursor = conn.cursor()
cursor.execute("SELECT id, num_players FROM games ORDER BY id")
rows = cursor.fetchall()
games = []
for row in rows:
    games.append(row)
cursor.close()
print("Loaded " + str(len(games)) + " games.", flush=True)

# Get the count of game participants for each game ID
i = 0
numInvalidGames = 0
for game in games:
    i += 1
    if i % 1000 == 0:
        print("On game #" + str(i), flush=True)

    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(id) FROM game_participants WHERE game_id = %s", (game[0],)
    )
    row = cursor.fetchone()
    cursor.close()
    num_game_participants = row[0]
    if num_game_participants != game[1]:
        print("Invalid player count found on game: ", game[0])
        numInvalidGames += 1

        cursor = conn.cursor()
        cursor.execute("DELETE FROM games WHERE id = %s", (game[0],))
        cursor.close()

conn.commit()
conn.close()

print("Total invalid rows:", numInvalidGames)
