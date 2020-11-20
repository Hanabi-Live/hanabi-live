// The lobby area that shows all of the current tables

import globals from "../globals";
import { createMouseCursors, timerFormatter } from "../misc";
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

  // Get the overlay div
  const overlay = $(".overlay");
  overlay.on("mouseleave", () => {
    overlay.hide();
  });
  // Create the mouse cursors
  const cursors = createMouseCursors();

  // Add all of the games
  let addedFirstJoinButton = false;
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

    // Add a hidden FirstJoin button to the row if appropriate
    if (
      !table.running &&
      !table.joined &&
      table.numPlayers < 6 &&
      !addedFirstJoinButton
    ) {
      addedFirstJoinButton = true;
      const button = $("<button>")
        .attr("type", "button")
        .css("display", "none")
        .attr("id", `join-${table.id}`)
        .addClass("lobby-games-first-join-button")
        .on("click", () => {
          tableJoin(table);
        });
      button.appendTo(row);
    }

    // Set the overlay div
    row.on("mouseenter", () => {
      const offset = row.offset();
      const width = row.outerWidth();
      const height = row.outerHeight();

      if (offset === undefined || width === undefined || height === undefined) {
        throw new Error(
          "Failed to get the dimensions and coordinates for the table row.",
        );
      }

      overlay.css({
        display: "flex",
        left: `${offset.left}px`,
        top: `${offset.top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });

      if (table.sharedReplay || (!table.joined && table.running)) {
        overlay.css("cursor", cursors.eye);
        overlay.attr("id", `spectate-${table.id}`);
        overlay.off("click").on("click", () => {
          tableSpectate(table);
        });
      } else if (!table.joined) {
        overlay.attr("id", `join-${table.id}`);
        if (table.numPlayers >= 6) {
          overlay.css("cursor", cursors.forbid);
          overlay.off("click");
        } else {
          overlay.css("cursor", cursors.sign);
          overlay.off("click").on("click", () => {
            tableJoin(table);
          });
        }
      } else {
        overlay.css("cursor", cursors.play);
        overlay.attr("id", `resume-${table.id}`);
        overlay.off("click").on("click", () => {
          tableReattend(table);
        });
      }
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
  }
}

function tableReattend(table: Table) {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableReattend", {
    tableID: table.id,
  });
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
