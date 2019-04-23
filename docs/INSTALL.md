Server Installation + Linter Installation (for Development / Windows)
---------------------------------------------------------------------

Like many code projects, we use [linters](https://en.wikipedia.org/wiki/Lint_(software)) to ensure that all of the code is written consistently and error-free. For Golang (the server-side code), we use [golangci-lint](https://github.com/golangci/golangci-lint). For JavaScript (the client-side code), we use [ESLint](https://eslint.org/) and have a configuration based on the [Airbnb style guide](https://github.com/airbnb/javascript). We ask that all pull requests pass our linting rules.

The following instructions will set up the server development environment as well as the linters. This assumes you are on Windows and will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice text editor that happens to be better than [Atom](https://atom.io/), [Notepad++](https://notepad-plus-plus.org/), etc. If you are using a different OS/editor, some adjustments will be needed (e.g. using `brew` on MacOS instead of `choco`).

Note that these steps require **an elevated (administrator) command-shell**.

* Install [Chocolatey](https://chocolatey.org/):
  * `@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [MariaDB](https://mariadb.org/), [Node.js](https://nodejs.org/en/), [Java](https://www.java.com/en/), [Visual Studio Code](https://code.visualstudio.com/), and [Wget](https://eternallybored.org/misc/wget/):
  * `choco install git golang mariadb nodejs jre8 vscode wget -y`
* Configure Git:
  * `refreshenv`
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global core.autocrlf false` <br />
  (so that Git does not convert LF to CRLF when cloning repositories)
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Configure MariaDB:
  * `mysql -u root`
    * `DELETE FROM mysql.user WHERE User='';` <br />
    (this delete the anonymous user that is installed by default)
    * `DROP DATABASE IF EXISTS test;` <br />
    (this deletes the test database that is installed by default)
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';`
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
    * `FLUSH PRIVILEGES;`
    * `exit`
* Clone the repository:
  * `mkdir %GOPATH%\src\github.com\Zamiell`
  * `cd %GOPATH%\src\github.com\Zamiell`
  * `git clone git@github.com:Zamiell/hanabi-live.git` <br />
  (or clone a fork, if you are doing development work)
  * `cd hanabi-live`
* Change from the Windows Command Prompt to Git Bash and install some dependencies:
  * `"%PROGRAMFILES%\Git\bin\sh.exe"`
  * `./install/install_dependencies.sh`
  * `./install/install_development_dependencies.sh`
  * `./install/install_database_schema.sh`
  * `exit`
* Set the domain URL (optional):
  * `notepad .env` <br />
  (if you plan to surf to "http://localhost", then don't change anything)
* Import a solid set of starting VSCode user settings:
  * `copy "install\settings.json" "%APPDATA%\Code\User\settings.json"` <br />
  (feel free to tweak this file to your liking)
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
  * `go install && "%GOPATH%\bin\src.exe"`
  * A Windows Firewall dialog may pop up; allow the connection.
  * Open a browser and surf to: http://localhost

<br />



Server Installation (for Linux)
-------------------------------

These instructions assume you are running Ubuntu 18.04.1 LTS.

* Install [Golang](https://golang.org/):
  * `sudo add-apt-repository ppa:longsleep/golang-backports` <br />
  (if you don't do this, it will install a version of Golang that is very old)
  * `sudo apt update`
  * `sudo apt install golang-go -y`
  * `mkdir "$HOME/go"`
  * `export GOPATH=$HOME/go && echo 'export GOPATH=$HOME/go' >> ~/.profile`
  * `export PATH=$PATH:$GOPATH/bin && echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.profile`
* Install [MariaDB](https://mariadb.org/):
  * `sudo apt install mariadb-server -y`
  * `sudo mysql_secure_installation`
    * Follow the prompts.
* Clone the server:
  * `mkdir -p "$GOPATH/src/github.com/Zamiell"`
  * `cd "$GOPATH/src/github.com/Zamiell/"`
  * `git clone https://github.com/Zamiell/hanabi-live.git` <br />
  (or clone a fork, if you are doing development work)
  * `cd hanabi-live`
* Install the project dependencies:
  * `./install/install_dependencies`
* Set up environment variables:
  * `nano .env`
    * Fill in the values accordingly. The most important one is DOMAIN - **this must match the URL that the user types in!**
* Set up a database user and import the database schema:
  * `sudo mysql -u root -p`
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';` <br />
    (change the password to something else)
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
    * `FLUSH PRIVILEGES;`
  * `./install/install_database_schema.sh`
* Set up automated database backups:
  * `crontab -e`

```
# Every day, backup the "hanabi" database
0 0 * * * /root/go/src/github.com/Zamiell/hanabi-live/make_database_dump.sh
```

<br />



Run
---

* The following script will compile and run the server:
  * `"$GOPATH/src/github.com/Zamiell/hanabi-live/run.sh"`
  * `sudo` might be necessary to run this command because the server listens on port 80 and/or 443.
* If you change any of the Go code, then you must restart the server for the changes to take effect.
* If you change any of the JavaScript or CSS, then you will need to re-run the `build_client.sh` script in order to re-bundle it into `main.min.js` and `main.min.css`. (This step does not require a server restart, but you will need to do a hard cache refresh in the browser.)
  * Alternatively, if you are actively changing/developing the JavaScript, leave the `watchify.sh` script running and surf to "https://localhost/dev". This way, the code will get automatically Browserified whenever you change a file.

<br />




Install HTTPS (optional)
------------------------

* `sudo apt install letsencrypt -y`
* `letsencrypt certonly --standalone -d hanabi.live -d www.hanabi.live` <br />
(this creates "/etc/letsencrypt/live/hanabi.live/")
* In the `.env` file:
  * Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanabi.live/fullchain.pem`
  * Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanabi.live/privkey.pem`
* `crontab -e`

```
# Every day, keep the Let's Encrypt certificate up to date
0 0 * * * /root/go/src/github.com/Zamiell/hanabi-live/renew_cert.sh
```

<br />



Install as a service (optional)
-------------------------------

* Install Supervisor:
  * `sudo apt install supervisor -y`
* Copy the configuration files:
  * `mkdir -p "/etc/supervisor/conf.d"`
  * `cp "$GOPATH/src/github.com/Zamiell/hanabi-live/install/supervisor/supervisord.conf" "/etc/supervisor/supervisord.conf"`
  * `cp "$GOPATH/src/github.com/Zamiell/hanabi-live/install/supervisor/hanabi-live.conf" "/etc/supervisor/conf.d/hanabi-live.conf"`
* Load the new configuration:
  * `supervisorctl reload`

To manage the service:

* Start it: `supervisorctl start hanabi-live`
* Stop it: `supervisorctl stop hanabi-live`
* Restart it: `supervisorctl restart hanabi-live`
