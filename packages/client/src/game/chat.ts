// In-game chat

import { assertDefined, parseFloatSafe } from "complete-common";
import interact from "interactjs";
import { globals } from "../Globals";
import { FADE_TIME_MS, LOCAL_STORAGE_KEY } from "../constants";
import { getHTMLElement } from "../utils";
import * as newUIState from "./newUI/newUIState";

const gameChatText = getHTMLElement("#game-chat-text");

/** The size of the chat modal before the player has moved or resized it, in percent of the page. */
const DEFAULT_CHAT_MODAL_WIDTH_PERCENT = 20;
const DEFAULT_CHAT_MODAL_HEIGHT_PERCENT = 50;

/** The gap between the default chat modal and the top and right edges, in percent of the page. */
const DEFAULT_CHAT_MODAL_MARGIN_PERCENT = 1;

const DEFAULT_CHAT_MODAL_SIZE = {
  width: `${DEFAULT_CHAT_MODAL_WIDTH_PERCENT}%`,
  height: `${DEFAULT_CHAT_MODAL_HEIGHT_PERCENT}%`,
} as const;

const DEFAULT_CHAT_MODAL_POSITION = {
  top: `${DEFAULT_CHAT_MODAL_MARGIN_PERCENT}%`,
  left: `${100 - DEFAULT_CHAT_MODAL_WIDTH_PERCENT - DEFAULT_CHAT_MODAL_MARGIN_PERCENT}%`,
} as const;

/** The smallest size that the player can resize the chat modal to, in pixels. */
const MIN_CHAT_MODAL_SIZE = {
  width: 200,
  height: 200,
} as const;

export function init(): void {
  // Make the chat modal draggable (using the InteractJS library). The bundled "interactjs" package
  // references "@interactjs/interactjs" which is not installed as a separate package, so
  // typescript-eslint cannot resolve the interact() type or its event types.

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
          min: MIN_CHAT_MODAL_SIZE,
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
      // The modal was moved or resized; store its size and its distance from the right and top
      // edges of the window so that it will persist between refreshes. Anchoring to the right edge
      // keeps the modal in the same place relative to the edge when the window size changes.
      const rect = event.target.getBoundingClientRect();
      localStorage.setItem(
        LOCAL_STORAGE_KEY.CHAT_WINDOW_WIDTH,
        event.target.style.width,
      );
      localStorage.setItem(
        LOCAL_STORAGE_KEY.CHAT_WINDOW_HEIGHT,
        event.target.style.height,
      );
      localStorage.setItem(
        LOCAL_STORAGE_KEY.CHAT_WINDOW_RIGHT,
        (window.innerWidth - rect.right).toString(),
      );
      localStorage.setItem(
        LOCAL_STORAGE_KEY.CHAT_WINDOW_TOP,
        rect.top.toString(),
      );
    });

  $("#game-chat-modal-header-close").click(() => {
    hide();
  });
}

/** Whether the player can see the in-game chat, in either game screen. */
export function isOpen(): boolean {
  return newUIState.isActive()
    ? newUIState.isChatOpen()
    : $("#game-chat-modal").is(":visible");
}

export function toggle(focusInput = true): void {
  if (isOpen()) {
    hide();
  } else {
    show(focusInput);
  }
}

export function show(focusInput = true): void {
  markRead();

  if (newUIState.isActive()) {
    // The redesigned game screen shows the chat in its side panel instead of in the modal.
    newUIState.setChatOpen(true);
    if (focusInput) {
      $("#game-chat-input").trigger("focus");
    }
    return;
  }

  const modal = $("#game-chat-modal");
  modal.fadeIn(FADE_TIME_MS);

  // Set the modal to the default size and position.
  modal.css(DEFAULT_CHAT_MODAL_SIZE);
  modal.css(DEFAULT_CHAT_MODAL_POSITION);
  moveElement(modal, 0, 0);

  // If there is a stored size + position for the chat box, set that.
  const width = localStorage.getItem(LOCAL_STORAGE_KEY.CHAT_WINDOW_WIDTH) ?? "";
  const height =
    localStorage.getItem(LOCAL_STORAGE_KEY.CHAT_WINDOW_HEIGHT) ?? "";
  const right = parseFloatSafe(
    localStorage.getItem(LOCAL_STORAGE_KEY.CHAT_WINDOW_RIGHT) ?? "",
  );
  const top = parseFloatSafe(
    localStorage.getItem(LOCAL_STORAGE_KEY.CHAT_WINDOW_TOP) ?? "",
  );

  if (
    width !== ""
    && height !== ""
    && right !== undefined
    && top !== undefined
  ) {
    modal.css("width", width);
    modal.css("height", height);

    // The stored width may be a percentage, so measure the modal after applying it.
    const modalWidth = modal[0]!.getBoundingClientRect().width;
    modal.css({
      left: `${window.innerWidth - right - modalWidth}px`,
      top: `${top}px`,
    });

    // Just in case, reset the size and position if the stored location puts the chat box offscreen.
    // (This is possible if the window size has changed since the last time.)
    if (isOffscreen(modal)) {
      modal.css(DEFAULT_CHAT_MODAL_SIZE);
      modal.css(DEFAULT_CHAT_MODAL_POSITION);
    }
  }

  // Scroll to the bottom of the chat.
  gameChatText.scrollTop = gameChatText.scrollHeight;

  if (focusInput) {
    $("#game-chat-input").trigger("focus");
  }
}

export function hide(): void {
  if (newUIState.isActive()) {
    newUIState.setChatOpen(false);
    return;
  }

  $("#game-chat-modal").fadeOut(FADE_TIME_MS);
}

/** Opening the chat counts every message in it as read. */
function markRead() {
  if (globals.chatUnread === 0) {
    return;
  }

  globals.chatUnread = 0;

  // We need to notify the server that we have read everything.
  assertDefined(globals.conn, 'The "globals.conn" object is not initialized.');
  globals.conn.send("chatRead", {
    tableID: globals.tableID,
  });

  // Reset the "Chat" UI button back to normal.
  assertDefined(globals.ui, 'The "globals.ui" object is not initialized.');
  globals.ui.updateChatLabel();
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
