import { getVariant } from "@hanabi-live/game";
import { shallowEqual, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";
import { ClassicTooltip } from "./ClassicTooltip";
import { optionFlags } from "./GameDialog";
import { GameOptionIcons } from "./GameOptionIcons";

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
  const player = game.players.some((person) => person.you);
  const table = tables[game.tableID];
  const { maxScore } = getVariant(game.options.variantName);
  return (
    <section className="room-panel classic-room-layout">
      <div className="classic-room-info" id="lobby-pregame-left">
        <h4 className="padding0p5">
          <strong>
            <i aria-hidden="true" className="fas fa-signature" />
            {"\u{A0} "}
            Name:
          </strong>
          <br />
          <span id="lobby-pregame-name">{game.name}</span>
        </h4>
        <h4 className="padding0p5">
          <strong>
            <i aria-hidden="true" className="fas fa-rainbow" />
            {"\u{A0} "}
            Variant:
          </strong>
          <br />
          <span id="lobby-pregame-variant">{game.options.variantName}</span>
        </h4>
        <h4 className="padding0p5">
          <strong>
            <i aria-hidden="true" className="fas fa-users" />
            {"\u{A0} "}
            Players:
          </strong>
          <br />
          <span id="lobby-pregame-seats">
            {game.players.length} / {game.maxPlayers}
          </span>
        </h4>
        {(game.options.timed
          || game.options.speedrun
          || game.passwordProtected
          || optionFlags.some(([key]) => game.options[key])) && (
          <h4 className="padding0p5">
            <span id="lobby-pregame-options-title">Options:</span>
            <br />
            <ul id="lobby-pregame-options">
              {game.passwordProtected && (
                <li>
                  <i
                    aria-label="Password protected"
                    className="fas fa-key"
                    title="This is a password-protected game."
                  />
                </li>
              )}
              <GameOptionIcons options={game.options} />
            </ul>
          </h4>
        )}
        <h4 className="padding0p5">
          <strong>
            <i aria-hidden="true" className="fas fa-glasses" />
            {"\u{A0} "}
            Spectators:
          </strong>
          <br />
          <ul className="classic-spectator-list" id="lobby-pregame-spectators">
            {table?.spectators.map((person) => (
              <li key={person.name}>
                &bull;{" "}
                <span
                  className={
                    person.name === welcome.username
                      ? "name-me"
                      : welcome.friends.includes(person.name)
                        ? "friend"
                        : ""
                  }
                >
                  {person.name}
                </span>
                {person.shadowingPlayerIndex !== -1 && (
                  <>
                    {" "}
                    ({"\u{1F575}\u{FE0F}"}{" "}
                    <em>{person.shadowingPlayerUsername}</em>)
                  </>
                )}
              </li>
            ))}
          </ul>
        </h4>
      </div>
      <div className="seat-grid lobby-pregame-players">
        {game.players.map((person) => {
          const selected =
            table?.spectators.some(
              (spectator) =>
                spectator.name === welcome.username
                && spectator.shadowingPlayerIndex === person.index,
            ) ?? false;
          const nameClass = person.you
            ? "name-me"
            : welcome.friends.includes(person.name)
              ? "friend"
              : "";
          return (
            <article className="seat" key={person.index}>
              <h2>
                {player ? (
                  <span className={nameClass}>{person.name}</span>
                ) : (
                  <button
                    aria-label={`${selected ? "Stop shadowing" : "Shadow"} ${person.name}`}
                    aria-pressed={selected}
                    className={`name-button ${nameClass} ${selected ? "unShadow" : "shadow"}`}
                    disabled={!online}
                    onClick={() =>
                      connection.send("tableSpectate", {
                        tableID: game.tableID,
                        shadowingPlayerIndex: selected ? -1 : person.index,
                      })
                    }
                  >
                    {person.name}
                    {selected && <> {"\u{1F575}\u{FE0F}"}</>}
                  </button>
                )}
              </h2>
              <div className="player-stats">
                <div>
                  <span>Total games:</span>
                  <span>{person.stats.numGames}</span>
                </div>
                <div>
                  <span>...of this variant:</span>
                  <span>{person.stats.variant.numGames}</span>
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
                <div>
                  <span>
                    {game.players.length === 1
                      ? "Best scores:"
                      : "Other best scores:"}
                  </span>
                  <ClassicTooltip label={`Best scores for ${person.name}`}>
                    {person.stats.variant.bestScores.map((score) => (
                      <div className="classic-score-row" key={score.numPlayers}>
                        <span>{score.numPlayers}-player:</span>
                        <span>
                          {score.score === maxScore ? (
                            <strong>
                              {score.score} / {maxScore}
                            </strong>
                          ) : (
                            `${score.score} / ${maxScore}`
                          )}
                          {score.score === maxScore && (
                            <>
                              {" "}
                              {"\u{A0}"}{" "}
                              <i
                                aria-label={
                                  score.modifier === 0
                                    ? "Unmodified"
                                    : "Modified"
                                }
                                className={`fas ${score.modifier === 0 ? "fa-check green" : "fa-times red"}`}
                              />
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </ClassicTooltip>
                </div>
              </div>
              {!person.present && (
                <p className="lobby-pregame-player-away">
                  <strong>AWAY</strong>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
