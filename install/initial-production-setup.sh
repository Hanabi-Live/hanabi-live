#!/usr/bin/env bash

# This script sets up the production server on a fresh Ubuntu 26 system.

set -o errexit -o nounset -o pipefail

DOMAIN="hanab.live"
ALT_DOMAIN="hanabi.live"
APP_USER="hanabi"
APP_DIR="/home/$APP_USER/hanabi-live"
DB_NAME="hanabi"
DB_USER="hanabiuser"

# Everything is in a function because "git checkout" can replace this file while it is running.
function main {
  # Refuse to overwrite an existing installation or its secrets.
  if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root." >&2
    exit 1
  fi
  if [[ "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)" != "$APP_DIR" ]]; then
    echo "Error: The repository must be cloned to: $APP_DIR" >&2
    exit 1
  fi
  if [[ -e "$APP_DIR/.env" ]]; then
    echo "Error: This server is already set up: $APP_DIR/.env exists" >&2
    exit 1
  fi
  cd "$APP_DIR"

  # Install dependencies.
  apt update
  apt install --yes certbot cron curl git openssl postgresql python3 redis-server sudo ufw

  # After upgrades, list services that need restarting instead of restarting them, because restarting
  # Redis stops the game server. Reboot during a quiet time to apply library updates.
  mkdir --parents /etc/needrestart/conf.d
  echo "\$nrconf{restart} = 'l';" > /etc/needrestart/conf.d/hanabi.conf

  # Size PostgreSQL's cache and Redis's limit from the server's memory, in KiB.
  local memory_kb
  memory_kb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)

  # Allow only SSH, HTTP, and HTTPS through the firewall.
  ufw allow OpenSSH
  ufw allow 80/tcp  # HTTP
  ufw allow 443/tcp # HTTPS
  ufw --force enable

  # Allow only key-based SSH logins. SSH uses the first value it reads, and this file comes before
  # cloud-init's, which may allow passwords.
  echo 'PasswordAuthentication no' > /etc/ssh/sshd_config.d/10-hanabi-no-passwords.conf
  sshd -t
  systemctl reload ssh

  # Create the service accounts.
  useradd --system --user-group --no-create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
  useradd --system --user-group --no-create-home --home-dir /var/lib/hanabi-redis --shell /usr/sbin/nologin hanabi-redis
  usermod --append --groups hanabi-redis "$APP_USER"

  # Install the systemd service for the server.
  install --mode 644 install/hanabi-live.service /etc/systemd/system/hanabi-live.service

  # Download the latest release.
  local sha256 archive rev
  DOWNLOAD=$(mktemp --directory)
  trap 'rm --recursive --force -- "$DOWNLOAD"' EXIT
  curl --silent --fail --show-error --location --output "$DOWNLOAD/SHA256SUMS" https://github.com/Hanabi-Live/hanabi-live/releases/latest/download/SHA256SUMS
  read -r sha256 archive < "$DOWNLOAD/SHA256SUMS"
  rev=${archive#hanabi-live-}
  rev=${rev%-linux-amd64.tar.gz}
  [[ "$rev" =~ ^[a-f0-9]{40}$ && "$sha256" =~ ^[a-f0-9]{64}$ && "$archive" == "hanabi-live-$rev-linux-amd64.tar.gz" ]] || {
    echo "Error: Invalid GitHub release checksum file." >&2
    exit 1
  }
  curl --silent --fail --show-error --location --output "$DOWNLOAD/$archive" "https://github.com/Hanabi-Live/hanabi-live/releases/download/server-$rev/$archive"
  git checkout "$rev"
  python3 install/release.py init "$DOWNLOAD/release"
  python3 install/release.py stage "$DOWNLOAD/release" "$DOWNLOAD/$archive" "$sha256"
  cp --archive "$DOWNLOAD/release/releases/$rev/"{hanabi-live,public,packages} .

  # Create the database and generate its password.
  local db_password session_secret
  # Use a quarter of memory for PostgreSQL's cache, instead of the 128 MB default. This only takes
  # effect when PostgreSQL restarts. The disk is an SSD, where random reads cost little more than
  # sequential ones, so let the planner prefer indexes. Log queries that wait over a second on a lock.
  for dir in /etc/postgresql/*/main/conf.d; do
    printf '%s\n' \
      "shared_buffers = $((memory_kb / 4))kB" \
      "random_page_cost = 1.1" \
      "log_lock_waits = on" \
      > "$dir/hanabi.conf"
  done
  systemctl enable postgresql
  systemctl restart postgresql
  db_password=$(openssl rand -hex 32)
  sudo --user postgres psql --set ON_ERROR_STOP=1 << SQL
CREATE USER $DB_USER PASSWORD '$db_password';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
SQL

  # Configure the server.
  session_secret=$(openssl rand -hex 64)
  install --mode 600 /dev/null .env
  cat > .env << EOF
DOMAIN="$DOMAIN"
SESSION_SECRET="$session_secret"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DB_PASSWORD="$db_password"
TLS_CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
TLS_KEY_FILE="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
REDIS_URL="redis+unix:///run/hanabi-redis/redis.sock"
EOF

  # Configure durable, local-only Redis storage (instead of Ubuntu's default Redis service).
  systemctl mask --now redis-server
  install --directory --mode 755 /etc/hanabi-redis
  install --mode 640 --group hanabi-redis install/redis/redis.conf /etc/hanabi-redis/redis.conf
  # Let Redis use a fifth of memory.
  sed --in-place "s/^maxmemory .*/maxmemory $((memory_kb / 5))kb/" /etc/hanabi-redis/redis.conf
  grep --quiet "^maxmemory $((memory_kb / 5))kb$" /etc/hanabi-redis/redis.conf
  install --mode 644 install/redis/hanabi-redis.service /etc/systemd/system/hanabi-redis.service

  # Prevent Redis background saves from failing under memory pressure.
  echo 'vm.overcommit_memory = 1' > /etc/sysctl.d/90-hanabi-redis.conf
  sysctl --quiet --system

  systemctl daemon-reload
  systemctl enable --now hanabi-redis

  # Obtain the certificate and grant the service access to its private key.
  certbot certonly --standalone --cert-name "$DOMAIN" --domain "$DOMAIN" --domain "www.$DOMAIN" --domain "$ALT_DOMAIN" --domain "www.$ALT_DOMAIN"
  chmod 0755 /etc/letsencrypt/{live,archive}
  chgrp "$APP_USER" "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  chmod 0640 "/etc/letsencrypt/live/$DOMAIN/privkey.pem"

  # Initialize the database and start the server as the app user.
  mkdir --parents logs letsencrypt
  chown --recursive "$APP_USER:$APP_USER" "/home/$APP_USER"
  sudo --user "$APP_USER" ./hanabi-live migrate apply
  sudo --user "$APP_USER" ./hanabi-live --check-startup
  systemctl enable --now hanabi-live
  # shellcheck source=/dev/null
  localhost_port=$(source .env && printf "%s" "${LOCALHOST_PORT:-8081}")
  curl --silent --show-error --fail --output /dev/null --retry 10 --retry-connrefused --retry-delay 1 "http://127.0.0.1:$localhost_port/metrics"

  # Renew certificates automatically, restarting gracefully as the app user.
  certbot reconfigure --cert-name "$DOMAIN" --webroot --webroot-path "$APP_DIR/letsencrypt" --deploy-hook "sudo --user $APP_USER $APP_DIR/scripts/localhost/gracefulRestart.sh"
  systemctl enable --now certbot.timer

  # Delete chat older than one year and back up PostgreSQL daily, as the app user.
  echo "0 3 * * * $APP_USER $APP_DIR/scripts/admin/database-backup.sh" > /etc/cron.d/hanabi-live
  chmod 644 /etc/cron.d/hanabi-live
  systemctl enable --now cron
  sudo --user "$APP_USER" ./scripts/admin/database-backup.sh

  echo "The server is set up. Also keep coordinated PostgreSQL and Redis backups off this server."
}

main "$@"
