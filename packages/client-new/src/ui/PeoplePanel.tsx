import { StatusText } from "@hanabi-live/data";
import { ArrowUpRight, Eye, MessageCircle, Star } from "lucide-react";
import { useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";

export function PeoplePanel({
  connection,
  message,
}: {
  connection: LobbyConnection;
  message: (name: string) => void;
}) {
  const {
    users,
    welcome,
    connection: status,
  } = useSelector(
    (state: LobbyState) => ({
      users: state.users,
      welcome: state.welcome,
      connection: state.connection,
    }),
    shallowEqual,
  );
  const [search, setSearch] = useState("");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  if (!welcome) {
    return null;
  }
  const online = Object.values(users)
    .filter(
      (user) =>
        (!friendsOnly || welcome.friends.includes(user.name))
        && user.name.toLowerCase().includes(search.toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        Number(b.name === welcome.username)
          - Number(a.name === welcome.username)
        || Number(welcome.friends.includes(b.name))
          - Number(welcome.friends.includes(a.name))
        || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  const offline = friendsOnly
    ? welcome.friends.filter(
        (name) =>
          Object.values(users).every((user) => user.name !== name)
          && name.toLowerCase().includes(search.toLowerCase()),
      )
    : [];
  return (
    <section className="people-panel box">
      <h3 className="lobby-title">
        Online Users ({Object.keys(users).length})
      </h3>
      <details className="classic-filters people-filters">
        <summary aria-label="Filter players" title="Filter players">
          <i aria-hidden="true" className="fas fa-filter" />
        </summary>
        <div className="filter-tabs">
          <button
            aria-pressed={!friendsOnly}
            onClick={() => setFriendsOnly(false)}
          >
            Everyone
          </button>
          <button
            aria-pressed={friendsOnly}
            onClick={() => setFriendsOnly(true)}
          >
            Friends
          </button>
        </div>
        <input
          aria-label="Find a player"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a player..."
          type="search"
          value={search}
        />
      </details>
      <div className="online-list" id="lobby-users-container">
        <table className="slim-table" id="lobby-users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {online.map((user) => (
              <tr className="person" key={user.userID}>
                <td>
                  <button
                    aria-expanded={selected === user.name}
                    className={`person-main ${user.name === welcome.username ? "name-me" : welcome.friends.includes(user.name) ? "friend" : ""}`}
                    onClick={() =>
                      setSelected(selected === user.name ? null : user.name)
                    }
                  >
                    <span>
                      {user.name}
                      {user.hyphenated && <small> /h</small>}
                    </span>
                  </button>
                  {selected === user.name && (
                    <div className="person-actions">
                      <a
                        className="button-link"
                        href={`/scores/${encodeURIComponent(user.name)}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ArrowUpRight size={14} /> Profile
                      </a>
                      {user.name !== welcome.username && (
                        <>
                          <button
                            disabled={status !== "online"}
                            onClick={() => message(user.name)}
                          >
                            <MessageCircle size={14} /> Message
                          </button>
                          <button
                            disabled={status !== "online"}
                            onClick={() =>
                              connection.send(
                                welcome.friends.includes(user.name)
                                  ? "chatUnfriend"
                                  : "chatFriend",
                                { name: user.name, room: "lobby" },
                              )
                            }
                          >
                            <Star size={14} />
                            {welcome.friends.includes(user.name)
                              ? "Unfriend"
                              : "Add friend"}
                          </button>
                        </>
                      )}
                      {user.tableID && (
                        <button
                          disabled={status !== "online"}
                          onClick={() =>
                            connection.send("tableSpectate", {
                              tableID: user.tableID,
                              shadowingPlayerIndex: -1,
                            })
                          }
                        >
                          <Eye size={14} /> Watch
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td>{user.inactive ? "Away" : StatusText[user.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {offline.map((name) => (
          <div className="offline-person" key={name}>
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              {name}
              <small>Offline</small>
            </span>
            <button
              aria-label={`Remove ${name} from friends`}
              className="icon-button"
              disabled={status !== "online"}
              onClick={() =>
                connection.send("chatUnfriend", { name, room: "lobby" })
              }
            >
              <Star size={14} />
            </button>
          </div>
        ))}
        {online.length === 0 && offline.length === 0 && (
          <p className="chat-empty">
            No players match. You can add friends from any player menu.
          </p>
        )}
      </div>
    </section>
  );
}
