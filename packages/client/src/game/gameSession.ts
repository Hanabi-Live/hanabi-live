// The game that the client has open, whichever screen draws it. A game opens with the game screen,
// and loads until the server has sent its state.

let open = false;
let loading = false;

/** Called when the game screen opens a game. */
export function openGame(): void {
  open = true;
  loading = true;
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
