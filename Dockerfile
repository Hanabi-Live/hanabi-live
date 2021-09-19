## first build the client
FROM node:16-buster

RUN mkdir -p /root/hanabi-live
WORKDIR /root/hanabi-live
COPY .env_template .env
COPY client/package.json client/package.json
COPY client/package-lock.json client/package-lock.json
RUN cd client && npm install
COPY data data
COPY public public
COPY client client

# needed only for git rev parse
COPY .git .git

RUN client/build_client.sh

## then build the server
FROM golang:1.17-buster

RUN mkdir -p /root/hanabi-live
WORKDIR /root/hanabi-live
COPY .env_template .env
COPY server server

RUN server/build_server.sh

## remove src code and copy build artifacts into a minimal image

FROM alpine

ENTRYPOINT ["/bin/sh"]

# was compiled against gnu libc above; musl is decently compatible
# also needs git so server can get rev-parse head
RUN apk update && apk add --no-cache libc6-compat git

RUN mkdir -p /root/hanabi-live
WORKDIR /root/hanabi-live

# will need to be mounted on startup
RUN touch .env
COPY data data
RUN mkdir -p logs
COPY --from=0 /root/hanabi-live/public public
COPY --from=1 /root/hanabi-live/hanabi-live hanabi-live
RUN chmod +x hanabi-live
RUN mkdir -p server/src
# needed at runtime, these are not compiled in
COPY server/src/views/ server/src/views/

# only needed so server knows its git hash
COPY .git .git

CMD ["/root/hanabi-live/hanabi-live"]
