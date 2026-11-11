// Full pages in the lobby (such as "Create Game" and "Resources"), which replace the lobby until
// the user submits them or returns.

import { lobbyPageShownChanged } from "../sessionSlice";
import { store } from "../store";
import { showLobbyHalves } from "./lobbyLayout";

interface LobbyPage {
  readonly section: string;
  readonly submitButton: string | undefined;
  readonly onHide: (() => void) | undefined;
}

let current: LobbyPage | undefined;

/**
 * Shows a page from the lobby or from the pre-game screen, which it returns to. Pages with a form
 * pass the button that submits it, so that pressing enter submits the form. `onHide` runs when the
 * page is hidden, such as to close its tooltips.
 */
export function show(
  section: string,
  submitButton?: string,
  onHide?: () => void,
): void {
  hide();
  current = { section, submitButton, onHide };

  $(section).show();
  showLobbyHalves(false);
  store.dispatch(lobbyPageShownChanged(true));
}

export function hide(): void {
  if (current === undefined) {
    return;
  }

  $(current.section).hide();
  current.onHide?.();
  current = undefined;
  showLobbyHalves(true);
  store.dispatch(lobbyPageShownChanged(false));
}

export function isShown(): boolean {
  return current !== undefined;
}

/** The button that submits the form on the page being shown, if any. */
export function getSubmitButton(): string | undefined {
  return current?.submitButton;
}
