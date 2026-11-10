// The navigation bar at the top of the lobby.

import { clearTabAccount, withTabAccount } from "@hanabi-live/data";
import { NO_TABLE_ID } from "../constants";
import { globals } from "../Globals";
import { showWarning } from "../modals";
import * as createGame from "./createGame";
import * as history from "./history";
import * as lobbyPage from "./lobbyPage";
import * as pregame from "./pregame";
import { tableJoin, tableSpectate } from "./tables/tableActions";
import * as watchReplay from "./watchReplay";

export function init(): void {
  // The "Create Game" and "Change Options" buttons.
  $("#nav-buttons-lobby-create-game, #nav-buttons-pregame-change-options").on(
    "click",
    () => {
      createGame.show();
    },
  );

  // The "Return to Lobby" or "Return to Game" button (from a lobby page).
  $("#nav-buttons-page-return").on("click", () => {
    lobbyPage.hide();
  });

  // The "Show History" button.
  $("#nav-buttons-lobby-history").on("click", () => {
    history.show();
  });

  // The "Watch Specific Replay" button.
  $("#nav-buttons-lobby-replay").on("click", () => {
    watchReplay.show();
  });

  // The "Help" button. (This is just a simple link, so it does not need any code.)

  // The "Resources" button
  $("#nav-buttons-lobby-resources").on("click", () => {
    lobbyPage.show("#lobby-resources");
  });

  // The "Settings" button
  $("#nav-buttons-lobby-settings").on("click", () => {
    lobbyPage.show("#lobby-settings");
  });

  // The "Sign Out" button.
  $(".signout").on("click", () => {
    // Keep "?dev" through signing out. The server rejects any other parameter.
    const dev = new URLSearchParams(globalThis.location.search).has("dev");
    const path = withTabAccount(dev ? "/logout?dev" : "/logout");
    clearTabAccount();
    globalThis.location.assign(path);
  });

  // The "Games" bottom screen toggle button.
  $("#lobby-toggle-show-tables").on("click", () => {
    $("#lobby-toggle-show-tables").addClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-chat").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").removeClass("toggle-active");
    // Show top half for small screens.
    $("#lobby-top-half").addClass("toggle-active");
    // Hide bottom half for small screens.
    $("#lobby-bottom-half").removeClass("toggle-active");
    // Fix chat margin for small screens.
    $("#lobby-chat-container")
      .removeClass("pregame-chat-layout")
      .removeClass("pregame-lobby-chat");
    $("#lobby-chat-pregame-container").removeClass("pregame-chat-layout");
    $("#lobby-online-users").removeClass("pregame-chat-layout");
  });

  // The "Who's online" bottom screen toggle button.
  $("#lobby-toggle-show-online").on("click", () => {
    // Set active button.
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").addClass("toggle-active");
    $("#lobby-toggle-show-chat").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").removeClass("toggle-active");
    // Hide top half for small screens.
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens.
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show online and hide chat, pregame chat.
    $("#lobby-online-users").removeClass("narrow-screen-hidden");
    $("#lobby-chat-container").addClass("narrow-screen-hidden");
    $("#lobby-chat-pregame-container").addClass("narrow-screen-hidden");
  });

  // The "Chat & Users" bottom screen toggle button.
  $("#lobby-toggle-show-chat").on("click", () => {
    // Set active button
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-chat").addClass("toggle-active");
    // Hide top half for small screens.
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens.
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show chat and hide online, pregame chat.
    $("#lobby-chat-container").removeClass("narrow-screen-hidden");
    $("#lobby-online-users").addClass("narrow-screen-hidden");
  });

  // The "Pregame Chat" bottom screen toggle button.
  $("#lobby-toggle-show-game-chat").on("click", () => {
    // Set active button.
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").addClass("toggle-active");
    // Hide top half for small screens.
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens.
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show chat, pregame chat and hide online.
    $("#lobby-chat-container").removeClass("narrow-screen-hidden");
    $("#lobby-chat-pregame-container").removeClass("narrow-screen-hidden");
    $("#lobby-chat-pregame").removeClass("narrow-screen-hidden");
    $("#lobby-online-users").addClass("narrow-screen-hidden");
    // Fix chat margin for small screens.
    $("#lobby-chat-container")
      .addClass("pregame-chat-layout")
      .addClass("pregame-lobby-chat");
    $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");
    $("#lobby-online-users").addClass("pregame-chat-layout");
  });

  // The "Start Game" button.
  $("#nav-buttons-pregame-start").on("click", () => {
    if (!$("#nav-buttons-pregame-start").hasClass("disabled")) {
      globals.conn!.send("tableStart", {
        tableID: globals.tableID,
        intendedPlayerNames: globals.game?.players.map(
          (player) => player.username,
        ),
      });
      $("#nav-buttons-pregame-start").addClass("disabled");
    }
  });

  // The "Join Game" button.
  $("#nav-buttons-pregame-join").on("click", () => {
    if ($("#nav-buttons-pregame-join").hasClass("disabled")) {
      return;
    }

    const table = globals.getTable(globals.tableID);
    if (table === undefined) {
      return;
    }

    const oldTable = globals.tables.find(
      (value) => value.joined && value.phase !== "sharedReplay",
    );
    if (oldTable !== undefined) {
      if (oldTable.phase !== "pregame") {
        showWarning(
          "You cannot join more than one table at a time. Terminate your other game before joining a new one.",
        );
        return;
      }
      globals.conn!.send("tableLeave", { tableID: oldTable.tableID });
    }
    tableJoin(table);
  });

  // The "Spectate Game" button.
  $("#nav-buttons-pregame-spectate").on("click", () => {
    if ($("#nav-buttons-pregame-spectate").hasClass("disabled")) {
      return;
    }

    const table = globals.getTable(globals.tableID);
    if (table === undefined) {
      return;
    }

    globals.conn!.send("tableLeave", { tableID: globals.tableID });
    tableSpectate(table);
  });

  // The "Return to Lobby" button (from the "Pregame" screen).
  $("#nav-buttons-pregame-unattend").on("click", () => {
    pregame.hide();
    globals.conn!.send("tableUnattend", {
      tableID: globals.tableID,
    });
    globals.tableID = NO_TABLE_ID;
  });

  // The "Leave Game" button.
  $("#nav-buttons-pregame-leave").on("click", () => {
    // "Leave Game" and "Return to Lobby" are the same for spectators.
    const table = globals.getTable(globals.tableID);
    if (table === undefined) {
      return;
    }

    if (
      table.spectators.some(
        (spectator) => spectator.username === globals.username,
      )
    ) {
      // We are a spectator.
      pregame.hide();
      globals.conn!.send("tableUnattend", {
        tableID: globals.tableID,
      });
      globals.tableID = NO_TABLE_ID;
    } else {
      globals.conn!.send("tableLeave", {
        tableID: globals.tableID,
      });
    }
  });

  // The "Return to Lobby" button (from the "History" screen).
  $("#nav-buttons-history-return").on("click", () => {
    history.hide();
  });

  // The "Return to History" button (from the "Other Scores" screen).
  $("#nav-buttons-history-other-scores-return").on("click", () => {
    history.hideOtherScores();
  });
}

/** Shows or hides the lobby's tables, chat, and online users, which full-page screens replace. */
export function showLobbyHalves(visible: boolean): void {
  for (const selector of [
    "#lobby-top-half",
    "#lobby-separator",
    "#lobby-bottom-half",
    "#lobby-small-screen-buttons",
  ]) {
    $(selector).toggleClass("hidden", !visible);
  }
}

export function show(target: string): void {
  const navTypes = [
    "lobby",
    "pregame",
    "page",
    "history",
    "history-other-scores",
  ];
  for (const navType of navTypes) {
    $(`#nav-buttons-${navType}`).hide();
  }
  if (target !== "nothing") {
    $(`#nav-buttons-${target}`).show();
  }
}
