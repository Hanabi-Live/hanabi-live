import {
  replaySoundEffectSchema,
  SERVER_COMMAND_SCHEMAS,
} from "@hanabi-live/data";
import { describe, expect, test } from "vitest";
import { toCardIdentity, toGameAction, toSoundType } from "./wire.ts";

/** Validates a game event as the connection does. */
function event(data: unknown) {
  return SERVER_COMMAND_SCHEMAS.gameEvent.parse({ tableId: 1, event: data })
    .event;
}

describe("server game events", () => {
  test("the final turn and an unattributed game over have no seat", () => {
    expect(toGameAction({ type: "turn", turn: 30 })).toEqual({
      type: "turn",
      turn: 30,
    });
    expect(
      toGameAction({
        type: "gameOver",
        endCondition: "normal",
        voters: [],
      }),
    ).toEqual({
      type: "gameOver",
      endCondition: "normal",
      voters: [],
    });
  });

  test("hidden clues stay hidden", () => {
    const action = toGameAction(
      event({
        type: "clue",
        playerIndex: 0,
        receiverIndex: 1,
        orders: [3, 4],
      }),
    );
    if (action.type !== "clue") {
      throw new Error("Expected a clue action");
    }
    expect(action.clue).toEqual({ type: undefined, value: undefined });
    expect(action.orders.map(Number)).toEqual([3, 4]);
  });

  test("values outside the game's types are rejected", () => {
    expect(() =>
      SERVER_COMMAND_SCHEMAS.pause.parse({
        tableId: 1,
        active: true,
        playerIndex: 6,
      }),
    ).toThrow();
    expect(() =>
      event({
        type: "clue",
        clue: { type: 1, value: 6 },
        playerIndex: 0,
        receiverIndex: 1,
        orders: [3],
        turn: 2,
      }),
    ).toThrow();
    expect(() =>
      event({
        type: "draw",
        playerIndex: 0,
        order: 66,
        identity: { suitIndex: 0, rank: 1 },
      }),
    ).toThrow();
    expect(() =>
      event({
        type: "draw",
        playerIndex: 0,
        order: 0,
        identity: { suitIndex: 6, rank: 1 },
      }),
    ).toThrow();
    expect(() =>
      event({
        type: "draw",
        playerIndex: 0,
        order: 0,
        identity: { suitIndex: 0, rank: 6 },
      }),
    ).toThrow();
  });
});

describe("card identities", () => {
  test("every identity names a suit and a rank", () => {
    const [identity] = SERVER_COMMAND_SCHEMAS.cardIdentities.parse({
      tableId: 1,
      deck: [{ suitIndex: 2, rank: 7 }],
    }).deck;
    expect(toCardIdentity(identity!)).toEqual({ suitIndex: 2, rank: 7 });
    expect(
      SERVER_COMMAND_SCHEMAS.cardIdentities.safeParse({
        tableId: 1,
        deck: [{ rank: 7 }],
      }).success,
    ).toBe(false);
  });
});

describe("sounds", () => {
  test("every sound a leader can send can be played", () => {
    for (const sound of replaySoundEffectSchema.options) {
      expect(toSoundType(sound)).toBe(sound);
    }
  });

  test("the lobby plays the shutdown sound", () => {
    const { sound } = SERVER_COMMAND_SCHEMAS.lobbySound.parse({
      sound: "shutdown",
    });
    expect(toSoundType(sound)).toBe("shutdown");
    expect(() =>
      SERVER_COMMAND_SCHEMAS.lobbySound.parse({ sound: "not-a-sound" }),
    ).toThrow();
  });
});
