import { StatusText } from "@hanabi-live/data";
import { ArrowUpRight, Eye, MessageCircle, Star, Users } from "lucide-react";
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
        Number(welcome.friends.includes(b.name))
          - Number(welcome.friends.includes(a.name))
        || Number(a.inactive) - Number(b.inactive)
        || a.name.localeCompare(b.name),
    );
  const offline = friendsOnly
    ? welcome.friends.filter(
        (name) =>
          Object.values(users).every((user) => user.name !== name)
          && name.toLowerCase().includes(search.toLowerCase()),
      )
    : [];
  return (
    <section className="people-panel">
      <h2>
        <Users size={17} /> Good company{" "}
        <span>{Object.keys(users).length}</span>
      </h2>
      <div className="filter-tabs">
        <button
          aria-pressed={!friendsOnly}
          onClick={() => setFriendsOnly(false)}
        >
          Everyone
        </button>
        <button aria-pressed={friendsOnly} onClick={() => setFriendsOnly(true)}>
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
      <div className="online-list">
        {online.map((user) => (
          <div className="person" key={user.userID}>
            <button
              aria-expanded={selected === user.name}
              className="person-main"
              onClick={() =>
                setSelected(selected === user.name ? null : user.name)
              }
            >
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <span>
                <strong>
                  {user.name}
                  {user.hyphenated && <small> /h</small>}
                </strong>
                <small>
                  {user.inactive ? "Away" : StatusText[user.status]}
                </small>
              </span>
              {welcome.friends.includes(user.name) && (
                <Star className="friend-star" size={13} />
              )}
              <span className={`status-dot ${user.inactive ? "" : "online"}`} />
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
          </div>
        ))}
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
