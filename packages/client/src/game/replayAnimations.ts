// The `animations()` console command, for development. It makes a replay show misplays, completed
// stacks, and the finale in full, as a game in progress does, so that you can check them without
// playing a game. It stays on after the page reloads, until you run it again.

import { LOCAL_STORAGE_KEY } from "../constants.ts";

/** The value of the `localStorage` key while the command is on. */
const ON = "true";

/** Whether a replay shows misplays, completed stacks, and the finale in full. */
export function areReplayAnimationsOn(): boolean {
  return localStorage.getItem(LOCAL_STORAGE_KEY.REPLAY_ANIMATIONS) === ON;
}

// Allow TypeScript to modify the browser's "window" object:
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    animations: () => void;
  }
}

// eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-global-object-property-assignment
window.animations = () => {
  if (areReplayAnimationsOn()) {
    localStorage.removeItem(LOCAL_STORAGE_KEY.REPLAY_ANIMATIONS);
    console.log(
      "Replays now show misplays, completed stacks, and the finale as usual.",
    );
  } else {
    localStorage.setItem(LOCAL_STORAGE_KEY.REPLAY_ANIMATIONS, ON);
    console.log(
      "Replays now show misplays, completed stacks, and the finale in full, also after the page reloads. Run animations() again to turn this off.",
    );
  }
};
