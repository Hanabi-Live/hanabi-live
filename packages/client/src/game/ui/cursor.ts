import type Konva from "konva";
import { store } from "../../store.ts";
import { getHtmlElement } from "../../utils.ts";
import type { Deck } from "./Deck.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";

const CURSOR_TYPES = ["default", "hand", "dragging", "look", "edit"] as const;

export type CursorType = (typeof CURSOR_TYPES)[number];

// Module variables. (This does not have to be on the globals because the HanabiUi constructor
// resets it.)
let currentCursorType: CursorType = "default";

const gameDiv = getHtmlElement("#game");

function show(cursorType: CursorType) {
  currentCursorType = cursorType;
  for (const type of CURSOR_TYPES) {
    gameDiv.classList.remove(`game-cursor-${type}`);
  }
  gameDiv.classList.add(`game-cursor-${cursorType}`);
}

/** Shows the default cursor, for a new game screen, whatever the last game left. */
export function reset(): void {
  show("default");
}

export function set(cursorType: CursorType): void {
  // It is possible to receive cursor events before the UI has initialized.
  if (
    cursorType === currentCursorType
    || store.getState().game.current === undefined
  ) {
    return;
  }

  // Do not show any custom cursors if we are an active player in a speedrun.
  if (
    (globals.options.speedrun
      || store.getState().session.settings.speedrunFeatures)
    && globals.state.playing
  ) {
    return;
  }

  show(cursorType);

  // If the Chrome development tools are open, then the cursor may not update properly:
  // https://stackoverflow.com/questions/37462132/update-mouse-cursor-without-moving-mouse-with-changed-css-cursor-property
}

export function getElementDragLocation(
  element: LayoutChild | Deck,
): "playArea" | "discardArea" | undefined {
  const pos = element.getAbsolutePosition();
  pos.x += (element.width() * element.scaleX()) / 2;
  pos.y += (element.height() * element.scaleY()) / 2;

  if (
    globals.elements.playArea !== undefined
    && posOverlaps(pos, globals.elements.playArea)
  ) {
    return "playArea";
  }
  if (
    globals.elements.discardArea !== undefined
    && posOverlaps(pos, globals.elements.discardArea)
  ) {
    return "discardArea";
  }

  return undefined;
}

function posOverlaps(pos: Konva.Vector2d, element: Konva.Rect | LayoutChild) {
  const elementPos = element.getAbsolutePosition();
  return (
    pos.x >= elementPos.x
    && pos.y >= elementPos.y
    && pos.x <= elementPos.x + element.width()
    && pos.y <= elementPos.y + element.height()
  );
}
