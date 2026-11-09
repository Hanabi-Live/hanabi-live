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

const H_GROUP_TOOLTIP = `<span style="${tooltips.SMALL_TOOLTIP_TEXT_STYLE}">This person is a self-identified member of the H-Group.</span>`;

const BOT_TOOLTIP = `<span style="${tooltips.SMALL_TOOLTIP_TEXT_STYLE}">This account is a bot.</span>`;

const SLEEPING_EMOJI = "\u{1F4A4}";
const ROBOT_EMOJI = "\u{1F916}";

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
        <UserIcon user={user} />
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

function HGroupIcon() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => tooltips.attach(ref.current!, H_GROUP_TOOLTIP), []);

  return (
    <span ref={ref}>
      <i className="fas fa-heading fa-xs" />
    </span>
  );
}

function UserIcon({ user }: { readonly user: UserRow["user"] }) {
  if (user.bot) {
    return <BotIcon />;
  }
  if (user.hGroup) {
    return <HGroupIcon />;
  }
  return <span className="tw:inline-block tw:w-[0.75em]" />;
}

function BotIcon() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => tooltips.attach(ref.current!, BOT_TOOLTIP), []);

  return (
    // The slot has the width of the other icons, which keeps the names aligned.
    <span className="tw:inline-block tw:w-[0.75em]">
      <span
        aria-label="Bot"
        className="tw:text-[0.7em] tw:leading-none"
        ref={ref}
        role="img"
      >
        {ROBOT_EMOJI}
      </span>
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
