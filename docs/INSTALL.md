Installation (for Client-Side Development Only)
-----------------------------------------------

If you are just looking to update the client JavaScript, then you do not need to install the server.

These instructions assume you are running OS X or Linux. Some adjustment will be needed for Windows installations.

* Clone the server:
  * `git clone https://github.com/Zamiell/keldon-hanabi`
  * `cd keldon-hanabi`
* Fix the `index.ejs` file:
  * `mv views/index.ejs index.html`
  * `sed --in-place 's/<%= websocketURL %>/http://www.hanabi.live/g' index.html`
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
  * `cp .env_template .env`
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
