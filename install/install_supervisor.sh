#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

sudo apt install python3-pip -y
pip3 install supervisor
mkdir -p /etc/supervisor/conf.d
mkdir -p /var/log/supervisor
cp "$DIR/supervisor/supervisord.conf" "/etc/supervisor/supervisord.conf"
cp "$DIR/supervisor/hanabi-live.conf" "/etc/supervisor/conf.d/hanabi-live.conf"
cp "$DIR/supervisor/supervisord.service" "/etc/systemd/system/supervisord.service"
mkdir -p "$DIR/../logs"
systemctl daemon-reload
systemctl start supervisord
supervisorctl reload
