import { describe, expect, test } from "vitest";
import { parseGameJSON } from "./gameJSON";

describe("pasted game JSON", () => {
  test("files from other tools are accepted", () => {
    const parsed = parseGameJSON(
      JSON.stringify({
        id: 7,
        seed: "p2v0s1",
        players: null,
        options: { variant: "No Variant", tableName: "ignored" },
      }),
    );
    expect(parsed).toHaveProperty("gameJSON.seed", "p2v0s1");
  });

  test("invalid files explain which field is wrong", () => {
    expect(parseGameJSON("not JSON")).toHaveProperty("error");
    const parsed = parseGameJSON(JSON.stringify({ deck: [{ rank: "five" }] }));
    expect("error" in parsed ? parsed.error : "").toContain("deck.0.rank");
  });
});
