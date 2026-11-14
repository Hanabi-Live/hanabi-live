// The game that the client has open, whichever screen draws it. A game opens with the game screen,
// and loads until the server has sent its state.

import type { Variant } from "@hanabi-live/game";
import { getDefaultVariant, getVariantById } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { store } from "../store.ts";
import type { State } from "./types/State.ts";

let open = false;
let loading = false;

/** The text of the last note that we wrote in this game. */
let lastNote = "";

/** Whether we asked to play again and the server has not answered yet. */
let restartPending = false;

/** Called when the game screen opens a game. */
export function openGame(): void {
  open = true;
  loading = true;
  lastNote = "";
  restartPending = false;
}

/** Called when the game closes, for "game/main.ts" to stop what the game started. */
export function closeGame(): void {
  open = false;
  loading = false;
}

/** Whether the client has a game open. Game events only apply to an open game. */
export function isOpen(): boolean {
  return open;
}

/** Whether the client is waiting for the state of the game that it opened. */
export function isLoading(): boolean {
  return loading;
}

/** Called once the game's first state is shown. */
export function finishLoading(): void {
  loading = false;
}

/** The game's state, which exists once the server has answered "gameInitLoad". */
export function currentState(): State {
  const { current } = store.getState().game;
  assertDefined(current, "The game's state does not exist yet.");
  return current;
}

/** The game's variant, or the default variant before the server has described the game. */
export function currentVariant(): Variant {
  const { current } = store.getState().game;
  return current === undefined
    ? getDefaultVariant()
    : getVariantById(current.metadata.options.variantId);
}

export function getLastNote(): string {
  return lastNote;
}

export function setLastNote(text: string): void {
  lastNote = text;
}

export function isRestartPending(): boolean {
  return restartPending;
}

export function setRestartPending(pending: boolean): void {
  restartPending = pending;
}
