#!/bin/bash

if [ $# -eq 0 ]; then
    echo "usage: `basename "$0"` [username] [msg]"
    exit 1
fi

curl --silent "http://localhost:8081/sendError/$1" --data "msg=$2"
