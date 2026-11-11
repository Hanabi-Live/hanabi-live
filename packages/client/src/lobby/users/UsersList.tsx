// The lobby area that shows all of the current logged-in users.

import type { Status } from "@hanabi-live/data";
import { StatusText } from "@hanabi-live/data";
import { useEffect, useRef } from "react";
import { globals } from "../../Globals";
import { DIMMED_OPACITY } from "../../constants";
import { store, useAppSelector } from "../../store";
import { TAB_CLASS_NAME } from "../../tabClassName";
import * as tooltips from "../../tooltips";
import { tableJoin, tableSpectate } from "../tables/tableActions";
import { Screen } from "../types/Screen";
import { UserLink } from "./UserMenu";
import type { UserRow } from "./usersSlice";
import {
  botsShownChanged,
  selectBotRows,
  selectBotsShown,
  selectUserCount,
  selectUserRows,
} from "./usersSlice";

const H_GROUP_TOOLTIP =
  '<span class="small-tooltip-text">This person is a self-identified member of the H-Group.</span>';

const BOT_TOOLTIP =
  '<span class="small-tooltip-text">This account is a bot.</span>';

const SLEEPING_EMOJI = "\u{1F4A4}";
const ROBOT_EMOJI = "\u{1F916}";

/** In these statuses, the user is not at a table that we could join or spectate. */
const STATUSES_WITHOUT_TABLE: ReadonlySet<Status> = new Set([
  "lobby",
  "replay",
]);

export function UsersList(): React.JSX.Element {
  const botsShown = useAppSelector(selectBotsShown);
  const rows = useAppSelector(botsShown ? selectBotRows : selectUserRows);
  // We cannot go to another table from the pre-game screen.
  const inPregame = useAppSelector(
    (state) => state.session.screen === Screen.PreGame,
  );

  return (
    <table className="tw:mb-2 tw:[&_td]:p-1" id="lobby-users-table">
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

/**
 * The title of the list. While bots are online, it is also the pair of tabs that switches between
 * the users and the bots.
 */
export function UsersTitle(): React.JSX.Element {
  const userCount = useAppSelector(selectUserCount);
  const botCount = useAppSelector(selectBotRows).length;
  const botsShown = useAppSelector(selectBotsShown);

  const usersLabel = (
    <>
      Online<span id="small-screen-toggle-users-h3"> Users</span> ({userCount})
    </>
  );
  if (botCount === 0) {
    return usersLabel;
  }

  return (
    <span className="tw:inline-flex tw:gap-[1.1em]" role="tablist">
      <button
        aria-selected={!botsShown}
        className={TAB_CLASS_NAME}
        onClick={() => {
          store.dispatch(botsShownChanged(false));
        }}
        role="tab"
        type="button"
      >
        {usersLabel}
      </button>
      <button
        aria-selected={botsShown}
        className={TAB_CLASS_NAME}
        onClick={() => {
          store.dispatch(botsShownChanged(true));
        }}
        role="tab"
        type="button"
      >
        Bots ({botCount})
      </button>
    </span>
  );
}

function UserRowView({
  row,
  inPregame,
}: {
  readonly row: UserRow;
  readonly inPregame: boolean;
}) {
  const { user, kind } = row;
  const nameLink = <UserLink row={row} />;
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
  if (user.hGroupConventions) {
    return <HGroupIcon />;
  }
  return <span className="tw:inline-block tw:w-3" />;
}

function BotIcon() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => tooltips.attach(ref.current!, BOT_TOOLTIP), []);

  return (
    // The slot has the width of the other icons, which keeps the names aligned.
    <span className="tw:inline-block tw:w-3">
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
  const table = globals.getTable(user.tableID);
  if (table === undefined) {
    return;
  }

  switch (user.status) {
    case "pregame": {
      tableJoin(table);
      break;
    }

    case "playing":
    case "spectating":
    case "sharedReplay": {
      tableSpectate(table);
      break;
    }

    case "lobby":
    case "replay": {
      break;
    }
  }
}
