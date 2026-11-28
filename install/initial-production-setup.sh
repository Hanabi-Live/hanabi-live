#!/usr/bin/env bash

# This script sets up the production server on a fresh Ubuntu 26 system.

set -o errexit -o nounset -o pipefail

DOMAIN="hanab.live"
ALT_DOMAIN="hanabi.live"
APP_USER="hanabi"
APP_DIR="/home/$APP_USER/hanabi-live"
DB_NAME="hanabi"
DB_USER="hanabiuser"
# The values that the operator must set in .env before setup, because the server cannot make them.
REQUIRED_VARIABLES=(GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME GOOGLE_DRIVE_PARENT_DIRECTORY_ID)
# The values that this script writes to .env.
GENERATED_VARIABLES=(DOMAIN SESSION_SECRET DB_NAME DB_USER DB_PASSWORD TLS_CERT_FILE TLS_KEY_FILE)
# Where cron looks for the programs of the daily backup. gdrive is in "/usr/local/bin".
CRON_PATH="/usr/local/bin:/usr/bin:/bin"

# Everything is in a function because "git checkout" can replace this file while it is running.
function main {
  if (($# != 1)); then
    echo "Usage: $0 RELEASE_ARCHIVE" >&2
    exit 1
  fi
  # The release archive, with its ".sha256" file beside it.
  ARCHIVE=$(realpath -- "$1")

  # Refuse to overwrite an existing installation or its secrets.
  if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root." >&2
    exit 1
  fi
  if [[ "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)" != "$APP_DIR" ]]; then
    echo "Error: The repository must be cloned to: $APP_DIR" >&2
    exit 1
  fi
  cd "$APP_DIR"
  check_env
  check_archive

  # Install dependencies.
  apt update
  apt install --yes certbot cron curl git openssl postgresql python3 sudo ufw

  # After upgrades, list services that need restarting instead of restarting them, because restarting
  # PostgreSQL stops the game server. Reboot during a quiet time to apply library updates.
  mkdir --parents /etc/needrestart/conf.d
  echo "\$nrconf{restart} = 'l';" > /etc/needrestart/conf.d/hanabi.conf

  # Size PostgreSQL's cache from the server's memory, in KiB.
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
  if ! id "$APP_USER" &> /dev/null; then
    useradd --system --user-group --no-create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
  fi

  # Install the systemd service for the server.
  install --mode 644 install/hanabi-live.service /etc/systemd/system/hanabi-live.service
  systemctl daemon-reload

  # Install the release that was built and uploaded with "install/build-release.sh".
  git checkout "$REV"
  STAGE=$(mktemp --directory)
  trap 'rm --recursive --force -- "$STAGE"' EXIT
  python3 install/release.py init "$STAGE/release"
  python3 install/release.py stage "$STAGE/release" "$ARCHIVE" "$SHA256"
  if ! grep --quiet '"dirty": false' "$STAGE/release/releases/$REV/release.json"; then
    echo "Error: The release was not built from a clean checkout." >&2
    exit 1
  fi
  cp --archive "$STAGE/release/releases/$REV/"{hanabi-live,public,packages} .

  # Obtain the certificate and grant the service access to its private key. Do this before the
  # database, because it fails while the domains do not point to this server.
  certbot certonly --standalone --keep-until-expiring --cert-name "$DOMAIN" --domain "$DOMAIN" --domain "www.$DOMAIN" --domain "$ALT_DOMAIN" --domain "www.$ALT_DOMAIN"
  chmod 0755 /etc/letsencrypt/{live,archive}
  chgrp "$APP_USER" "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  chmod 0640 "/etc/letsencrypt/live/$DOMAIN/privkey.pem"

  # Use a quarter of memory for PostgreSQL's cache, instead of the 128 MB default. This only takes
  # effect when PostgreSQL restarts. The disk is an SSD, where random reads cost little more than
  # sequential ones, so let the planner prefer indexes. Log queries that wait over a second on a lock,
  # and statements that take over 250 ms, without their parameter values, which can hold private data.
  for dir in /etc/postgresql/*/main/conf.d; do
    printf '%s\n' \
      "shared_buffers = $((memory_kb / 4))kB" \
      "random_page_cost = 1.1" \
      "log_lock_waits = on" \
      "log_min_duration_statement = 250ms" \
      "log_parameter_max_length = 0" \
      > "$dir/hanabi.conf"
  done
  systemctl enable postgresql
  systemctl restart postgresql
  chmod 600 .env
  if [[ $CONFIGURED == false ]]; then
    # Create the database and generate its password.
    local db_password session_secret
    db_password=$(openssl rand -hex 32)
    sudo --user postgres psql --set ON_ERROR_STOP=1 << SQL
CREATE USER $DB_USER PASSWORD '$db_password';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
SQL

    # Configure the server.
    session_secret=$(openssl rand -hex 64)
    # The operator's last line can lack a newline, so that the first value would join it.
    if [[ -s .env && "$(tail --bytes 1 .env)" != "" ]]; then
      echo >> .env
    fi
    cat >> .env << EOF
DOMAIN="$DOMAIN"
SESSION_SECRET="$session_secret"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DB_PASSWORD="$db_password"
TLS_CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
TLS_KEY_FILE="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
EOF
  fi

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
  printf '%s\n' "PATH=$CRON_PATH" "0 3 * * * $APP_USER $APP_DIR/scripts/admin/database-backup.sh" > /etc/cron.d/hanabi-live
  chmod 644 /etc/cron.d/hanabi-live
  systemctl enable --now cron

  echo "The server is set up."
}

# Checks the .env file that the operator made, before setup changes anything.
function check_env {
  if systemctl is-enabled --quiet hanabi-live 2> /dev/null; then
    echo "Error: This server is already set up. If an earlier run of this script failed after it started the server, run the commands that follow that step by hand." >&2
    exit 1
  fi
  if [[ ! -f .env ]]; then
    echo "Error: Create $APP_DIR/.env first, with these values: ${REQUIRED_VARIABLES[*]}" >&2
    exit 1
  fi
  local name missing=() generated=()
  for name in "${REQUIRED_VARIABLES[@]}"; do
    # shellcheck source=/dev/null
    if [[ -z "$(source .env && printf "%s" "${!name-}")" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]} > 0)); then
    echo "Error: Set these values in $APP_DIR/.env: ${missing[*]}" >&2
    exit 1
  fi
  for name in "${GENERATED_VARIABLES[@]}"; do
    # shellcheck source=/dev/null
    if [[ -n "$(source .env && printf "%s" "${!name-}")" ]]; then
      generated+=("$name")
    fi
  done
  # An earlier run can fail after it made the database and wrote its values. This run keeps them.
  CONFIGURED=false
  if ((${#generated[@]} == ${#GENERATED_VARIABLES[@]})); then
    CONFIGURED=true
  elif ((${#generated[@]} > 0)); then
    echo "Error: $APP_DIR/.env sets some of the values that setup makes. Remove them: ${generated[*]}" >&2
    exit 1
  fi
  # The backup runs as the app user, and gdrive reads the service account from its home directory.
  local account
  # shellcheck source=/dev/null
  account="/home/$APP_USER/.gdrive/$(source .env && printf "%s" "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME")"
  if [[ ! -f "$account" ]]; then
    echo "Error: The Google Drive service account file does not exist: $account" >&2
    exit 1
  fi
  if ! PATH="$CRON_PATH" command -v gdrive > /dev/null; then
    echo "Error: Install the gdrive program in /usr/local/bin first. The daily backup uploads with it." >&2
    exit 1
  fi
}

# Checks the release archive, before setup changes anything. Sets "REV" and "SHA256".
function check_archive {
  local archive
  if [[ ! -f "$ARCHIVE" || ! -f "$ARCHIVE.sha256" ]]; then
    echo "Error: The release archive or its checksum file does not exist: $ARCHIVE" >&2
    exit 1
  fi
  read -r SHA256 archive < "$ARCHIVE.sha256" || true
  REV=${archive#hanabi-live-}
  REV=${REV%-linux-amd64.tar.gz}
  [[ "$REV" =~ ^[a-f0-9]{40}$ && "$SHA256" =~ ^[a-f0-9]{64}$ && "$archive" == "$(basename -- "$ARCHIVE")" ]] || {
    echo "Error: Invalid release checksum file: $ARCHIVE.sha256" >&2
    exit 1
  }
  if ! sha256sum --check --status <<< "$SHA256  $ARCHIVE"; then
    echo "Error: The release archive does not match its checksum file: $ARCHIVE" >&2
    exit 1
  fi
  if ! git cat-file -e "$REV^{commit}" 2> /dev/null; then
    echo "Error: This checkout does not have the revision of the release. Run \"git fetch\" first: $REV" >&2
    exit 1
  fi
}

main "$@"
