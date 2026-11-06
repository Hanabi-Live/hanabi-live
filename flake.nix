{
  description = "Hanabi Live Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        bunVersion = pkgs.lib.removePrefix "bun@"
          (builtins.fromJSON (builtins.readFile ./package.json)).packageManager;
        bunSources = {
          aarch64-darwin = {
            archive = "bun-darwin-aarch64.zip";
            hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
          };
          x86_64-darwin = {
            archive = "bun-darwin-x64-baseline.zip";
            hash = "sha256-1KFVrfv9CRVes7oFyeOlRPOSl9emhhbTx3WfZ6tcR9w=";
          };
          aarch64-linux = {
            archive = "bun-linux-aarch64.zip";
            hash = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
          };
          x86_64-linux = {
            archive = "bun-linux-x64.zip";
            hash = "sha256-v4zL+ysLgBWeD5ptFcVTF63YB3U028YTCj7bUvzLOVw=";
          };
        };
        bun = pkgs.bun.overrideAttrs (_final: previous:
          let
            sources = builtins.mapAttrs (_system: source: pkgs.fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${source.archive}";
              inherit (source) hash;
            }) bunSources;
          in {
            version = bunVersion;
            src = sources.${system};
            passthru = previous.passthru // { inherit sources; };
          });
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
            postgresql_16
            redis
            gnumake
            gcc
            bash
            shellcheck
            bun
          ];

          shellHook = ''
            export PGDATA="$PWD/.direnv/postgres"
            export REDISDATA="$PWD/.direnv/redis"
            export HOST="127.0.0.1"
            
            mkdir -p "$PGDATA" "$REDISDATA"

            # Setup PostgreSQL
            if [ ! -d "$PGDATA" ] || [ -z "$(ls -A "$PGDATA")" ]; then
              initdb -D "$PGDATA"
              echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
              pg_ctl -D "$PGDATA" -l "$PGDATA/log" -o "-k $PGDATA" start
              # Wait for postgres to start
              sleep 2
              createdb -h localhost hanabi || true
              psql -h localhost -d hanabi -f install/database_schema.sql || true
              pg_ctl -D "$PGDATA" stop
            fi

            echo "---------------------------------------------------"
            echo "Hanabi Live Dev Shell"
            echo "---------------------------------------------------"
            echo "To start the services, run:"
            echo "  pg_ctl -D \$PGDATA -l \$PGDATA/log -o \"-k \$PGDATA\" start"
            echo "  redis-server --dir \$REDISDATA --port 6379 --daemonize yes"
            echo ""
            echo "Then run the development server:"
            echo "  ./dev.sh"
            echo "---------------------------------------------------"
          '';
        };
      }
    );
}
