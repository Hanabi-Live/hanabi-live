import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Crown,
  Eye,
  Settings2,
  UserPlus,
} from "lucide-react";
import { shallowEqual, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import { optionFlags } from "./GameDialog";

export function PregamePanel({
  connection,
  edit,
  join,
}: {
  connection: LobbyConnection;
  edit: () => void;
  join: (table: Table) => void;
}) {
  const {
    pregame: game,
    welcome,
    tables,
    connection: status,
    pending,
    directoryReady,
  } = useSelector(
    (state: LobbyState) => ({
      pregame: state.pregame,
      welcome: state.welcome,
      tables: state.tables,
      connection: state.connection,
      pending: state.pending,
      directoryReady: state.directoryReady,
    }),
    shallowEqual,
  );
  const { id } = useParams();
  if (!game || !welcome) {
    const available = id !== undefined && tables[Number(id)] !== undefined;
    return (
      <div className="empty">
        <h2>
          {directoryReady && !available
            ? "That table is no longer available."
            : "Getting your table ready..."}
        </h2>
        <p>Check your connection or choose another table.</p>
        <Link className="button-link" to="/">
          Return to the lobby
        </Link>
      </div>
    );
  }
  const online = status === "online";
  const owner = game.owner === welcome.userID;
  const player = game.players.some((person) => person.you);
  const table = tables[game.tableID];
  return (
    <section className="room-panel">
      <button
        className="text-button back-link"
        disabled={!online}
        onClick={() =>
          connection.send("tableUnattend", { tableID: game.tableID })
        }
      >
        <ArrowLeft size={15} /> Back to tables
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD THINGS TAKE TEAMWORK</span>
          <h1>{game.name}</h1>
          <p>
            {game.options.variantName} &middot; {game.players.length} /{" "}
            {game.maxPlayers} seats
          </p>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard
              .writeText(
                `${globalThis.location.origin}/new/table/${game.tableID}`,
              )
              .then(() => connection.notice("Table invitation copied."))
              .catch(() =>
                connection.notice(
                  "Unable to copy the invitation. Copy this page's address instead.",
                ),
              );
          }}
        >
          <Copy size={15} /> Invite a friend
        </button>
      </div>
      <div className="table-badges">
        {game.options.timed && (
          <span>
            Timed: {game.options.timeBase / 60}m + {game.options.timePerTurn}s
          </span>
        )}
        {game.options.speedrun && <span>Speedrun</span>}
        {game.passwordProtected && <span>Password protected</span>}
        {optionFlags
          .filter(([key]) => game.options[key])
          .map(([key, title]) => (
            <span key={key}>{title}</span>
          ))}
      </div>
      <div className="seat-grid">
        {game.players.map((person) => (
          <article className="seat" key={person.index}>
            <div className="seat-top">
              <span className="avatar">{person.name.slice(0, 1)}</span>
              {person.you && <span className="you-badge">You</span>}
            </div>
            <h2>{person.name}</h2>
            <small className={person.present ? "ready-text" : ""}>
              {person.present ? (
                <>
                  <Check size={13} /> At the table
                </>
              ) : (
                "Away"
              )}
            </small>
            <div className="player-stats">
              <span>{person.stats.numGames.toLocaleString()} games played</span>
              <span>{person.stats.variant.numGames} in this variant</span>
              <details>
                <summary>Best scores</summary>
                {person.stats.variant.bestScores.map((score) => (
                  <div key={score.numPlayers}>
                    {score.numPlayers} players: <strong>{score.score}</strong>
                    {score.modifier === 0 ? "" : " (modified)"}
                  </div>
                ))}
              </details>
            </div>
            {owner && !person.you && (
              <div className="seat-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    connection.send("tableSetLeader", {
                      tableID: game.tableID,
                      name: person.name,
                    })
                  }
                >
                  <Crown size={13} /> Make host
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    connection.send("chat", {
                      room: `table${game.tableID}`,
                      msg: `/kick ${person.name}`,
                    })
                  }
                >
                  Remove
                </button>
              </div>
            )}
            {!player && (
              <button
                disabled={!online}
                onClick={() =>
                  connection.send("tableSpectate", {
                    tableID: game.tableID,
                    shadowingPlayerIndex: person.index,
                  })
                }
              >
                <Eye size={14} /> Shadow
              </button>
            )}
          </article>
        ))}
        {Array.from(
          { length: Math.max(0, game.maxPlayers - game.players.length) },
          (_, index) => (
            <div className="seat empty-seat" key={`empty-${index}`}>
              <UserPlus />
              <strong>A place for someone good.</strong>
              {!player && table && (
                <button disabled={!online} onClick={() => join(table)}>
                  Take this seat
                </button>
              )}
            </div>
          ),
        )}
      </div>
      <div className="pregame-controls">
        <div className="actions">
          {owner && (
            <button
              className="primary"
              disabled={!online || pending !== null || game.players.length < 2}
              onClick={() =>
                connection.send("tableStart", {
                  tableID: game.tableID,
                  intendedPlayers: game.players.map((person) => person.name),
                })
              }
            >
              Start game <ArrowRight size={17} />
            </button>
          )}
          <button disabled={!online} onClick={edit}>
            <Settings2 size={16} />
            {owner ? "Table options" : "Suggest options"}
          </button>
          {player && game.players.length >= 2 && (
            <button
              disabled={!online}
              onClick={() => {
                connection.send("tableLeave", { tableID: game.tableID });
                connection.send("tableSpectate", {
                  tableID: game.tableID,
                  shadowingPlayerIndex: -1,
                });
              }}
            >
              Watch instead
            </button>
          )}
        </div>
        <button
          className="danger-text"
          disabled={!online}
          onClick={() =>
            connection.send(player ? "tableLeave" : "tableUnattend", {
              tableID: game.tableID,
            })
          }
        >
          {player ? "Leave table" : "Stop watching"}
        </button>
      </div>
      {table && table.spectators.length > 0 && (
        <div className="spectator-list">
          <Eye size={16} /> Watching:{" "}
          {table.spectators
            .map(
              (person) =>
                `${person.name}${person.shadowingPlayerUsername ? ` (shadowing ${person.shadowingPlayerUsername})` : ""}`,
            )
            .join(", ")}
        </div>
      )}
      <p className="room-tip">
        {owner
          ? "Everyone here? Start when your teammates are ready."
          : "Your host will start the game when everyone is ready."}{" "}
        Table chat is available in Conversation.
      </p>
    </section>
  );
}
