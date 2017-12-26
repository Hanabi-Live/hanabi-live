Installation (for Client-Side Development Only)
-----------------------------------------------

If you are just looking to update the client JavaScript, then you do not need to install the server.

These instructions assume you are running macOS or Linux. Some adjustment will be needed for Windows installations.

* TODO

<br />



Installation (Full)
-------------------

These instructions assume you are running Ubuntu 16.04 LTS. Some adjustment will be needed for macOS or Windows installations.

* Install Go:
  * `sudo add-apt-repository ppa:longsleep/golang-backports` (if you don't do this, it will install a version of Go that is very old)
  * `sudo apt update`
  * `sudo apt install golang-go -y`
  * `mkdir "$HOME/go"`
  * `export GOPATH=$HOME/go && echo 'export GOPATH=$HOME/go' >> ~/.profile`
  * `export PATH=$PATH:$GOPATH/bin && echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.profile`
* Install [MariaDB](https://mariadb.org/) and set up a user:
  * `sudo apt install mariadb-server -y`
  * `sudo mysql_secure_installation`
    * Follow the prompts.
  * `sudo mysql -u root -p`
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';` (change the password to something else)
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
    * `FLUSH PRIVILEGES;`
* Clone the server:
  * `mkdir -p "$GOPATH/src/github.com/Zamiell"`
  * `cd "$GOPATH/src/github.com/Zamiell/"`
  * `git clone https://github.com/Zamiell/hanabi-live.git` (or clone a fork, if you are doing development work)
  * `cd hanabi-live`
* Download and install all of the Go dependencies:
  * `cd src` (this is where all of the Go source code lives)
  * `go get ./...` (it is normal for this to take a very long time)
  * `cd ..`
* Set up environment variables:
  * `cp .env_template .env`
  * `nano .env`
    * Fill in the values accordingly.
* Import the database schema:
  * `mysql -uhanabiuser -p < install/database_schema.sql`

<br />



Run
---

* `cd "$GOPATH/src/github.com/Zamiell/hanabi-live"`
* `go run src/*.go` (sudo might be necessary because it runs on port 80 and/or 443)

<br />



Compile / Build
---------------

* `cd "$GOPATH/src/github.com/Zamiell/hanabi-live/src"`
* `go install`
* `mv "$GOPATH/bin/src" "$GOPATH/bin/hanabi-live"` (the binary is called `src` by default, since the name of the directory is `src`)

<br />



Install HTTPS (optional)
------------------------

* `sudo apt install letsencrypt -y`
* `letsencrypt certonly --standalone -d hanabi.live -d www.hanabi.live` (this creates "/etc/letsencrypt/live/hanabi.live/")
* In the `.env` file:
  * Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanabi.live/fullchain.pem`
  * Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanabi.live/privkey.pem`

<br />



Install as a service (optional)
-------------------------------

* Install Supervisor:
  * `apt install supervisor -y`
  * `systemctl enable supervisor` (this is needed due to [a quirk in Ubuntu 16.04](http://unix.stackexchange.com/questions/281774/ubuntu-server-16-04-cannot-get-supervisor-to-start-automatically))
* Copy the configuration files:
  * `cp "$GOPATH/Zamiell/hanabi-live/install/supervisord/supervisord.conf" "/etc/supervisord/supervisord.conf"`
  * `cp "$GOPATH/Zamiell/hanabi-live/install/supervisord/hanabi-live.conf" "/etc/supervisord/conf.d/hanabi-live.conf"`
* Start it: `systemctl start supervisor`

Later, to manage the service:

* Start it: `supervisorctl start hanabi-live`
* Stop it: `supervisorctl stop hanabi-live`
* Restart it: `supervisorctl restart hanabi-live`

<br />
