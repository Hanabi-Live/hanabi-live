import { shallowEqual, useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";

export function ClassicHeader({
  connection,
  create,
  edit,
  join,
}: {
  connection: LobbyConnection;
  create: () => void;
  edit: () => void;
  join: (table: Table) => void;
}) {
  const { welcome, pregame, tables, pending, online, historyCount } =
    useSelector(
      (state: LobbyState) => ({
        welcome: state.welcome,
        pregame: state.pregame,
        tables: state.tables,
        pending: state.pending,
        online: state.connection === "online",
        historyCount: Object.keys(state.history).length,
      }),
      shallowEqual,
    );
  const { pathname, search }: { pathname: string; search: string } =
    useLocation();
  const game = pathname.startsWith("/table/") ? pregame : null;
  const player = game?.players.some((person) => person.you) ?? false;
  const owner = game?.owner === welcome?.userID;
  return (
    <header id="header">
      <h1 className="lobby-header">
        <Link aria-label="Play" to="/">
          <img
            alt="Hanab Live"
            className="classic-navbar-logo"
            src="/public/img/logos/navbar.svg"
          />
        </Link>
      </h1>
      {welcome && (
        <nav aria-label="Main navigation" id="nav">
          <ul>
            {game ? (
              <>
                <li>
                  <button
                    aria-label="Start game"
                    className="button"
                    disabled={
                      !online
                      || !owner
                      || pending !== null
                      || game.players.length < 2
                    }
                    onClick={() =>
                      connection.send("tableStart", {
                        tableID: game.tableID,
                        intendedPlayers: game.players.map(
                          (person) => person.name,
                        ),
                      })
                    }
                  >
                    <i aria-hidden="true" className="fas fa-play nav-icon" />
                    <span className="hidden-xs">Start Game</span>
                  </button>
                </li>
                {!player && (
                  <li>
                    <button
                      aria-label="Join game"
                      className="button"
                      disabled={
                        !online || pending !== null || !tables[game.tableID]
                      }
                      onClick={() => {
                        const table = tables[game.tableID];
                        if (table) {
                          join(table);
                        }
                      }}
                    >
                      <i
                        aria-hidden="true"
                        className="fas fa-sign-in-alt nav-icon"
                      />
                      <span className="hidden-xs">Join Game</span>
                    </button>
                  </li>
                )}
                <li>
                  <button
                    aria-label="Watch instead"
                    className="button"
                    disabled={!online || (player && game.players.length < 2)}
                    onClick={() => {
                      if (player) {
                        connection.send("tableLeave", {
                          tableID: game.tableID,
                        });
                      }
                      connection.send("tableSpectate", {
                        tableID: game.tableID,
                        shadowingPlayerIndex: -1,
                      });
                    }}
                  >
                    <i aria-hidden="true" className="fas fa-ghost nav-icon" />
                    <span className="hidden-xs">Spectate Game</span>
                  </button>
                </li>
                <li>
                  <button
                    aria-label={owner ? "Table options" : "Suggest options"}
                    className="button"
                    disabled={!online}
                    onClick={edit}
                  >
                    <i aria-hidden="true" className="fas fa-rainbow nav-icon" />
                    <span className="hidden-md">Change Options</span>
                  </button>
                </li>
                <li>
                  <button
                    aria-label="Back to tables"
                    className="button"
                    disabled={!online}
                    onClick={() =>
                      connection.send("tableUnattend", {
                        tableID: game.tableID,
                      })
                    }
                  >
                    <i aria-hidden="true" className="fas fa-pause nav-icon" />
                    <span className="hidden-md">Return to Lobby</span>
                  </button>
                </li>
                <li>
                  <button
                    aria-label={player ? "Leave table" : "Stop watching"}
                    className="button"
                    disabled={!online}
                    onClick={() =>
                      connection.send(player ? "tableLeave" : "tableUnattend", {
                        tableID: game.tableID,
                      })
                    }
                  >
                    <i aria-hidden="true" className="fas fa-times nav-icon" />
                    <span className="hidden-xs">Leave Game</span>
                  </button>
                </li>
              </>
            ) : pathname === "/history" ? (
              <>
                {new URLSearchParams(search).get("friends") === "1" ? (
                  <li>
                    <Link className="button" to="/history">
                      <i
                        aria-hidden="true"
                        className="fas fa-history nav-icon"
                      />
                      Return to History
                    </Link>
                  </li>
                ) : (
                  <>
                    <li className="hidden-sm">
                      Shown games: {historyCount} / {welcome.totalGames}
                    </li>
                    <li>
                      <Link
                        aria-label="Show History of Friends"
                        className="button"
                        to="/history?friends=1"
                      >
                        <i
                          aria-hidden="true"
                          className="fas fa-heart nav-icon"
                        />
                        <span className="hidden-sm">
                          Show History of Friends
                        </span>
                      </Link>
                    </li>
                    <li>
                      <Link
                        aria-label="Return to Lobby"
                        className="button"
                        to="/"
                      >
                        <i
                          aria-hidden="true"
                          className="fas fa-home nav-icon"
                        />
                        Return to Lobby
                      </Link>
                    </li>
                  </>
                )}
              </>
            ) : (
              <>
                <li>
                  <button
                    aria-label="Create a table"
                    className="button"
                    disabled={
                      !online
                      || pending !== null
                      || welcome.maintenanceMode
                      || welcome.shuttingDown
                    }
                    onClick={create}
                  >
                    <i aria-hidden="true" className="fas fa-plus nav-icon" />
                    <span className="hidden-xs">
                      New<span className="hidden-xl"> Game</span>
                    </span>
                  </button>
                </li>
                <li className="hidden-xs">
                  <Link className="button" to="/history">
                    <i aria-hidden="true" className="fas fa-history nav-icon" />
                    History
                  </Link>
                </li>
                <li>
                  <Link aria-label="Replays" className="button" to="/replays">
                    <i aria-hidden="true" className="fas fa-eye nav-icon" />
                    <span className="hidden-xs">
                      <span className="hidden-xl">Watch </span>Replay
                    </span>
                  </Link>
                </li>
                <li className="hidden-xs">
                  <a
                    aria-label="Stats"
                    className="button"
                    href="/stats"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <i
                      aria-hidden="true"
                      className="fas fa-chart-area nav-icon"
                    />
                    <span className="hidden-md">Stats</span>
                  </a>
                </li>
                <li className="hidden-xs">
                  <Link className="button" to="/resources">
                    <i aria-hidden="true" className="fas fa-link nav-icon" />
                    <span className="hidden-md">Resources</span>
                  </Link>
                </li>
                <li>
                  <Link aria-label="Settings" className="button" to="/settings">
                    <i aria-hidden="true" className="fas fa-cog nav-icon" />
                    <span className="hidden-md">Settings</span>
                  </Link>
                </li>
                <li className="hidden-xs">
                  <a
                    className="button help-button"
                    href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <i
                      aria-hidden="true"
                      className="fas fa-question-circle nav-icon"
                    />
                    <span className="hidden-md">Help</span>
                  </a>
                </li>
                <li>
                  <button
                    aria-label="Sign out"
                    className="button"
                    onClick={() => {
                      void connection.logout();
                    }}
                  >
                    <i
                      aria-hidden="true"
                      className="fas fa-sign-out-alt nav-icon"
                    />
                    <span className="hidden-md">Sign Out</span>
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
