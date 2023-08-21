// In-game sounds.

import { globals } from "./GlobalsA";

let soundEffect: HTMLAudioElement | null = null;

export function init(): void {
  // Preload some sounds. Ideally, we would check to see if the user has the "soundMove" setting
  // enabled (or "volume" set above 0) before attempting to preload sounds. However, at this point
  // in the code, the server has not sent us the settings corresponding to this user account, so
  // just assume that they have sounds enabled.
  const soundFiles = [
    "tone",
    "turn_blind1",
    // (Do not preload the rest of the blind-play sounds, since they will only occur very rarely.)
    "turn_fail1",
    "turn_other",
    "turn_us",
    // (Do not preload shared replay sound effects, as they are used more rarely.)
    "game_paused",
    "game_unpaused",
  ];
  for (const file of soundFiles) {
    const audio = new Audio(`/public/sounds/${file}.mp3`);
    audio.load();
  }
}

export function play(file: string, mute = false): void {
  if (mute && soundEffect !== null) {
    soundEffect.muted = true;
  }

  const path = `/public/sounds/${file}.mp3`;
  soundEffect = new Audio(path);

  // HTML5 audio volume is a range between 0.0 to 1.0, but volume is stored in the settings as an
  // integer from 0 to 100.
  let { volume } = globals.settings;
  if (typeof volume !== "number") {
    volume = 50;
  }
  soundEffect.volume = volume / 100;

  soundEffect.play().catch(() => {
    // Do nothing if audio playback fails, since it is most likely due to the user not having
    // interacted with the page yet:
    // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
  });
}
