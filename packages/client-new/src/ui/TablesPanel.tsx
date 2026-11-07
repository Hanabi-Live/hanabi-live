import { errorDetails } from "@hanabi-live/data";
import { shallowEqual, useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import { GameOptionIcons } from "./GameOptionIcons";

export function TablesPanel({
  connection,
  join,
}: {
  connection: LobbyConnection;
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
  if (!welcome) {
    return null;
  }
  const all = Object.values(tables);
  const friendNames = welcome.friends;
  function tableHasFriends(table: Table): boolean {
    return [
      ...(table.sharedReplay ? [] : table.players),
      ...table.spectators.map((person) => person.name),
    ].some((name) => friendNames.includes(name));
  }

  function priority(table: Table): number {
    if (table.joined && !table.sharedReplay) {
      return 0;
    }
    const kind = table.sharedReplay
      ? 4
      : table.running
        ? 3
        : table.passwordProtected
          ? 2
          : 1;
    return kind + (tableHasFriends(table) ? 0 : 4);
  }
  const visible = all.toSorted(
    (a, b) => priority(a) - priority(b) || a.id - b.id,
  );
  function activate(table: Table, copy = false) {
    if (!online || pending !== null) {
      return;
    }
    if (copy) {
      const path = table.sharedReplay
        ? `/shared-replay/${table.name.slice("Shared replay for game #".length)}`
        : table.running || table.joined
          ? `/game/${table.id}`
          : `/pre-game/${table.id}`;
      void navigator.clipboard
        .writeText(`${globalThis.location.origin}${path}`)
        .then(() => connection.notice("Table link copied."))
        .catch((error: unknown) =>
          connection.notice(errorDetails(error, "Copying the table link")),
        );
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
              const hasFriends = tableHasFriends(table);
              return (
                <tr
                  aria-label={`${action} ${table.name}`}
                  className={`table-card lobby-games-table-${kind} ${table.numPlayers >= table.maxPlayers ? "full" : ""}`}
                  key={table.id}
                  onClick={(event) => activate(table, event.ctrlKey)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget
                      && (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      activate(table, event.ctrlKey);
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
                        activate(table, event.ctrlKey);
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
                    <ul className="classic-option-list">
                      <GameOptionIcons options={table.options} />
                    </ul>
                  </td>
                  <td>
                    {table.sharedReplay
                      ? "Reviewing"
                      : table.running
                        ? "Running"
                        : "Not Started"}
                    {(table.running || table.sharedReplay)
                      && hasFriends
                      && ` (${table.progress}%)`}
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
                                : !table.sharedReplay
                                    && welcome.friends.includes(name)
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
                  <td
                    className={table.joined ? "" : "lobbySpectators"}
                    onClick={(event) => {
                      if (table.joined) {
                        return;
                      }
                      event.stopPropagation();
                      if (online && pending === null) {
                        connection.send("tableSpectate", {
                          tableID: table.id,
                          shadowingPlayerIndex: -1,
                        });
                      }
                    }}
                  >
                    {table.joined ? (
                      table.spectators.map((person, index) => (
                        <span key={person.name}>
                          {index > 0 && ", "}
                          <span
                            className={
                              welcome.friends.includes(person.name)
                                ? "friend"
                                : ""
                            }
                          >
                            {person.name}
                          </span>
                        </span>
                      ))
                    ) : (
                      <button
                        aria-label="Watch table"
                        className="name-button classic-spectators"
                        disabled={!online || pending !== null}
                      >
                        {table.spectators.length === 0
                          ? "\u{A0}"
                          : table.spectators.map((person, index) => (
                              <span key={person.name}>
                                {index > 0 && ", "}
                                <span
                                  className={
                                    welcome.friends.includes(person.name)
                                      ? "friend"
                                      : ""
                                  }
                                >
                                  {person.name}
                                </span>
                              </span>
                            ))}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
