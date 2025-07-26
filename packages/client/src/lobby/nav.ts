// The navigation bar at the top of the lobby.

import { globals } from "../Globals";
import { initModal } from "../modals";
import * as tooltips from "../tooltips";
import * as createGame from "./createGame";
import * as history from "./history";
import * as pregame from "./pregame";
import * as tablesDraw from "./tablesDraw";
import * as watchReplay from "./watchReplay";

export function init(): void {
  // The "Create Game" and "Change Options" buttons.
  initModal(
    "#nav-buttons-lobby-create-game",
    "#create-game-modal",
    createGame.ready,
    createGame.before,
    "#create-game-variant-dropdown1",
  );

  initModal(
    "#nav-buttons-pregame-change-options",
    "#create-game-modal",
    createGame.ready,
    createGame.before,
    "#create-game-variant-dropdown1",
  );

  // The "Show History" button.
  $("#nav-buttons-lobby-history").on("click", () => {
    history.show();
  });

  // The "Watch Specific Replay" button.
  initModal(
    "#nav-buttons-lobby-replay",
    "#replay-modal",
    watchReplay.ready,
    undefined,
    watchSpecificReplayFocus,
  );

  // The "Help" button. (This is just a simple link, so it does not need any code.)

  // The "Resources" button
  initModal("#nav-buttons-lobby-resources", "#resources-modal");

  // The "Settings" button
  initModal("#nav-buttons-lobby-settings", "#settings-modal");

  // The "Sign Out" button.
  $(".signout").on("click", () => {
    // Add the query parameters to the end to preserve using "?dev".
    globalThis.location.href = `/logout${globalThis.location.search}`;
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
        intendedPlayers: globals.game?.players.map((player) => player.name),
      });
      $("#nav-buttons-pregame-start").addClass("disabled");
    }
  });

  // The "Join Game" / "Join Spectate" button.
  $("#nav-buttons-pregame-join").on("click", () => {
    if (!$("#nav-buttons-pregame-join").hasClass("disabled")) {
      const table = globals.tableMap.get(globals.tableID);
      if (table === undefined) {
        return;
      }

      if (
        table.spectators.some(
          (spectator) => spectator.name === globals.username,
        )
      ) {
        // We are a spectator. We can join table without unattending it.
        tablesDraw.tableJoin(table);
      } else {
        // We are a player. We cannot spectate table without leaving it.
        globals.conn!.send("tableLeave", { tableID: globals.tableID });
        tablesDraw.tableSpectate(table);
      }
    }
  });

  // The "Change Options" button. (Also initialized in the "initTooltips()" function.)
  $("#nav-buttons-pregame-change-options").unbind("click");
  $("#nav-buttons-pregame-change-options").on("click", () => {
    if (!$("#nav-buttons-pregame-change-options").hasClass("disabled")) {
      tooltips.open("#nav-buttons-pregame-change-options");
    }
  });

  // The "Return to Lobby" button (from the "Pregame" screen).
  $("#nav-buttons-pregame-unattend").on("click", () => {
    pregame.hide();
    globals.conn!.send("tableUnattend", {
      tableID: globals.tableID,
    });
    globals.tableID = -1;
  });

  // The "Leave Game" button.
  $("#nav-buttons-pregame-leave").on("click", () => {
    // "Leave Game" and "Return to Lobby" are the same for spectators.
    const table = globals.tableMap.get(globals.tableID);
    if (table === undefined) {
      return;
    }

    if (
      table.spectators.some((spectator) => spectator.name === globals.username)
    ) {
      // We are a spectator.
      pregame.hide();
      globals.conn!.send("tableUnattend", {
        tableID: globals.tableID,
      });
      globals.tableID = -1;
    } else {
      globals.conn!.send("tableLeave", {
        tableID: globals.tableID,
      });
    }
  });

  // The "Show History of Friends" button (from the "History" screen).
  $("#nav-buttons-history-show-friends").on("click", () => {
    history.showFriends();
  });

  // The "Return to Lobby" button (from the "History" screen).
  $("#nav-buttons-history-return").on("click", () => {
    history.hide();
  });

  // The "Return to History" button (from the "History of Friends" screen).
  $("#nav-buttons-history-friends-return").on("click", () => {
    history.hideFriends();
  });

  // The "Return to History" button from the "History Details" screen. This is initialized in the
  // "history.drawOtherScores()" function.
}

function watchSpecificReplayFocus() {
  if ($("#replay-id-row").is(":visible")) {
    $("#replay-id").trigger("focus");
  } else if ($("#replay-json-row").is(":visible")) {
    $("#replay-json").trigger("focus");
  }

  $("#replay-id").on("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#replay-submit").trigger("click");
    }
  });
}

export function show(target: string): void {
  const navTypes = [
    "lobby",
    "pregame",
    "history",
    "history-friends",
    "history-other-scores",
  ];
  for (const navType of navTypes) {
    $(`#nav-buttons-${navType}`).hide();
  }
  if (target !== "nothing") {
    $(`#nav-buttons-${target}`).show();
  }
}
