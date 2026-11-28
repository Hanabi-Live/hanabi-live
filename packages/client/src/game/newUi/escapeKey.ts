// Escape closes the menus and panels of the redesigned game screen, and does nothing else.

import { isModalVisible } from "../../modals.ts";

/** A menu, panel, or held card that Escape closes. */
interface EscapeLayer {
  readonly onEscape: () => void;

  /** Whether Escape applies to the layer now, for a layer that listens while it is not open. */
  readonly isActive: (() => boolean) | undefined;
}

/** The layers that are open, in the order that they opened. Escape closes the last one. */
const layers: EscapeLayer[] = [];

/** Whether the player types in the element, such as the chat or the note of a card. */
function isTextBox(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement
    && (target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target.isContentEditable)
  );
}

function onKeyDown(event: KeyboardEvent) {
  // While the player types, Escape belongs to the text box. The note of a card closes itself, and
  // the game's hotkeys take the focus away from the chat (see "ui/keyboard.ts").
  if (event.key !== "Escape" || isModalVisible() || isTextBox(event.target)) {
    return;
  }

  // A layer that says when it is active, such as a card that the player drags, is what the player
  // does right now, so it comes before the menus that are open.
  const layer =
    layers.find((candidate) => candidate.isActive?.() === true)
    ?? layers.findLast((candidate) => candidate.isActive === undefined);
  if (layer === undefined) {
    return;
  }

  event.stopPropagation();
  layer.onEscape();
}

/**
 * Calls `onEscape` when the player presses Escape, and returns a function that stops listening. The
 * key press then does nothing else: the hotkeys of the game (see "ui/keyboard.ts") listen on the
 * document, where Escape ends a hypothetical, or leaves a replay or the in-game replay. This
 * listener comes first, because it listens on the window as the event goes down to the page. While
 * a modal shows, Escape closes the modal instead (see "modals.ts").
 *
 * When more than one layer listens, such as a list that is open over the clue menu, one key press
 * closes only the layer that started to listen last.
 *
 * `isActive` says whether Escape applies now, for a layer that listens all the time, such as a card
 * that the player can drag. While it applies, that layer gets the key before the others. Without
 * it, Escape always applies.
 */
export function onEscapeKey(
  onEscape: () => void,
  isActive?: () => boolean,
): () => void {
  const layer: EscapeLayer = {
    onEscape,
    isActive,
  };
  if (layers.length === 0) {
    globalThis.addEventListener("keydown", onKeyDown, { capture: true });
  }
  layers.push(layer);

  return () => {
    const index = layers.indexOf(layer);
    if (index === -1) {
      return;
    }

    layers.splice(index, 1);
    if (layers.length === 0) {
      globalThis.removeEventListener("keydown", onKeyDown, { capture: true });
    }
  };
}
