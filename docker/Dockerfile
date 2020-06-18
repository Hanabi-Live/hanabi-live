### This Dockerfile is a multi-stage build, to improve runtime size.
### See: https://docs.docker.com/develop/develop-images/multistage-build/

#####
##### "entrypoint" stage: Builds the "/entrypoint" app
#####

FROM golang:stretch as entrypoint

ADD docker/src/ /app/src
WORKDIR /app/src
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/entrypoint

#####
##### "backend" stage: Builds /app//hanabi-live
#####

FROM golang:stretch as backend

WORKDIR /app/src
ADD src/ /app/src
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/hanabi-live

#####
##### "frontend" stage: Compresses the typescript app
#####

FROM node:stretch as frontend
ARG SENTRY_DSN=""

# add frontend assets
ADD .git /app/.git
ADD build_client.sh /app/build_client.sh
ADD public /app/public/

# install deps and build
WORKDIR /app/public/js
RUN npm install
RUN SENTRY_DSN="${SENTRY_DSN}" ../../build_client.sh

#####
##### "assembly" stage: Puts everything together
#####

FROM alpine:latest as assembly

# As per https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#user
# we should not run as root if we don't need to.
# So we create an explicit user to run everything with
ENV USER=appuser
ENV UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    "${USER}"

# copy built assets
COPY --from=entrypoint /app/entrypoint /app/entrypoint
COPY --from=frontend /app/public/js/src/data/version.json /app//public/js/src/data/version.json
COPY --from=frontend /app/public/css/main.min.css /app/public/css/main.min.css
COPY --from=frontend /app/public/js/dist/ /app/public/js/dist/
COPY --from=backend /app/hanabi-live /app/hanabi-live

# add some more static assets
ADD public /app/public/
ADD src /app/src/

# create an empty .env file that is writeable
RUN touch /app/.env && chmod a+rw /app/.env

# chown everything by the 'appuser'
RUN chown -R appuser:appuser /app/

#####
##### final stage: Puts everything into a from scratch image
#####

# we use an image from scratch to keep final image size small
# with an empty SENTRY_DSN, we don't even have to build locally and can even publish this image on DockerHub
FROM scratch

# for debugging purposes, you can use a different image like:
# FROM busybox

ARG SENTRY_DSN=""

# copy over the app data
COPY --from=assembly /app/ /app/

# and the information for the user
COPY --from=assembly /etc/passwd /etc/passwd
COPY --from=assembly /etc/group /etc/group

# environment variables
ENV DOMAIN "localhost"
ENV SESSION_SECRET "change_this_string"
ENV DB_HOST "db"
ENV DB_PORT "3306"
ENV DB_NAME=""
ENV DB_USER ""
ENV DB_PASS ""
ENV DISCORD_TOKEN ""
ENV DISCORD_LISTEN_CHANNEL_IDS ""
ENV DISCORD_LOBBY_CHANNEL_ID ""
ENV GA_TRACKING_ID ""
ENV SENTRY_DSN="${SENTRY_DSN}"

# use the limited user we created to run everything
# because it's not root, we can't listen on ports < 1024. 
# hence we use port 8080 as default
USER appuser:appuser
EXPOSE 8080

# the docker image needs some additional magic to run properly
# in particular, we want to wait for the database, create an env file
ENTRYPOINT [ "/app/entrypoint" ]

# and then start the regular server executable
CMD [ "/app/hanabi-live" ]
