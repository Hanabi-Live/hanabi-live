// The clue log is a React component that sits on top of the Konva stage.

import type { CardOrder } from "@hanabi-live/game";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { globals } from "../UIGlobals";
import { ClueLog } from "./ClueLog";

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;
let hoveredCardOrder: CardOrder | null = null;

/** Draws the clue log at the current stage size. Call it again after the stage is rebuilt. */
export function drawClueLog(): void {
  // The stage removes its old contents when a new game creates it again.
  const { content } = globals.stage;
  if (rootElement !== null && !content.contains(rootElement)) {
    unmountClueLog();
  }

  if (root === null) {
    const element = document.createElement("div");
    // The stage's layers are canvases inside the same element, so the log must sit above them.
    element.style.position = "absolute";
    element.style.top = "0";
    element.style.left = "0";
    element.style.zIndex = "1";
    content.append(element);
    rootElement = element;
    root = createRoot(element);
  }

  render();
}

/** Highlights the clues that touched or missed a card, or clears the highlight when `null`. */
export function showClueMatches(cardOrder: CardOrder | null): void {
  hoveredCardOrder = cardOrder;
  render();
}

export function unmountClueLog(): void {
  root?.unmount();
  root = null;
  rootElement?.remove();
  rootElement = null;
  hoveredCardOrder = null;
}

function render() {
  if (root === null || globals.store === null) {
    return;
  }

  root.render(
    <StrictMode>
      <Provider store={globals.store}>
        <ClueLog
          colorblindMode={globals.lobby.settings.colorblindMode}
          hoveredCardOrder={hoveredCardOrder}
          stageHeight={globals.stage.height()}
          stageWidth={globals.stage.width()}
          variant={globals.variant}
        />
      </Provider>
    </StrictMode>,
  );
}
