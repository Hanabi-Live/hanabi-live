import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { EndCondition } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { toGameAction, toPlayerIndex, toSoundType } from "./wire";

/** Validates a game event as the connection does. */
function event(action: unknown) {
  return SERVER_COMMAND_SCHEMAS.gameAction.parse({ tableID: 1, action }).action;
}

describe("server game events", () => {
  test("status events are not applied", () => {
    expect(
      toGameAction({ type: "status", clues: 8, score: 0, maxScore: 25 }),
    ).toBeUndefined();
  });

  test("the final turn and an unattributed game over keep their -1 seat", () => {
    expect(
      toGameAction({ type: "turn", num: 30, currentPlayerIndex: -1 }),
    ).toEqual({ type: "turn", num: 30, currentPlayerIndex: -1 });
    expect(
      toGameAction({
        type: "gameOver",
        endCondition: 1,
        playerIndex: -1,
        votes: null,
      }),
    ).toEqual({
      type: "gameOver",
      endCondition: EndCondition.Normal,
      playerIndex: -1,
      votes: null,
    });
  });

  test("hidden clues stay hidden", () => {
    const action = toGameAction(
      event({
        type: "clue",
        clue: { type: -1, value: -1 },
        giver: 0,
        target: 1,
        list: [3, 4],
        turn: 2,
      }),
    );
    if (action?.type !== "clue") {
      throw new Error("Expected a clue action");
    }
    expect(action.clue).toEqual({ type: -1, value: -1 });
    expect(action.list.map(Number)).toEqual([3, 4]);
  });

  test("values outside the game's types are rejected", () => {
    expect(() => toPlayerIndex(6)).toThrow();
    expect(() =>
      event({ type: "strike", num: 4, turn: 3, order: 0 }),
    ).toThrow();
    expect(() =>
      event({ type: "draw", playerIndex: 0, order: 66, suitIndex: 0, rank: 1 }),
    ).toThrow();
    expect(() =>
      event({ type: "draw", playerIndex: 0, order: 0, suitIndex: 6, rank: 1 }),
    ).toThrow();
    expect(() =>
      event({ type: "draw", playerIndex: 0, order: 0, suitIndex: 0, rank: 6 }),
    ).toThrow();
    expect(toSoundType("not-a-sound")).toBeUndefined();
  });
});

describe("shared replay sounds", () => {
  test("every sound a leader can send can be played", () => {
    for (const sound of SERVER_COMMAND_SCHEMAS.replaySound.shape.sound
      .options) {
      expect(toSoundType(sound)).toBe(sound);
    }
  });
});
