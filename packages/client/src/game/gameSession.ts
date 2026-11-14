// Whether the game that the client opened is still loading, whichever screen draws it. A game loads
// from when the game screen shows until the server has sent its state.

let loading = false;

/** Called when the game screen opens a game. */
export function startLoading(): void {
  loading = true;
}

/** Whether the client is waiting for the state of the game that it opened. */
export function isLoading(): boolean {
  return loading;
}

/** Called once the game's first state is shown. */
export function finishLoading(): void {
  loading = false;
}
