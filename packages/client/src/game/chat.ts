// In-game chat

import { assertNotNull, parseFloatSafe } from "complete-common";
import interact from "interactjs";
import { globals } from "../Globals";
import { FADE_TIME_MS } from "../constants";
import { getHTMLElement } from "../utils";

const gameChatText = getHTMLElement("#game-chat-text");

export function init(): void {
  // Make the chat modal draggable (using the InteractJS library).
  interact(".draggable")
    .draggable({
      allowFrom: "#game-chat-modal-header",

      // Keep the modal within the bounds of the page. (The parent is the <body> element.)
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
        }),
      ],

      // Define the drag behavior.
      onmove: (event: Interact.InteractEvent) => {
        // The old position is stored in the "data-x" and "data-y" attributes.
        const oldXString = event.target.dataset["x"] ?? "";
        const oldYString = event.target.dataset["y"] ?? "";
        const oldX = parseFloatSafe(oldXString) ?? 0;
        const oldY = parseFloatSafe(oldYString) ?? 0;

        // Move it,
        const newX = oldX + event.dx;
        const newY = oldY + event.dy;
        const element = $(`#${event.target.id}`);
        moveElement(element, newX, newY);
      },
    })

    .resizable({
      // Resize from all edges and corners.
      edges: {
        // We do not want it to be resizable from the top since it interferes with the area
        // dedicated to moving the div.
        left: true,
        right: true,
        bottom: true,
      },

      ignoreFrom: "#game-chat-modal-header",

      modifiers: [
        // Keep the modal within the bounds of the page. (The parent is the <body> element.)
        interact.modifiers.restrictEdges({
          outer: "parent",
        }),

        // Define a minimum size for the modal.
        interact.modifiers.restrictSize({
          min: {
            width: 200,
            height: 200,
          },
        }),
      ],
    })

    .on("resizemove", (event: Interact.ResizeEvent) => {
      if (event.deltaRect === undefined) {
        return;
      }

      // The old position is stored in the "data-x" and "data-y" attributes.
      const oldXString = event.target.dataset["x"] ?? "";
      const oldYString = event.target.dataset["y"] ?? "";
      const oldX = parseFloatSafe(oldXString) ?? 0;
      const oldY = parseFloatSafe(oldYString) ?? 0;

      // Translate when resizing from top or left edges.
      const newX = oldX + event.deltaRect.left;
      const newY = oldY + event.deltaRect.top;

      // Move it.
      const element = $(`#${event.target.id}`);
      moveElement(element, newX, newY);

      // Resize it.
      event.target.style.width = `${event.rect.width}px`;
      event.target.style.height = `${event.rect.height}px`;
    })

    .on("dragend resizeend", (event: Interact.InteractEvent) => {
      // The modal was moved or resized; store the window dimensions in a cookie so that it will
      // persist between refreshes.
      localStorage.setItem("chatWindowWidth", event.target.style.width);
      localStorage.setItem("chatWindowHeight", event.target.style.height);
      localStorage.setItem("chatWindowX", event.target.dataset["x"] ?? "0");
      localStorage.setItem("chatWindowY", event.target.dataset["y"] ?? "0");
    });

  $("#game-chat-modal-header-close").click(() => {
    hide();
  });
}

export function toggle(): void {
  const modal = $("#game-chat-modal");
  if (modal.is(":visible")) {
    hide();
  } else {
    show();
  }
}

export function show(): void {
  const modal = $("#game-chat-modal");
  modal.fadeIn(FADE_TIME_MS);

  // Check to see if there are any unread chat messages.
  if (globals.chatUnread !== 0) {
    // If the user is opening the chat, then we assume that all of the chat messages are read.
    globals.chatUnread = 0;

    // We need to notify the server that we have read everything.
    assertNotNull(
      globals.conn,
      'The "globals.conn" object is not initialized.',
    );
    globals.conn.send("chatRead", {
      tableID: globals.tableID,
    });

    // Reset the "Chat" UI button back to normal.
    assertNotNull(globals.ui, 'The "globals.ui" object is not initialized.');
    globals.ui.updateChatLabel();
  }

  // Set the modal to the default position.
  modal.css("width", "20%");
  modal.css("height", "50%");
  modal.css("top", "1%");
  modal.css("left", "79%");

  // If there is a stored size + position for the chat box, set that.
  let resetPosition = true;
  const width = localStorage.getItem("chatWindowWidth") ?? "";
  const height = localStorage.getItem("chatWindowHeight") ?? "";
  const xString = localStorage.getItem("chatWindowX") ?? "";
  const yString = localStorage.getItem("chatWindowY") ?? "";

  if (width !== "" && height !== "" && xString !== "" && yString !== "") {
    resetPosition = false;

    modal.css("width", width);
    modal.css("height", height);

    const x = parseFloatSafe(xString);
    const y = parseFloatSafe(yString);

    if (x !== undefined && y !== undefined) {
      moveElement(modal, x, y);
    }

    // Just in case, reset the size and position if the stored location puts the chat box offscreen.
    // (This is possible if the window size has changed since the last time.)
    if (isOffscreen(modal)) {
      resetPosition = true;
    }
  }

  if (resetPosition) {
    modal.css("width", "20%");
    modal.css("height", "50%");
    modal.css("webkitTransform", "translate(0px, 0px)");
    modal.css("transform", "translate(0px, 0px)");
    modal.attr("data-x", 0);
    modal.attr("data-y", 0);
  }

  // Scroll to the bottom of the chat.
  gameChatText.scrollTop = gameChatText.scrollHeight;

  $("#game-chat-input").trigger("focus");
}

export function hide(): void {
  $("#game-chat-modal").fadeOut(FADE_TIME_MS);
}

/** Subroutine to move an element (using the "transform" CSS property). */
function moveElement(element: JQuery, x: number, y: number) {
  // Update the element's style.
  const transform = `translate(${x}px, ${y}px)`;
  element.css("webkitTransform", transform);
  element.css("transform", transform);

  // Keep the dragged position in the "data-x" & "data-y" attributes.
  element.attr("data-x", x);
  element.attr("data-y", y);
}

/** From: https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen */
function isOffscreen(element: JQuery) {
  const domElement = element[0]!;
  const rect = domElement.getBoundingClientRect();
  return (
    rect.top < 0 // Above the top
    || rect.bottom > window.innerHeight // Below the bottom
    || rect.left < 0 // Left of the left edge
    || rect.right > window.innerWidth // Right of the right edge
  );
}
