import { errorDetails } from "@hanabi-live/data";
import { Copy, Crown, Eye } from "lucide-react";
import { shallowEqual, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";
import { optionFlags } from "./GameDialog";

export function PregamePanel({ connection }: { connection: LobbyConnection }) {
  const {
    pregame: game,
    welcome,
    tables,
    connection: status,
    directoryReady,
  } = useSelector(
    (state: LobbyState) => ({
      pregame: state.pregame,
      welcome: state.welcome,
      tables: state.tables,
      connection: state.connection,
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
    <section className="room-panel classic-room-layout">
      <div className="classic-room-info">
        <div className="classic-room-field">
          <strong>
            <i aria-hidden="true" className="fas fa-signature" /> Name:
          </strong>
          <h2 className="classic-room-name">{game.name}</h2>
        </div>
        <h4>
          <strong>
            <i aria-hidden="true" className="fas fa-rainbow" /> Variant:
          </strong>
          <span>{game.options.variantName}</span>
        </h4>
        <h4>
          <strong>
            <i aria-hidden="true" className="fas fa-users" /> Players:
          </strong>
          <span>
            {game.players.length} / {game.maxPlayers}
          </span>
        </h4>
        {(game.options.timed
          || game.options.speedrun
          || game.passwordProtected
          || optionFlags.some(([key]) => game.options[key])) && (
          <>
            <h4>
              <strong>Options:</strong>
            </h4>
            <div className="table-badges">
              {game.options.timed && (
                <span>
                  Timed: {game.options.timeBase / 60}m +{" "}
                  {game.options.timePerTurn}s
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
          </>
        )}
        <h4>
          <strong>
            <i aria-hidden="true" className="fas fa-glasses" /> Spectators:
          </strong>
          <span>
            {table && table.spectators.length > 0
              ? table.spectators.map((person) => person.name).join(", ")
              : ""}
          </span>
        </h4>
        <button
          aria-label="Invite a friend"
          className="classic-invite"
          onClick={() => {
            void navigator.clipboard
              .writeText(
                `${globalThis.location.origin}/new/table/${game.tableID}`,
              )
              .then(() => connection.notice("Table invitation copied."))
              .catch((error: unknown) =>
                connection.notice(
                  `${errorDetails(error, "Copying the invitation")} Copy this page's address instead.`,
                ),
              );
          }}
        >
          <Copy size={15} />
        </button>
      </div>
      <div className="seat-grid">
        {game.players.map((person) => (
          <article className="seat" key={person.index}>
            <h2>
              <a
                className={
                  person.you
                    ? "name-me"
                    : welcome.friends.includes(person.name)
                      ? "friend"
                      : ""
                }
                href={`/scores/${encodeURIComponent(person.name)}`}
                rel="noreferrer"
                target="_blank"
              >
                {person.name}
              </a>
            </h2>
            <div className="player-stats">
              <div>
                <span>Total games:</span>
                <span>{person.stats.numGames}</span>
              </div>
              <div>
                <span>...of this variant:</span>
                <span>
                  {person.stats.variant.numGames
                    - person.stats.variant.numStrikeouts}
                </span>
              </div>
              <div>
                <span>Average score:</span>
                <span>
                  {person.stats.variant.averageScore === 0
                    ? "-"
                    : Math.round(person.stats.variant.averageScore * 10) / 10}
                </span>
              </div>
              <div>
                <span>Strikeout rate:</span>
                <span>
                  {person.stats.variant.numGames === 0
                    ? "-"
                    : `${Math.round((person.stats.variant.numStrikeouts / person.stats.variant.numGames) * 1000) / 10}%`}
                </span>
              </div>
              {game.players.length > 1 && (
                <div>
                  <span>{game.players.length}-player best score:</span>
                  <span>
                    {person.stats.variant.bestScores.find(
                      (score) => score.numPlayers === game.players.length,
                    )?.score ?? "-"}
                  </span>
                </div>
              )}
              <details>
                <summary>
                  {game.players.length === 1
                    ? "Best scores:"
                    : "Other best scores:"}
                  <i aria-hidden="true" className="fas fa-chart-area green" />
                </summary>
                {person.stats.variant.bestScores.map((score) => (
                  <div key={score.numPlayers}>
                    {score.numPlayers} players: <strong>{score.score}</strong>
                    {score.modifier === 0 ? "" : " (modified)"}
                  </div>
                ))}
              </details>
            </div>
            {!person.present && (
              <p className="lobby-pregame-player-away">
                <strong>AWAY</strong>
              </p>
            )}
            {owner && !person.you && (
              <details className="seat-actions">
                <summary aria-label={`Actions for ${person.name}`}>
                  <i aria-hidden="true" className="fas fa-ellipsis-v" />
                </summary>
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
              </details>
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
      </div>
    </section>
  );
}
