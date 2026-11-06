#!/usr/bin/env bash

# Used by the migration runner and CI after sourcing this file.
# shellcheck disable=SC2034
readonly TERN_VERSION="v2.4.3"

get_migration_version() {
  local directory="$1" file name prefix version=0
  local -a names=()
  if [[ ! -d $directory ]]; then
    echo "Missing migrations directory: $directory" >&2
    return 1
  fi
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
    echo 0
    return
  fi
  while IFS= read -r name; do
    prefix="${name%%_*}"
    if ((10#$prefix != version + 1)); then
      echo "Migration numbers must be unique and consecutive from 001: $name" >&2
      return 1
    fi
    ((version += 1))
  done < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort -n)
  echo "$version"
}
