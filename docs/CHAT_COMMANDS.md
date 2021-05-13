# Hanab Live Chat Commands

If you need general help with the website, then read the [features page](FEATURES.md). If you need the list of chat commands, read on.

<br />

### General commands (that work everywhere):

| Command                               | Description
| ------------------------------------- | -----------
| `/help`                               | Get the link to this page
| `/discord`                            | Get the link for the [Discord server](https://discord.gg/FADvkJp)
| `/rules`                              | Get the link for the [Community Guidelines](https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md)
| `/new`                                | Get the link for the [Hyphen-ated group beginner's guide](https://hanabi.github.io/docs/beginner)
| `/doc`                                | Get the link for the [Hyphen-ated group reference document](https://hanabi.github.io/docs/reference)
| `/bga`                                | Get the link for the [Board Game Arena guide](https://github.com/hanabi/hanabi.github.io/blob/main/misc/BGA.md)
| `/efficiency`                         | Get the link for the [efficiency document](https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md)
| `/playerinfo`                         | Get the number of games played for all the players in the current game
| `/playerinfo [username]`              | Get the number of games played for a specific player
| `/playerinfo [username1] [username2]` | Get the number of games played for a list of players
| `/replay [game ID] [turn]`            | Generate a link to a replay so that you can share it with others
| `/random [min] [max]`                 | Get a random integer
| `/uptime`                             | Get how long the server has been online
| `/timeleft`                           | Get how much time is left before the server shuts down
| `/shrug`                              | ¯\\\_(ツ)\_/¯

<br />

### General commands (that work everywhere except for Discord)

| Command                | Description
| ---------------------- |------------
| `/pm [username] [msg]` | Send a private message
| `/r [msg]`             | Reply to a private message
| `/friend [username]`   | Add someone to your friends list
| `/unfriend [username]` | Remove someone from your friends list
| `/friends`             | Show a list of all your friends
| `/tagsearch [tag]`     | Search through all games for a specific tag
| `/version`             | Show the version number of the client code

<br />

### Pre-game commands (table-owner-only)

| Command                 | Description
| ----------------------- |------------
| `/setvariant [variant]` | Change the variant of the current game
| `/s`                    | Automatically start the game when the next person joins
| `/s2`                   | Automatically start the game when it has 2 players
| `/s3`                   | Automatically start the game when it has 3 players
| `/s4`                   | Automatically start the game when it has 4 players
| `/s5`                   | Automatically start the game when it has 5 players
| `/s6`                   | Automatically start the game when it has 6 players
| `/startin [minutes]`    | Automatically start the game in the provided amount of minutes
| `/kick [username]`      | Remove a player from the table
| `/impostor`             | Randomly tells one of the players they are an impostor and the others they are crew-mates.

<br />

### Pre-game or game commands

| Command        | Description
| -------------- |------------
| `/missing`     | Get the list of every max score that the team is missing
| `/findvariant` | Find a random variant that everyone needs the max score in

<br />

### Pre-game, game, and replay commands

| Command      | Description
| ------------ |------------
| `/setleader` | Change the owner/leader of the game

<br />

### Game commands

| Command    | Description
| ---------- | -----------
| `/pause`   | Pause the game (can be done on any turn)
| `/unpause` | Unpause the game

<br />

### Game or replay commands

| Command      | Description
| ------------ | -----------
| `/tag [tag]` | Tag this game with a word or phrase so that you can find it later

<br />

### Replay commands

| Command            | Description
| ------------------ | -----------
| `/suggest [turn]`  | Suggest a specific turn for the shared replay leader to go to
| `/tagdelete [tag]` | Delete an existing tag from the game
| `/tags`            | Show all of the tags for this game
