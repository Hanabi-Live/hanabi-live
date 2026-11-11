// The lobby's layout: its halves, and the buttons that switch between them on small screens.

export function init(): void {
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
    $("#lobby-online-users").removeClass("hidden-640");
    $("#lobby-chat-container").addClass("hidden-640");
    $("#lobby-chat-pregame-container").addClass("hidden-640");
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
    $("#lobby-chat-container").removeClass("hidden-640");
    $("#lobby-online-users").addClass("hidden-640");
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
    $("#lobby-chat-container").removeClass("hidden-640");
    $("#lobby-chat-pregame-container").removeClass("hidden-640");
    $("#lobby-chat-pregame").removeClass("hidden-640");
    $("#lobby-online-users").addClass("hidden-640");
    // Fix chat margin for small screens.
    $("#lobby-chat-container")
      .addClass("pregame-chat-layout")
      .addClass("pregame-lobby-chat");
    $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");
    $("#lobby-online-users").addClass("pregame-chat-layout");
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
  $("#lobby-full").toggleClass("hidden", visible);
}
