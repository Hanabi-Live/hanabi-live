import type { PlayerIndex } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";
import type { State } from "./types/State.ts";

// The page's globals need a browser window.
vi.mock("../Globals.ts", () => ({
  globals: {},
}));
const { getPauseAction } = await import("./pause.ts");

/** A timed game in which we sit in seat 0. */
function timedGame({
  currentPlayerIndex = 0,
  pausingPlayerIndex,
  queued = false,
  timed = true,
  playing = true,
}: {
  readonly currentPlayerIndex?: number;
  readonly pausingPlayerIndex?: number;
  readonly queued?: boolean;
  readonly timed?: boolean;
  readonly playing?: boolean;
}): State {
  return {
    playing,
    finished: false,
    metadata: {
      ourPlayerIndex: 0,
      options: {
        timeControl: timed ? {} : undefined,
      },
    },
    ongoingGame: {
      turn: {
        currentPlayerIndex: currentPlayerIndex as PlayerIndex,
      },
    },
    pause: {
      pausingPlayerIndex: pausingPlayerIndex as PlayerIndex | undefined,
      queued,
    },
  } as unknown as State;
}

describe("getPauseAction", () => {
  test("pauses on our turn", () => {
    expect(getPauseAction(timedGame({}))).toBe("pause");
  });

  test("queues a pause on another player's turn, and cancels it", () => {
    expect(getPauseAction(timedGame({ currentPlayerIndex: 1 }))).toBe("queue");
    expect(
      getPauseAction(
        timedGame({
          currentPlayerIndex: 1,
          queued: true,
        }),
      ),
    ).toBe("unqueue");
  });

  test("does nothing in an untimed game, for a spectator, or while paused", () => {
    expect(getPauseAction(timedGame({ timed: false }))).toBeUndefined();
    expect(getPauseAction(timedGame({ playing: false }))).toBeUndefined();
    expect(
      getPauseAction(timedGame({ pausingPlayerIndex: 1 })),
    ).toBeUndefined();
  });
});
