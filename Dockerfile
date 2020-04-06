# Build and run the Golang server inside Docker.

FROM ubuntu:bionic

RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common && \
    add-apt-repository ppa:longsleep/golang-backports && \
    apt-get update

RUN apt-get install -y --no-install-recommends \
        curl \
        gpg-agent \
        git \
        golang-go \
        mariadb-client

RUN mkdir -p /root/hanabi-live
WORKDIR /root/hanabi-live

# Warm the cache so we don't need to download modules again every time the code changes
# https://github.com/golang/go/issues/26610
COPY ./src/go.mod ./src/go.sum ./src/
RUN cd src && go mod download

# Build the server code
COPY ./src ./src
RUN cd src && go build -o ../hanabi-live

COPY .env_template .env
RUN echo 'DB_HOST=mariadb' >> .env

CMD /bin/bash -c '\
    source .env; \
    echo "Waiting for mariadb to start..."; \
    while ! mysqladmin ping --silent --host="$DB_HOST" --user="$DB_USER" --password="$DB_PASS"; do \
        sleep 2; \
    done; \
    echo "Starting hanabi-live server"; \
    ./hanabi-live'
