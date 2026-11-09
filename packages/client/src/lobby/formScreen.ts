// Full-page forms in the lobby (such as "Create Game"), which replace the lobby until the user
// submits them or returns.

import { globals } from "../Globals";
import * as nav from "./nav";
import { Screen } from "./types/Screen";

interface FormScreen {
  readonly section: string;
  readonly submitButton: string;
}

let current: FormScreen | null = null;

/** Shows a form screen from the lobby or from the pre-game screen, which it returns to. */
export function show(section: string, submitButton: string): void {
  hide();
  current = { section, submitButton };

  $(section).show();
  nav.showLobbyHalves(false);
  $("#nav-buttons-form-return-target").text(
    globals.currentScreen === Screen.PreGame ? "Game" : "Lobby",
  );
  nav.show("form");
}

export function hide(): void {
  if (current === null) {
    return;
  }

  $(current.section).hide();
  current = null;
  nav.showLobbyHalves(true);
  nav.show(globals.currentScreen === Screen.PreGame ? "pregame" : "lobby");
}

export function isShown(): boolean {
  return current !== null;
}

/** The button that submits the form screen being shown, if any. */
export function getSubmitButton(): string | undefined {
  return current?.submitButton;
}
