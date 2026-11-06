FROM golang:1.27-bookworm AS go
FROM docker.io/oven/bun:1.4.4 AS bun
FROM rust:1.99.1-bookworm AS rust

FROM bun AS dependencies
COPY --from=go /usr/local/go /usr/local/go
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
ENV CARGO_HOME="/usr/local/cargo" RUSTUP_HOME="/usr/local/rustup"
ENV PATH="/usr/local/cargo/bin:/usr/local/go/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends python3 git bzip2 build-essential musl-tools && apt-get clean
WORKDIR /root/hanabi-live
COPY rust-toolchain.toml ./
RUN rustup target add x86_64-unknown-linux-musl
COPY package.json bun.lock bunfig.toml tsconfig.json tsconfig.monorepo.json LICENSE ./
COPY packages/client/package.json packages/client/package.json
COPY packages/client-new/package.json packages/client-new/package.json
COPY packages/data/package.json packages/data/package.json
COPY packages/game/package.json packages/game/package.json
COPY packages/scripts/package.json packages/scripts/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY patches patches
RUN test "$(bun --version)" = "$(bun -p 'require("./package.json").packageManager.slice(4)')" \
  && bun install --frozen-lockfile

FROM dependencies AS build
COPY packages packages
COPY scripts scripts
COPY public public
COPY server server
COPY .cargo .cargo
COPY install install
COPY misc misc
# Full history is needed only in the build stage for the client cache version.
COPY .git .git
RUN bash install/build_release.sh /root/artifact

FROM alpine
RUN apk add --no-cache ca-certificates bash
WORKDIR /root/hanabi-live
COPY --from=build /root/artifact/release ./
RUN mkdir logs
STOPSIGNAL SIGTERM
ENTRYPOINT ["/root/hanabi-live/hanabi-live"]
