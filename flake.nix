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
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
            nodejs_20
            postgresql_16
            redis
            gnumake
            gcc
            bash
            nodePackages.npm
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
