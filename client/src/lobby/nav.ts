// The navigation bar at the top of the lobby

import * as KeyCode from "keycode-js";
import globals from "../globals";
import * as modals from "../modals";
import * as tooltips from "../tooltips";
import * as createGame from "./createGame";
import * as history from "./history";
import * as pregame from "./pregame";
import * as watchReplay from "./watchReplay";

export function init(): void {
  // Remove the recursive link to prevent confusion
  $("#logo-link").removeAttr("href");

  // Initialize all of the navigation tooltips
  initTooltips();

  // The "Create Game" and "Change Options" buttons
  tooltips.setOption(
    "#nav-buttons-lobby-create-game",
    "functionBefore",
    createGame.before,
  );
  tooltips.setOption(
    "#nav-buttons-lobby-create-game",
    "functionReady",
    createGame.ready,
  );
  tooltips.setOption(
    "#nav-buttons-pregame-change-options",
    "functionBefore",
    createGame.before,
  );
  tooltips.setOption(
    "#nav-buttons-pregame-change-options",
    "functionReady",
    createGame.ready,
  );
  // (the logic for this tooltip is handled in the "createGame.ts" file)

  // The "Show History" button
  $("#nav-buttons-lobby-history").on("click", () => {
    history.show();
  });

  // The "Watch Specific Replay" button
  tooltips.setOption(
    "#nav-buttons-lobby-replay",
    "functionReady",
    watchReplay.ready,
  );
  // (the logic for this tooltip is handled in the "watchReplay.ts" file)

  // The "Help" button
  // (this is just a simple link)

  // The "Resources" button
  // (initialized in the "initTooltips()" function)

  // The "Settings" button
  // (initialized in the "initTooltips()" function)

  // The "Sign Out" button
  $(".signout").on("click", () => {
    // Add the query parameters to the end to preserve using "?dev"
    window.location.href = `/logout${window.location.search}`;
  });

  // The "Games" bottom screen toggle button
  $("#lobby-toggle-show-tables").on("click", () => {
    $("#lobby-toggle-show-tables").addClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-chat").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").removeClass("toggle-active");
    // Show top half for small screens
    $("#lobby-top-half").addClass("toggle-active");
    // Hide bottom half for small screens
    $("#lobby-bottom-half").removeClass("toggle-active");
    // Fix chat margin for small screens
    $("#lobby-chat-container")
      .removeClass("pregame-chat-layout")
      .removeClass("pregame-lobby-chat");
    $("#lobby-chat-pregame-container").removeClass("pregame-chat-layout");
    $("#lobby-online-users").removeClass("pregame-chat-layout");
  });

  // The "Who's online" bottom screen toggle button
  $("#lobby-toggle-show-online").on("click", () => {
    // Set active button
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").addClass("toggle-active");
    $("#lobby-toggle-show-chat").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").removeClass("toggle-active");
    // Hide top half for small screens
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show online and hide chat, pregame chat
    $("#lobby-online-users").removeClass("narrow-screen-hidden");
    $("#lobby-chat-container").addClass("narrow-screen-hidden");
    $("#lobby-chat-pregame-container").addClass("narrow-screen-hidden");
  });

  // The "Chat & Users" bottom screen toggle button
  $("#lobby-toggle-show-chat").on("click", () => {
    // Set active button
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-chat").addClass("toggle-active");
    // Hide top half for small screens
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show chat and hide online, pregame chat
    $("#lobby-chat-container").removeClass("narrow-screen-hidden");
    $("#lobby-online-users").addClass("narrow-screen-hidden");
  });

  // The "Pregame Chat" bottom screen toggle button
  $("#lobby-toggle-show-game-chat").on("click", () => {
    // Set active button
    $("#lobby-toggle-show-tables").removeClass("toggle-active");
    $("#lobby-toggle-show-online").removeClass("toggle-active");
    $("#lobby-toggle-show-game-chat").addClass("toggle-active");
    // Hide top half for small screens
    $("#lobby-top-half").removeClass("toggle-active");
    // Show bottom half for small screens
    $("#lobby-bottom-half").addClass("toggle-active");
    // Show chat, pregame chat and hide online
    $("#lobby-chat-container").removeClass("narrow-screen-hidden");
    $("#lobby-chat-pregame-container").removeClass("narrow-screen-hidden");
    $("#lobby-chat-pregame").removeClass("narrow-screen-hidden");
    $("#lobby-online-users").addClass("narrow-screen-hidden");
    // Fix chat margin for small screens
    $("#lobby-chat-container")
      .addClass("pregame-chat-layout")
      .addClass("pregame-lobby-chat");
    $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");
    $("#lobby-online-users").addClass("pregame-chat-layout");
  });

  // The "Start Game" button
  $("#nav-buttons-pregame-start").on("click", () => {
    if (!$("#nav-buttons-pregame-start").hasClass("disabled")) {
      globals.conn!.send("tableStart", {
        tableID: globals.tableID,
      });
      $("#nav-buttons-pregame-start").addClass("disabled");
    }
  });

  // The "Change Options" button
  // (also initialized in the "initTooltips()" function)
  $("#nav-buttons-pregame-change-options").unbind("click");

  $("#nav-buttons-pregame-change-options").on("click", () => {
    if (!$("#nav-buttons-pregame-change-options").hasClass("disabled")) {
      tooltips.open("#nav-buttons-pregame-change-options");
    }
  });

  // The "Return to Lobby" button (from the "Pregame" screen)
  $("#nav-buttons-pregame-unattend").on("click", () => {
    pregame.hide();
    globals.conn!.send("tableUnattend", {
      tableID: globals.tableID,
    });
    globals.tableID = -1;
  });

  // The "Leave Game" button
  $("#nav-buttons-pregame-leave").on("click", () => {
    globals.conn!.send("tableLeave", {
      tableID: globals.tableID,
    });
  });

  // The "Show History of Friends" button (from the "History" screen)
  $("#nav-buttons-history-show-friends").on("click", () => {
    history.showFriends();
  });

  // The "Return to Lobby" button (from the "History" screen)
  $("#nav-buttons-history-return").on("click", () => {
    history.hide();
  });

  // The "Return to History" button (from the "History of Friends" screen)
  $("#nav-buttons-history-friends-return").on("click", () => {
    history.hideFriends();
  });

  // The "Return to History" button (from the "History Details" screen)
  // (initialized in the "history.drawOtherScores()" function)
}

function initTooltips() {
  const navTooltips = [
    "lobby-create-game",
    "lobby-replay",
    "lobby-resources",
    "lobby-settings",
    "pregame-change-options",
  ];

  const functionBefore = () => {
    modals.setShadeOpacity(0.6);
  };

  const tooltipCloseFunction = () => {
    // We want to fade in the background as soon as we start the tooltip closing animation,
    // so we have to hook to the "close" event
    // Furthermore, we don't want to fade in the background if we click from one tooltip to the
    // other, so we have to check to see how many tooltips are open
    // If one tooltip is open, then it is the one currently closing
    // If two tooltips are open, then we are clicking from one to the next
    let tooltipsOpen = 0;
    for (const tooltip of navTooltips) {
      if (tooltips.isOpen(`#nav-buttons-${tooltip}`)) {
        tooltipsOpen += 1;
      }
    }
    if (tooltipsOpen <= 1) {
      modals.setShadeOpacity(0);
    }
  };

  // The "close" event will not fire if we initialize this on the tooltip class for some reason,
  // so we initialize all 3 individually
  for (const navTooltip of navTooltips) {
    const tooltip = `#nav-buttons-${navTooltip}`;
    tooltips.create(tooltip, "nav", functionBefore);
    tooltips.getInstance(tooltip).on("close", tooltipCloseFunction);
  }

  // Map the escape key to close all tooltips / modals
  $(document).keydown((event) => {
    if (event.which === KeyCode.KEY_ESCAPE) {
      event.preventDefault();
      tooltips.closeAllTooltips();
      modals.closeAll();
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
