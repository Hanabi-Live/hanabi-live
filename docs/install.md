# Hanab Live Installation

## For Development

To run a copy of the Hanab Live server, you need the following:

- [Redis](https://redis.io/) (to store ongoing game state)
- [PostgreSQL](https://www.postgresql.org/) (to store finished games)

Since these are not typically installed on a laptop, we recommend that you use
[Podman](https://podman.io/) to run the website inside of a
[container](<https://en.wikipedia.org/wiki/Containerization_(computing)>) during
development.

(If you are on Windows, we recommend running the container inside
[WSL](https://en.wikipedia.org/wiki/Windows_Subsystem_for_Linux).)

- Install [Podman](https://podman.io/docs/installation) and Podman Compose.
  (Alternatively, you can use [Docker](https://www.docker.com/get-started/) if
  you want, but Podman is free and open-source.)
- Clone the repository.
- `cp .env.example .env`
- In `.env`, set `SESSION_SECRET` to a random 128-character alphanumeric string.
  (For example, you can generate one with `openssl rand -hex 64`.)
- Start the server:

```sh
export HANABI_BUILD_REVISION="$(git rev-parse HEAD)"
podman compose --file docker-compose-dev.yml up --build --detach
```

- Watch the logs:

```sh
podman compose --file docker-compose-dev.yml logs --follow hanab-live-server
```

- Then, in a browser, surf to: http://localhost:1212/

## For Production

On a fresh Ubuntu 26.04 server, run as root. Point your domain at the server,
allow incoming TCP ports 80 and 443, and replace `example.com` below.

- Install dependencies:
  - `apt update && apt install --yes git gh python3 redis-server postgresql certbot supervisor cron curl openssl nano`
- Create a new database, and set up a database user:
  - `sudo --user postgres psql`
  - `CREATE USER hanabiuser;`
  - `\password hanabiuser`
  - `CREATE DATABASE hanabi OWNER hanabiuser;`
  - `\q`
- Install an approved `main` CI release. Replace `RUN_ID`, `REV`, and `SHA256`
  with its run ID, full commit SHA, and published archive checksum. Do not use
  `candidate-` artifacts.

```sh
git clone https://github.com/Hanabi-Live/hanabi-live.git /root/hanabi-live
cd /root/hanabi-live
gh auth login
gh run download RUN_ID --name hanabi-live-rust-REV-linux-amd64 --dir /root/hanabi-download
git checkout REV
python3 install/release.py init /root/hanabi-release
python3 install/release.py stage /root/hanabi-release /root/hanabi-download/hanabi-live-rust-REV-linux-amd64.tar.gz SHA256
cp --archive /root/hanabi-release/releases/REV-rust/{hanabi-live,public,packages} .
```

- Configure the server:
  - `cp .env.example .env && chmod 600 .env`
  - `nano .env`: set `DOMAIN`, `DB_NAME=hanabi`, `DB_USER=hanabiuser`, and
    `DB_PASSWORD` to the password chosen above.
  - Set `SESSION_SECRET` to the output of `openssl rand -hex 64`.
  - Set `TLS_CERT_FILE=/etc/letsencrypt/live/example.com/fullchain.pem` and
    `TLS_KEY_FILE=/etc/letsencrypt/live/example.com/privkey.pem`.
- Configure Redis:
  - `nano /etc/redis/redis.conf`: set `appendonly yes`, `appendfsync always`,
    and `maxmemory-policy noeviction`. Keep it bound to loopback.
  - `systemctl restart redis-server`
- Obtain the certificate before starting the server:
  - `certbot certonly --standalone --domain example.com`
- Initialize the database and start the server:

```sh
./install/install-database-schema.sh
mkdir --parents logs letsencrypt
./hanabi-live --check-startup
cp install/supervisor/hanabi-live.conf /etc/supervisor/conf.d/hanabi-live.conf
systemctl enable --now supervisor
supervisorctl reread
supervisorctl update
```

- Configure certificate renewal without stopping games:

```sh
certbot reconfigure --cert-name example.com --webroot \
  --webroot-path /root/hanabi-live/letsencrypt \
  --deploy-hook /root/hanabi-live/admin/gracefulRestart.sh
systemctl enable --now certbot.timer
```

- Set up daily PostgreSQL backups:
  - `./database-backup.sh`
  - `crontab -e`, then add:

```text
0 3 * * * /root/hanabi-live/database-backup.sh
```

The script saves PostgreSQL backups in `backups/`; also arrange coordinated,
off-server PostgreSQL and Redis backups.
