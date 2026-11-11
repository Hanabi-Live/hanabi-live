import { describe, expect, test } from "vitest";
import { parseGameJson } from "./gameJson.ts";

describe("pasted game JSON", () => {
  test("exported games are accepted", () => {
    const parsed = parseGameJson(
      JSON.stringify({
        gameId: 7,
        seed: "p2v0s1",
        options: { variantName: "No Variant" },
      }),
    );
    expect(parsed).toHaveProperty("gameJson.seed", "p2v0s1");
  });

  test("unknown fields and nulls are rejected", () => {
    for (const game of [
      { seed: "p2v0s1", options: { tableName: "x" } },
      { seed: "p2v0s1", playerNames: null },
    ]) {
      expect(parseGameJson(JSON.stringify(game))).toHaveProperty("error");
    }
  });

  test("invalid files explain which field is wrong", () => {
    expect(parseGameJson("not JSON")).toHaveProperty("error");
    const parsed = parseGameJson(JSON.stringify({ deck: [{ rank: "five" }] }));
    expect("error" in parsed ? parsed.error : "").toContain("deck.0.rank");
  });
});
