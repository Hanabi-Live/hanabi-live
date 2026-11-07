# Hanab Live Installation

## For Development

To run a copy of the Hanab Live server, you need the following:

- [Redis](https://redis.io/) (to store ongoing game state)
- [PostgreSQL](https://www.postgresql.org/) (to store finished games)

Since these are not typically installed on a laptop, we recommend that you use
[Podman](https://podman.io/) to run the website inside of a
[container](<https://en.wikipedia.org/wiki/Containerization_(computing)>) during
development.

(If you are on Windows, we recommend running the container inside
[WSL](https://en.wikipedia.org/wiki/Windows_Subsystem_for_Linux).)

- Install [Podman](https://podman.io/docs/installation) and Podman Compose.
  (Alternatively, you can use [Docker](https://www.docker.com/get-started/) if
  you want, but Podman is free and open-source.)
- Clone the repository.
- `cp .env.example .env`
- In `.env`, set `SESSION_SECRET` to a random 128-character alphanumeric string.
  (For example, you can generate one with `openssl rand -hex 64`.)
- Start the server:

```sh
export HANABI_BUILD_REVISION="$(git rev-parse HEAD)"
podman compose --file docker-compose-dev.yml up --build --detach
```

- Watch the logs:

```sh
podman compose --file docker-compose-dev.yml logs --follow hanab-live-server
```

- Then, in a browser, "http://localhost:1212/"

## For Production

- Install dependencies:
  - `sudo apt update && sudo apt install --yes git redis-server postgresql`
- Create a new database, and set up a database user:
  - `sudo -u postgres psql`
  - `CREATE DATABASE hanabi;`
  - `\c hanabi`
  - `CREATE USER hanabiuser WITH PASSWORD '1234567890';`
  - `GRANT ALL PRIVILEGES ON DATABASE hanabi TO hanabiuser;`
  - `GRANT ALL ON SCHEMA public TO hanabiuser;`
  - `\q`
- TODO
