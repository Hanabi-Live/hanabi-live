import type Konva from "konva";
import { getHTMLElement } from "../../utils";
import type { Deck } from "./Deck";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./globals";

export type CursorType = "default" | "hand" | "dragging" | "look" | "edit";

// Module variables. (This does not have to be on the globals because it is explicitly reset in
// HanabiUI constructor.)
let currentCursorType = "default";

const gameDiv = getHTMLElement("#game");

export function set(cursorType: CursorType): void {
  // It is possible to receive cursor events before the UI has initialized.
  if (globals.store === null) {
    return;
  }

  if (cursorType === currentCursorType) {
    return;
  }

  // Don't show any custom cursors if we are an active player in a speedrun.
  if (
    (globals.options.speedrun || globals.lobby.settings.speedrunMode) &&
    globals.state.playing
  ) {
    return;
  }

  currentCursorType = cursorType;
  const cursorTypes = ["default", "hand", "dragging", "look", "edit"];

  for (const type of cursorTypes) {
    gameDiv.classList.remove(`game-cursor-${type}`);
  }

  gameDiv.classList.add(`game-cursor-${cursorType}`);

  // If the Chrome development tools are open, then the cursor may not update properly:
  // https://stackoverflow.com/questions/37462132/update-mouse-cursor-without-moving-mouse-with-changed-css-cursor-property
}

export function getElementDragLocation(
  element: LayoutChild | Deck,
): "playArea" | "discardArea" | null {
  const pos = element.getAbsolutePosition();
  pos.x += (element.width() * element.scaleX()) / 2;
  pos.y += (element.height() * element.scaleY()) / 2;

  if (
    globals.elements.playArea !== null &&
    posOverlaps(pos, globals.elements.playArea)
  ) {
    return "playArea";
  }
  if (
    globals.elements.discardArea !== null &&
    posOverlaps(pos, globals.elements.discardArea)
  ) {
    return "discardArea";
  }

  return null;
}

export function elementOverlaps(element: LayoutChild): boolean {
  if (globals.loading) {
    return false;
  }

  const pos = globals.stage.getPointerPosition();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (pos === undefined) {
    // This method will return undefined if the cursor is not inside of the stage.
    return false;
  }

  return posOverlaps(pos, element);
}

function posOverlaps(pos: Konva.Vector2d, element: Konva.Rect | LayoutChild) {
  const elementPos = element.getAbsolutePosition();
  return (
    pos.x >= elementPos.x &&
    pos.y >= elementPos.y &&
    pos.x <= elementPos.x + element.width() &&
    pos.y <= elementPos.y + element.height()
  );
}
