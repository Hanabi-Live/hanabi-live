#!/bin/bash

# Import the database username and password
source $REPO_DIR/.env

mysql -u$DB_USER -p$DB_PASS hanabi
