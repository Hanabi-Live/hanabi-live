# Hanabi Live Installation

If you just want to install Hanabi Live without the ability to edit the code, skip to [the production installation section](#installation-for-production-linux).

Like many code projects, we use [linters](https://en.wikipedia.org/wiki/Lint_(software)) to ensure that all of the code is written consistently and error-free. For Golang (the server-side code), we use [golangci-lint](https://github.com/golangci/golangci-lint). For TypeScript (the client-side code), we use [ESLint](https://eslint.org/) and have a configuration based on the [Airbnb style guide](https://github.com/airbnb/javascript). We ask that all pull requests pass our linting rules.

The following instructions will set up the server as well as the linters. We assume that you will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice text editor that happens to be better than [Atom](https://atom.io/), [Notepad++](https://notepad-plus-plus.org/), etc. Some adjustments will be needed if you are using a different editor.

<br />

## Table of Contents

1. [Installation for Development (Windows)](#installation-for-development-windows)
2. [Installation for Development (MacOS)](#installation-for-development-macos)
3. [Installation for Development (Docker)](#installation-for-development-docker)
4. [Installation for Production (Linux)](#installation-for-production-linux)
5. [Running the Server](#running-the-server)
6. [Running the Server in Docker](#running-the-server-in-docker)
7. [Running a Production Docker Image](#running-a-production-docker-image)
<br />

## Installation for Development (Windows)

If you want to install less stuff on your computer, you can alternatively follow the instructions for [Installation for Development (Docker)](#installation-for-development-docker), although this is not recommended.

* Open a [Command Prompt as an administrator](https://www.howtogeek.com/194041/how-to-open-the-command-prompt-as-administrator-in-windows-8.1/).
* Install the [Chocolatey](https://chocolatey.org/) package manager:
  * `@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [MariaDB](https://mariadb.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  * `choco install git golang mariadb nodejs vscode -y`
  * `refreshenv`
* Configure Git:
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global core.autocrlf false` <br />
  (so that Git does not convert LF to CRLF when cloning repositories)
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Configure MariaDB:
  * `mysql -u root`
  * `DELETE FROM mysql.user WHERE User='';` <br />
  (this deletes the anonymous user that is installed by default)
  * `DROP DATABASE IF EXISTS test;` <br />
  (this deletes the test database that is installed by default)
  * `CREATE DATABASE hanabi;`
  * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';`
  * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
  * `FLUSH PRIVILEGES;`
  * `exit`
* Clone the repository:
  * `cd [the path where you want the code to live]` (optional)
  * If you already have an SSH keypair and have the public key attached to your GitHub profile, then use the following command to clone the repostory via SSH:
    * `git clone git@github.com:Zamiell/hanabi-live.git`
  * If you do not already have an SSH keypair, then use the following command to clone the repository via HTTPS:
    * `git clone https://github.com/Zamiell/hanabi-live.git`
  * Or, if you are doing development work, then clone your forked version of the repository. For example:
    * `git clone https://github.com/[Your_Username]/hanabi-live.git`
* Enter the cloned repository:
    * `cd hanabi-live`
* Change from the Windows Command Prompt to Git Bash
  *  `"%PROGRAMFILES%\Git\bin\sh.exe"`
* Install some dependencies:
  * `./install/install_dependencies.sh`
  * `./install/install_development_dependencies.sh`
  * `./install/install_database_schema.sh`
  * `exit`
* Set the domain URL (optional):
  * `notepad .env` <br />
  (if you plan to use a URL of "http://localhost", then do not change anything)
* Open VSCode using the cloned repository as the project folder:
  * `code .`
* In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
* Test the Golang linter:
  * On the left pane, navigate to and open "src\main.go".
  * If you get a popup asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  * Add a new line of "asdf" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  * Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
* Test the TypeScript linter:
  * On the left pane, navigate to and open "public\js\src\main.ts".
  * Add a new line of "asdf" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
* See [Running the Server](#running-the-server).

<br />

## Installation for Development (MacOS)

If you want to install less stuff on your computer, you can alternatively follow the instructions for [Installation for Development (Docker)](#installation-for-development-docker), although this is not recommended.

* Install the [Homebrew](https://brew.sh/) package manager:
  * `/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [MariaDB](https://mariadb.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  * `brew install git golang mariadb node`
  * `brew cask install visual-studio-code`
* Enable [launching Visual Studio Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
* Configure Git:
  * `refreshenv`
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Start MariaDB:
  * `mysql.server start`
* Configure MariaDB:
  * `mysql -u root`
  * `DELETE FROM mysql.user WHERE User='';` <br />
  (this deletes the anonymous user that is installed by default)
  * `DROP DATABASE IF EXISTS test;` <br />
  (this deletes the test database that is installed by default)
  * `CREATE DATABASE hanabi;`
  * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';`
  * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
  * `FLUSH PRIVILEGES;`
  * `exit`
* Clone the repository:
  * `cd [the path where you want the code to live]` (optional)
  * If you already have an SSH keypair and have the public key attached to your GitHub profile, then use the following command to clone the repostory via SSH:
    * `git clone git@github.com:Zamiell/hanabi-live.git`
  * If you do not already have an SSH keypair, then use the following command to clone the repository via HTTPS:
    * `git clone https://github.com/Zamiell/hanabi-live.git`
  * Or, if you are doing development work, then clone your forked version of the repository. For example:
    * `git clone https://github.com/[Your_Username]/hanabi-live.git`
* Enter the cloned repository:
    * `cd hanabi-live`
* Install some dependencies:
  * `./install/install_dependencies.sh`
  * `./install/install_development_dependencies.sh`
  * `./install/install_database_schema.sh`
* Set the domain URL (optional):
  * `open -t .env` <br />
  (if you plan to use a URL of "http://localhost", then do not change anything)
* Open VSCode using the cloned repository as the project folder:
  * `code .`
* In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
* Test the Golang linter:
  * On the left pane, navigate to and open "src\main.go".
  * If you get a popup asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  * Add a new line of "asdf" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  * Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
* Test the TypeScript linter:
  * On the left pane, navigate to and open "public\js\src\main.ts".
  * Add a new line of "asdf" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
* See [Running the Server](#running-the-server).

<br />

## Installation for Development (Docker)

We provide a [docker-compose.yml](../docker-compose.yml) file which runs MariaDB and the Golang backend inside of networked Docker containers.

* [Install Docker](https://docs.docker.com/get-docker/).
* Run `docker-compose up --build` to build and run the server.
  * The database will be automatically initialized when the server is first run, and will persist in a local directory called `mysql_data`.
* Run `webpack-dev-server.sh`, as above, to build the frontend.
* Visit "http://localhost:8081/dev".

<br />

## Installation for Production (Linux)

These instructions assume you are running Ubuntu 18.04.1 LTS. Some adjustments may be needed if you are on a different flavor of Linux.

* Install [Golang](https://golang.org/):
  * `sudo apt update`
  * `sudo apt upgrade -y`
  * `sudo apt install software-properties-common -y`
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
    * Note that even if you change the root password, if you are the root user, MariaDB will not prompt you for a password. This is because [it uses the `unix_socket` authentication plugin](https://mariadb.com/kb/en/authentication-from-mariadb-104/) by default.
* Install [nvm](https://github.com/nvm-sh/nvm) and [Node.js](https://nodejs.org/en/):
  * `sudo apt install curl -y`
  * `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash`
  * `export NVM_DIR="$HOME/.nvm"`
  * `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  * `[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"`
  * `nvm install node` <br />
  (this installs the latest version)
* Clone the server:
  * `sudo apt install git -y`
  * `cd /root` (or change to the path where you want the code to live; "/root" is recommended)
  * If you already have an SSH keypair and have the public key attached to your GitHub profile, then use the following command to clone the repostory via SSH:
    * `git clone git@github.com:Zamiell/hanabi-live.git`
  * If you do not already have an SSH keypair, then use the following command to clone the repository via HTTPS:
    * `git clone https://github.com/Zamiell/hanabi-live.git`
  * `cd hanabi-live`
* Install the project dependencies:
  * `./install/install_dependencies.sh`
* Set up environment variables:
  * `nano .env`
    * Fill in the values accordingly. The most important one is "DOMAIN" - this must match the URL that the user types in to their browser.
* Set up a database user and import the database schema:
  * `sudo mysql -u root -p`
    * `CREATE DATABASE hanabi;`
    * `CREATE USER 'hanabiuser'@'localhost' IDENTIFIED BY '1234567890';` <br />
    (change the username and password to the values that you specified in the ".env" file)
    * `GRANT ALL PRIVILEGES ON hanabi.* to 'hanabiuser'@'localhost';`
    * `FLUSH PRIVILEGES;`
    * `exit`
  * `./install/install_database_schema.sh`
* See [Running the Server](#running-the-server).

<br />

#### Set up iptables (optional)

* `sudo apt install iptables-persistent -y`
* `sudo iptables -A INPUT -p icmp -m state --state NEW,RELATED,ESTABLISHED -j ACCEPT`
* `sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport ssh -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport http -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport https -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport 3306 -s localhost -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport 8081 -s localhost -j ACCEPT`
* `sudo iptables -A INPUT -j DROP`
* `sudo iptables-save > /etc/iptables/rules.v4`

<br />

#### Set up Automated Database Backups (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

* `crontab -e`

```
# Every day, backup the "hanabi" database
0 0 * * * /root/hanabi-live/make_database_dump.sh
```

<br />

#### Install HTTPS (optional)

This assumes that your domain names are "hanabi.live" and "www.hanabi.live". It also assumes that you installed the server to "/root/hanabi-live". Adjust if needed.

* `sudo apt update`
* `sudo apt install software-properties-common -y`
* `sudo add-apt-repository universe`
* `sudo add-apt-repository ppa:certbot/certbot`
* `sudo apt update`
* `sudo apt install certbot -y`
* `certbot certonly --standalone -d hanabi.live -d www.hanabi.live` <br />
  (this creates "/etc/letsencrypt/live/hanabi.live/")
* In the `.env` file:
  * Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanabi.live/fullchain.pem`
  * Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanabi.live/privkey.pem`
* `crontab -e`

```
# Every day, keep the Let's Encrypt certificate up to date
0 0 * * * /root/hanabi-live/renew_cert.sh
```

<br />

#### Install as a service (optional)

This assumes that you installed the server to "/root/hanabi-live". If not, you will need to edit the paths in the below commands and edit the contents of the three Supervisor files.

* Install Supervisor:
  * `sudo apt install python-pip -y`
  * `pip install supervisor`
  * `mkdir -p /etc/supervisor/conf.d`
  * `mkdir -p /var/log/supervisor`
* Copy the configuration files:
  * `cp "/root/hanabi-live/install/supervisor/supervisord.conf" "/etc/supervisor/supervisord.conf"`
  * `cp "/root/hanabi-live/install/supervisor/hanabi-live.conf" "/etc/supervisor/conf.d/hanabi-live.conf"`
  * `cp "/root/hanabi-live/install/supervisor/supervisord.service" "/etc/systemd/system/supervisord.service"`
* Start it:
  * `systemctl daemon-reload`
  * `systemctl start supervisord`
* Load the new configuration:
  * `supervisorctl reload`

To manage the service:

* Start it: `supervisorctl start hanabi-live`
* Stop it: `supervisorctl stop hanabi-live`
* Restart it: `supervisorctl restart hanabi-live`

<br />

## Running the Server

* The "run.sh" script in the root of the repository will build and run the server.
  * If you are on Windows, you should run this script from a Git Bash window.
  * If you are on Windows, you might have to accept a Windows Firewall dialog (because a new program is listening on new ports).
  * If you are on MacOS or Linux, then `sudo` might be necessary to run this script because the server listens on port 80 and/or 443.
* If you change any of the Golang code, then you must restart the server for the changes to take effect.
* If you change any of the TypeScript or CSS, then you will need to re-run the `build_client.sh` script in order to re-bundle it into `main.min.js` and `main.min.css`. (This step does not require a server restart, but you will need to perform a hard cache refresh in the browser.)
  * Alternatively, if you are actively changing or developing the TypeScript, leave the `webpack-dev-server.sh` script running and go to "https://localhost/dev". This way, the code will be automatically compiled whenever you change a file and the page will automatically refresh.

## Running a Production Docker Image

We provide a [docker-compose.yml](../docker/docker-compose.yml) file which runs mariadb, the backend and static files inside a docker container. 

* [Install Docker](https://docs.docker.com/get-docker/)
* Clone this repository into some directory. 
* Copy `docker/.env_template` to `docker/.env` and adjust the file according to your setup. 
* cd into the `docker` directory and run `docker-compose up --build -d` to build and then start the docker containers in the background.
  * The database data will automatically persist inside a dedicated volume.
  * If you restart your server, the docker containers will automatically restart. 
  * To stop the containers, use `docker-compose down`. This will not delete the database volume. 
