# Hanabi Live Installation

If you just want to install Hanabi Live without the ability to edit the code, skip to [the production installation section](#installation-for-production-linux).

Like many code projects, we use [linters](https://en.wikipedia.org/wiki/Lint_(software)) to ensure that all of the code is written consistently and error-free. For Golang (the server-side code), we use [golangci-lint](https://github.com/golangci/golangci-lint). For TypeScript (the client-side code), we use [ESLint](https://eslint.org/) and have a configuration based on the [Airbnb style guide](https://github.com/airbnb/javascript). We ask that all pull requests pass our linting rules.

The following instructions will set up the server as well as the linters. We assume that you will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice text editor that happens to be better than [Atom](https://atom.io/), [Notepad++](https://notepad-plus-plus.org/), etc. Some adjustments will be needed if you are using a different editor.

<br />

## Table of Contents

1. [Hardware Prerequisites](#hardware-prerequisites)
2. [Installation for Development (Windows)](#installation-for-development-windows)
3. [Installation for Development (MacOS)](#installation-for-development-macos)
4. [Installation for Development (Docker)](#installation-for-development-docker)
5. [Installation for Production (Linux)](#installation-for-production-linux)
6. [Running the Server](#running-the-server)

<br />

## Hardware Prerequisites

Building the client code can be memory intensive. Make sure that your system has at least 2 GB of RAM.

<br />

## Installation for Development (Windows)

If you want to install less stuff on your computer, you can alternatively follow the instructions for [Installation for Development (Docker)](#installation-for-development-docker), although this is not recommended.

* Open a [Command Prompt as an administrator](https://www.howtogeek.com/194041/how-to-open-the-command-prompt-as-administrator-in-windows-8.1/).
* Install the [Chocolatey](https://chocolatey.org/) package manager:
  * `@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  * `choco install git golang nodejs vscode -y`
* Configure Git:
  * `refreshenv`
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global core.autocrlf false` <br />
  (so that Git does not convert LF to CRLF when cloning repositories)
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Install [PostgreSQL](https://www.postgresql.org/):
  * `choco install postgresql -y --params '/Password 1234567890'` <br />
  (replace "1234567890" with a more secure password, or remove the `--params '/Password 1234567890'` if you want it to generate a random password, which will be displayed in the post-installation output)
* Make it so that PostgreSQL only listens on localhost instead of on all interfaces:
  * `notepad "C:\Program Files\PostgreSQL\12\data\postgresql.conf"`
    * Add a "#" in front of the "listen_addresses" line.
  * `net stop postgresql-x64-12`
  * `net start postgresql-x64-12`
* Create a new database and set up a database user:
  * `refreshenv`
  * `psql -U postgres`
  * Enter the password for the "postgres" user that you created in the previous step.
  * `CREATE DATABASE hanabi;`
  * `\c hanabi`
  * `CREATE EXTENSION IF NOT EXISTS citext;` <br />
  (this [allows "UNIQUE" constraints to be case-insensitive](http://shuber.io/case-insensitive-unique-constraints-in-postgres/) if needed)
  * `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  * `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  * `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  * `\q`
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
  * `exit`
* Set up environment variables (optional):
  * `notepad .env` <br />
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
* Install the database schema:
  * `./install/install_database_schema.sh`
* Open VSCode using the cloned repository as the project folder:
  * `code .`
* In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
* Test the Golang linter:
  * On the left pane, navigate to and open "src\main.go".
  * If you get a popup asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  * Add a new line of "test" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  * Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
* Test the TypeScript linter:
  * On the left pane, navigate to and open "public\js\src\main.ts".
  * Add a new line of "test" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
* See [Running the Server](#running-the-server).

<br />

## Installation for Development (MacOS)

If you want to install less stuff on your computer, you can alternatively follow the instructions for [Installation for Development (Docker)](#installation-for-development-docker), although this is not recommended.

* Install the [Homebrew](https://brew.sh/) package manager:
  * `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"`
* Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  * `brew install git golang node`
  * `brew cask install visual-studio-code`
* Configure Git:
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Enable [launching Visual Studio Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
* Install [PostgreSQL](https://www.postgresql.org/), create a new database, and set up a database user:
  * `brew install postgresql`
  * `brew services start postgresql`
  * `psql postgres` <br />
  (on MacOS, there is no password by default)
  * `\password postgres`
  * Enter a secure password for the postgres user. (This is the "master" account that has access to all databases.)
  * `CREATE DATABASE hanabi;`
  * `\c hanabi`
  * `CREATE EXTENSION IF NOT EXISTS citext;` <br />
  (this [allows "UNIQUE" constraints to be case-insensitive](http://shuber.io/case-insensitive-unique-constraints-in-postgres/) if needed)
  * `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  * `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  * `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  * `\q`
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
* Set up environment variables (optional):
  * `open -t .env` <br />
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
* Install the database schema:
  * `./install/install_database_schema.sh`
* Open VSCode using the cloned repository as the project folder:
  * `code .`
* In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
* Test the Golang linter:
  * On the left pane, navigate to and open "src\main.go".
  * If you get a popup asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  * Add a new line of "testing" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  * Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
* Test the TypeScript linter:
  * On the left pane, navigate to and open "public\js\src\main.ts".
  * Add a new line of "testing" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
* See [Running the Server](#running-the-server).

<br />

## Installation for Development (Docker)

Docker is **not supported** as an official installation method. However, we provide a [docker-compose.yml](../docker-compose.yml) file which runs PostgreSQL and the Golang backend inside of networked Docker containers, if you so choose.

* [Install Docker](https://docs.docker.com/get-docker/).
* Run `docker-compose up --build` to build and run the server.
  * The database will be automatically initialized when the server is first run, and will persist in a local directory called `mysql_data`.
* Run `webpack-dev-server.sh`, as above, to build the frontend.
* Visit "http://localhost:8081/dev".

<br />

## Installation for Production (Linux)

These instructions assume you are running Ubuntu 18.04.1 LTS. Some adjustments may be needed if you are on a different flavor of Linux.

* Make sure the package manager is up to date:
  * `sudo apt update`
  * `sudo apt upgrade -y`
* Install and configure [Git](https://git-scm.com/):
  * `sudo apt install git -y`
  * `git config --global user.name "Your_Username"`
  * `git config --global user.email "your@email.com"`
  * `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
* Install and configure [Golang](https://golang.org/):
  * `sudo apt install software-properties-common -y`
  * `sudo add-apt-repository ppa:longsleep/golang-backports` <br />
  (if we do not use the custom repository, the package manager will install a version of Golang that is very old)
  * `sudo apt update`
  * `sudo apt install golang-go -y`
  * `mkdir "$HOME/go"`
  * `export GOPATH=$HOME/go && echo 'export GOPATH=$HOME/go' >> ~/.profile`
  * `export PATH=$PATH:$GOPATH/bin && echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.profile`
* Install [PostgreSQL](https://www.postgresql.org/), create a new database, and set up a database user:
  * `sudo apt install postgresql postgresql-contrib -y` <br />
  * `sudo -u postgres psql` <br />
  (on Linux, there is no default password; you must connect through the "postgres" operating system account)
  * `CREATE DATABASE hanabi;`
  * `\c hanabi`
  * `CREATE EXTENSION IF NOT EXISTS citext;` <br />
  (this [allows "UNIQUE" constraints to be case-insensitive](http://shuber.io/case-insensitive-unique-constraints-in-postgres/) if needed)
  * `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  * `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  * `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  * `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  * `\q`
* Install [nvm](https://github.com/nvm-sh/nvm) and [Node.js](https://nodejs.org/en/):
  * `sudo apt install curl -y`
  * `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash`
  * `export NVM_DIR="$HOME/.nvm"`
  * `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  * `[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"`
  * `nvm install node` <br />
  (this installs the latest version)
* Clone the server:
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
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
* Install the database schema:
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
* `sudo iptables -A INPUT -p tcp --dport 5432 -s localhost -j ACCEPT`
* `sudo iptables -A INPUT -p tcp --dport 8081 -s localhost -j ACCEPT`
* `sudo iptables -A INPUT -j DROP`
* `sudo iptables-save > /etc/iptables/rules.v4`

<br />

#### Set up Automated Database Backups (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

* `crontab -e`

```
# Every day, backup the "hanabi" database
0 0 * * * /root/hanabi-live/database_backup.sh
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
