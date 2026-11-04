import { getVariant } from "@hanabi-live/game";
import { Play, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { HistoryGame } from "../protocol";
import type { LobbyState } from "../store";
import { GameOptionIcons } from "./GameOptionIcons";
import { Modal } from "./Modal";

function finished(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function HistoryPanel({ connection }: { connection: LobbyConnection }) {
  const state = useSelector(
    (value: LobbyState) => ({
      welcome: value.welcome,
      connection: value.connection,
      pending: value.pending,
      history: value.history,
      friendHistory: value.friendHistory,
      otherScores: value.otherScores,
      historyLoading: value.historyLoading,
      friendHistoryLoading: value.friendHistoryLoading,
      historyHasMore: value.historyHasMore,
      friendHistoryHasMore: value.friendHistoryHasMore,
    }),
    shallowEqual,
  );
  const [parameters] = useSearchParams();
  const friends = parameters.get("friends") === "1";
  const [search, setSearch] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  useEffect(() => {
    connection.send(friends ? "historyFriendsGet" : "historyGet", {
      offset: 0,
      amount: 10,
    });
  }, [friends, connection]);
  const allGames = Object.values(
    friends ? state.friendHistory : state.history,
  ).toSorted(
    (a, b) =>
      Date.parse(b.datetimeFinished) - Date.parse(a.datetimeFinished)
      || b.id - a.id,
  );
  const games = allGames.filter((game) =>
    `${game.id} ${game.options.variantName} ${game.playerNames.join(" ")} ${game.tags}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const loading = friends ? state.friendHistoryLoading : state.historyLoading;
  const hasMore = friends ? state.friendHistoryHasMore : state.historyHasMore;
  function replay(game: HistoryGame, visibility: "solo" | "shared") {
    connection.send("replayCreate", {
      source: "id",
      databaseID: game.id,
      visibility,
    });
  }

  function rows(list: readonly HistoryGame[], comparison = false) {
    return (
      <table className="alt history-table">
        <thead>
          <tr>
            <th>Game ID</th>
            <th># of Players</th>
            <th>Score</th>
            <th>Variant</th>
            <th>Options</th>
            <th>{friends || comparison ? "Players" : "Other Players"}</th>
            <th>Date Played</th>
            <th>Watch Replay</th>
            <th>Share Replay</th>
            <th>Other Scores</th>
          </tr>
        </thead>
        <tbody>
          {list.map((game) => (
            <tr className="history-card" key={game.id}>
              <td>#{game.id}</td>
              <td>{game.playerNames.length}</td>
              <td>
                {game.score}/{getVariant(game.options.variantName).maxScore}
              </td>
              <td>{game.options.variantName}</td>
              <td className="lobby-games-table-options">
                <GameOptionIcons options={game.options} />
              </td>
              <td>
                {game.playerNames
                  .filter(
                    (name) =>
                      friends || comparison || name !== state.welcome?.username,
                  )
                  .join(", ")}
              </td>
              <td>{finished(game.datetimeFinished)}</td>
              <td>
                <button
                  className="button fit margin0"
                  disabled={
                    state.connection !== "online" || state.pending !== null
                  }
                  onClick={() => replay(game, "solo")}
                >
                  <i aria-hidden="true" className="fas fa-eye" />
                  <span className="sr-only">Replay</span>
                </button>
              </td>
              <td>
                <button
                  aria-label={`Start shared replay ${game.id}`}
                  className="button fit margin0"
                  disabled={
                    state.connection !== "online" || state.pending !== null
                  }
                  onClick={() => replay(game, "shared")}
                >
                  <i aria-hidden="true" className="fas fa-users" />
                </button>
              </td>
              <td>
                <button
                  aria-label="Compare seed"
                  className="button fit margin0"
                  disabled={state.connection !== "online"}
                  onClick={() => {
                    setSeed(game.seed);
                    connection.send("historyGetSeed", {
                      seed: game.seed,
                      friends,
                    });
                  }}
                >
                  <i aria-hidden="true" className="fas fa-chart-bar" />{" "}
                  {Math.max(0, game.numGamesOnThisSeed - 1)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <section className="classic-history">
      <details className="classic-filters">
        <summary aria-label="Search history">
          <Search size={14} />
        </summary>
        <label className="search-label">
          <Search size={16} />
          <input
            aria-label="Search loaded history"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loaded games, players, and tags..."
            type="search"
            value={search}
          />
        </label>
      </details>
      <div className="classic-history-scroll">
        {games.length > 0 ? (
          rows(games)
        ) : (
          <div className="empty">
            <Play />
            <h2>{loading ? "Gathering your games..." : "No games found."}</h2>
            <p>
              {loading
                ? "Fetching history from the server."
                : "Finished games will appear here."}
            </p>
          </div>
        )}
      </div>
      <div className="classic-history-footer">
        {hasMore && (
          <button
            className="load-more"
            disabled={loading || state.connection !== "online"}
            onClick={() =>
              connection.send(friends ? "historyFriendsGet" : "historyGet", {
                offset: allGames.length,
                amount: 10,
              })
            }
          >
            {loading ? "Loading..." : "Show More History"}
          </button>
        )}
        <a
          className="button"
          href={`/history/${encodeURIComponent(state.welcome?.username ?? "")}`}
          rel="noreferrer"
          target="_blank"
        >
          <i aria-hidden="true" className="fas fa-history" /> All History
        </a>
      </div>
      {seed !== null && (
        <Modal
          close={() => setSeed(null)}
          description={seed}
          title="Other Scores"
        >
          <div className="classic-history-scroll">
            {rows(
              state.otherScores.filter((game) => game.seed === seed),
              true,
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
