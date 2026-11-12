// The lobby area that shows all of the current logged-in users.

import { StatusText } from "@hanabi-live/data";
import { globals } from "../../Globals.ts";
import { DIMMED_OPACITY } from "../../constants.ts";
import { store, useAppSelector } from "../../store.ts";
import { TAB_CLASS_NAME } from "../../tabClassName.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { tableJoin, tableSpectate } from "../tables/tableActions.ts";
import { Screen } from "../types/Screen.ts";
import { UserLink } from "./UserMenu.tsx";
import type { UserRow } from "./usersSlice.ts";
import {
  botsShownChanged,
  selectBotRows,
  selectBotsShown,
  selectUserCount,
  selectUserRows,
} from "./usersSlice.ts";

const H_GROUP_TOOLTIP =
  "This person is a self-identified member of the H-Group.";

const BOT_TOOLTIP = "This account is a bot.";

const SLEEPING_EMOJI = "\u{1F4A4}";
const ROBOT_EMOJI = "\u{1F916}";

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
          <UserRowView inPregame={inPregame} key={row.user.userId} row={row} />
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
      Online<span className="tw:narrow-640:hidden"> Users</span> ({userCount})
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
  const statusText = StatusText[user.activity.type];

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
        {inPregame || !("tableId" in user.activity) ? (
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
  const ref = tooltipRef(H_GROUP_TOOLTIP, { instant: true });

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
  const ref = tooltipRef(BOT_TOOLTIP, { instant: true });

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
  const { activity } = user;
  if (!("tableId" in activity)) {
    return;
  }
  const table = globals.getTable(activity.tableId);
  if (table === undefined) {
    return;
  }

  if (activity.type === "pregame") {
    tableJoin(table);
  } else {
    tableSpectate(table);
  }
}
