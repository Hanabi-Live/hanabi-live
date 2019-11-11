#!/bin/bash

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename $REPO)"

supervisorctl status $REPO
