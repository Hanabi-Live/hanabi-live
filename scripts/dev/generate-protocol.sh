#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." &> /dev/null && pwd)
cd "$ROOT"
if (($# > 1)) || [[ ${1:-} != "" && ${1:-} != --check ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 1
fi
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT
status=0
# The data package and the game library do not depend on each other, so each gets its own module.
for target in "packages/data/src/generated/protocol.ts" "packages/game/src/generated/protocol.ts --game"; do
  read -r output flag <<< "$target"
  (
    cd "$ROOT/server/protocol"
    cargo run --quiet --locked --bin generate -- ${flag:+"$flag"}
  ) \
    | bunx --bun --no-install prettier --stdin-filepath "$output" > "$temporary"
  if [[ ${1:-} == --check ]]; then
    if ! diff -u "$output" "$temporary"; then
      status=1
    fi
  else
    mkdir -p "$(dirname "$output")"
    cp "$temporary" "$output"
  fi
done
if ((status != 0)); then
  echo "Wire contracts are stale. Run bash scripts/dev/generate-protocol.sh." >&2
fi
exit "$status"
