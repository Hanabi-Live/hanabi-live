# Hanab Live Installation

## For Development

- Install [Bun](https://bun.sh/), [Rust](https://rustup.rs/), and either
  [Podman](https://podman.io/docs/installation) (with Podman Compose) or
  [Docker](https://www.docker.com/get-started/).
  - If you are on Windows, we recommend that you use
    [WSL](https://en.wikipedia.org/wiki/Windows_Subsystem_for_Linux).
- Clone the repository.
- Install the dependencies:
  - `bun ci`
- Start the Hanab server and PostgreSQL:
  - `bun run dev`
- In a browser, surf to: http://localhost:1212/
- To stop the container (its data is kept):
  - `bun run dev down`

## For Production

To set up the production server for hanab.live:

```sh
# Set up an SSH key. (This part is important, since the setup script disables password authentication.)
ssh-copy-id root@hanab.live
# Build the release from a clean checkout of main, and upload it.
bun install --frozen-lockfile
bash install/build-release.sh /tmp/hanabi-release
scp /tmp/hanabi-release/hanabi-live-* root@hanab.live:
ssh root@hanab.live
```

Then, once on the server:

```sh
apt update
apt upgrade --yes
apt install --yes git
mkdir -p /home/hanabi
git clone https://github.com/Hanabi-Live/hanabi-live.git /home/hanabi/hanabi-live
```

The daily database backup needs a Google Drive service account. Put its key file
in `/home/hanabi/.gdrive/`. Then create `/home/hanabi/hanabi-live/.env` with
`GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME` and `GOOGLE_DRIVE_PARENT_DIRECTORY_ID`
(see `.env.example`), and run the setup script:

```sh
/home/hanabi/hanabi-live/install/initial-production-setup.sh /root/hanabi-live-*-linux-amd64.tar.gz
```
