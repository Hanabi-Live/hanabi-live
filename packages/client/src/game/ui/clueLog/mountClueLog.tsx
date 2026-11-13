// The clue log is a React component that sits among the canvases of the Konva stage.

import type { CardOrder } from "@hanabi-live/game";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "../../../store.ts";
import { globals } from "../UiGlobals.ts";
import { ClueLog } from "./ClueLog.tsx";

let rootElement: HTMLDivElement | undefined;
let root: Root | undefined;
let hoveredCardOrder: CardOrder | undefined;
let pointerListeners: AbortController | undefined;

/**
 * Draws the clue log at the current stage size. Call it after the layers are added to the stage,
 * and again after the stage is rebuilt.
 */
export function drawClueLog(): void {
  // The stage removes its old contents when a new game creates it again.
  const { content } = globals.stage;
  if (rootElement !== undefined && !content.contains(rootElement)) {
    unmountClueLog();
  }

  if (rootElement === undefined) {
    rootElement = document.createElement("div");
    rootElement.style.position = "absolute";
    rootElement.style.top = "0";
    rootElement.style.left = "0";
    root = createRoot(rootElement);
    routePointerEvents(rootElement);
  }

  placeAmongLayers(rootElement);

  render();
}

/** Highlights the clues that touched or missed a card, or clears the highlight when `undefined`. */
export function showClueMatches(cardOrder: CardOrder | undefined): void {
  hoveredCardOrder = cardOrder;
  render();
}

export function unmountClueLog(): void {
  pointerListeners?.abort();
  pointerListeners = undefined;
  root?.unmount();
  root = undefined;
  rootElement?.remove();
  rootElement = undefined;
  hoveredCardOrder = undefined;
}

/**
 * Draws the log above the UI layer (like the other boxes, such as the trash) and below the other
 * layers, so that the cards and dialogs (such as the restart dialog) cover it. The stage adds the
 * canvases of its layers again when it is rebuilt, so call this after each rebuild.
 */
function placeAmongLayers(element: HTMLDivElement) {
  globals.layers.UI.getNativeCanvasElement().after(element);

  // The canvases above the log would take its pointer events. The stage handles its pointer events
  // on the element that holds all of its canvases, so the canvases do not need them.
  let canvas = element.nextElementSibling;
  while (canvas instanceof HTMLCanvasElement) {
    canvas.style.pointerEvents = "none";
    canvas = canvas.nextElementSibling;
  }
}

/** Where a shape on a higher layer covers the log, the log must not take the pointer events. */
function routePointerEvents(element: HTMLDivElement) {
  pointerListeners = new AbortController();
  for (const type of ["pointermove", "pointerdown"] as const) {
    globals.stage.content.addEventListener(
      type,
      (event) => {
        element.style.pointerEvents = isCovered(event) ? "none" : "";
      },
      { capture: true, signal: pointerListeners.signal },
    );
  }
}

/** Whether a shape on a layer above the clue log is under the pointer. */
function isCovered(event: PointerEvent): boolean {
  // The stage is scaled with a CSS transform while the window is being resized.
  const { content } = globals.stage;
  const bounds = content.getBoundingClientRect();
  const scale = bounds.width / content.offsetWidth;
  const shape = globals.stage.getIntersection({
    x: (event.clientX - bounds.left) / scale,
    y: (event.clientY - bounds.top) / scale,
  });
  return shape !== null && shape.getLayer() !== globals.layers.UI;
}

function render() {
  if (root === undefined || store.getState().game.current === undefined) {
    return;
  }

  root.render(
    <StrictMode>
      <Provider store={store}>
        <ClueLog
          colorblindMode={store.getState().session.settings.colorblindMode}
          hoveredCardOrder={hoveredCardOrder}
          stageHeight={globals.stage.height()}
          stageWidth={globals.stage.width()}
          variant={globals.variant}
        />
      </Provider>
    </StrictMode>,
  );
}
