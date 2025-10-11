# Hanab Live Installation

Like many code projects, we use [linters](<https://en.wikipedia.org/wiki/Lint_(software)>) to ensure that all of the code is written consistently and error-free. Specifically, we use [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/). We ask that all pull requests pass our linting rules.

The following instructions will set up the server as well as the linters. We assume that you will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice code editor. Some adjustments will be needed if you are using a different editor.

<br />

## Table of Contents

1. [Hardware Prerequisites](#hardware-prerequisites)
1. [Installation for Development (Windows)](#installation-for-development-windows)
1. [Installation for Development (MacOS)](#installation-for-development-macos)
1. [Installation for Development/Production (Linux)](#installation-for-developmentproduction-linux)
1. [Running the Server in Development](#running-the-server-in-development)

<br />

## Hardware Prerequisites

Building the client code can be memory intensive. Make sure that your system has at least 2 GB of RAM.

<br />

## Installation for Development (Windows)

- Open a [Command Prompt as an administrator](https://www.howtogeek.com/194041/how-to-open-the-command-prompt-as-administrator-in-windows-8.1/).
- Install [Git](https://git-scm.com/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id Git.Git`
- Install [Golang](https://golang.org/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id GoLang.Go`
- Install [Node.js](https://nodejs.org/en/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id OpenJS.NodeJS.LTS`
- Install [Visual Studio Code](https://code.visualstudio.com/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id Microsoft.VisualStudioCode`
- Install [PostgreSQL v14](https://www.postgresql.org/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id PostgreSQL.PostgreSQL.14`
  - Note that versions other than 14 will probably work fine, if you already have a separate version installed.
- Configure Git (if you do not already have it configured):
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Make it so that PostgreSQL only listens on localhost instead of on all interfaces:
  - `notepad "C:\Program Files\PostgreSQL\14\data\postgresql.conf"`
    - Add a "#" in front of the "listen_addresses" line.
    - Save the file.
  - `net stop postgresql-x64-14`
  - `net start postgresql-x64-14`
- Create a new database and set up a database user:
  - `set PGPASSWORD=postgres`
  - `"C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres`
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
    (replace "1234567890" with a more secure password if you want)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the repository. For example:
    - `git clone git@github.com:[Your_GitHub_Username]/hanabi-live.git`
- Enter the cloned repository:
  - `cd hanabi-live`
- Change from the Windows Command Prompt to Git Bash:
  - `"%PROGRAMFILES%\Git\bin\sh.exe"`
- Install some dependencies:
  - `./install/install_dependencies.sh`
  - `./install/install_development_dependencies.sh`
- Set up environment variables:
  - `notepad .env`
    - Enter a random 128 character alphanumeric string for "SESSION_SECRET".
    - Verify that "DOMAIN" and "DB_PASSWORD" are correct.
    - Save and exit.
- Install the database schema:
  - `./install/install_database_schema.sh`
- Open VSCode using the cloned repository as the project folder:
  - `code .`
- Test the TypeScript linter:
  - On the left pane, navigate to and open "packages/client/src/main.ts".
  - Open the "Problems Pane", if it is not already open. (You can use the "Ctrl + Shift + M" hotkey to do this, or "View" --> "Problems" from the menu.)
  - Add a new line of "test" somewhere and watch as an ESLint warning appears in the bottom pane. (There is no need to save the file.)
- See [Running the Server in Development](#running-the-server-in-development).

<br />

## Installation for Development (MacOS)

- Install the [Homebrew](https://brew.sh/) package manager (if you do not already have it installed):
  - `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- Install [Git](https://git-scm.com/) (if you do not already have it installed):
  - `brew install git`
- Install [Golang](https://golang.org/) (if you do not already have it installed):
  - `brew install golang`
- Install [Node.js](https://nodejs.org/en/) (if you do not already have it installed):
  - `brew install node`
- Install [Visual Studio Code](https://code.visualstudio.com/) (if you do not already have it installed):
  - `brew cask install visual-studio-code`
- Install [PostgreSQL](https://www.postgresql.org/) (if you do not already have it installed):
  - `brew install postgresql`
- Configure Git:
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Enable [launching Visual Studio Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
- Create a new database, and set up a database user:
  - `brew services start postgresql`
  - `psql postgres` <br />
    (on MacOS, there is no password by default)
  - `\password postgres`
  - Enter a secure password for the postgres user. (This is the "master" account that has access to all databases.)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
    (replace "1234567890" with a more secure password if you want)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the repository. For example:
    - `git clone git@github.com:[Your_GitHub_Username]/hanabi-live.git`
- Enter the cloned repository:
  - `cd hanabi-live`
- Install some dependencies:
  - `./install/install_dependencies.sh`
  - `./install/install_development_dependencies.sh`
- Set up environment variables (optional):
  - `open -t .env`
    - Enter a random 128 character alphanumeric string for "SESSION_SECRET".
    - Verify that "DOMAIN" and "DB_PASSWORD" are correct.
    - Save and exit.
- Install the database schema:
  - `./install/install_database_schema.sh`
- Open VSCode using the cloned repository as the project folder:
  - `code .`
- Test the TypeScript linter:
  - On the left pane, navigate to and open "packages/client/src/main.ts".
  - Add a new line of "testing" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
- See [Running the Server in Development](#running-the-server-in-development).

<br />

## Installation for Development/Production (Linux)

These instructions assume you are on Ubuntu 20.04 LTS. Some adjustments may be needed if you are on a different flavor of Linux.

- Make sure the package manager is up to date:
  - `sudo apt update`
  - `sudo apt upgrade -y`
- Install [Git](https://git-scm.com/):
  - `sudo apt install git -y`
- Install [Golang](https://golang.org/):
  - `sudo apt install golang -y`
- Install [PostgreSQL](https://www.postgresql.org/), create a new database, and set up a database user:
  - `sudo apt install postgresql -y` <br />
  - `sudo -u postgres psql` <br />
    (on Linux, there is no default password; you must connect through the "postgres" operating system account)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
    (replace "1234567890" with a secure password)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Install [nvm](https://github.com/nvm-sh/nvm) and [Node.js](https://nodejs.org/en/):
  - `sudo apt install curl -y`
  - `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash`
  - `export NVM_DIR="$HOME/.nvm"`
  - `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  - `[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"`
  - `nvm install node` <br />
    (this installs the latest version)
- Configure Git:
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Clone the server:
  - `cd /root` (or change to the path where you want the code to live; "/root" is recommended)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the repository. For example:
    - `git clone git@github.com:[Your_GitHub_Username]/hanabi-live.git`
- Enter the cloned repository:
  - `cd hanabi-live`
- Install the project dependencies:
  - `./install/install_dependencies.sh`
- Install the project development dependencies (but only in non-production environments):
  - `./install/install_development_dependencies.sh`
- Set up environment variables:
  - `vim .env`
    - Enter a random 128 character alphanumeric string for "SESSION_SECRET".
    - Verify that "DOMAIN" and "DB_PASSWORD" are correct.
    - Save and exit.
- Install the database schema:
  - `./install/install_database_schema.sh`
- If you are in development, see [Running the Server in Development](#running-the-server-in-development).
- If you are in production, see [Running the Server in Production](#running-the-server-in-production).

<br />

## Running the Server in Development

- Open a shell/terminal, if you do not already have one open.
  - On Windows, you should use Git Bash.
- Run the server:
  - `./run.sh`
  - This will run the server forever until you either close the terminal window or cancel it with Ctrl + C.
  - If you are on Windows, you might have to accept a Windows Firewall dialog (because a new program is listening on new ports).
  - If you are on MacOS or Linux, then `sudo` might be necessary to run this script because the server listens on port 80 and/or 443. If you do not want to use `sudo`, then change the port to e.g. 8000 by editing the ".env" file and restarting the server.
- Open a second shell/terminal. (We need to leave the first one open, since it is running the server.)
- Run the TypeScript listener:
  - `./packages/client/esbuild_dev.sh`
  - This will run `esbuild` forever until you either close the terminal window or cancel it with Ctrl + C.
  - `esbuild` will scan for any changes to TypeScript files and automatically update the `main.min.js` file.
- Open a browser and go to: http://localhost/
  - If it does not work or is stuck loading, press F12 to open the JavaScript console for hints as to what went wrong.
- If you update any Golang files, you will have to manually stop and start the server.
- If you update any TypeScript files, you will have to manually refresh the page to pick up the new changes.
- If you update any CSS files, you might also need to run `build_client.sh crit` to re-generate the critical CSS, which is necessary for the content the users see first. The "crit" version takes a long time, but you only need to run it once before committing your changes.
- You can also go to "http://localhost/login=test1" to automatically log in as "test1", "http://localhost/login=test2" to automatically log in as "test2", and so forth. This is useful for testing a bunch of different users in tabs without having to use an incognito window.

<br />

## Running the Server in Production

### Install as a Service (optional)

This assumes that you installed the server to "/root/hanabi-live". If not, you will need to edit the paths in the below commands and edit the contents of the three Supervisor files.

- Install Supervisor and install the service:
  - `./install/install_supervisor.sh`

To manage the service:

- Start it: `supervisorctl start hanabi-live`
- Stop it: `supervisorctl stop hanabi-live`
- Restart it: `supervisorctl restart hanabi-live`

<br />

### Set up `iptables` (Optional)

- `sudo apt install iptables-persistent -y`
- `sudo iptables -A INPUT -p icmp -m state --state NEW,RELATED,ESTABLISHED -j ACCEPT`
- `sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport ssh -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport http -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport https -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport 6432 -s localhost -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport 5432 -s localhost -j ACCEPT`
- `sudo iptables -A INPUT -p tcp --dport 8081 -s localhost -j ACCEPT`
- `sudo iptables -A INPUT -j DROP`
- `sudo iptables-save > /etc/iptables/rules.v4`

<br />

### Set up Automated Database Backups (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

- `crontab -e`

```sh
# Every day, backup the "hanabi" database
0 0 * * * /root/hanabi-live/database_backup.sh
```

<br />

### Set up Secondary Automated Database Backups to Google Drive (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

- Download and compile [gdrive](https://github.com/gdrive-org/gdrive):
  - `go get github.com/prasmussen/gdrive`
- Add it to the path:
  - `export PATH="$PATH:/root/go/bin" && echo >> "~/.bashrc" && echo 'export PATH="$PATH:/root/go/bin"' >> "~/.bashrc"`
- Go to the [Google Drive service account project page](https://console.cloud.google.com/iam-admin/serviceaccounts?project=hanabi-live&folder=&organizationId=&supportedpurview=project).
  - If you are starting fresh, you will have to create a new Google Drive account, create a new service account, and create a new project. For more information, see [this GitHub issue](https://github.com/gdrive-org/gdrive/issues/533).
- Actions --> Create key --> JSON --> Create
- `mkdir -p "~/.gdrive"`
- `vim ~/.gdrive/hanabi-live-c3373cecaf32.json`
  - Paste it in.
- Find the ID of the subdirectory inside of the Google Drive account that you want the file to be uploaded to:
  - `gdrive list --service-account "hanabi-live-c3373cecaf32.json" --max 9999 | grep dir`
- `vim /root/hanabi-live/.env`
  - Fill in the "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH" and "GOOGLE_DRIVE_PARENT_DIRECTORY_ID" fields.

<br />

### Install HTTPS (optional)

Adjust the "certbot" command below according to what domain names you want to register.

- `sudo apt install certbot -y`
- `certbot certonly --standalone -d hanab.live -d www.hanab.live -d hanabi.live -d www.hanabi.live -d fireworks.cards -d www.fireworks.cards` <br />
  (this creates "/etc/letsencrypt/live/hanab.live/")
- In the `.env` file:
  - Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanab.live/fullchain.pem`
  - Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanab.live/privkey.pem`
- `crontab -e`

```sh
# Every day, keep the Let's Encrypt certificate up to date
0 0 * * * /root/hanab-live/renew_cert.sh
```

<br />
