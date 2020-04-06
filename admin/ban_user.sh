#!/bin/bash

if [ $# -eq 0 ]; then
    echo "usage: `basename "$0"` [username]"
    exit 1
fi

curl --silent "http://localhost:8081/ban/$1"
