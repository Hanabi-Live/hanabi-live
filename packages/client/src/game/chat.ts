// In-game chat

import { parseFloatSafe } from "complete-common";
import interact from "interactjs";
import { globals } from "../Globals.ts";
import { LOCAL_STORAGE_KEY } from "../constants.ts";
import { fadeIn, fadeOut, isElementShown } from "../elementVisibility.ts";
import { store } from "../store.ts";
import { getHtmlElement } from "../utils.ts";
import { GAME_CHAT_INPUT_ID, GAME_CHAT_TEXT_ID } from "./GameChatBox.tsx";
import { gameChatUnreadChanged } from "./gameChatSlice.ts";
import { newUiChatOpenChanged } from "./newUi/newUiSlice.ts";

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
        moveElement(event.target, newX, newY);
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
      moveElement(event.target, newX, newY);

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

  getHtmlElement("#game-chat-modal-header-close").addEventListener(
    "click",
    () => {
      hide();
    },
  );
}

/** Whether the player can see the in-game chat, in either game screen. */
export function isOpen(): boolean {
  const { newUi } = store.getState();
  return newUi.shown
    ? newUi.chatOpen
    : isElementShown(getHtmlElement("#game-chat-modal"));
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

  if (store.getState().newUi.shown) {
    // The redesigned game screen shows the chat in its side panel instead of in the modal.
    store.dispatch(newUiChatOpenChanged(true));
    if (focusInput) {
      getHtmlElement(`#${GAME_CHAT_INPUT_ID}`).focus();
    }
    return;
  }

  const modal = getHtmlElement("#game-chat-modal");
  fadeIn(modal);

  // Set the modal to the default size and position.
  Object.assign(modal.style, DEFAULT_CHAT_MODAL_SIZE);
  Object.assign(modal.style, DEFAULT_CHAT_MODAL_POSITION);
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
    modal.style.width = width;
    modal.style.height = height;

    // The stored width may be a percentage, so measure the modal after applying it.
    const modalWidth = modal.getBoundingClientRect().width;
    modal.style.left = `${window.innerWidth - right - modalWidth}px`;
    modal.style.top = `${top}px`;

    // Just in case, reset the size and position if the stored location puts the chat box offscreen.
    // (This is possible if the window size has changed since the last time.)
    if (isOffscreen(modal)) {
      Object.assign(modal.style, DEFAULT_CHAT_MODAL_SIZE);
      Object.assign(modal.style, DEFAULT_CHAT_MODAL_POSITION);
    }
  }

  // Scroll to the bottom of the chat.
  const text = getHtmlElement(`#${GAME_CHAT_TEXT_ID}`);
  text.scrollTop = text.scrollHeight;

  if (focusInput) {
    getHtmlElement(`#${GAME_CHAT_INPUT_ID}`).focus();
  }
}

export function hide(): void {
  if (store.getState().newUi.shown) {
    store.dispatch(newUiChatOpenChanged(false));
    return;
  }

  fadeOut(getHtmlElement("#game-chat-modal"));
}

/** Opening the chat counts every message in it as read. */
function markRead() {
  if (store.getState().gameChat.unread === 0) {
    return;
  }

  store.dispatch(gameChatUnreadChanged(0));

  // We need to notify the server that we have read everything.
  globals.connection.send("chatRead", {
    tableId: globals.joinedTableId,
  });

  // Reset the classic screen's "Chat" button back to normal.
  globals.ui?.updateChatLabel();
}

/** Subroutine to move an element (using the "transform" CSS property). */
function moveElement(element: HTMLElement | SVGElement, x: number, y: number) {
  // Update the element's style.
  element.style.transform = `translate(${x}px, ${y}px)`;

  // Keep the dragged position in the "data-x" & "data-y" attributes.
  element.dataset["x"] = x.toString();
  element.dataset["y"] = y.toString();
}

/** From: https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen */
function isOffscreen(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top < 0 // Above the top
    || rect.bottom > window.innerHeight // Below the bottom
    || rect.left < 0 // Left of the left edge
    || rect.right > window.innerWidth // Right of the right edge
  );
}
