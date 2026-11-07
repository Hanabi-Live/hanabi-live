#!/usr/bin/env bash

# Used by the migration runner and CI after sourcing this file.
# shellcheck disable=SC2034
readonly TERN_VERSION="v2.4.3"

get_migration_baseline() {
  local file="$1/baseline.txt" baseline
  if [[ ! -f $file || -L $file ]]; then
    echo "Missing or invalid migration baseline: $file" >&2
    return 1
  fi
  baseline="$(cat "$file")" || return 1
  if [[ ! $baseline =~ ^(0|[1-9][0-9]{0,8})$ ]]; then
    echo "Invalid migration baseline: $file" >&2
    return 1
  fi
  echo "$baseline"
}

get_migration_version() {
  local directory="$1" file name prefix version
  local -a names=()
  if [[ ! -d $directory ]]; then
    echo "Missing migrations directory: $directory" >&2
    return 1
  fi
  version="$(get_migration_baseline "$directory")" || return 1
  for file in "$directory"/*.sql; do
    if [[ ! -e $file && ! -L $file ]]; then
      continue
    fi
    name="${file##*/}"
    if [[ ! -f $file || -L $file || ! $name =~ ^[0-9]{3,9}_[a-z0-9_]+\.sql$ ]]; then
      echo "Invalid migration file: $name" >&2
      return 1
    fi
    if grep --quiet --fixed-strings -- "---- create above / drop below ----" "$file"; then
      echo "Down migrations are not supported: $name" >&2
      return 1
    elif [[ $? -ne 1 ]]; then
      echo "Failed to read migration: $name" >&2
      return 1
    fi
    names+=("$name")
  done
  if ((${#names[@]} == 0)); then
    echo "$version"
    return
  fi
  while IFS= read -r name; do
    prefix="${name%%_*}"
    if ((10#$prefix != version + 1)); then
      echo "Migration numbers must be unique and consecutive after the baseline: $name" >&2
      return 1
    fi
    ((version += 1))
  done < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort -n)
  echo "$version"
}

# Tern requires every numbered slot from 1, even for versions already applied.
# These temporary guards preserve its numbering without retaining retired SQL.
prepare_tern_migrations() {
  local directory="$1" output="$2" baseline number file name
  get_migration_version "$directory" > /dev/null || return 1
  baseline="$(get_migration_baseline "$directory")" || return 1
  for ((number = 1; number <= baseline; number++)); do
    printf -v name '%03d_baseline.sql' "$number"
    printf "DO \$\$ BEGIN RAISE EXCEPTION 'Upgrade to schema baseline %s with an earlier release first.'; END \$\$;\n" \
      "$baseline" > "$output/$name" || return 1
  done
  for file in "$directory"/*.sql; do
    [[ -e $file ]] || continue
    cp -- "$file" "$output/" || return 1
  done
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  set -euo pipefail
  get_migration_version "$1"
fi
