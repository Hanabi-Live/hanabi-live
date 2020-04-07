# Hanabi Live Chat Commands

### General commands (that work everywhere):

| Command             | Description
| ------------------- | -----------
| /help               | Display this message
| /discord            | Get the link for the Hanabi Discord server
| /random [min] [max] | Get a random number
| /uptime             | Get how long the server has been online

<br />

### General commands (that work everywhere except for Discord)

| Command               | Description
| --------------------- |------------
| /pm [recipient] [msg] | Send a private message
| /r [msg]              | Reply to a private message

<br />

### Pre-game commands

| Command            | Description
| ------------------ |------------
| /s                 | Automatically start the game when the next person joins
| /s#                | Automatically start the game when it has # players
| /startin [minutes] | Automatically start the game in N minutes
| /findvariant       | Find a random variant that everyone needs the max score in

<br />

### Game commands

| Command  | Description
| -------- | -----------
| /pause   | Pause the game (can be done on any turn)
| /unpause | Unpause the game

<br />

### Discord commands

| Command           | Description
| ----------------- |------------
| /here             | Ping members of the Hyphen-ated group to get a game going
| /last             | See how long it has been since the last ping
| /next             | Put yourself on the waiting list
| /unnext           | Take yourself off the waiting list
| /list             | Show the people on the waiting list
| /link [id] [turn] | Link to a specific game and turn

<br />

### Admin-only commands (from the lobby only)

| Command      | Description
| ------------ |------------
| /restart     | Restart the server
| /graceful    | Gracefully restart the server
| /shutdown    | Gracefully shutdown the server
| /maintenance | Disable new game creation
| /cancel      | Enable new game creation
| /debug       | Print out some server-side info
