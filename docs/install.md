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

To set up the production server for hanab.live:

```sh
set -o errexit -o nounset -o pipefail

# Local variables
DOMAIN="hanab.live"

# Install dependencies.
apt update
apt install --yes certbot cron curl git openssl postgresql python3 redis-server

# Create the service account.
useradd --system --user-group --create-home --home-dir /home/hanabi --shell /usr/sbin/nologin hanabi

# Clone the repository.
git clone https://github.com/Hanabi-Live/hanabi-live.git /home/hanabi/hanabi-live
cd /home/hanabi/hanabi-live

# Install the systemd service for the server.
install --mode 644 install/hanabi-live.service /etc/systemd/system/hanabi-live.service

# Download the latest release.
mkdir --parents /root/hanabi-download
curl --silent --fail --show-error --location --output /root/hanabi-download/SHA256SUMS https://github.com/Hanabi-Live/hanabi-live/releases/latest/download/SHA256SUMS
read -r SHA256 ARCHIVE < /root/hanabi-download/SHA256SUMS
REV=${ARCHIVE#hanabi-live-rust-}
REV=${REV%-linux-amd64.tar.gz}
[[ "$REV" =~ ^[a-f0-9]{40}$ && "$SHA256" =~ ^[a-f0-9]{64}$ && "$ARCHIVE" == "hanabi-live-rust-$REV-linux-amd64.tar.gz" ]] || {
  echo "Error: Invalid GitHub release checksum file." >&2
  exit 1
}
curl --silent --fail --show-error --location --output "/root/hanabi-download/$ARCHIVE" "https://github.com/Hanabi-Live/hanabi-live/releases/download/server-$REV/$ARCHIVE"
git checkout "$REV"
python3 install/release.py init /root/hanabi-release
python3 install/release.py stage /root/hanabi-release "/root/hanabi-download/$ARCHIVE" "$SHA256"
cp --archive /root/hanabi-release/releases/"$REV"-rust/{hanabi-live,public,packages} .

# Create the database and generate its password.
DB_PASSWORD=$(openssl rand -hex 32)
sudo --user postgres psql --set ON_ERROR_STOP=1 << SQL
CREATE USER hanabiuser PASSWORD '$DB_PASSWORD';
CREATE DATABASE hanabi OWNER hanabiuser;
SQL

# Configure the server.
SESSION_SECRET=$(openssl rand -hex 64)
install --mode 600 /dev/null .env
cat > .env << EOF
DOMAIN="$DOMAIN"
SESSION_SECRET="$SESSION_SECRET"
DB_NAME="hanabi"
DB_USER="hanabiuser"
DB_PASSWORD="$DB_PASSWORD"
TLS_CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
TLS_KEY_FILE="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
EOF

# Configure durable, local-only Redis storage.
cat >> /etc/redis/redis.conf << 'REDIS'
bind 127.0.0.1
appendonly yes
appendfsync always
maxmemory-policy noeviction
REDIS
systemctl restart redis-server

# Prevent Redis background saves from failing under memory pressure.
echo 'vm.overcommit_memory = 1' > /etc/sysctl.d/90-hanabi-redis.conf
sysctl --quiet --system

# Obtain the certificate and grant the service access to its private key.
certbot certonly --standalone --cert-name "$DOMAIN" --domain "$DOMAIN"
chmod 0755 /etc/letsencrypt/{live,archive}
chgrp hanabi "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
chmod 0640 "/etc/letsencrypt/live/$DOMAIN/privkey.pem"

# Initialize the database and start the server as hanabi.
mkdir --parents logs letsencrypt
chown --recursive hanabi:hanabi /home/hanabi/hanabi-live
sudo --user hanabi ./install/install-database-schema.sh
sudo --user hanabi ./hanabi-live --check-startup
systemctl daemon-reload
systemctl enable --now hanabi-live
curl --fail --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:8081/metrics

# Renew certificates automatically, restarting gracefully as hanabi.
certbot reconfigure --cert-name "$DOMAIN" --webroot \
  --webroot-path /home/hanabi/hanabi-live/letsencrypt \
  --deploy-hook 'sudo --user hanabi /home/hanabi/hanabi-live/admin/gracefulRestart.sh'
systemctl enable --now certbot.timer

# Back up PostgreSQL daily as hanabi.
echo '0 3 * * * hanabi /home/hanabi/hanabi-live/database-backup.sh' > /etc/cron.d/hanabi-live
chmod 644 /etc/cron.d/hanabi-live
systemctl enable --now cron
sudo --user hanabi ./database-backup.sh

# Also keep coordinated PostgreSQL and Redis backups off this server.
```
