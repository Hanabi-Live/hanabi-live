# Hanab Live Installation

If you just want to install the website without the ability to edit the code, skip to [the production installation section](#installation-for-production-linux).

Like many code projects, we use [linters](https://en.wikipedia.org/wiki/Lint_(software)) to ensure that all of the code is written consistently and error-free. For Golang (the server-side code), we use [golangci-lint](https://github.com/golangci/golangci-lint). For TypeScript (the client-side code), we use [ESLint](https://eslint.org/) and have a configuration based on the [Airbnb style guide](https://github.com/airbnb/javascript). We ask that all pull requests pass our linting rules.

The following instructions will set up the server as well as the linters. We assume that you will be using Microsoft's [Visual Studio Code](https://code.visualstudio.com/), which is a very nice text editor that happens to be better than [Atom](https://atom.io/), [Notepad++](https://notepad-plus-plus.org/), etc. Some adjustments will be needed if you are using a different editor.

<br />

## Table of Contents

1. [Hardware Prerequisites](#hardware-prerequisites)
1. [Installation for Development (Windows)](#installation-for-development-windows)
1. [Installation for Development (MacOS)](#installation-for-development-macos)
1. [Installation for Production (Linux)](#installation-for-production-linux)
1. [Running the Server](#running-the-server)

<br />

## Hardware Prerequisites

Building the client code can be memory intensive. Make sure that your system has at least 2 GB of RAM.

<br />

## Installation for Development (Windows)

- Open a [Command Prompt as an administrator](https://www.howtogeek.com/194041/how-to-open-the-command-prompt-as-administrator-in-windows-8.1/).
- Install the [Chocolatey](https://chocolatey.org/) package manager:
  - `@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"`
- Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  - `choco install git golang nodejs vscode -y`
- Configure Git:
  - `refreshenv`
  - `git config --global user.name "Your_Username"`
  - `git config --global user.email "your@email.com"`
  - `git config --global core.autocrlf false` <br />
  (so that Git does not convert LF to CRLF when cloning repositories)
  - `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
- Install [PostgreSQL](https://www.postgresql.org/):
  - Manually download it and install it. (Don't use `choco`, because the package is bugged.)
  - Check to see if `psql` works. If not, you'll have to [manually add it to your PATH variable](https://www.architectryan.com/2018/03/17/add-to-the-path-on-windows-10/).
- Make it so that PostgreSQL only listens on localhost instead of on all interfaces:
  - `notepad "C:\Program Files\PostgreSQL\13\data\postgresql.conf"`
    - Add a "#" in front of the "listen_addresses" line.
  - `net stop postgresql-x64-13`
  - `net start postgresql-x64-13`
- Create a new database and set up a database user:
  - `refreshenv`
  - `psql -U postgres`
  - Enter the password for the "postgres" user that you created during the installation wizard.
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Zamiell/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Zamiell/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the repository. For example:
    - `git clone https://github.com/[Your_Username]/hanabi-live.git`
- Enter the cloned repository:
    - `cd hanabi-live`
- Change from the Windows Command Prompt to Git Bash
  -  `"%PROGRAMFILES%\Git\bin\sh.exe"`
- Install some dependencies:
  - `./install/install_dependencies.sh`
  - `./install/install_development_dependencies.sh`
  - `exit`
- Set up environment variables (optional):
  - `notepad .env` <br />
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
- Install the database schema:
  - `./install/install_database_schema.sh`
- Open VSCode using the cloned repository as the project folder:
  - `code .`
- In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
- Test the Golang linter:
  - On the left pane, navigate to and open "src\main.go".
  - If you get a pop-up asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  - Add a new line of "test" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  - Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
- Test the TypeScript linter:
  - On the left pane, navigate to and open "public\js\src\main.ts".
  - Add a new line of "test" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
- See [Running the Server](#running-the-server).

<br />

## Installation for Development (MacOS)

- Install the [Homebrew](https://brew.sh/) package manager:
  - `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"`
- Install [Git](https://git-scm.com/), [Golang](https://golang.org/), [Node.js](https://nodejs.org/en/), and [Visual Studio Code](https://code.visualstudio.com/):
  - `brew install git golang node`
  - `brew cask install visual-studio-code`
- Configure Git:
  - `git config --global user.name "Your_Username"`
  - `git config --global user.email "your@email.com"`
  - `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
- Enable [launching Visual Studio Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
- Install [PostgreSQL](https://www.postgresql.org/), create a new database, and set up a database user:
  - `brew install postgresql`
  - `brew services start postgresql`
  - `psql postgres` <br />
  (on MacOS, there is no password by default)
  - `\password postgres`
  - Enter a secure password for the postgres user. (This is the "master" account that has access to all databases.)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Zamiell/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Zamiell/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the repository. For example:
    - `git clone https://github.com/[Your_Username]/hanabi-live.git`
- Enter the cloned repository:
  - `cd hanabi-live`
- Install some dependencies:
  - `./install/install_dependencies.sh`
  - `./install/install_development_dependencies.sh`
- Set up environment variables (optional):
  - `open -t .env` <br />
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
- Install the database schema:
  - `./install/install_database_schema.sh`
- Open VSCode using the cloned repository as the project folder:
  - `code .`
- In the bottom-right-hand corner, click on "Analysis Tools Missing" and then on "Install". You will know that it has finished once it displays: "All tools successfully installed."
- Test the Golang linter:
  - On the left pane, navigate to and open "src\main.go".
  - If you get a pop-up asking to use any experimental features (e.g. gopls), ignore it and/or do not allow it to proceed.
  - Add a new line of "testing" somewhere, save the file, and watch as some "Problems" appear in the bottom pane.
  - Add a blank line somewhere, save the file, and watch as the blank line is automatically removed (because VSCode will automatically run the "goimports" tool every time you save a file).
- Test the TypeScript linter:
  - On the left pane, navigate to and open "public\js\src\main.ts".
  - Add a new line of "testing" somewhere and watch as some "Problems" appear in the bottom pane. (There is no need to save the file.)
- See [Running the Server](#running-the-server).

<br />

## Installation for Production (Linux)

These instructions assume you are running Ubuntu 20.04 LTS. Some adjustments may be needed if you are on a different flavor of Linux.

- Make sure the package manager is up to date:
  - `sudo apt update`
  - `sudo apt upgrade -y`
- Install and configure [Git](https://git-scm.com/):
  - `sudo apt install git -y`
  - `git config --global user.name "Your_Username"`
  - `git config --global user.email "your@email.com"`
  - `git config --global pull.rebase true` <br />
  (so that Git automatically rebases when pulling)
- Install [Golang](https://golang.org/):
  - `wget https://golang.org/dl/go1.16.linux-amd64.tar.gz`
  - `tar -xvf go1.16.linux-amd64.tar.gz`
  - `sudo ln -s $HOME/go/bin/go /usr/local/bin`
- Install [PostgreSQL](https://www.postgresql.org/), create a new database, and set up a database user:
  - `sudo apt install postgresql -y` <br />
  - `sudo -u postgres psql` <br />
  (on Linux, there is no default password; you must connect through the "postgres" operating system account)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br />
  (replace "1234567890" with a secure password)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT USAGE ON SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hanabiuser;`
  - `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hanabiuser;`
  - `\q`
- Install [nvm](https://github.com/nvm-sh/nvm) and [Node.js](https://nodejs.org/en/):
  - `sudo apt install curl -y`
  - `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash`
  - `export NVM_DIR="$HOME/.nvm"`
  - `[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
  - `[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"`
  - `nvm install node` <br />
  (this installs the latest version)
- Clone the server:
  - `cd /root` (or change to the path where you want the code to live; "/root" is recommended)
  - If you already have an SSH key pair and have the public key attached to your GitHub profile, then use the following command to clone the repository via SSH:
    - `git clone git@github.com:Zamiell/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command to clone the repository via HTTPS:
    - `git clone https://github.com/Zamiell/hanabi-live.git`
  - `cd hanabi-live`
- Install the project dependencies:
  - `./install/install_dependencies.sh`
- Set up environment variables:
  - `nano .env`
  (the two important ones to verify are "DOMAIN" and "DB_PASS")
- Install the database schema:
  - `./install/install_database_schema.sh`
- See [Running the Server](#running-the-server).

<br />

#### Set up iptables (optional)

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

#### Install as a service (optional)

This assumes that you installed the server to "/root/hanabi-live". If not, you will need to edit the paths in the below commands and edit the contents of the three Supervisor files.

- Install Supervisor and install the service:
  - `./install/install_supervisor.sh`

To manage the service:

- Start it: `supervisorctl start hanabi-live`
- Stop it: `supervisorctl stop hanabi-live`
- Restart it: `supervisorctl restart hanabi-live`

<br />

#### Set up Automated Database Backups (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

- `crontab -e`

```
# Every day, backup the "hanabi" database
0 0 * * * /root/hanabi-live/database_backup.sh
```

<br />

#### Set up Secondary Automated Database Backups to Google Drive (optional)

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

#### Install HTTPS (optional)

Adjust the "certbot" command below according to what domain names you want to register.

- `sudo apt install certbot -y`
- `certbot certonly --standalone -d hanab.live -d www.hanab.live -d hanabi.live -d www.hanabi.live -d fireworks.cards -d www.fireworks.cards` <br />
  (this creates "/etc/letsencrypt/live/hanab.live/")
- In the `.env` file:
  - Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanab.live/fullchain.pem`
  - Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanab.live/privkey.pem`
- `crontab -e`

```
# Every day, keep the Let's Encrypt certificate up to date
0 0 * * * /root/hanab-live/renew_cert.sh
```

<br />

## Running the Server

- The "run.sh" script in the root of the repository will build and run the server.
  - If you are on Windows, you should run this script from a Git Bash window.
  - If you are on Windows, you might have to accept a Windows Firewall dialog (because a new program is listening on new ports).
  - If you are on MacOS or Linux, then `sudo` might be necessary to run this script because the server listens on port 80 and/or 443. If you don't want to use `sudo`, then change the port to e.g. 8000 by editing the ".env" file and restarting the server.
- Once the server is running, you can go to "http://localhost/" to view the site.
  - By default, the server runs on port 80 (the default HTTP port).
  - Viewing the page will only work if the prerequisites were installed properly, which is covered previously in this document.
  - If it does not work or is stuck loading, look at the JavaScript console for hints as to what went wrong.
- If you change any of the Golang code, then you must restart the server for the changes to take effect.
- If you change any of the TypeScript or CSS, then you will need to re-run the `build_client.sh` script in order to re-bundle it into `main.min.js` and `main.min.css`. (This step does not require a server restart, but you will need to perform a hard cache refresh in the browser.)
  - Alternatively, if you are actively changing or developing TypeScript code, leave the `webpack-dev-server.sh` script running and go to "http://localhost/?dev". That way, the code will be automatically compiled whenever you change a file, and the page will automatically refresh.
  - You can also go to "http://localhost/?dev&login=test1" to automatically log in as "test1", "http://localhost/?dev&login=test2" to automatically log in as "test2", and so forth. This is useful for testing a bunch of different users in tabs without having to use an incognito window.
- If you change any CSS, you might also need to run `build_client.sh crit` to re-generate the critical CSS, which is necessary for the content the users see first. The "crit" version takes longer than `build_client.sh`, so you only need to run it once before committing your changes.
