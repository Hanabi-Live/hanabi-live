import type { GameAction, GameState } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SoundType } from "../../../types/SoundType.ts";

vi.mock("../../isOurTurn.ts", () => ({ isOurTurn: () => true }));
vi.mock("../getSoundType.ts", () => ({
  SOUND_TYPE_ACTIONS: [],
  getSoundType: () => SoundType.Us,
  getStandardSoundType: () => SoundType.Us,
}));
vi.mock("../../UiGlobals.ts", () => ({
  globals: {
    lobby: { settings: { soundMove: "all", hGroupConventions: false } },
    isResizing: false,
    playStartSound: false,
    state: { replay: { hypothetical: undefined, states: [] }, finished: false },
    metadata: { ourPlayerIndex: 0 },
    variant: { throwItInAHole: false },
    game: { sounds: { play: vi.fn() } },
  },
}));
const { globals } = await import("../../UiGlobals.ts");
const { onNewSoundEffect } = await import("./soundView.ts");

const firstTurn = {
  gameState: { turn: { turnNum: 0, currentPlayerIndex: 0 } } as GameState,
  actions: [] as readonly GameAction[],
};

describe("sound on the first load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("plays when the game started just now", () => {
    globals.playStartSound = true;

    onNewSoundEffect(firstTurn, undefined);

    expect(globals.game!.sounds.play).toHaveBeenCalledWith(SoundType.Us, false);
  });

  test("does not play after a refresh on the first turn", () => {
    globals.playStartSound = false;

    onNewSoundEffect(firstTurn, undefined);

    expect(globals.game!.sounds.play).not.toHaveBeenCalled();
  });

  test("plays only once when the observers register again", () => {
    globals.playStartSound = true;

    onNewSoundEffect(firstTurn, undefined);
    onNewSoundEffect(firstTurn, undefined);

    expect(globals.game!.sounds.play).toHaveBeenCalledTimes(1);
  });
});
