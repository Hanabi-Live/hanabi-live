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
      echo "Deploy approved main to root@hanab.live:/home/hanabi/hanabi-live over SSH."
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

echo "Deployment target: root@hanab.live:/home/hanabi/hanabi-live"
started=$(date +%s)
# Send credentials on encrypted stdin, never in SSH command-line arguments.
if {
  token=${GH_TOKEN:-${GITHUB_TOKEN_PERSONAL_CLASSIC:-${GITHUB_TOKEN:-}}}
  if [[ -n $token ]]; then
    printf 'export GH_TOKEN=%q\n' "$token"
  fi
  cat << 'REMOTE'
set -o errexit -o nounset -o pipefail
cd /home/hanabi/hanabi-live
tools=$(mktemp -d)
chmod 755 "$tools"
trap 'rm -f "$tools/deploy.py" "$tools/release.py"; rmdir "$tools"' EXIT
REMOTE
  # Run this checkout's deployment tools, which may be newer than the production checkout.
  for name in deploy release; do
    printf '%s\n' "cat > \"\$tools/$name.py\" << 'HANABI_DEPLOY_TOOL'"
    cat "$DIR/install/$name.py"
    printf '\nHANABI_DEPLOY_TOOL\n'
  done
  cat << 'REMOTE'
# Deploy as the account that owns the installation, so it can read what is published.
sudo --user=hanabi --preserve-env=GH_TOKEN python3 -B "$tools/deploy.py" "$@"
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
