import {
  ArrowRight,
  Eye,
  LockKeyhole,
  Plus,
  Search,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";
import { useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import { optionFlags } from "./GameDialog";

export function TablesPanel({
  connection,
  create,
  join,
}: {
  connection: LobbyConnection;
  create: () => void;
  join: (table: Table) => void;
}) {
  const {
    tables,
    users,
    welcome,
    connection: status,
    pending,
  } = useSelector(
    (state: LobbyState) => ({
      tables: state.tables,
      users: state.users,
      welcome: state.welcome,
      connection: state.connection,
      pending: state.pending,
    }),
    shallowEqual,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [players, setPlayers] = useState("any");
  if (!welcome) {
    return null;
  }
  const online = status === "online";
  const all = Object.values(tables);
  const openCount = all.filter(
    (table) =>
      !table.running
      && !table.sharedReplay
      && table.numPlayers < table.maxPlayers,
  ).length;
  const visible = all
    .filter((table) => {
      if (
        !`${table.name} ${table.variant} ${table.players.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ) {
        return false;
      }
      if (
        players !== "any"
        && table.maxPlayers !== Number(players)
        && table.numPlayers !== Number(players)
      ) {
        return false;
      }
      switch (filter) {
        case "open": {
          return (
            !table.running
            && !table.sharedReplay
            && table.numPlayers < table.maxPlayers
          );
        }

        case "playing": {
          return table.running && !table.sharedReplay;
        }

        case "replays": {
          return table.sharedReplay;
        }

        case "friends": {
          return [
            ...table.players,
            ...table.spectators.map((person) => person.name),
          ].some((name) => welcome.friends.includes(name));
        }

        default: {
          return true;
        }
      }
    })
    .toSorted(
      (a, b) =>
        Number(b.joined) - Number(a.joined)
        || Number(a.running) - Number(b.running)
        || b.id - a.id,
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD COMPANY. GREAT CLUES.</span>
          <h1>Find your next table.</h1>
          <p>A familiar group or a new connection. There's a seat for you.</p>
        </div>
        <button
          className="primary"
          disabled={
            !online
            || pending !== null
            || welcome.maintenanceMode
            || welcome.shuttingDown
          }
          onClick={create}
        >
          <Plus size={18} /> Create a table
        </button>
      </div>
      {welcome.firstTimeUser && (
        <details className="welcome-guide">
          <summary>New around here? Your first good clue starts here.</summary>
          <p>
            You can see everyone's cards except your own. Give clues, build each
            color from 1 to 5, and trust your teammates. Start with "No Variant"
            and let your table know you're learning.
          </p>
          <a
            href="https://hanabi.github.io/beginner"
            rel="noreferrer"
            target="_blank"
          >
            Read the beginner's guide <ArrowRight size={14} />
          </a>
        </details>
      )}
      {welcome.playingAtTables.map((id) => (
        <button
          className="resume"
          disabled={!online}
          key={id}
          onClick={() => connection.attend(id)}
        >
          Your game is waiting. Resume table {id} <ArrowRight size={16} />
        </button>
      ))}
      <div className="lobby-stats">
        <span>
          <i className="status-dot online" />
          {openCount} open {openCount === 1 ? "table" : "tables"}
        </span>
        <span>
          {all.filter((table) => table.running && !table.sharedReplay).length}{" "}
          games in progress
        </span>
        <span>{Object.keys(users).length} people online</span>
      </div>
      <div className="table-toolbar">
        <label className="search-label">
          <Search size={16} />
          <input
            aria-label="Find a game"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tables, players, or variants..."
            type="search"
            value={search}
          />
        </label>
        <label className="compact-label">
          Players
          <select
            onChange={(event) => setPlayers(event.target.value)}
            value={players}
          >
            <option value="any">Any size</option>
            {[2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} players
              </option>
            ))}
          </select>
        </label>
      </div>
      <div aria-label="Table filters" className="filter-tabs table-filters">
        {(
          [
            ["all", "All tables"],
            ["open", "Open seats"],
            ["playing", "In progress"],
            ["replays", "Replays"],
            ["friends", "With friends"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <span>{visible.length}</span>
      </div>
      <div aria-label="Available tables" className="table-list">
        {visible.length === 0 && (
          <div className="empty">
            <Sparkles />
            <h2>
              {all.length > 0
                ? "No tables match just yet."
                : "A little quiet right now."}
            </h2>
            <p>
              {all.length > 0
                ? "Try another filter, or create exactly the game you want."
                : "Create a table and invite someone to play."}
            </p>
            <button
              disabled={!online || welcome.maintenanceMode}
              onClick={create}
            >
              Start a new table
            </button>
          </div>
        )}
        {visible.map((table) => (
          <article className="table-card" key={table.id}>
            <div className={`table-mark ${table.running ? "running" : ""}`}>
              <Sparkles />
            </div>
            <div className="table-info">
              <h2>
                {table.name}
                {table.passwordProtected && (
                  <LockKeyhole aria-label="Password protected" size={13} />
                )}
              </h2>
              <span>{table.variant}</span>
              <p className="table-player-names">
                {table.players.map((name, index) => (
                  <span key={name}>
                    {index > 0 && " \u{B7} "}
                    {!table.joined && !table.sharedReplay ? (
                      <button
                        aria-label={`Shadow ${name}`}
                        className="name-button"
                        disabled={!online}
                        onClick={() =>
                          connection.send("tableSpectate", {
                            tableID: table.id,
                            shadowingPlayerIndex: index,
                          })
                        }
                        title={`Watch from ${name}'s perspective`}
                      >
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </span>
                ))}
              </p>
              <div className="table-badges">
                {table.timed && (
                  <span>
                    <Timer size={12} />
                    {table.timeBase / 60}m + {table.timePerTurn}s
                  </span>
                )}
                {table.options.speedrun && <span>Speedrun</span>}
                {optionFlags
                  .filter(([key]) => table.options[key])
                  .map(([key, title]) => (
                    <span key={key}>{title}</span>
                  ))}
                {table.joined && <span className="mine-badge">Your table</span>}
              </div>
            </div>
            <div className="table-meta">
              <span>
                <Users size={15} />
                {table.numPlayers}/{table.maxPlayers}
              </span>
              <small>
                {table.sharedReplay
                  ? "Shared replay"
                  : table.running
                    ? `${table.progress}% complete`
                    : "Open table"}
              </small>
              {table.spectators.length > 0 && (
                <small>
                  <Eye size={12} /> {table.spectators.length} watching
                </small>
              )}
            </div>
            <div className="table-actions">
              <button
                disabled={!online || pending !== null}
                onClick={() =>
                  table.joined
                    ? connection.attend(table.id)
                    : table.running
                        || table.sharedReplay
                        || table.numPlayers >= table.maxPlayers
                      ? connection.send("tableSpectate", {
                          tableID: table.id,
                          shadowingPlayerIndex: -1,
                        })
                      : join(table)
                }
              >
                {table.joined
                  ? "Resume"
                  : table.running
                      || table.sharedReplay
                      || table.numPlayers >= table.maxPlayers
                    ? "Watch"
                    : "Join"}{" "}
                <ArrowRight size={16} />
              </button>
              {!table.running && !table.sharedReplay && !table.joined && (
                <button
                  className="text-button"
                  disabled={!online}
                  onClick={() =>
                    connection.send("tableSpectate", {
                      tableID: table.id,
                      shadowingPlayerIndex: -1,
                    })
                  }
                >
                  Watch table
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <footer className="lobby-footer">
        <span>Every good game begins with a little trust.</span>
        <Link to="/resources">
          Rules, conventions &amp; community <ArrowRight size={13} />
        </Link>
      </footer>
    </section>
  );
}
