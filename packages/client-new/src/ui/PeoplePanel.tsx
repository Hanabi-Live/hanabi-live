import { Status, StatusText } from "@hanabi-live/data";
import { shallowEqual, useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";

export function PeoplePanel({
  connection,
  join,
}: {
  connection: LobbyConnection;
  join: (table: Table) => void;
}) {
  const {
    users,
    welcome,
    connection: status,
    tables,
    pregame,
  } = useSelector(
    (state: LobbyState) => ({
      users: state.users,
      welcome: state.welcome,
      connection: state.connection,
      tables: state.tables,
      pregame: state.pregame,
    }),
    shallowEqual,
  );
  if (!welcome) {
    return null;
  }
  const online = Object.values(users).toSorted(
    (a, b) =>
      Number(b.name === welcome.username) - Number(a.name === welcome.username)
      || Number(welcome.friends.includes(b.name))
        - Number(welcome.friends.includes(a.name))
      || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  return (
    <section className="people-panel box">
      <h3 className="lobby-title">
        Online Users ({Object.keys(users).length})
      </h3>
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
                  {user.hyphenated ? (
                    <i
                      className="fas fa-heading fa-xs"
                      title="This person is a self-identified member of the Hyphenated group."
                    />
                  ) : (
                    <span className="lobby-hyphen-empty" />
                  )}
                  {"\u{A0} "}
                  <a
                    className={`person-main ${user.name === welcome.username ? "name-me" : welcome.friends.includes(user.name) ? "friend" : ""}`}
                    href={`/scores/${encodeURIComponent(user.name)}`}
                    rel="noreferrer"
                    style={{
                      opacity: user.inactive ? 0.3 : 1,
                      fontWeight: user.name === welcome.username ? 400 : 300,
                    }}
                    target="_blank"
                  >
                    {user.name}
                  </a>
                  {user.inactive && <> {"\u{1F4A4}"}</>}
                </td>
                <td>
                  {pregame === null
                  && user.tableID !== undefined
                  && user.status !== Status.Lobby
                  && user.status !== Status.Replay ? (
                    <button
                      className="text-button person-status"
                      disabled={status !== "online"}
                      onClick={() => {
                        const table =
                          user.tableID === undefined
                            ? undefined
                            : tables[user.tableID];
                        if (table) {
                          if (user.status === Status.PreGame) {
                            join(table);
                          } else {
                            connection.send("tableSpectate", {
                              tableID: table.id,
                              shadowingPlayerIndex: -1,
                            });
                          }
                        } else {
                          connection.notice(
                            "That table is no longer available.",
                          );
                        }
                      }}
                    >
                      {StatusText[user.status]}
                    </button>
                  ) : (
                    StatusText[user.status]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
