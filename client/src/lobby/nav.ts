// The navigation bar at the top of the lobby

import * as KeyCode from "keycode-js";
import { sendText } from "../chat";
import { VARIANTS } from "../game/data/gameData";
import globals from "../globals";
import { closeAllTooltips } from "../misc";
import * as modals from "../modals";
import * as createGame from "./createGame";
import * as history from "./history";
import * as pregame from "./pregame";
import * as watchReplay from "./watchReplay";

export function init(): void {
  // Remove the recursive link to prevent confusion
  $("#logo-link").removeAttr("href");

  // Initialize all of the navigation tooltips using Tooltipster
  initTooltips();

  // The "Create Game" button
  $("#nav-buttons-lobby-create-game").tooltipster(
    "option",
    "functionBefore",
    createGame.before,
  );
  $("#nav-buttons-lobby-create-game").tooltipster(
    "option",
    "functionReady",
    createGame.ready,
  );
  // (the logic for this tooltip is handled in the "createGame.ts" file)

  // The "Show History" button
  $("#nav-buttons-lobby-history").on("click", () => {
    history.show();
  });

  // The "Watch Specific Replay" button
  $("#nav-buttons-lobby-replay").tooltipster(
    "option",
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

  // The "Change Variant" button
  // (also initialized in the "initTooltips()" function)
  $("#nav-buttons-pregame-change-variant").unbind("click");

  $("#nav-buttons-pregame-change-variant").on("click", () => {
    if (!$("#nav-buttons-pregame-change-variant").hasClass("disabled")) {
      $("#nav-buttons-pregame-change-variant").tooltipster("open");
    }
  });

  $("#nav-buttons-pregame-change-variant").tooltipster(
    "option",
    "functionReady",
    () => {
      // Clear/focus the selector
      $("#change-variant-dropdown").val("");
      $("#change-variant-dropdown").focus();

      if ($("#change-variant-dropdown-list").children().length !== 0) {
        return; // already initialized, don't need to do again
      }

      // Populate variant list
      for (const variantName of VARIANTS.keys()) {
        const option = new Option(variantName, variantName);
        $("#change-variant-dropdown-list").append($(option));
      }

      // Pressing enter anywhere will submit the form
      $("#change-variant-dropdown").on("keypress", (event) => {
        if (event.which === KeyCode.KEY_RETURN) {
          event.preventDefault();
          $("#change-variant-submit").click();
        }
      });

      // Update button trigger
      $("#change-variant-submit").on("click", () => {
        const variantName = (
          $("#change-variant-dropdown").val() as string
        ).trim();
        if (VARIANTS.get(variantName) === undefined) {
          return;
        }
        if (globals.game?.owner === globals.userID) {
          globals.conn!.send("tableSetVariant", {
            tableID: globals.tableID,
            options: {
              variantName,
            },
          });
        } else {
          sendText("table", `Please @/setvariant ${variantName}@`);
        }
        // Close the tooltips
        closeAllTooltips();
      });
    },
  );

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
  const tooltips = [
    "lobby-create-game",
    "lobby-replay",
    "lobby-resources",
    "lobby-settings",
    "pregame-change-variant",
  ];

  const tooltipsterOptions = {
    theme: "tooltipster-shadow",
    trigger: "click",
    interactive: true,
    delay: 0,
    // Some tooltips are too large for small resolutions and will wrap off the screen;
    // we can use a Tooltipster plugin to automatically create a scroll bar for it
    // https://github.com/louisameline/tooltipster-scrollableTip
    plugins: [
      "sideTip", // Make it have the ability to be positioned on a specific side
      "scrollableTip", // Make it scrollable
    ],
    functionBefore: () => {
      modals.setShadeOpacity(0.6);
    },
  };

  const tooltipsterClose = () => {
    // We want to fade in the background as soon as we start the tooltip closing animation,
    // so we have to hook to the "close" event
    // Furthermore, we don't want to fade in the background if we click from one tooltip to the
    // other, so we have to check to see how many tooltips are open
    // If one tooltip is open, then it is the one currently closing
    // If two tooltips are open, then we are clicking from one to the next
    let tooltipsOpen = 0;
    for (const tooltip of tooltips) {
      if ($(`#nav-buttons-${tooltip}`).tooltipster("status").open) {
        tooltipsOpen += 1;
      }
    }
    if (tooltipsOpen <= 1) {
      modals.setShadeOpacity(0);
    }
  };

  // The "close" event will not fire if we initialize this on the tooltip class for some reason,
  // so we initialize all 3 individually
  for (const tooltip of tooltips) {
    $(`#nav-buttons-${tooltip}`)
      .tooltipster(tooltipsterOptions)
      .tooltipster("instance")
      .on("close", tooltipsterClose);
  }

  // Map the escape key to close all tooltips / modals
  $(document).keydown((event) => {
    if (event.which === KeyCode.KEY_ESCAPE) {
      event.preventDefault();
      closeAllTooltips();
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
