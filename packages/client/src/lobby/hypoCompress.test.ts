import { describe, expect, test } from "@jest/globals";
import type { GameJSON } from "./hypoCompress";
import { expand, shrink } from "./hypoCompress";

describe("replay URL seed metadata", () => {
  // Two players, one card of each rank, one play, standard variant.
  const payload = "215abcde,00ba,0";

  test("legacy links retain an empty seed", () => {
    const json = expand(payload);
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toHaveProperty("seed", "");
    expect(shrink(json!)).toBe(`${payload},`);
  });

  test.each([
    "p4v0s3",
    "legacy-1-p4v0s3",
    "",
    "A-very-long-seed-with-hyphens-1234567890",
  ])("round-trips seed %s without changing the game", (seed) => {
    const legacy = JSON.parse(expand(payload)!) as GameJSON;
    const game = { ...legacy, seed };
    const compressed = shrink(JSON.stringify(game));
    expect(compressed).toBeDefined();
    expect(compressed!.endsWith(`,${seed}`)).toBe(true);
    expect(JSON.parse(expand(compressed!)!)).toEqual(game);
  });

  test.each(["bad seed", "bad/seed", "bad,seed", "bad?seed"])(
    "rejects invalid seed %s",
    (seed) => {
      const game = JSON.parse(expand(payload)!) as GameJSON;
      expect(shrink(JSON.stringify({ ...game, seed }))).toBeUndefined();
      expect(expand(`${payload},${seed}`)).toBeUndefined();
    },
  );
});
