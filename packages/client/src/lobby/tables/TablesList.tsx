// The lobby area that shows all of the current tables.

import { MAX_PLAYERS } from "@hanabi-live/game";
import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { PATH } from "../../constants";
import { DECK_PLAYS_ICON_CSS, OptionIcons } from "../../enums/OptionIcons";
import { useAppSelector } from "../../store";
import * as tooltips from "../../tooltips";
import { copyStringToClipboard, getURLFromPath } from "../../utils";
import type { OptionDescription } from "../optionDescriptions";
import { getOptionDescriptions } from "../optionDescriptions";
import { tableJoin, tableReattend, tableSpectate } from "./tableActions";
import type { Table, TableRow } from "./tablesSlice";
import { selectTableRows } from "./tablesSlice";

/**
 * How long a row ignores clicks after it appears or moves. Tables come, go, and re-sort as the
 * server reports changes, so a player who aims at one row could otherwise click on another table
 * that has just moved under the pointer. This is about the time that a person needs to react.
 */
const MOVED_ROW_CLICK_DELAY_MS = 500;

/** Narrow screens hide some of these columns by their position. */
const COLUMNS = [
  "Name",
  "# of Players",
  "Variant",
  "Options",
  "Status",
  "Players",
  "Spectators",
] as const;

export function TablesList(): React.JSX.Element {
  const rows = useAppSelector(selectTableRows);

  if (rows.length === 0) {
    return (
      <div className="align-center-v tw:h-full">
        <h3 id="lobby-games-no">No current games.</h3>
      </div>
    );
  }

  return (
    <div className="lobby-table-container" id="lobby-games-table-container">
      <h3 className="lobby-title">List of games</h3>
      <table className="alt" id="lobby-games-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody id="lobby-games-table-tbody">
          {rows.map((row) => (
            <TableRowView key={row.table.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRowView({
  row: { table, action, hasFriends, firstJoinable },
}: {
  readonly row: TableRow;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  const username = useAppSelector((state) => state.session.username);
  const friends = useAppSelector((state) => state.session.friends);
  const movedTime = useMovedTime(ref);

  const classNames = [`lobby-games-table-${getKind(table)}`];
  if (
    table.numPlayers === table.maxPlayers
    || (action === "join" && table.numPlayers >= MAX_PLAYERS)
  ) {
    classNames.push("full");
  }
  if (firstJoinable) {
    classNames.push("lobby-games-join-first-table-button");
  }

  const status = getStatus(table);
  const canSpectateFromCells = !table.joined;
  const canShadow = !table.joined && !table.sharedReplay;

  return (
    <tr
      className={classNames.join(" ")}
      id={`${action}-${table.id}`}
      onClick={(event) => {
        if (event.ctrlKey) {
          // Copy the URL that clicking on this row would go to.
          copyStringToClipboard(getURLFromPath(getPath(table, action)));
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
      <td>
        {table.passwordProtected && !table.running && !table.sharedReplay && (
          <i className="fas fa-key fa-sm icon-label" />
        )}
        {table.name}
      </td>
      <td>
        {table.running || table.sharedReplay
          ? table.numPlayers
          : `${table.numPlayers} / ${table.maxPlayers}`}
      </td>
      <td>{table.variant}</td>
      <td className="lobby-games-table-options">
        {getOptionDescriptions(table.options).map((description) => (
          // The space separates the icons like the spaces between words.
          <Fragment key={description.name}>
            <OptionIcon description={description} />{" "}
          </Fragment>
        ))}
      </td>
      <td>
        {status}
        {status !== "Not Started" && hasFriends && ` (${table.progress}%)`}
      </td>
      <td>
        {table.players.map((player, playerIndex) => {
          let className: string | undefined;
          if (player === username) {
            className = "name-me";
          } else if (friends.includes(player) && !table.sharedReplay) {
            className = "friend";
          }
          if (canShadow) {
            className =
              className === undefined ? "shadow" : `${className} shadow`;
          }
          return (
            <Fragment key={player}>
              {playerIndex > 0 && ", "}
              <span
                className={className}
                onClick={
                  canShadow
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
        className={canSpectateFromCells ? "lobbySpectators" : undefined}
        onClick={
          canSpectateFromCells
            ? (event) => {
                event.stopPropagation();
                tableSpectate(table);
              }
            : undefined
        }
      >
        {table.spectators.map(({ name }, i) => (
          <Fragment key={name}>
            {i > 0 && ", "}
            {friends.includes(name) ? (
              <span className="friend">{name}</span>
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

function OptionIcon({
  description: { icon, label, tooltip },
}: {
  readonly description: OptionDescription;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(
    () =>
      tooltips.attach(
        ref.current!,
        `<div class="lobby-games-table-tooltip-icon">${tooltip}</div>`,
      ),
    [tooltip],
  );

  return (
    <li>
      <i
        className={label === undefined ? icon : `${icon} icon-label`}
        ref={ref}
        style={icon === OptionIcons.DeckPlays ? DECK_PLAYS_ICON_CSS : undefined}
      />
      {label}
    </li>
  );
}

/** Decides the background color of the row. */
function getKind(table: Table) {
  if (table.sharedReplay) {
    return "replay";
  }
  if (table.joined) {
    return "joined";
  }
  if (table.running) {
    return "started";
  }
  return table.passwordProtected ? "unstarted-password" : "unstarted";
}

function getStatus(table: Table) {
  if (table.sharedReplay) {
    return "Reviewing";
  }
  return table.running ? "Running" : "Not Started";
}

function getPath(table: Table, action: TableRow["action"]): string {
  switch (action) {
    case "join": {
      return `${PATH.PRE_GAME}/${table.id}`;
    }

    case "resume": {
      return `${PATH.GAME}/${table.id}`;
    }

    case "spectate": {
      // A shared replay of a stored game gets a link that lasts beyond this table.
      return table.sharedReplay && table.databaseID !== undefined
        ? `${PATH.SHARED_REPLAY}/${table.databaseID}`
        : `${PATH.GAME}/${table.id}`;
    }
  }
}
