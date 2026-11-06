# Hanab Live Installation

Like many code projects, we use
[linters](<https://en.wikipedia.org/wiki/Lint_(software)>) to ensure that all of
the code is written consistently and error-free. Specifically, we use
[ESLint](https://eslint.org/) and [Prettier](https://prettier.io/). We ask that
all pull requests pass our linting rules.

The following instructions will set up the server as well as the linters. We
assume that you will be using Microsoft's
[Visual Studio Code](https://code.visualstudio.com/), which is a very nice code
editor. Some adjustments will be needed if you are using a different editor.

<br />

## Table of Contents

1. [Hardware Prerequisites](#hardware-prerequisites)
1. [JavaScript Tooling](#javascript-tooling)
1. [Installation for Development (Windows)](#installation-for-development-windows)
1. [Installation for Development (MacOS)](#installation-for-development-macos)
1. [Installation for Development/Production (Linux)](#installation-for-developmentproduction-linux)
1. [Installation for Development (Nix)](#installation-for-development-nix)
1. [Running the Server in Development](#running-the-server-in-development)

<br />

## Hardware Prerequisites

Building the client code can be memory intensive. Make sure that your system has
at least 2 GB of RAM.

<br />

## JavaScript Tooling

Bun manages JavaScript dependencies and runs the JavaScript tools;
`package.json` pins its version and `bun.lock` pins the dependency graph. From
the repository root:

```sh
bun install --frozen-lockfile
bun run build-client
bun run test
bash lint.sh
```

`bun run test` prepares the Go/Rust process-test backends when a disposable
`HANABI_TEST_DATABASE_URL` is supplied, then runs the migrated suites with
native Bun tests and per-file isolation. For a focused unit test, use
`bun test --isolate --tsconfig-override tsconfig.monorepo.json PATH`. Use
`bunx --bun --no-install` for installed tools so checks cannot silently download
unlocked versions. External versions are centralized in the root
`workspaces.catalog`; manifests use `catalog:` for these dependencies and
`workspace:*` for local packages. To change a version, edit its catalog entry,
run `bun install`, and commit the manifest and lockfile. `bun run update` honors
the existing version locks and update cooldown. Dependency lifecycle scripts are
restricted to the explicit `trustedDependencies` list.

`bunfig.toml` disables automatic `.env` loading. The migrated lockfile's
`configVersion: 0` retains hoisted installs, including with workspaces, without
an explicit linker setting. The Nix shell and CI use the same pinned Bun
version; Docker verifies its Bun image against the manifest pin.

<br />

## Installation for Development (Windows)

- Open a
  [Command Prompt as an administrator](https://www.howtogeek.com/194041/how-to-open-the-command-prompt-as-administrator-in-windows-8.1/).
- Install [Git](https://git-scm.com/) (if you do not already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id Git.Git`
- Install [Golang](https://golang.org/) 1.27 or newer:
  - `winget install --accept-source-agreements --silent --exact --id GoLang.Go`
- Install [Bun](https://bun.sh/) at the version pinned in `package.json`:
  - `winget install --exact --id Oven-sh.Bun --version 1.4.4`
- Install [Visual Studio Code](https://code.visualstudio.com/) (if you do not
  already have it installed):
  - `winget install --accept-source-agreements --silent --exact --id Microsoft.VisualStudioCode`
- Install [PostgreSQL](https://www.postgresql.org/) (if you do not already have
  it installed).
  - You should use the latest version, which is not available on `winget`, so
    you have to download the installer manually. (Older versions will probably
    work fine too, if you already have an older version installed.)
- Configure Git (if you do not already have it configured):
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Make it so that PostgreSQL only listens on "localhost" instead of on all
  interfaces:
  - `notepad "C:\Program Files\PostgreSQL\18\data\postgresql.conf"`
    - Add a "#" in front of the "listen_addresses" line.
    - Save the file.
  - `net stop postgresql-x64-18`
  - `net start postgresql-x64-18`
- Create a new database and set up a database user:
  - `set PGPASSWORD=1234567890` <br /> (replace "1234567890" with the root
    password that you entered when installing PostgreSQL)
  - `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres`
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br /> (replace
    "1234567890" with a more secure password if you want)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your
    GitHub profile, then use the following command to clone the repository via
    SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command
    to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the
    repository. For example:
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
  - Open the "Problems Pane", if it is not already open. (You can use the
    "Ctrl + Shift + M" hotkey to do this, or "View" --> "Problems" from the
    menu.)
  - Add a new line of "test" somewhere and watch as an ESLint warning appears in
    the bottom pane. (There is no need to save the file.)
- See [Running the Server in Development](#running-the-server-in-development).

<br />

## Installation for Development (MacOS)

- Install the [Homebrew](https://brew.sh/) package manager (if you do not
  already have it installed):
  - `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- Install [Git](https://git-scm.com/) (if you do not already have it installed):
  - `brew install git`
- Install [Golang](https://golang.org/) 1.27 or newer:
  - `brew install golang`
- Install [Bun](https://bun.sh/) at the version pinned in `package.json`:
  - `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"`
  - `export PATH="$HOME/.bun/bin:$PATH"`
- Install [Visual Studio Code](https://code.visualstudio.com/) (if you do not
  already have it installed):
  - `brew cask install visual-studio-code`
- Install [PostgreSQL](https://www.postgresql.org/) (if you do not already have
  it installed):
  - `brew install postgresql`
- Configure Git:
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Enable
  [launching Visual Studio Code from the command line](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line).
- Create a new database, and set up a database user:
  - `brew services start postgresql`
  - `psql postgres` <br /> (on MacOS, there is no password by default)
  - `\password postgres`
  - Enter a secure password for the postgres user. (This is the "master" account
    that has access to all databases.)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br /> (replace
    "1234567890" with a more secure password if you want)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Clone the repository:
  - `cd [the path where you want the code to live]` (optional)
  - If you already have an SSH key pair and have the public key attached to your
    GitHub profile, then use the following command to clone the repository via
    SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command
    to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the
    repository. For example:
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
  - Add a new line of "testing" somewhere and watch as some "Problems" appear in
    the bottom pane. (There is no need to save the file.)
- See [Running the Server in Development](#running-the-server-in-development).

<br />

## Installation for Development/Production (Linux)

These instructions assume you are on Ubuntu 20.04 LTS. Some adjustments may be
needed if you are on a different flavor of Linux.

- Make sure the package manager is up to date:
  - `sudo apt update`
  - `sudo apt upgrade -y`
- Install [Git](https://git-scm.com/):
  - `sudo apt install git -y`
- Install [Golang](https://golang.org/) 1.27 or newer:
  - `sudo apt install golang -y`
  - If the packaged version is older, use the
    [official installer](https://go.dev/doc/install).
- Install [PostgreSQL](https://www.postgresql.org/), create a new database, and
  set up a database user:
  - `sudo apt install postgresql -y` <br />
  - `sudo -u postgres psql` <br /> (on Linux, there is no default password; you
    must connect through the "postgres" operating system account)
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';` <br /> (replace
    "1234567890" with a secure password)
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- Install [Bun](https://bun.sh/) at the version pinned in `package.json`:
  - `sudo apt install unzip -y`
  - `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"`
  - `export PATH="$HOME/.bun/bin:$PATH"`
- Configure Git:
  - `git config --global user.name "Your_GitHub_Username"`
  - `git config --global user.email "your@email.com"`
- Clone the server:
  - `cd /root` (or change to the path where you want the code to live; "/root"
    is recommended)
  - If you already have an SSH key pair and have the public key attached to your
    GitHub profile, then use the following command to clone the repository via
    SSH:
    - `git clone git@github.com:Hanabi-Live/hanabi-live.git`
  - If you do not already have an SSH key pair, then use the following command
    to clone the repository via HTTPS:
    - `git clone https://github.com/Hanabi-Live/hanabi-live.git`
  - Or, if you are doing development work, then clone your forked version of the
    repository. For example:
    - `git clone git@github.com:[Your_GitHub_Username]/hanabi-live.git`
- Enter the cloned repository:
  - `cd hanabi-live`
- Install the project dependencies:
  - `./install/install_dependencies.sh`
- Install the project development dependencies (but only in non-production
  environments):
  - `./install/install_development_dependencies.sh`
- Set up environment variables:
  - `vim .env`
    - Enter a random 128 character alphanumeric string for "SESSION_SECRET".
    - Verify that "DOMAIN" and "DB_PASSWORD" are correct.
    - Save and exit.
- Install the database schema:
  - `./install/install_database_schema.sh`
- If you are in development, see
  [Running the Server in Development](#running-the-server-in-development).
- If you are in production, see
  [Running the Server in Production](#running-the-server-in-production).

<br />

## Installation for Development (Nix)

If you use [Nix](https://nixos.org/) (for example on NixOS or on macOS with
nix-darwin), you can use the provided `flake.nix` file to set up a development
environment with all of the necessary dependencies (including Go, PostgreSQL,
Redis, and Bun).

- Install Nix (if you do not already have it installed):
  - `curl -L https://nixos.org/nix/install | sh`
- Enable Flakes by adding the following to your Nix configuration (e.g.
  `~/.config/nix/nix.conf`):
  - `experimental-features = nix-command flakes`
- Enter the development shell:
  - `nix develop`
- (Optional, recommended) If you also use [direnv](https://direnv.net/), copy
  the example file and then allow it:
  - `cp .envrc.nix.example .envrc`
  - `direnv allow`
- This keeps Nix + direnv opt-in:
  - Nix users do not have to use direnv.
  - direnv users do not have to use Nix.
- Once you are in the development shell, the environment variables for
  PostgreSQL and Redis will be set up automatically. The database files will be
  stored in the `.direnv` directory.
- Follow the instructions in the shell hook to start the services and the
  development server.

<br />

## Running the Server in Development

- Open a shell/terminal, if you do not already have one open.
  - On Windows, you should use Git Bash.
- Run the server:
  - `./run.sh`
  - This will run the server forever until you either close the terminal window
    or cancel it with Ctrl + C.
  - If you are on Windows, you might have to accept a Windows Firewall dialog
    (because a new program is listening on new ports).
  - If you are on MacOS or Linux, then `sudo` might be necessary to run this
    script because the server listens on port 80 and/or 443. If you do not want
    to use `sudo`, then change the port to e.g. 8000 by editing the ".env" file
    and restarting the server.
- Open a second shell/terminal. (We need to leave the first one open, since it
  is running the server.)
- Run the TypeScript listener:
  - `./packages/client/esbuild_dev.sh`
  - This will run `esbuild` forever until you either close the terminal window
    or cancel it with Ctrl + C.
  - `esbuild` will scan for any changes to TypeScript files and automatically
    update the `main.min.js` file.
- Open a browser and go to: http://localhost/
  - If it does not work or is stuck loading, press F12 to open the JavaScript
    console for hints as to what went wrong.
- If you update any Golang files, you will have to manually stop and start the
  server.
- If you update any TypeScript files, you will have to manually refresh the page
  to pick up the new changes.
- If you update any CSS files, you might also need to run `build_client.sh crit`
  to re-generate the critical CSS, which is necessary for the content the users
  see first. The "crit" version takes a long time, but you only need to run it
  once before committing your changes.
- You can also go to "http://localhost/?login=test1" to automatically log in as
  "test1", "http://localhost/?login=test2" to automatically log in as "test2",
  and so forth. This is useful for testing a bunch of different users in tabs
  without having to use an incognito window.

<br />

## Running the Server in Production

### Install as a Service (optional)

This assumes that you installed the server to "/root/hanabi-live". If not, you
will need to edit the paths in the below commands and edit the contents of the
three Supervisor files.

- Install Supervisor and install the service:
  - `./install/install_supervisor.sh`

To manage the service:

- Start it, only if it is already stopped: `supervisorctl start hanabi-live`
- Stop it gracefully: `curl http://127.0.0.1:${LOCALHOST_PORT:-8081}/shutdown`
- Restart it gracefully:
  `curl http://127.0.0.1:${LOCALHOST_PORT:-8081}/gracefulRestart`

Do not use `supervisorctl stop` or `supervisorctl restart` on a running game
server: source builds do not save ongoing games on signals. Check the server log
after a restart. See [the production instructions](../AGENTS.md) for deployment
and database migration precautions.

### Opt-in CI releases (Linux amd64)

Release construction runs in parallel with CI validation. Intermediate
`candidate-` artifacts are retained for seven days and must not be deployed.
After every required check and release build succeeds, `publish_native_release`
verifies the candidate checksums and publishes the normal release artifacts
without rebuilding. Failed checks block publication; successful candidates can
be reused when retrying failed checks within their retention period.

Existing source installations are unchanged. Trusted `main` CI runs publish
`hanabi-live-<revision>-linux-amd64` only after the required checks pass.
Download its archive and checksum from that successful run. `release.json`
records the revision, client version, toolchain, workflow run, and every asset
checksum. Checksums detect corruption, not an untrusted publisher; verify the
repository, run, and revision before installing. Full Git history is required
for builds.

Use Python 3.12+ and Bash on the installation host; Go, Node, and Git are not
needed at runtime. The archive includes the pinned migration executable. Example
commands, **requiring separate operator authorization**, are:

```sh
python3 install/release.py init /opt/hanabi-live
python3 install/release.py stage /opt/hanabi-live ./hanabi-live-REV-linux-amd64.tar.gz TRUSTED_SHA256
python3 install/release.py activate /opt/hanabi-live REV --apply-migrations
```

For the first transition, use the **old service's `/shutdown`** and wait for its
actual exit (this lets ongoing games finish). Only while stopped, copy its
`.env`, `ongoing_tables`, optional `motd.txt`, and certificate directory into
`shared/`; retain the database and original checkpoints. Review migrations,
including the UUID-era snapshot prerequisite for migration 003. Do not
initialize an existing database. Install the separate
`install/supervisor/hanabi-live-release.conf`, adjusting paths/account, and
retire the old program **while stopped**. Do not reuse its restart policy. Keep
releases operator-owned and read-only to the service account; grant that account
access only to shared state and the lock. Start the new program explicitly after
successful activation and check readiness and logs.

Later updates: send SIGTERM directly to the release process and wait for exit
before staging and activation. SIGTERM drains commands and writes durable
checkpoints; a failed checkpoint leaves the process paused, not falsely stopped.
Never force-kill it to complete a rollout. Staging and activation refuse a
running service. Activation deliberately runs forward migrations **before**
atomically changing `current`; it never starts a process. Failed verification or
migration leaves the pointer and checkpoints unchanged, but a failed migration
may have advanced the schema: investigate before starting any old code. Exit
status 2 reports a rename that succeeded but whose directory sync failed:
staging may already exist, or `current` may already have changed. Keep the
service stopped and inspect the reported path and repair storage before
proceeding. Automatic rollback and older/equal client versions are rejected;
recovery/schema downgrades require a separately reviewed procedure, especially
with active games.

`/gracefulRestart` in release mode verifies and re-executes the **same** paired
release after saving checkpoints, without compilation or pointer changes.
`/shutdown` still lets games finish, then exits successfully. The opt-in
Supervisor policy restarts crashes, not intentional stops. Never use
`supervisorctl stop/restart` on a running game server. Container images use the
same verified binary lifecycle and need no Git/compiler; retain the database and
mount `ongoing_tables`, configure a generous stop timeout, and verify exit
rather than allowing a forced kill. Container upgrades also require deliberate
migrations before starting new code. `docker-compose.yml` uses a local
Dockerfile build (`pull_policy: build`); it is a development example, not a
published production server image.

For a local build: `bash install/build_release.sh dist/native`. Local dirty
builds are marked untrusted; only clean, successful CI artifacts are deployment
inputs.

<br />

### Rust release bundles and temporary cutover

CI also publishes `hanabi-live-rust-<revision>-linux-amd64`, a static Rust
server with its paired client assets and migration tool. The same release
installer stages it separately under `<revision>-rust`; activation requires
`--runtime rust`. The Go artifact and its existing installation commands are
unchanged.

For prerequisites, installation, and the temporary live-game transfer procedure,
see the [Rust server runbook](../experimental/rust-server/README.md). Do not
activate Rust over unresolved Go games without importing their checkpoints. The
cutover bridge must be deleted after permanently switching to Rust.

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

Backups stream directly into gzip and are published only after the dump and
compression succeed. On Linux, concurrent backups are locked out and the output
size is capped using the initial free space minus a 1 GiB reserve for
PostgreSQL. Failed runs remove their partial file. Disk-pressure cleanup never
deletes the newest completed backup; if older backups cannot free enough space,
increase storage or reclaim unrelated disposable files rather than deleting
recovery data.

<br />

### Set up Secondary Automated Database Backups to Google Drive (optional)

This assumes you installed the server to "/root/hanabi-live". Adjust if needed.

- Download and compile [gdrive](https://github.com/gdrive-org/gdrive):
  - `go get github.com/prasmussen/gdrive`
- Add it to the path:
  - `export PATH="$PATH:/root/go/bin" && echo >> "~/.bashrc" && echo 'export PATH="$PATH:/root/go/bin"' >> "~/.bashrc"`
- Go to the
  [Google Drive service account project page](https://console.cloud.google.com/iam-admin/serviceaccounts?project=hanabi-live&folder=&organizationId=&supportedpurview=project).
  - If you are starting fresh, you will have to create a new Google Drive
    account, create a new service account, and create a new project. For more
    information, see
    [this GitHub issue](https://github.com/gdrive-org/gdrive/issues/533).
- Actions --> Create key --> JSON --> Create
- `mkdir -p "~/.gdrive"`
- `vim ~/.gdrive/hanabi-live-c3373cecaf32.json`
  - Paste it in.
- Find the ID of the subdirectory inside of the Google Drive account that you
  want the file to be uploaded to:
  - `gdrive list --service-account "hanabi-live-c3373cecaf32.json" --max 9999 | grep dir`
- `vim /root/hanabi-live/.env`
  - Fill in the "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH" and
    "GOOGLE_DRIVE_PARENT_DIRECTORY_ID" fields.

<br />

### Install HTTPS (optional)

Adjust the "certbot" command below according to what domain names you want to
register.

- `sudo apt install certbot -y`
- Disable certbot's built-in automatic renewal. The "renew_cert.sh" script
  (configured below) is the only thing that should renew the certificate,
  because the graceful server restart needed to load a new certificate is wired
  to certbot's renewal hook. If certbot's own timer is left enabled, it can
  renew the certificate without restarting the server, so the server keeps
  serving the old (and eventually expired) certificate from memory:
  - `sudo systemctl disable --now certbot.timer`
- `certbot certonly --standalone -d hanab.live -d www.hanab.live -d hanabi.live -d www.hanabi.live -d fireworks.cards -d www.fireworks.cards --deploy-hook "cd /root/hanabi-live && bash admin/gracefulRestart.sh"`
  <br /> (this creates "/etc/letsencrypt/live/hanab.live/"; the deploy hook
  gracefully restarts the server on every renewal so that it loads the new
  certificate)
- In the `.env` file:
  - Set `TLS_CERT_FILE` to: `/etc/letsencrypt/live/hanab.live/fullchain.pem`
  - Set `TLS_KEY_FILE` to: `/etc/letsencrypt/live/hanab.live/privkey.pem`
- `crontab -e`

```sh
# Every day, keep the Let's Encrypt certificate up to date
0 0 * * * /root/hanabi-live/renew_cert.sh
```

<br />
