import { ArrowUpRight, Play, Search, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { HistoryGame } from "../protocol";
import type { LobbyState } from "../store";
import { Modal } from "./Modal";

function finished(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
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
  const [friends, setFriends] = useState(false);
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

  function rows(list: readonly HistoryGame[]) {
    return (
      <div className="history-list">
        {list.map((game) => (
          <article className="history-card" key={game.id}>
            <div className={`score-badge ${game.score === 0 ? "failed" : ""}`}>
              <strong>{game.score}</strong>
              <small>points</small>
            </div>
            <div className="table-info">
              <h2>{game.options.variantName}</h2>
              <p>{game.playerNames.join(" \u{B7} ")}</p>
              <small>
                #{game.id} &middot; {finished(game.datetimeFinished)} &middot;{" "}
                {game.numTurns} turns
              </small>
              {game.tags && <p className="tags">{game.tags}</p>}
            </div>
            <div className="history-actions">
              <button
                disabled={
                  state.connection !== "online" || state.pending !== null
                }
                onClick={() => replay(game, "solo")}
              >
                <Play size={15} /> Replay
              </button>
              <button
                aria-label={`Start shared replay ${game.id}`}
                className="icon-button"
                disabled={state.connection !== "online"}
                onClick={() => replay(game, "shared")}
              >
                <Share2 size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setSeed(game.seed);
                  connection.send("historyGetSeed", {
                    seed: game.seed,
                    friends,
                  });
                }}
              >
                Compare seed
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY GAME TELLS A STORY</span>
          <h1>Your table history.</h1>
          <p>Revisit a great solve. Learn from the near misses.</p>
        </div>
        <a
          className="button-link"
          href={`/history/${encodeURIComponent(state.welcome?.username ?? "")}`}
          rel="noreferrer"
          target="_blank"
        >
          Public history <ArrowUpRight size={16} />
        </a>
      </div>
      <div aria-label="History source" className="filter-tabs">
        <button aria-pressed={!friends} onClick={() => setFriends(false)}>
          Your games
        </button>
        <button aria-pressed={friends} onClick={() => setFriends(true)}>
          Friends' games
        </button>
      </div>
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
      {games.length > 0 ? (
        rows(games)
      ) : (
        <div className="empty">
          <Play />
          <h2>
            {loading
              ? "Gathering your games..."
              : "Your next story starts at a table."}
          </h2>
          <p>
            {loading
              ? "Fetching history from the server."
              : "Finished games will appear here."}
          </p>
        </div>
      )}
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
          {loading ? "Loading..." : "Load more games"}
        </button>
      )}
      {seed !== null && (
        <Modal
          close={() => setSeed(null)}
          description={seed}
          title="The same cards. Different stories."
        >
          {rows(state.otherScores.filter((game) => game.seed === seed))}
        </Modal>
      )}
    </section>
  );
}
