import { replayGameSchema } from "@hanabi-live/data";
import { describe, expect, test } from "vitest";
import { expand, shrink } from "./hypoCompress.ts";

/** Expands a replay URL's game, with the defaults that the replay format fills in. */
function expandGame(compressed: string) {
  return replayGameSchema.parse(JSON.parse(expand(compressed)!));
}

describe("replay URL seed metadata", () => {
  // Two players, one card of each rank, one play, standard variant, and no seed.
  const payload = "215abcde,00ab,0,";

  test.each(["p4v0s3", undefined, "A-very-long-seed-with-hyphens-1234567890"])(
    "round-trips seed %s without changing the game",
    (seed) => {
      const game = {
        ...replayGameSchema.parse(JSON.parse(expand(payload)!)),
        seed,
      };
      const compressed = shrink(JSON.stringify(game));
      expect(compressed).toBeDefined();
      expect(compressed!.endsWith(`,${seed ?? ""}`)).toBe(true);
      expect(expandGame(compressed!)).toEqual(game);
    },
  );

  test.each(["bad seed", "bad/seed", "bad,seed", "bad?seed"])(
    "rejects invalid seed %s",
    (seed) => {
      const game = replayGameSchema.parse(JSON.parse(expand(payload)!));
      expect(
        shrink(
          JSON.stringify({
            ...game,
            seed,
          }),
        ),
      ).toBeUndefined();
      expect(expand(`${payload}${seed}`)).toBeUndefined();
    },
  );
});

describe("replay URL actions", () => {
  // Two players, one card of each rank, one play, standard variant, and no seed.
  const payload = "215abcde,00ab,0,";

  test("reads a compressed action", () => {
    const game: unknown = JSON.parse(expand(payload)!);
    expect(replayGameSchema.parse(game).actions).toEqual([
      {
        type: "play",
        order: 0,
      },
    ]);
  });

  test("round-trips every kind of action", () => {
    const game = {
      ...replayGameSchema.parse(JSON.parse(expand(payload)!)),
      actions: [
        {
          type: "clue",
          receiverIndex: 1,
          clue: {
            type: "rank",
            rank: 1,
          },
        },
        {
          type: "clue",
          receiverIndex: 0,
          clue: {
            type: "color",
            color: 2,
          },
        },
        {
          type: "play",
          order: 0,
        },
        {
          type: "discard",
          order: 1,
        },
        {
          type: "gameOver",
          endCondition: "terminatedByPlayer",
          playerIndex: 1,
        },
      ],
    };
    const compressed = shrink(JSON.stringify(game));
    expect(compressed).toBeDefined();
    expect(expandGame(compressed!)).toEqual(game);
  });

  test.each(["terminatedByVote", "idleTimeout"])(
    "round-trips a %s game over without a player",
    (endCondition) => {
      const game = {
        ...replayGameSchema.parse(JSON.parse(expand(payload)!)),
        actions: [
          {
            type: "gameOver",
            endCondition,
          },
        ],
      };
      const compressed = shrink(JSON.stringify(game));
      expect(compressed).toBeDefined();
      expect(expandGame(compressed!)).toEqual(game);
    },
  );
});

describe("replay URL options", () => {
  // Two players, one card of each rank, one play, standard variant, and no seed.
  const payload = "215abcde,00ab,0,";

  test("keeps the options that change how a game plays", () => {
    const game = replayGameSchema.parse(JSON.parse(expand(payload)!));
    const withOptions = {
      ...game,
      options: {
        ...game.options,
        oneExtraCard: true,
        allOrNothing: true,
      },
    };
    // One Extra Card is the third option and All or Nothing is the fifth: 4 + 16.
    expect(shrink(JSON.stringify(withOptions))).toBe(`${payload},20`);
    expect(expandGame(`${payload},20`)).toEqual(withOptions);
  });

  test("a game without these options keeps the old format", () => {
    const game = replayGameSchema.parse(JSON.parse(expand(payload)!));
    // A copied game always names the options, also when they are off.
    expect(
      shrink(
        JSON.stringify({
          ...game,
          options: {
            ...game.options,
            oneExtraCard: false,
            allOrNothing: false,
          },
        }),
      ),
    ).toBe(payload);
  });

  test("does not compress a game with an option that the URL cannot hold", () => {
    const game = replayGameSchema.parse(JSON.parse(expand(payload)!));
    expect(
      shrink(
        JSON.stringify({
          ...game,
          options: {
            ...game.options,
            speedrun: true,
          },
        }),
      ),
    ).toBeUndefined();
  });

  test.each(["0", "32", "x", "04", ""])(
    "refuses the options part %j",
    (options) => {
      expect(expand(`${payload},${options}`)).toBeUndefined();
    },
  );
});
