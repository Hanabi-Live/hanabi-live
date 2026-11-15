// Escape closes the menus and panels of the redesigned game screen, and does nothing else.

import { isModalVisible } from "../../modals.ts";

/**
 * Calls `onEscape` when the player presses Escape, and returns a function that stops listening. The
 * key press then does nothing else: the hotkeys of the game (see "ui/keyboard.ts") listen on the
 * document, where Escape ends a hypothetical, or leaves a replay or the in-game replay. This
 * listener comes first, because it listens on the window as the event goes down to the page. While
 * a modal shows, Escape closes the modal instead (see "modals.ts").
 *
 * `isActive` says whether Escape applies now. By default, it always does.
 */
export function onEscapeKey(
  onEscape: () => void,
  isActive: () => boolean = () => true,
): () => void {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || isModalVisible() || !isActive()) {
      return;
    }

    event.stopPropagation();
    onEscape();
  }

  globalThis.addEventListener("keydown", onKeyDown, { capture: true });
  return () => {
    globalThis.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}
