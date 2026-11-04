import { useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import { optionFlags } from "./GameDialog";

const optionIcons = [
  "sync-alt",
  "blind",
  "expand",
  "plus-circle",
  "minus-circle",
  "layer-group",
  "chess-knight",
] as const;

export function TablesPanel({
  connection,
  create,
  join,
}: {
  connection: LobbyConnection;
  create: () => void;
  join: (table: Table) => void;
}) {
  const { tables, welcome, online, pending } = useSelector(
    (state: LobbyState) => ({
      tables: state.tables,
      welcome: state.welcome,
      online: state.connection === "online",
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
  const all = Object.values(tables);
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
  function activate(table: Table) {
    if (!online || pending !== null) {
      return;
    }
    if (table.joined) {
      connection.attend(table.id);
    } else if (
      table.running
      || table.sharedReplay
      || table.numPlayers >= table.maxPlayers
    ) {
      connection.send("tableSpectate", {
        tableID: table.id,
        shadowingPlayerIndex: -1,
      });
    } else {
      join(table);
    }
  }
  if (all.length === 0) {
    return (
      <div className="classic-empty">
        <h3>No current games.</h3>
      </div>
    );
  }
  return (
    <section aria-label="Available tables" className="classic-games-view">
      <h3 className="lobby-title">List of games</h3>
      <details className="classic-filters">
        <summary aria-label="Filter games" title="Filter games">
          <i aria-hidden="true" className="fas fa-filter" />
        </summary>
        <div className="table-toolbar">
          <label>
            Search
            <input
              aria-label="Find a game"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tables, players, or variants"
              type="search"
              value={search}
            />
          </label>
          <label>
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
          </div>
        </div>
      </details>
      <div className="lobby-table-container">
        <table className="alt" id="lobby-games-table">
          <thead>
            <tr>
              <th>Name</th>
              <th># of Players</th>
              <th>Variant</th>
              <th>Options</th>
              <th>Status</th>
              <th>Players</th>
              <th>Spectators</th>
            </tr>
          </thead>
          <tbody id="lobby-games-table-tbody">
            {visible.map((table) => {
              const kind = table.sharedReplay
                ? "replay"
                : table.joined
                  ? "joined"
                  : table.running
                    ? "started"
                    : table.passwordProtected
                      ? "unstarted-password"
                      : "unstarted";
              const action = table.joined
                ? "Resume"
                : table.running
                    || table.sharedReplay
                    || table.numPlayers >= table.maxPlayers
                  ? "Watch"
                  : "Join";
              return (
                <tr
                  aria-label={`${action} ${table.name}`}
                  className={`table-card lobby-games-table-${kind} ${table.numPlayers >= table.maxPlayers ? "full" : ""}`}
                  key={table.id}
                  onClick={() => activate(table)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget
                      && (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      activate(table);
                    }
                  }}
                  tabIndex={online && pending === null ? 0 : -1}
                >
                  <td>
                    <button
                      aria-label={action}
                      className="classic-row-name"
                      disabled={!online || pending !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        activate(table);
                      }}
                    >
                      {table.passwordProtected && !table.running && (
                        <i
                          aria-label="Password protected"
                          className="fas fa-key"
                        />
                      )}{" "}
                      {table.name}
                    </button>
                  </td>
                  <td>
                    {table.running || table.sharedReplay
                      ? table.numPlayers
                      : `${table.numPlayers} / ${table.maxPlayers}`}
                  </td>
                  <td>{table.variant}</td>
                  <td className="lobby-games-table-options">
                    {table.timed && (
                      <i
                        aria-label="Timed"
                        className="fas fa-clock"
                        title={`Timed: ${table.timeBase / 60}m + ${table.timePerTurn}s`}
                      />
                    )}
                    {table.options.speedrun && (
                      <i
                        aria-label="Speedrun"
                        className="fas fa-running"
                        title="Speedrun"
                      />
                    )}
                    {optionFlags.map(
                      ([key, title], index) =>
                        table.options[key] && (
                          <i
                            aria-label={title}
                            className={`fas fa-${optionIcons[index]}`}
                            key={key}
                            title={title}
                          />
                        ),
                    )}
                  </td>
                  <td>
                    {table.sharedReplay
                      ? "Reviewing"
                      : table.running
                        ? "Running"
                        : "Not Started"}
                  </td>
                  <td>
                    {table.players.map((name, index) => (
                      <span key={name}>
                        {index > 0 && ", "}
                        {!table.joined && !table.sharedReplay ? (
                          <button
                            aria-label={`Shadow ${name}`}
                            className={`name-button shadow ${name === welcome.username ? "name-me" : welcome.friends.includes(name) ? "friend" : ""}`}
                            disabled={!online}
                            onClick={(event) => {
                              event.stopPropagation();
                              connection.send("tableSpectate", {
                                tableID: table.id,
                                shadowingPlayerIndex: index,
                              });
                            }}
                          >
                            {name}
                          </button>
                        ) : (
                          <span
                            className={
                              name === welcome.username
                                ? "name-me"
                                : welcome.friends.includes(name)
                                  ? "friend"
                                  : ""
                            }
                          >
                            {name}
                          </span>
                        )}
                      </span>
                    ))}
                  </td>
                  <td>
                    <button
                      aria-label="Watch table"
                      className="name-button classic-spectators"
                      disabled={!online}
                      onClick={(event) => {
                        event.stopPropagation();
                        connection.send("tableSpectate", {
                          tableID: table.id,
                          shadowingPlayerIndex: -1,
                        });
                      }}
                    >
                      {table.spectators.map((person) => person.name).join(", ")
                        || "\u{A0}"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="empty">
            <h3>No matching games.</h3>
            <button
              onClick={() => {
                setSearch("");
                setFilter("all");
                setPlayers("any");
              }}
            >
              Clear filters
            </button>
            <button disabled={!online} onClick={create}>
              New Game
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
