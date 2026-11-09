import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { EndCondition } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { toCardIdentity, toGameAction, toSoundType } from "./wire";

/** Validates a game event as the connection does. */
function event(action: unknown) {
  return SERVER_COMMAND_SCHEMAS.gameAction.parse({ tableID: 1, action }).action;
}

describe("server game events", () => {
  test("the final turn and an unattributed game over keep their -1 seat", () => {
    expect(
      toGameAction({ type: "turn", num: 30, currentPlayerIndex: -1 }),
    ).toEqual({ type: "turn", num: 30, currentPlayerIndex: -1 });
    expect(
      toGameAction({
        type: "gameOver",
        endCondition: EndCondition.Normal,
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
    if (action.type !== "clue") {
      throw new Error("Expected a clue action");
    }
    expect(action.clue).toEqual({ type: -1, value: -1 });
    expect(action.list.map(Number)).toEqual([3, 4]);
  });

  test("values outside the game's types are rejected", () => {
    expect(() =>
      SERVER_COMMAND_SCHEMAS.pause.parse({
        tableID: 1,
        active: true,
        playerIndex: 6,
      }),
    ).toThrow();
    expect(() =>
      event({
        type: "clue",
        clue: { type: 1, value: 6 },
        giver: 0,
        target: 1,
        list: [3],
        turn: 2,
      }),
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
  });
});

describe("card identities", () => {
  test("unknown suits and ranks become null", () => {
    const [identity] = SERVER_COMMAND_SCHEMAS.cardIdentities.parse({
      tableID: 1,
      cardIdentities: [{ suitIndex: -1, rank: 7 }],
    }).cardIdentities;
    expect(toCardIdentity(identity!)).toEqual({ suitIndex: null, rank: 7 });
  });
});

describe("sounds", () => {
  test("every sound a leader can send can be played", () => {
    for (const sound of SERVER_COMMAND_SCHEMAS.replaySound.shape.sound
      .options) {
      expect(toSoundType(sound)).toBe(sound);
    }
  });

  test("the lobby plays the shutdown sound", () => {
    const { file } = SERVER_COMMAND_SCHEMAS.soundLobby.parse({
      file: "shutdown",
    });
    expect(toSoundType(file)).toBe("shutdown");
    expect(() =>
      SERVER_COMMAND_SCHEMAS.soundLobby.parse({ file: "not-a-sound" }),
    ).toThrow();
  });
});
