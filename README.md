keldon-hanabi
=============

Description
-----------

* This is the source code for my [Hanabi game server](http://isaacracing.net:3000/).
* This is an emulation of the [Keldon Hanabi game server](http://keldon.net/hanabi/), of which the source code is not published.
* It is programmed in [Node.js](https://nodejs.org/en/) using [Socket.IO](https://socket.io/).
* It uses a [MariaDB](https://mariadb.org/) database to store information about the users and games.
* The main file is `index.js`, which listens for HTTP connections.
* Handlers for messages (commands) recieved from the client are located in the `messages` subdirectory.
* All database logic is in the `models` subdirectory.

<br />



List of Changes & Improvements over the Original Server
-------------------------------------------------------

### New Features

* Bottom Deck Blind Plays
  * On your turn, if there is 1 card left in the deck, you are allowed to blind play it.
  * This is done by dragging the deck on to the play area.
  * A golden border will appear around the deck when there is 1 card left in order to signify that this is possible.
  * This feature prevents stupid losses that occur from being "bottom decked" by a 3 or a 4 that was impossible to save in the early or mid-game.
* Shared Replays
  * You can turn any replay into a shared replay. Once created, an unlimited number of people can join it.
  * When in a shared replay, the leader can control what turn is being shown to everyone in the replay.
  * The creator can move a shared cursor by right clicking.
  * You can see who the leader of the replay is by hovering over the "ðŸ‘‘" icon in the bottom right-hand corner.
  * You can use this feature to share a past game with a friend who was not in that game.
* New variant: White Suit and Multi-color Suit
  * This is like the "Multi-color Suit" variant, but purple is replaced with white.
  * No color clues touch the white suit.
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
* Card-reordering mode
  * If enabled, each player will automatically reorder their cards in the following algorithmic fashion:
    * After you discard or clue, if all the people between you and the last person who discarded played cards, then you move your right-most unclued card to the left-most position.
* Color-blind mode
  * For players who are color-blind, this mode will make the game much easier to play by drawing the letters of the color on top of the card.
* Keyboard Shortcuts
  * For the lobby:
    * Create a table: `Alt + c`
    * Show history: `Alt + h`
    * Start a game: `Alt + s`
    * Leave a table: `Alt + l`
    * Return to tables: `Alt + r`
  * For in-game:
    * Play a card: `a` or `+` (will prompt an alert for the slot number)
    * Discard a card: `d` or `-` (will prompt an alert for the slot number)
    * Clue:
        * `Tab` to select a player
        * `1`, `2`, `3`, `4`, `5` for a number clue
        * Or `q`, `w`, `e`, `r`, `t` for a color clue
        * Then `Enter` to submit
  * For in a replay:
    * Rewind back one turn: `Left`
    * Fast-forward one turn: `Right`
    * Rewind one full rotation: `[`
    * Fast-forward one full rotation: `]`
    * Go to the beginning: `Home`
    * Go to the end: `End`
* Discord Integration
  * All lobby chat will be replicated to (and from) the Hanabi Discord server.
  * You can join the Hanabi Discord server here: https://discord.gg/FADvkJp

### Bug Fixes

* Games will no longer randomly crash if there are too many spectators.
* Your hand will be properly revealed at the end of the game.

### Quality of Life Improvements

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
* Upon refreshing the page, if you are in the middle of the game, you will be automatically taken into that game from the lobby.
* You will no longer have to refresh the page after resizing the browser window.
* The "Clues" text on the game UI will be red while at 8 clues.
* Each suit name is listed below the stack in the middle of the screen during games with the multi-color variants.
* The ambiguous checkboxes in the lobby have been converted to a "Status" indicator, showing exactly what the person is doing.
  * The possible statuses are as follows: Lobby, Pre-Game, Playing, Replay, Shared Replay, Spectating
* During a game, you can mouse over the "ðŸ‘€" icon in the bottom right-hand corner to see who is spectating the game.
* The username box on the login box will now be automatically focused and you can press enter to login.
* When you create a game, the server will suggest a randomly generated table name for you.
* The fade time has been shortened to 200 milliseconds (from 800 milliseconds) in order to make the UI snappier.
* Your name will be bolded in the user list.
* The UI has been cleaned up a little to make it look less cramped.

<br />



Installation (for Client-Side Development Only)
-----------------------------------------------

If you are just looking to update the client JavaScript, then you do not need to install the server.

These instructions assume you are running OS X or Linux. Some adjustment will be needed for Windows installations.

* Clone the server:
  * `git clone https://github.com/Zamiell/keldon-hanabi`
  * `cd keldon-hanabi`
* Fix the `index.ejs` file:
  * `mv views/index.ejs index.html`
  * `sed --in-place 's/<%= websocketURL %>/http://isaacracing.net:3000/g' index.html`
* Open `index.html` in a browser, which will load the local scripts but connect to the real server.

<br />



Installation (Full)
-------------------

These instructions assume you are running Linux. Some adjustment will be needed for OS X or Windows installations.

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

<br />



Credits
-------

* [Keldon Jones](http://keldon.net/) was the original creator of this amazing software. The client is around 6000 lines of code, so it must have taken a long time to make.
* [Hyphen-ated](https://github.com/Hyphen-ated/) created the extremely useful Chrome extension called [Make Hanabi Great Again](https://github.com/Hyphen-ated/MakeHanabiGreatAgain), which extended the features of the original site. MHGA is seamlessly integrated into the emulator.

