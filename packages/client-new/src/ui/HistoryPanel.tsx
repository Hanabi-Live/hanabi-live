import { getVariant } from "@hanabi-live/game";
import { Play, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { HistoryGame } from "../protocol";
import { wireHistory } from "../protocol";
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

function SeedComparison({
  seed,
  renderRows,
}: {
  seed: string;
  renderRows: (games: readonly HistoryGame[]) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [games, setGames] = useState<HistoryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setGames([]);
    async function load() {
      try {
        const response = await fetch(
          `/api/v1/seed-full/${encodeURIComponent(seed)}?size=10&page=${page}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10_000),
            ]),
          },
        );
        if (!response.ok) {
          throw new Error(`Unable to load seed history (${response.status}).`);
        }
        const data: unknown = await response.json();
        const parsed = wireHistory.array().parse(data);
        if (!controller.signal.aborted) {
          setGames(parsed);
        }
      } catch (error_) {
        if (!controller.signal.aborted) {
          console.error("Unable to load seed history", error_);
          setError(
            error_ instanceof Error
              ? error_.message
              : "Unable to load seed history.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [seed, page, attempt]);
  return (
    <>
      {loading ? (
        <p role="status">Loading other scores...</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>
            Retry comparison
          </button>
        </div>
      ) : games.length === 0 ? (
        <p>No more games for this seed.</p>
      ) : (
        <div className="classic-history-scroll">{renderRows(games)}</div>
      )}
      <div className="actions">
        <button
          disabled={loading || page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous page
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={loading || error !== "" || games.length < 10}
          onClick={() => setPage((value) => value + 1)}
        >
          Next page
        </button>
        <a
          href={`/seed/${encodeURIComponent(seed)}`}
          rel="noreferrer"
          target="_blank"
        >
          View seed data
        </a>
      </div>
    </>
  );
}

export function HistoryPanel({ connection }: { connection: LobbyConnection }) {
  const state = useSelector(
    (value: LobbyState) => ({
      welcome: value.welcome,
      connection: value.connection,
      pending: value.pending,
      history: value.history,
      friendHistory: value.friendHistory,
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
    if (state.connection !== "online") {
      return;
    }
    connection.send(friends ? "historyFriendsGet" : "historyGet", {
      offset: 0,
      amount: 10,
    });
  }, [friends, connection, state.connection]);
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
          <SeedComparison
            key={seed}
            renderRows={(comparisonGames) => rows(comparisonGames, true)}
            seed={seed}
          />
        </Modal>
      )}
    </section>
  );
}
