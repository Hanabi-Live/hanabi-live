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
