import { HYPO_PREFIX } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { getLogLinePlayerIndex } from "./logLinePlayer.ts";

describe("getLogLinePlayerIndex", () => {
  const playerNames = ["Bob", "Bobby", "Cathy"];

  test("gives a line to the longest name that it starts with", () => {
    expect(
      getLogLinePlayerIndex("Bobby plays Red 1 from slot #1", playerNames),
    ).toBe(1);
    expect(
      getLogLinePlayerIndex("Bob plays Red 1 from slot #1", playerNames),
    ).toBe(0);
  });

  test("reads the name after the prefix of a hypothetical line", () => {
    expect(
      getLogLinePlayerIndex(
        `${HYPO_PREFIX}Cathy discards Blue 3 from slot #2`,
        playerNames,
      ),
    ).toBe(2);
  });

  test("gives a line that starts with no name to no one", () => {
    expect(getLogLinePlayerIndex("Players score 25 points", playerNames)).toBe(
      undefined,
    );
  });
});
