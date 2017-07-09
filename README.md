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

Installation
------------

* Install Node.js.
* Install MariaDB.
* Create a new database user.
* `git clone https://github.com/Zamiell/keldon-hanabi`
* `cd keldon-hanabi`
* `cp .env_defaults .env`
* `vi .env` (fill in the values)
* `mysql -uhanabiuser -p1234567890 < install/database_schema.sql` (to import the database)
* `npm install`
* `npm start`
