// The lobby area that shows all of the current tables.

import { isValidPlayerIndex, MAX_PLAYERS } from "@hanabi-live/game";
import { Fragment, useLayoutEffect, useRef } from "react";
import { PATH } from "../../constants.ts";
import { useAppSelector } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import { copyStringToClipboard, getUrlFromPath } from "../../utils.ts";
import { OptionIcon } from "../OptionIcon.tsx";
import { BORDERED_TABLE } from "../borderedTable.ts";
import {
  FULL_CURSOR,
  JOIN_CURSOR,
  REJOIN_CURSOR,
  SHADOW_NAME,
  SPECTATE_CURSOR,
} from "../cursorClasses.ts";
import { getOptionDescriptions } from "../optionDescriptions.ts";
import { tableJoin, tableReattend, tableSpectate } from "./tableActions.ts";
import type { Table, TableRow } from "./tablesSlice.ts";
import { selectTableRows } from "./tablesSlice.ts";

/**
 * How long a row ignores clicks after it appears or moves. Tables come, go, and re-sort as the
 * server reports changes, so a player who aims at one row could otherwise click on another table
 * that has just moved under the pointer. This is about the time that a person needs to react.
 */
const MOVED_ROW_CLICK_DELAY_MS = 500;

/** The columns, and the classes that hide the less important ones on narrow screens. */
const COLUMNS = {
  name: { title: "Name", className: "tw:narrow-736:hidden" },
  numPlayers: { title: "# of Players", className: "tw:narrow-840:hidden" },
  // When the "Name" column is hidden, this column is the first one, so it needs a left border.
  variant: {
    title: "Variant",
    className: "tw:narrow-736:[border-left-width:1px]",
  },
  options: { title: "Options", className: "tw:narrow-530:hidden" },
  status: { title: "Status", className: "tw:narrow-410:hidden" },
  players: { title: "Players", className: undefined },
  spectators: { title: "Spectators", className: "tw:narrow-640:hidden" },
} as const;

/** The background of each kind of row. */
const ROW_CLASSES = {
  joined: `tw:bg-lobby-table-joined tw:hover:bg-lobby-table-joined-hover ${REJOIN_CURSOR}`,
  unstarted:
    "tw:bg-lobby-table-unstarted tw:hover:bg-lobby-table-unstarted-hover",
  "unstarted-password":
    "tw:bg-lobby-table-unstarted-password tw:hover:bg-lobby-table-unstarted-password-hover",
  started: `tw:bg-lobby-table-started tw:hover:bg-lobby-table-started-hover ${SPECTATE_CURSOR}`,
  replay: `tw:bg-lobby-table-replay tw:hover:bg-lobby-table-replay-hover ${SPECTATE_CURSOR}`,
} as const;

export function TablesList(): React.JSX.Element {
  const rows = useAppSelector(selectTableRows);

  if (rows.length === 0) {
    return (
      <div className="tw:flex tw:h-full tw:items-center tw:justify-center">
        <h3 id="lobby-games-no">No one is playing right now.</h3>
      </div>
    );
  }

  return (
    <div
      className="tw:h-full tw:overflow-y-auto"
      id="lobby-games-table-container"
    >
      <h3 className="tw:text-[1.3em]">List of games</h3>
      <table className={`${BORDERED_TABLE} tw:mb-0`} id="lobby-games-table">
        <thead>
          <tr>
            {Object.values(COLUMNS).map(({ title, className }) => (
              <th className={className} key={title}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody id="lobby-games-table-tbody">
          {rows.map((row) => (
            <TableRowView key={row.table.tableId} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRowView({
  row: { table, joined, action, hasFriends, firstJoinable },
}: {
  readonly row: TableRow;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  const username = useAppSelector((state) => state.session.username);
  const friends = useAppSelector((state) => state.session.friends);
  const movedTime = useMovedTime(ref);

  const kind = getKind(table, joined);
  const classNames: string[] = [ROW_CLASSES[kind]];
  if (kind === "unstarted" || kind === "unstarted-password") {
    const full =
      table.playerNames.length === table.settings.maxPlayers
      || (action === "join" && table.playerNames.length >= MAX_PLAYERS);
    classNames.push(full ? FULL_CURSOR : JOIN_CURSOR);
  }
  if (firstJoinable) {
    classNames.push("lobby-games-join-first-table-button");
  }

  const status = getStatus(table);
  const canSpectateFromCells = !joined;
  const canShadow = !joined && table.phase !== "sharedReplay";

  return (
    <tr
      className={classNames.join(" ")}
      id={`${action}-${table.tableId}`}
      onClick={(event) => {
        if (event.ctrlKey) {
          // Copy the URL that clicking on this row would go to.
          copyStringToClipboard(getUrlFromPath(getPath(table, action)));
          tooltips.showCopied(ref.current!);
          return;
        }
        switch (action) {
          case "join": {
            // Trying to join a full table tells its players that someone else wants to play.
            tableJoin(table);
            break;
          }

          case "spectate": {
            tableSpectate(table);
            break;
          }

          case "resume": {
            tableReattend(table);
            break;
          }
        }
      }}
      onClickCapture={(event) => {
        // This blocks the clicks on the cells that spectate as well as the click on the row.
        if (performance.now() - movedTime.current < MOVED_ROW_CLICK_DELAY_MS) {
          event.stopPropagation();
        }
      }}
      ref={ref}
    >
      <td className={COLUMNS.name.className}>
        {table.passwordProtected && table.phase === "pregame" && (
          // The key's solid head is on its right, so it needs more room than other icons.
          <i className="fas fa-key fa-sm tw:mr-2.5" />
        )}
        {table.settings.name}
      </td>
      <td className={COLUMNS.numPlayers.className}>
        {table.phase === "pregame"
          ? `${table.playerNames.length} / ${table.settings.maxPlayers}`
          : table.playerNames.length}
      </td>
      <td className={COLUMNS.variant.className}>
        {table.settings.options.variantName}
      </td>
      {/* The icons stay on one line when the table is narrow. */}
      <td className={`tw:whitespace-nowrap ${COLUMNS.options.className}`}>
        {getOptionDescriptions(table.settings).map((description) => (
          // The space separates the icons like the spaces between words.
          <Fragment key={description.name}>
            <OptionIcon description={description} />{" "}
          </Fragment>
        ))}
      </td>
      <td className={COLUMNS.status.className}>
        {status}
        {status !== "Not Started" && hasFriends && ` (${table.progress}%)`}
      </td>
      <td>
        {table.playerNames.map((player, playerIndex) => {
          let className: string | undefined;
          if (player === username) {
            className = "tw:text-name-me";
          } else if (
            friends.includes(player)
            && table.phase !== "sharedReplay"
          ) {
            className = "tw:text-friend";
          }
          if (canShadow) {
            className =
              className === undefined
                ? SHADOW_NAME
                : `${className} ${SHADOW_NAME}`;
          }
          return (
            <Fragment key={player}>
              {playerIndex > 0 && ", "}
              <span
                className={className}
                onClick={
                  canShadow && isValidPlayerIndex(playerIndex)
                    ? (event) => {
                        event.stopPropagation();
                        tableSpectate(table, playerIndex);
                      }
                    : undefined
                }
              >
                {player}
              </span>
            </Fragment>
          );
        })}
      </td>
      <td
        className={
          canSpectateFromCells
            ? `${COLUMNS.spectators.className} ${SPECTATE_CURSOR}`
            : COLUMNS.spectators.className
        }
        onClick={
          canSpectateFromCells
            ? (event) => {
                event.stopPropagation();
                tableSpectate(table);
              }
            : undefined
        }
      >
        {table.spectators.map(({ username: name }, i) => (
          <Fragment key={name}>
            {i > 0 && ", "}
            {friends.includes(name) ? (
              <span className="tw:text-friend">{name}</span>
            ) : (
              name
            )}
          </Fragment>
        ))}
      </td>
    </tr>
  );
}

/**
 * Records when the row last appeared, moved, or changed its height. A change in height can move the
 * edge of the row under the pointer.
 */
function useMovedTime(ref: React.RefObject<HTMLTableRowElement | null>) {
  const movedTime = useRef(performance.now());
  const position = useRef<{ top: number; height: number } | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    const { offsetTop: top, offsetHeight: height } = ref.current!;

    // A hidden row has no position, such as when we are in a game. When the lobby is shown again,
    // the row has not moved under the pointer.
    if (height === 0) {
      position.current = undefined;
      return;
    }

    const previous = position.current;
    if (
      previous !== undefined
      && (previous.top !== top || previous.height !== height)
    ) {
      movedTime.current = performance.now();
    }
    position.current = { top, height };
  });

  return movedTime;
}

/** Decides the background color of the row. */
function getKind(table: Table, joined: boolean) {
  if (table.phase === "sharedReplay") {
    return "replay";
  }
  if (joined) {
    return "joined";
  }
  if (table.phase !== "pregame") {
    return "started";
  }
  return table.passwordProtected ? "unstarted-password" : "unstarted";
}

function getStatus(table: Table) {
  if (table.phase === "sharedReplay") {
    return "Reviewing";
  }
  return table.phase === "pregame" ? "Not Started" : "Running";
}

function getPath(table: Table, action: TableRow["action"]): string {
  switch (action) {
    case "join": {
      return `${PATH.PRE_GAME}/${table.tableId}`;
    }

    case "resume": {
      return `${PATH.GAME}/${table.tableId}`;
    }

    case "spectate": {
      // A shared replay of a stored game gets a link that lasts beyond this table.
      return table.phase === "sharedReplay" && table.gameId !== undefined
        ? `${PATH.SHARED_REPLAY}/${table.gameId}`
        : `${PATH.GAME}/${table.tableId}`;
    }
  }
}
