// The lobby area that shows all of the current logged-in users.

import { Status, StatusText } from "@hanabi-live/data";
import { useEffect, useRef } from "react";
import { globals } from "../../Globals";
import { DIMMED_OPACITY } from "../../constants";
import { useAppSelector } from "../../store";
import * as tooltips from "../../tooltips";
import { tableJoin, tableSpectate } from "../tablesDraw";
import { Screen } from "../types/Screen";
import type { UserRow } from "./usersSlice";
import { selectUserCount, selectUserRows } from "./usersSlice";

const HYPHENATED_TOOLTIP =
  '<span style="font-size: 0.75em;">This person is a self-identified member of the Hyphenated group.</span>';

const SLEEPING_EMOJI = "\u{1F4A4}";

const NAME_CLASSES = {
  self: "name-me",
  friend: "friend",
  other: undefined,
} as const satisfies Record<UserRow["kind"], string | undefined>;

/** In these statuses, the user is not at a table that we could join or spectate. */
const STATUSES_WITHOUT_TABLE: ReadonlySet<Status> = new Set([
  Status.Lobby,
  Status.Replay,
]);

export function UsersList(): React.JSX.Element {
  const rows = useAppSelector(selectUserRows);
  // We cannot go to another table from the pre-game screen.
  const inPregame = useAppSelector(
    (state) => state.session.screen === Screen.PreGame,
  );

  return (
    <table className="slim-table" id="lobby-users-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="lobby-users-table-tbody">
        {rows.map((row) => (
          <UserRowView inPregame={inPregame} key={row.user.userID} row={row} />
        ))}
      </tbody>
    </table>
  );
}

export function OnlineUserCount(): React.JSX.Element {
  return <>{useAppSelector(selectUserCount)}</>;
}

function UserRowView({
  row: { user, kind },
  inPregame,
}: {
  readonly row: UserRow;
  readonly inPregame: boolean;
}) {
  const nameLink = (
    <a
      className={NAME_CLASSES[kind]}
      href={`/scores/${encodeURIComponent(user.name)}`}
      rel="noopener noreferrer"
      target="_blank"
    >
      {user.name}
    </a>
  );
  const statusText = StatusText[user.status];

  return (
    <tr>
      <td>
        {user.hyphenated ? (
          <HyphenatedIcon />
        ) : (
          <span className="tw:inline-block tw:w-[0.75em]" />
        )}
        {"\u{A0} "}
        <span style={user.inactive ? { opacity: DIMMED_OPACITY } : undefined}>
          {kind === "self" ? <strong>{nameLink}</strong> : nameLink}
          {user.inactive && ` \u{A0}${SLEEPING_EMOJI}`}
        </span>
      </td>
      <td>
        {inPregame || STATUSES_WITHOUT_TABLE.has(user.status) ? (
          statusText
        ) : (
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              goToTable(user);
            }}
          >
            {statusText}
          </a>
        )}
      </td>
    </tr>
  );
}

function HyphenatedIcon() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => tooltips.attach(ref.current!, HYPHENATED_TOOLTIP), []);

  return (
    <span ref={ref}>
      <i className="fas fa-heading fa-xs" />
    </span>
  );
}

/** Joins or spectates the table that a user is at. */
function goToTable(user: UserRow["user"]) {
  if (user.tableID === undefined) {
    return;
  }
  const table = globals.tableMap.get(user.tableID);
  if (table === undefined) {
    return;
  }

  switch (user.status) {
    case Status.PreGame: {
      tableJoin(table);
      break;
    }

    case Status.Playing:
    case Status.Spectating:
    case Status.SharedReplay: {
      tableSpectate(table);
      break;
    }

    case Status.Lobby:
    case Status.Replay: {
      break;
    }
  }
}
