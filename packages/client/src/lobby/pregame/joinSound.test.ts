import { tableIdSchema, userIdSchema } from "@hanabi-live/data";
import { defaultOptions } from "@hanabi-live/game";
import { expect, test } from "vitest";
import { shouldPlayJoinSound } from "./joinSound.ts";
import type { Game } from "./pregameSlice.ts";

const ALICE = userIdSchema.parse(1);

function pregame(tableId: number, userIds: readonly number[]): Game {
  return {
    tableId: tableIdSchema.parse(tableId),
    settings: {
      name: "table",
      maxPlayers: 5,
      options: defaultOptions,
    },
    owner: {
      userId: ALICE,
      username: "alice",
    },
    passwordProtected: false,
    players: userIds.map((userId) => ({
      userId: userIdSchema.parse(userId),
      username: `user${userId}`,
      present: true,
      stats: {
        numGames: 0,
        variant: {
          numGames: 0,
          bestScores: [],
        },
      },
    })),
  };
}

test("a join plays the sound to the other players once per burst", () => {
  const created = pregame(1, [1]);
  const bob = pregame(1, [1, 2]);
  const carol = pregame(1, [1, 2, 3]);
  const dave = pregame(1, [1, 2, 3, 4]);

  // A join right after the table is created plays no sound.
  expect(shouldPlayJoinSound(undefined, created, ALICE, 0)).toBe(false);
  expect(shouldPlayJoinSound(created, bob, ALICE, 1000)).toBe(false);

  // A join after a quiet time plays it, but the next join soon after does not.
  expect(shouldPlayJoinSound(bob, carol, ALICE, 60_000)).toBe(true);
  expect(shouldPlayJoinSound(carol, dave, ALICE, 61_000)).toBe(false);
});

test("our own join and a spectator's view play no sound", () => {
  const before = pregame(2, [1]);
  const after = pregame(2, [1, 2]);
  expect(shouldPlayJoinSound(undefined, before, ALICE, 0)).toBe(false);

  // A spectator of the pregame is not a player there.
  const spectator = userIdSchema.parse(9);
  expect(shouldPlayJoinSound(before, after, spectator, 60_000)).toBe(false);

  // The player who joins hears nothing.
  const bob = userIdSchema.parse(2);
  expect(shouldPlayJoinSound(undefined, after, bob, 120_000)).toBe(false);
  expect(shouldPlayJoinSound(after, after, bob, 240_000)).toBe(false);
});
