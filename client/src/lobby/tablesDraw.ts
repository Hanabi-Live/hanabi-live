// The lobby area that shows all of the current tables

import globals from "../globals";
import { timerFormatter } from "../misc";
import * as modals from "../modals";
import Screen from "./types/Screen";
import Table from "./types/Table";

export default function tablesDraw(): void {
  const tbody = $("#lobby-games-table-tbody");

  // Clear all of the existing rows
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
        if (friends && i === 1 && table.joined && !table.sharedReplay) {
          tableIDsOfThisType.push(id);
        }

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
          tableIDsOfThisType.push(id);
        } else if (
          i === 3 &&
          !table.running &&
          table.passwordProtected &&
          !table.joined
        ) {
          tableIDsOfThisType.push(id);
        } else if (
          i === 4 &&
          table.running &&
          !table.sharedReplay &&
          !table.joined
        ) {
          tableIDsOfThisType.push(id);
        } else if (i === 5 && table.running && table.sharedReplay) {
          tableIDsOfThisType.push(id);
        }
      }
      tableIDsOfThisType.sort();
      sortedTableIDs = sortedTableIDs.concat(tableIDsOfThisType);
    }
  }

  // Add all of the games
  let addedJoinFirstTableButton = false;
  for (const id of sortedTableIDs) {
    const table = globals.tableMap.get(id);
    if (table === undefined) {
      throw new Error(`Failed to get the table for the ID of "${id}".`);
    }

    // Set the background color of the row, depending on what kind of game it is
    let htmlClass;
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

    // Column 1 - Name
    let { name } = table;
    if (table.passwordProtected && !table.running && !table.sharedReplay) {
      name = `<i class="fas fa-key fa-sm"></i> &nbsp; ${name}`;
    }
    $("<td>").html(name).appendTo(row);

    // Column 2 - # of Players
    $("<td>").html(table.numPlayers.toString()).appendTo(row);

    // Column 3 - Variant
    $("<td>").html(table.variant).appendTo(row);

    // Column 4 - Timed
    let timed = "No";
    if (table.timed) {
      timed = `${timerFormatter(table.timeBase)} + ${timerFormatter(
        table.timePerTurn,
      )}`;
    }
    $("<td>").html(timed).appendTo(row);

    // Column 5 - Status
    let status;
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

    // Column 6 - Players
    const playersArray: string[] = [];
    for (const player of table.players) {
      if (player === globals.username) {
        playersArray.push(`<span class="name-me">${player}</span>`);
      } else if (globals.friends.includes(player)) {
        playersArray.push(`<span class="friend">${player}</span>`);
      } else {
        playersArray.push(player);
      }
    }
    const playersString = playersArray.join(", ");
    $("<td>").html(playersString).appendTo(row);

    // Column 7 - Spectators
    let spectatorsString: string;
    if (table.spectators.length === 0) {
      spectatorsString = "-";
    } else {
      const spectatorsArray: string[] = [];
      for (const spectator of table.spectators) {
        if (globals.friends.includes(spectator)) {
          spectatorsArray.push(`<span class="friend">${spectator}</span>`);
        } else {
          spectatorsArray.push(spectator);
        }
      }
      spectatorsString = spectatorsArray.join(", ");
    }
    $("<td>").html(spectatorsString).appendTo(row);

    // There is a keyboard shortcut to join the first table available
    // Add a hidden button to facilitate this
    if (
      !table.running &&
      !table.joined &&
      table.numPlayers < 6 &&
      !addedJoinFirstTableButton
    ) {
      addedJoinFirstTableButton = true;
      const button = $("<button>")
        .attr("type", "button")
        .css("display", "none")
        .attr("id", `join-${table.id}`)
        .addClass("lobby-games-join-first-table-button")
        .on("click", () => {
          tableJoin(table);
        });
      button.appendTo(row);
    }

    // Setup mouse events
    row.on("mouseenter", () => {
      row.addClass("hover").off("click");
      if (table.sharedReplay || (!table.joined && table.running)) {
        row.attr("id", `spectate-${table.id}`).on("click", () => {
          tableSpectate(table);
        });
      } else if (!table.joined) {
        row.attr("id", `join-${table.id}`);
        if (table.numPlayers >= 6) {
          row.addClass("full");
        } else {
          row.on("click", () => {
            tableJoin(table);
          });
        }
      } else {
        row.attr("id", `resume-${table.id}`).on("click", () => {
          tableReattend(table);
        });
      }
    });

    row.on("mouseleave", () => {
      row.removeClass("hover").removeClass("full").off("click");
    });

    row.appendTo(tbody);
  }
}

export function tableSpectate(table: Table): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableSpectate", {
    tableID: table.id,
    shadowingPlayerIndex: -1,
  });
  // (we will get a "tableStart" response back from the server)
}

export function tableJoin(table: Table): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  if (table.passwordProtected) {
    modals.passwordShow(table.id);
  } else {
    globals.conn!.send("tableJoin", {
      tableID: table.id,
    });
    // (we will get a "joined" response back from the server)
  }
}

function tableReattend(table: Table) {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableReattend", {
    tableID: table.id,
  });
  // (we will get either a "game" or a "tableStart" response back from the server,
  // depending on if the game has started or not)
}

function tableHasFriends(table: Table) {
  for (const player of table.players) {
    if (globals.friends.includes(player)) {
      return true;
    }
  }

  for (const spectator of table.spectators) {
    if (globals.friends.includes(spectator)) {
      return true;
    }
  }

  return false;
}
