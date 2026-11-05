FROM golang:1.27-bookworm AS go

FROM node:24-bookworm AS build
COPY --from=go /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends python3 && apt-get clean
WORKDIR /root/hanabi-live
COPY package.json package-lock.json tsconfig.json tsconfig.monorepo.json LICENSE ./
RUN npm ci
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
