FROM golang:1.27-bookworm AS go
FROM docker.io/oven/bun:1.4.4 AS bun

FROM node:24-bookworm AS dependencies
COPY --from=go /usr/local/go /usr/local/go
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
ENV PATH="/usr/local/go/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends python3 && apt-get clean
WORKDIR /root/hanabi-live
COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.monorepo.json LICENSE ./
COPY patches patches
RUN test "$(bun --version)" = "$(node -p 'require("./package.json").packageManager.slice(4)')" \
  && bun install --frozen-lockfile

FROM dependencies AS build
COPY packages packages
COPY scripts scripts
COPY public public
COPY server server
COPY install install
COPY misc misc
# Full history is needed only in the build stage for the client cache version.
COPY .git .git
RUN bash install/build_release.sh /root/artifact

FROM alpine
RUN apk add --no-cache ca-certificates bash
WORKDIR /root/hanabi-live
COPY --from=build /root/artifact/release ./
RUN mkdir logs ongoing_tables
STOPSIGNAL SIGTERM
ENTRYPOINT ["/root/hanabi-live/hanabi-live"]
