keldon-hanabi
=============

Description
-----------

* This is an emulation of the [Keldon Hanabi game server](http://keldon.net/hanabi/), of which the source code is not published.
* It is programmed in [Node.js](https://nodejs.org/en/) using [Socket.IO](https://socket.io/).
* It uses a MariaDB database to store information about the users and games.
* The main file is `index.js`, which listens for HTTP connections.
* Handlers for messages (commands) recieved from the client are located in the `messages` subdirectory.
* All database logic is in the `models` subdirectory.

<br />

List of Changes & Improvements over the Original Server
-------------------------------------------------------

### New Features

* Shared Replays
  * You can turn any replay into a shared replay, upon which an unlimited number of people can join.
  * When in a shared replay, the creator can control what turn is being shown to everyone in the replay.
  * You can use this feature to share a past game with a friend who was not in that game.
* New variant: Mixed-color Suits
  * This has 6 new suits: Green, Magenta, Navy, Orange, Tan, and Burgundy.
  * There are only 4 types of clues: Blue, Yellow, Red, and Black.
* New variant: Mixed and Multi-color Suits
  * This has 5 new suits, with Rainbow as the 6th suit: Teal, Lime, Orange, Burgundy, and Indigo.
  * The standard clue types are available.
* New game option: Timer
  * Similar to chess, each player has a bank of time that decreases only during their turn.
  * By default, each player starts with 5 minutes.
  * Upon performing a move, each player will add 10 seconds to their clock.
  * If time runs out for any player, the game immediately ends.
  * In non-timed games, the timers will still show, but they will count up instead of down to show how long each player is taking.
* New sounds
  * The sound for reaching your turn is improved.
  * There is a new sound whenever someone else performs an action.
  * There is a custom sound for a failed play.
  * There is a custom sound for a blind play.
* Notes
  * You can right-click a card to add a note to it.
  * Since notes are tracked by the server, you can switch computers mid-game and keep your notes.
  * Your notes will persist into the replay.
  * Everyone's notes are combined and shown to spectators, which is fun to see.
* Color-blind mode
  * For players who are color-blind, this mode will make the game much easier to play by drawing the letters of the color on top of the card.
* Keyboard Shortcuts
  * You can now completely play the game using the keyboard.
  * You can see the documentation for the hotkeys by clicking the "Help" button while in a game.
* Discord Integration
  * All lobby chat will be replicated to (and from) the Hanabi Discord server.
  * You can join the Hanabi Discord server here: https://discord.gg/FADvkJp

### Bug Fixes + Quality of Live Improvements

* Games will no longer randomly crash if there are too many spectators.
* The action log is improved:
  * It will show what slot a player played or discarded from.
  * It will show "(blind)" for blind plays.
  * It will shows "(clued)" when discarding clued cards.
  * It will show 3 actions instead of 1.
  * It will show how many cards were left in the deck at the start of each message. (This only occurs when you click on it to see the full log.)
  * At the end of the game, it will show how much time each player had left. Or, in non-timed games, it will show how much time they took in total.
* The clue log will still continue to function if you mouse over played and discarded cards.
* The "No Clues" indicator is much easier to see.
* In-game replays will show card faces based on your current knowledge of the card.
* Replays of other games will no longer show "Alice", "Bob", etc., and will instead show the real player names. This way, if you have a question about what they did, you can actually message them and ask.
* The ambiguous checkboxes in the lobby have been converted to a "Status" indicator, showing exactly what the person is doing.
  * The possible statuses are as follows: Lobby, Pre-Game, Playing, Replay, Shared Replay, Spectating
* You can now press enter to login on the login screen.
* When you create a game, the server will suggest a randomly generated table name for you.
* The UI has been cleaned up a little to make it look less cramped.
* The fade time has been shortened to 200 milliseconds (from 800 milliseconds) in order to make the UI snappier.

<br />

Installation
------------

These instructions assume you are running Linux. Some adjustment will be needed for Windows installations.

* Install [Node.js](https://nodejs.org/en/) (using [Node Version Manager](https://github.com/creationix/nvm)):
  * `curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash`
  * `export NVM_DIR="$HOME/.nvm"`
  * `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  * `[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"`
  * `nvm install node`
* Install [MariaDB](https://mariadb.org/) and set up a user:
  * `sudo apt install mariadb-server -y`
  * `sudo mysql_secure_installation`
    * Follow the prompts.
  * `sudo mysql -u root -p`
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';`
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
* Clone the server:
  * `git clone https://github.com/Zamiell/keldon-hanabi`
  * `cd keldon-hanabi`
* Set up environment variables:
  * `cp .env_defaults .env`
  * `nano .env`
    * Change the values accordingly (assuming you modified the commands above).
    * `DISCORD_TOKEN` can be left blank if you don't want to enable Discord functionality.
    * `KELDON_USER` and `KELDON_PASS` can be left blank if you don't want to enable the Keldon bot functionality.
* Import the database schema:
  * `mysql -uhanabiuser -p1234567890 < install/database_schema.sql`
* Install the Node.js modules:
  * `npm install`
* Start the server:
  * `npm start`
