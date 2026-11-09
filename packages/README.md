# Hanab Live Packages

The TypeScript code is split up into several different packages. (The server is
written in Rust and lives in the [`server`](../server) directory.)

| Name    | Description                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| client  | The client code that is downloaded when you surf to the website.                                                  |
| data    | Constants, types, and generated protocol schemas that are shared by the other packages.                           |
| game    | Contains the rules for the game. Can compute the next game state, given an existing game state and a game action. |
| scripts | Scripts for development, building, and deployment.                                                                |
| testing | Integration tests that run against the compiled server.                                                           |
