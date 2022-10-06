// The lobby area that shows all of the current logged-in users.

import { ensureAllCases } from "@hanabi/data";
import globals from "../globals";
import * as tooltips from "../tooltips";
import * as tablesDraw from "./tablesDraw";
import Screen from "./types/Screen";
import Status, { StatusText } from "./types/Status";

export function draw(): void {
  $(".lobby-users-num").text(globals.userMap.size);

  const tbody = $("#lobby-users-table-tbody");

  // Clear all of the existing rows.
  tbody.html("");

  // Don't do anything if there are no users. (This will be the case when first logging in and not
  // doing the tutorial.)
  if (globals.userMap.size === 0) {
    return;
  }

  // Make a mapping of user names to IDs (and keep track of our friends).
  const usernameMapping = new Map<string, number>();
  const onlineFriends: string[] = [];
  for (const [id, user] of globals.userMap.entries()) {
    usernameMapping.set(user.name, id);
    if (globals.friends.includes(user.name)) {
      onlineFriends.push(user.name);
    }
  }

  // Make an alphabetical list of all of the usernames.
  const alphabeticalUsernames = Array.from(usernameMapping.keys());
  alphabeticalUsernames.sort(
    // We want to do a case-insensitive sort, which will not occur by default.
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // Additionally, alphabetize all of our friends.
  onlineFriends.sort(
    // We want to do a case-insensitive sort, which will not occur by default.
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // First, draw our username at the top.
  const alreadyDrawnUsers: string[] = [];
  drawUser(globals.username, usernameMapping, tbody, false);
  alreadyDrawnUsers.push(globals.username);

  // Second, draw our currently online friends, if any.
  for (const friend of onlineFriends) {
    drawUser(friend, usernameMapping, tbody, true);
    alreadyDrawnUsers.push(friend);
  }

  // Then, draw all of the other users in alphabetical order.
  for (const username of alphabeticalUsernames) {
    if (!alreadyDrawnUsers.includes(username)) {
      drawUser(username, usernameMapping, tbody, false);
    }
  }
}

function drawUser(
  username: string,
  usernameMapping: Map<string, number>,
  tbody: JQuery,
  friend: boolean,
) {
  // Find the status of this user from the "userList" map.
  const userID = usernameMapping.get(username);
  if (userID === undefined) {
    throw new Error(`Failed to get the ID for the username of "${username}".`);
  }
  const user = globals.userMap.get(userID);
  if (user === undefined) {
    throw new Error(`Failed to get the user for the ID of "${userID}".`);
  }

  let nameColumn = "";
  if (user.hyphenated) {
    nameColumn += `<span id="hyphenated-tooltip-${userID}" class="tooltip" `;
    nameColumn += 'data-tooltip-content="#hyphenated-tooltip">';
    nameColumn += '<i class="fas fa-heading fa-xs"></i></span>&nbsp; ';
  } else {
    nameColumn += '<span class="lobby-hyphen-empty"></span>&nbsp; ';
  }

  nameColumn += `<span id="online-users-${userID}">`;
  if (username === globals.username) {
    nameColumn += "<strong>";
  }
  nameColumn += `<a href="/scores/${username}" `;
  if (username === globals.username) {
    nameColumn += 'class="name-me" ';
  } else if (friend) {
    nameColumn += 'class="friend" ';
  }
  nameColumn += 'target="_blank" rel="noopener noreferrer">';
  nameColumn += username;
  nameColumn += "</a>";
  if (username === globals.username) {
    nameColumn += "</strong>";
  }
  nameColumn += `<span id="online-users-${userID}-zzz" class="hidden"> &nbsp;💤</span>`;
  nameColumn += "</span>";

  let statusColumn: string;
  const statusText = StatusText[user.status]!;
  if (
    globals.currentScreen === Screen.PreGame ||
    user.status === Status.Lobby ||
    user.status === Status.Replay
  ) {
    statusColumn = statusText;
  } else {
    statusColumn = `<a id="online-users-${userID}-link" href="#">${statusText}</a>`;
  }

  const row = $("<tr>");
  $("<td>").html(nameColumn).appendTo(row);
  $("<td>").html(statusColumn).appendTo(row);

  row.appendTo(tbody);

  setLink(userID);
  setInactive(userID, user.inactive);

  const content =
    '<span style="font-size: 0.75em;">This person is a self-identified member of the Hyphenated group.</span>';
  tooltips.create(`#hyphenated-tooltip-${userID}`, "default", content);
}

function setLink(userID: number) {
  $(`#online-users-${userID}-link`).off("click");
  $(`#online-users-${userID}-link`).on("click", () => {
    // Get the user corresponding to this element.
    const user = globals.userMap.get(userID);
    if (user === undefined) {
      return;
    }

    // Get the table corresponding to the user. If the user is in the lobby or in a solo replay,
    // this will be undefined.
    const table = globals.tableMap.get(user.tableID);
    if (table === undefined) {
      return;
    }

    switch (user.status) {
      case Status.Lobby: {
        // The "Lobby" status is not a link.
        break;
      }

      case Status.PreGame: {
        tablesDraw.tableJoin(table);
        break;
      }

      case Status.Playing: {
        tablesDraw.tableSpectate(table);
        break;
      }

      case Status.Spectating: {
        tablesDraw.tableSpectate(table);
        break;
      }

      case Status.Replay: {
        // The "Replay" status is not a link.
        break;
      }

      case Status.SharedReplay: {
        tablesDraw.tableSpectate(table);
        break;
      }

      default: {
        ensureAllCases(user.status);
      }
    }
  });
}

export function setInactive(userID: number, inactive: boolean): void {
  if (inactive) {
    $(`#online-users-${userID}`).fadeTo(0, 0.3);
    $(`#online-users-${userID}-zzz`).show();
  } else {
    $(`#online-users-${userID}`).fadeTo(0, 1);
    $(`#online-users-${userID}-zzz`).hide();
  }
}
