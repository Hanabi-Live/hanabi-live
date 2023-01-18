// The lobby area that shows all of the current tables.

import { globals } from "../globals";
import * as modals from "../modals";
import * as tooltips from "../tooltips";
import { copyStringToClipboard, getURLFromPath } from "../utils";
import * as createGame from "./createGame";
import { getOptionIcons, initializeOptionTooltips } from "./pregame";
import { Screen } from "./types/Screen";
import { Table } from "./types/Table";

export function tablesDraw(): void {
  const tbody = $("#lobby-games-table-tbody");

  // Clear all of the existing rows.
  tbody.html("");

  if (globals.tableMap.size === 0) {
    $("#lobby-games-no").show();
    $("#lobby-games").addClass("align-center-v");
    $("#lobby-games-table-container").hide();
    return;
  }
  $("#lobby-games-no").hide();
  $("#lobby-games").removeClass("align-center-v");
  $("#lobby-games-table-container").show();

  // We want the tables to be drawn in a certain order:
  // 1) Tables that we are currently in
  // 2) Tables our friends are currently in
  // 3) Unstarted tables
  // 4) Unstarted & password-protected tables
  // 5) Ongoing tables
  // 6) Shared replays
  let sortedTableIDs: number[] = [];
  for (const friends of [true, false]) {
    for (let i = 1; i <= 5; i++) {
      const tableIDsOfThisType: number[] = [];
      for (const [id, table] of globals.tableMap) {
        // Tables that we are currently in.
        if (friends && i === 1 && table.joined && !table.sharedReplay) {
          tableIDsOfThisType.push(id);
        }

        // Tables our friends are currently in.
        const hasFriends = tableHasFriends(table);
        if ((friends && !hasFriends) || (!friends && hasFriends)) {
          continue;
        }

        if (
          i === 2 &&
          !table.running &&
          !table.passwordProtected &&
          !table.joined
        ) {
          // Unstarted tables
          tableIDsOfThisType.push(id);
        } else if (
          i === 3 &&
          !table.running &&
          table.passwordProtected &&
          !table.joined
        ) {
          // Unstarted & password-protected tables.
          tableIDsOfThisType.push(id);
        } else if (
          i === 4 &&
          table.running &&
          !table.sharedReplay &&
          !table.joined
        ) {
          // Ongoing tables
          tableIDsOfThisType.push(id);
        } else if (i === 5 && table.running && table.sharedReplay) {
          // Shared replays
          tableIDsOfThisType.push(id);
        }
      }
      tableIDsOfThisType.sort();
      sortedTableIDs = sortedTableIDs.concat(tableIDsOfThisType);
    }
  }

  // Add all of the games.
  let addedJoinFirstTableButton = false;
  for (const id of sortedTableIDs) {
    const table = globals.tableMap.get(id);
    if (table === undefined) {
      throw new Error(`Failed to get the table for the ID of "${id}".`);
    }

    // Set the background color of the row, depending on what kind of game it is.
    let htmlClass: string;
    if (table.sharedReplay) {
      htmlClass = "replay";
    } else if (table.joined) {
      htmlClass = "joined";
    } else if (table.running) {
      htmlClass = "started";
    } else if (table.passwordProtected) {
      htmlClass = "unstarted-password";
    } else {
      htmlClass = "unstarted";
    }
    const row = $(`<tr class="lobby-games-table-${htmlClass}">`);

    // Column 1 - Name.
    let { name } = table;
    if (table.passwordProtected && !table.running && !table.sharedReplay) {
      name = `<i class="fas fa-key fa-sm"></i> &nbsp; ${name}`;
    }
    $("<td>").html(name).appendTo(row);

    // Column 2 - # of Players.
    const tdCell = $("<td>").html(
      table.running || table.sharedReplay
        ? table.numPlayers.toString()
        : `${table.numPlayers.toString()} / ${table.maxPlayers.toString()}`,
    );
    if (table.numPlayers === table.maxPlayers) {
      row.addClass("full");
    }
    tdCell.appendTo(row);

    // Column 3 - Variant.
    $("<td>").html(table.variant).appendTo(row);

    // Column 4 - Options.
    $("<td>")
      .addClass("lobby-games-table-options")
      .html(getOptionIcons(table.options, "lobby-games-table", table.id))
      .appendTo(row);

    // Column 5 - Status.
    let status: string;
    if (table.sharedReplay) {
      status = "Reviewing";
    } else if (table.running) {
      status = "Running";
    } else {
      status = "Not Started";
    }
    if (status !== "Not Started" && tableHasFriends(table)) {
      status += ` (<span id="status-${table.id}">${table.progress}</span>%)`;
    }
    $("<td>").html(status).appendTo(row);

    // Column 6 - Players.
    const td = $("<td>");
    table.players.forEach((player, index) => {
      const span = $("<span>").html(player);
      if (player === globals.username) {
        span.addClass("name-me");
      } else if (globals.friends.includes(player)) {
        span.addClass("friend");
      }
      if (!table.joined && !table.sharedReplay) {
        span.addClass("shadow").on("click", (evt) => {
          evt.stopPropagation();
          tableSpectate(table, index);
        });
      }
      if (td.html().length > 0) {
        td.append(", ");
      }
      span.appendTo(td);
    });
    td.appendTo(row);

    // Column 7 - Spectators.
    let spectatorsString = "";
    const spectatorsArray: string[] = [];
    for (const spectator of table.spectators) {
      if (globals.friends.includes(spectator.name)) {
        spectatorsArray.push(`<span class="friend">${spectator.name}</span>`);
      } else {
        spectatorsArray.push(spectator.name);
      }
    }
    spectatorsString = spectatorsArray.join(", ");
    // Change click behavior on the spectators cell.
    if (table.joined) {
      $("<td>").html(spectatorsString).appendTo(row);
    } else {
      // Can also join as a spectator.
      $("<td>")
        .html(spectatorsString)
        .addClass("lobbySpectators")
        .on("click", (evt) => {
          evt.stopPropagation();
          tableSpectate(table);
        })
        .appendTo(row);
    }

    // There is a keyboard shortcut to join the first table available. Add a class to the first
    // relevant row to facilitate this.
    if (
      !table.running &&
      !table.joined &&
      table.numPlayers < 6 &&
      !addedJoinFirstTableButton
    ) {
      addedJoinFirstTableButton = true;
      row.addClass("lobby-games-join-first-table-button");
    }

    // Setup click actions.
    if (table.sharedReplay || (!table.joined && table.running)) {
      const rowId = `spectate-${table.id}`;
      row
        .attr("id", rowId)
        .on("click", (event: JQuery.ClickEvent<HTMLElement>) => {
          if (event.ctrlKey) {
            // Copy the URL that would occur from clicking on this table row.
            let gameID = table.id.toString();
            if (table.sharedReplay) {
              gameID = table.name.substring("Shared replay for game #".length);
            }
            const path = table.sharedReplay
              ? `/shared-replay/${gameID}`
              : `/game/${gameID}`;
            copyURLToClipboard(path, `#${rowId}`);
          } else {
            tableSpectate(table);
          }
        });
    } else if (!table.joined) {
      const rowId = `join-${table.id}`;
      row.attr("id", rowId);
      if (table.numPlayers >= 6) {
        row.addClass("full");
      } else {
        row.on("click", (event: JQuery.ClickEvent<HTMLElement>) => {
          if (event.ctrlKey) {
            // Copy the URL that would occur from clicking on this table row.
            copyURLToClipboard(`/pre-game/${table.id}`, `#${rowId}`);
          } else {
            tableJoin(table);
          }
        });
      }
    } else {
      const rowId = `resume-${table.id}`;
      row
        .attr("id", rowId)
        .on("click", (event: JQuery.ClickEvent<HTMLElement>) => {
          if (event.ctrlKey) {
            // Copy the URL that would occur from clicking on this table row.
            copyURLToClipboard(`/game/${table.id}`, `#${rowId}`);
          } else {
            tableReattend(table);
          }
        });
    }

    row.appendTo(tbody);
    initializeOptionTooltips(table.options, "lobby-games-table", table.id);
  }
}

export function tableSpectate(table: Table, shadowingPlayerIndex = -1): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableSpectate", {
    tableID: table.id,
    shadowingPlayerIndex,
  });
  // (We will get a "tableStart" response back from the server.)
}

export function tableJoin(table: Table): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  if (table.passwordProtected) {
    modals.askForPassword(table.id);
  } else {
    globals.conn!.send("tableJoin", {
      tableID: table.id,
    });

    // Prepare the Change Options dialog for guest.
    createGame.ready();
    // (We will get a "joined" response back from the server.)
  }
}

function tableReattend(table: Table) {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableReattend", {
    tableID: table.id,
  });
  // (We will get either a "game" or a "tableStart" response back from the server, depending on if
  // the game has started or not.)
}

function tableHasFriends(table: Table) {
  if (!table.sharedReplay) {
    for (const player of table.players) {
      if (globals.friends.includes(player)) {
        return true;
      }
    }
  }

  for (const spectator of table.spectators) {
    if (globals.friends.includes(spectator.name)) {
      return true;
    }
  }

  return false;
}

function copyURLToClipboard(path: string, selector: string) {
  const url = getURLFromPath(path);
  copyStringToClipboard(url);

  // Show a visual indication that the copy worked.
  tooltips.create(selector, "clipboard");
  tooltips.openInstance(selector);
  setTimeout(() => {
    tooltips.closeInstance(selector);
  }, 1000); // 1 second
}
