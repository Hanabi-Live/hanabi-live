Server Installation + Linter Installation (for Windows)
-------------------------------------------------------

Like many code projects, we use [linters](https://en.wikipedia.org/wiki/Lint_(software)) to ensure that all of the code is written consistently and error-free. For Golang (the server-side code), we use [golangci-lint](https://github.com/golangci/golangci-lint). For JavaScript (the client-side code), we use [ESLint](https://eslint.org/) and have a configuration based on the [Airbnb style guide](https://github.com/airbnb/javascript). We ask that all pull requests pass our linting rules.

The following instructions will set up the server development environment as well as the linters. This assumes you are on Windows and will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice text editor that happens to be better than [Atom](https://atom.io/), [Notepad++](https://notepad-plus-plus.org/), etc. If you are using a different OS/editor, some adjustments will be needed (e.g. using `brew` on MacOS instead of `choco`).

Note that these steps require **an elevated (administrator) command-shell**.

* Install [Chocolatey](https://chocolatey.org/):
  * `@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [MariaDB](https://mariadb.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  * `choco install git golang mariadb nodejs vscode -y`
* Configure Git:
  * `refreshenv`
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global core.autocrlf false` <br />
  (so that Git does not convert LF to CRLF when cloning repositories)
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Clone the repository:
  * `mkdir %GOPATH%\src\github.com\Zamiell`
  * `cd %GOPATH%\src\github.com\Zamiell`
  * `git clone https://github.com/Zamiell/hanabi-live.git` <br />
  (or clone a fork, if you are doing development work)
  * `cd hanabi-live`
* Install the project's development dependencies:
  * `install\install_development_dependencies.sh`
* Delete the anonymous user, delete the test database, create the Hanabi database, and create the Hanabi user:
  * `mysql -u root`
    * `DELETE FROM mysql.user WHERE User='';`
    * `DROP DATABASE IF EXISTS test;`
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';`
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
    * `FLUSH PRIVILEGES;`
    * `exit`
* Install the database schema:
  * `mysql -uhanabiuser -p1234567890 < install/database_schema.sql`
* Set up environment variables:
  * `copy .env_template .env`
  * For local development, you don't have to change any of the default environment variables, but if you like you can open this file to review the defaults.
* Set the Golang linter in the VS Code settings:
  * `notepad "%APPDATA%\Code\User\settings.json"` <br />
  (the file will not exist on fresh VS Code installations)

```
{
    "editor.fontSize": 16,
    "editor.renderWhitespace": "all",
    "editor.wordWrap": "on",
    "go.lintTool":"golangci-lint",
    "go.lintFlags": [
        "--fast"
    ],
    "workbench.startupEditor": "newUntitledFile"
}
```

* Open VSCode using the cloned repository as the project folder:
  * `code .`
* Test the Golang linter:
  * On the left pane, navigate to and open "src\action.go".
  * In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
  * Add a new line of "asdf" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
* Test the JavaScript linter:
  * On the left pane, navigate to and open "public\js\lobby.js".
  * Add a new line of "asdf" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
* If needed, compile and run the server locally:
  * `cd src`
  * `go build && "%GOPATH%\bin\src.exe"`
  * A Windows Firewall dialog may pop up; allow the connection.
  * Open a browser and surf to: http://localhost

<br />



Server Installation (Linux)
---------------------------

These instructions assume you are running Ubuntu 18.04.1 LTS. Some adjustment will be needed for macOS installations.

* Install [Golang](https://golang.org/):
  * `sudo add-apt-repository ppa:longsleep/golang-backports` (if you don't do this, it will install a version of Golang that is very old)
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
  * `go get -v ./...` (it is normal for this to take a very long time)
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
* `go run src/*.go`
  * `sudo` might be necessary to run this command because the server listens on port 80 and/or 443.
  * If you are on Windows, this command must be run in PowerShell (as opposed to a "normal" command prompt); otherwise,  the `*` file substitution will not work.

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
  * `sudo apt install supervisor -y`
(http://unix.stackexchange.com/questions/281774/ubuntu-server-16-04-cannot-get-supervisor-to-start-automatically))
* Copy the configuration files:
  * `cp "$GOPATH/Zamiell/hanabi-live/install/supervisord/supervisord.conf" "/etc/supervisord/supervisord.conf"`
  * `cp "$GOPATH/Zamiell/hanabi-live/install/supervisord/hanabi-live.conf" "/etc/supervisord/conf.d/hanabi-live.conf"`
* Start it: `systemctl start supervisor`

Later, to manage the service:

* Start it: `supervisorctl start hanabi-live`
* Stop it: `supervisorctl stop hanabi-live`
* Restart it: `supervisorctl restart hanabi-live`

<br />



Automate backups (optional)
---------------------------

* `crontab -e`

```
# Backup the hanabi-live database every day at midnight
0 0 * * * /root/go/src/github.com/Zamiell/hanabi-live/make_database_dump.sh
```
