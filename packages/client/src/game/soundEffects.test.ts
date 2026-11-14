import type { GameAction, GameState } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SoundType } from "./types/SoundType.ts";
import type { State } from "./types/State.ts";

vi.mock("../sounds.ts", () => ({ play: vi.fn() }));
vi.mock("./getSoundType.ts", () => ({
  SOUND_TYPE_ACTIONS: [],
  getSoundType: () => SoundType.Us,
  getStandardSoundType: () => SoundType.Us,
}));
const sounds = await import("../sounds.ts");
const { onNewSoundEffect, setPlayStartSound } =
  await import("./soundEffects.ts");

const state = {
  replay: {
    hypothetical: undefined,
    states: [],
  },
  finished: false,
  playing: true,
  metadata: {
    ourPlayerIndex: 0,
    options: {
      variantId: 0,
    },
  },
} as unknown as State;

const firstTurn = {
  gameState: {
    turn: {
      turnNum: 0,
      currentPlayerIndex: 0,
    },
  } as GameState,
  actions: [] as readonly GameAction[],
};

describe("sound on the first load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("plays when the game started just now", () => {
    setPlayStartSound(true);

    onNewSoundEffect(state, firstTurn, undefined);

    expect(sounds.play).toHaveBeenCalledWith(SoundType.Us, false);
  });

  test("does not play after a refresh on the first turn", () => {
    setPlayStartSound(false);

    onNewSoundEffect(state, firstTurn, undefined);

    expect(sounds.play).not.toHaveBeenCalled();
  });

  test("plays only once when the game is described again", () => {
    setPlayStartSound(true);

    onNewSoundEffect(state, firstTurn, undefined);
    onNewSoundEffect(state, firstTurn, undefined);

    expect(sounds.play).toHaveBeenCalledTimes(1);
  });
});
