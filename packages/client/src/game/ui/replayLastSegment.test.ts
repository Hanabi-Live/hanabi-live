import type { GameAction } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";
import type { State } from "../types/State.ts";

vi.mock("./UiGlobals.ts", () => ({ globals: {} }));
vi.mock("../../modals.ts", () => ({}));
vi.mock("./arrows.ts", () => ({}));
vi.mock("./getCardOrStackBase.ts", () => ({}));
vi.mock("./konvaHelpers.ts", () => ({}));
vi.mock("../../utils.ts", () => ({
  getHtmlElement: vi.fn(),
  getHtmlInputElement: vi.fn(),
}));
const { initialState } =
  await import("../reducers/initialStates/initialState.ts");
const replay = await import("./replay.ts");

const FINAL_SEGMENT = 3;

function finishedGame(actions: readonly GameAction[]): State {
  const initial = initialState(getDefaultMetadata(2));
  return {
    ...initial,
    ongoingGame: {
      ...initial.ongoingGame,
      turn: { ...initial.ongoingGame.turn, segment: FINAL_SEGMENT },
    },
    replay: { ...initial.replay, actions },
  };
}

const playerTimes: GameAction = {
  type: "playerTimes",
  playerTimesMs: [0, 0],
  durationMs: 0,
};

describe("the last segment of the replay controls", () => {
  test("the New UI skips the segment that only adds the players' times", () => {
    expect(replay.getLastSegment(finishedGame([playerTimes]), true)).toBe(
      FINAL_SEGMENT - 1,
    );
  });

  test("the classic screen shows the players' times", () => {
    expect(replay.getLastSegment(finishedGame([playerTimes]), false)).toBe(
      FINAL_SEGMENT,
    );
  });

  test("the New UI keeps a segment that is not the players' times", () => {
    const gameOver: GameAction = {
      type: "gameOver",
      endCondition: "terminatedByPlayer",
      playerIndex: 0,
      voters: [],
    };
    expect(replay.getLastSegment(finishedGame([gameOver]), true)).toBe(
      FINAL_SEGMENT,
    );
  });
});
