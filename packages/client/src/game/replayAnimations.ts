// The `animations()` console command, for development. It makes a replay show misplays, completed
// stacks, and the finale in full, as a game in progress does, so that you can check them without
// playing a game.

let replayAnimations = false;

/** Whether a replay shows misplays, completed stacks, and the finale in full. */
export function areReplayAnimationsOn(): boolean {
  return replayAnimations;
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
  replayAnimations = !replayAnimations;
  console.log(
    replayAnimations
      ? "Replays now show misplays, completed stacks, and the finale in full."
      : "Replays now show misplays, completed stacks, and the finale as usual.",
  );
};
