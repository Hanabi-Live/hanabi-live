#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

check=false
for argument in "$@"; do
  case "$argument" in
    --check) check=true ;;
    --apply-migrations) ;;
    -h | --help)
      echo "Usage: $0 [--check] [--apply-migrations]"
      echo "Build main, then deploy it to root@hanab.live:/home/hanabi/hanabi-live over SSH once CI passes."
      echo "--check verifies without deploying; --apply-migrations approves pending migrations."
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

# How long the replacement server must run without logging a failure after the restart.
FAILURE_SCAN_SECONDS=60

# Build the pushed main from a clean copy, so that local changes cannot reach production. The build
# cache outlives the copy, so that later builds are faster.
git -C "$DIR" fetch --quiet origin main
revision=$(git -C "$DIR" rev-parse FETCH_HEAD)
build=$(mktemp --directory)
cleanup() {
  git -C "$DIR" worktree remove --force "$build/source" 2> /dev/null || true
  rm -rf -- "$build"
}
trap cleanup EXIT
echo "Building main $revision."
git -C "$DIR" worktree add --quiet --detach "$build/source" "$revision"
(
  cd "$build/source"
  bun install --frozen-lockfile
  CARGO_TARGET_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/hanabi-live/release-target" \
    bash install/build-release.sh "$build/release"
)
archive="hanabi-live-$revision-linux-amd64.tar.gz"

echo "Deployment target: root@hanab.live:/home/hanabi/hanabi-live"
started=$(date +%s)
# Upload the release as the account that owns the installation.
upload=$(ssh -T root@hanab.live \
  'sudo --user=hanabi mktemp --directory /home/hanabi/hanabi-live/backups/upload-XXXXXXXX')
for file in "$archive" "$archive.sha256"; do
  ssh -T root@hanab.live "sudo --user=hanabi tee $upload/$file > /dev/null" < "$build/release/$file"
done
token=${GH_TOKEN:-${GITHUB_TOKEN_PERSONAL_CLASSIC:-${GITHUB_TOKEN:-}}}
# Send credentials on encrypted stdin, never in SSH command-line arguments.
if {
  if [[ -n $token ]]; then
    printf 'export GH_TOKEN=%q\n' "$token"
  fi
  printf 'UPLOAD=%q ARCHIVE=%q\n' "$upload" "$archive"
  cat << 'REMOTE'
set -o errexit -o nounset -o pipefail
cd /home/hanabi/hanabi-live
tools=$(mktemp -d)
chmod 755 "$tools"
trap 'rm -f "$tools/deploy.py" "$tools/release.py"; rmdir "$tools"; rm -rf -- "$UPLOAD"' EXIT
REMOTE
  # Run this checkout's deployment tools, which may be newer than the production checkout.
  for name in deploy release; do
    printf '%s\n' "cat > \"\$tools/$name.py\" << 'HANABI_DEPLOY_TOOL'"
    cat "$DIR/install/$name.py"
    printf '\nHANABI_DEPLOY_TOOL\n'
  done
  cat << 'REMOTE'
# Deploy as the account that owns the installation, so it can read what is published.
sudo --user=hanabi --preserve-env=GH_TOKEN python3 -B "$tools/deploy.py" --archive "$UPLOAD/$ARCHIVE" "$@"
REMOTE
} | ssh -T root@hanab.live "bash -l -s -- $*"; then
  if [[ $check == false ]]; then
    # The check imports the data package, which needs the version file that client builds write.
    if [[ ! -f "$DIR/packages/data/src/version.js" ]]; then
      bash "$DIR/scripts/dev/set-version.sh"
    fi
    # Sign in and join the lobby the way a returning player does.
    bun run --cwd "$DIR" check-deployment
    # Migrations can block live queries before the restart, so scan the whole deployment.
    echo "Checking that the server logged no failures during the deployment and the $FAILURE_SCAN_SECONDS seconds after its restart."
    failures=$(
      ssh -T root@hanab.live "bash -s -- $started $FAILURE_SCAN_SECONDS" << 'REMOTE'
set -o errexit -o nounset -o pipefail
journal() { journalctl --unit=hanabi-live --since="@$1" "${@:2}" --no-pager --output=short-unix; }
# The first start of a replacement server, or the deployment's start if it did not restart.
restarted=$(journal "$1" | awk '/ Server listening at / && start == "" { start = $1 } END { print start }')
restarted=${restarted:-$1}
restarted=${restarted%.*}
remaining=$((restarted + $2 - $(date +%s)))
if ((remaining > 0)); then
  sleep "$remaining"
fi
journal "$1" --until="@$((restarted + $2))" | grep -F " Server failure: " || true
REMOTE
    )
    if [[ -n $failures ]]; then
      echo "Deployment check failed: the server logged failures during the deployment:" >&2
      echo "$failures" >&2
      exit 1
    fi
    echo "The server logged no failures."
  fi
else
  status=$?
  if [[ $status == 255 ]]; then
    echo "SSH failed; deployment outcome is unknown. Do not retry or roll back automatically." >&2
    echo "Inspect /home/hanabi/hanabi-live/backups/deploy-*/deployment.json and server health on production first." >&2
  fi
  exit "$status"
fi
