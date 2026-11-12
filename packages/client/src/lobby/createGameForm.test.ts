import { defaultSettings } from "@hanabi-live/data";
import { getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { CreateGameForm } from "./createGameForm.ts";
import {
  DEFAULT_TIME_CONTROL,
  formFromTable,
  getErrors,
  readFormDeal,
  readTable,
} from "./createGameForm.ts";

const defaultForm: CreateGameForm = {
  name: "",
  password: "",
  seed: "",
  replayGameId: "",
  replayTurn: "",
  ...formFromTable(defaultSettings.createTable, "No Variant"),
};

describe("getErrors", () => {
  test("accepts the defaults", () => {
    expect(getErrors(defaultForm)).toStrictEqual({});
  });

  test("checks the clock only for a timed table that is not a speedrun", () => {
    const badClock = {
      ...defaultForm,
      timeBaseMinutes: "0",
      timePerTurnSeconds: "x",
    };
    expect(getErrors(badClock)).toStrictEqual({});
    expect(Object.keys(getErrors({ ...badClock, timed: true }))).toStrictEqual([
      "timeBaseMinutes",
      "timePerTurnSeconds",
    ]);
    expect(
      getErrors({
        ...badClock,
        timed: true,
        extraOptions: { ...defaultForm.extraOptions, speedrun: true },
      }),
    ).toStrictEqual({});
  });

  test("names each character that a seed cannot have once", () => {
    expect(getErrors({ ...defaultForm, seed: "a b c!" }).seed).toBe(
      "You cannot have these characters in a seed: (space) !",
    );
  });

  test("does not allow both a seed and a replay", () => {
    expect(
      getErrors({ ...defaultForm, seed: "abc", replayGameId: "5" })
        .replayGameId,
    ).toBe("A replay uses its game's seed, so the custom seed must be blank.");
  });

  test("checks the turn only for a replay", () => {
    expect(getErrors({ ...defaultForm, replayTurn: "0" })).toStrictEqual({});
    expect(
      getErrors({ ...defaultForm, replayGameId: "5", replayTurn: "0" })
        .replayTurn,
    ).toBe("The turn must be a positive number.");
  });
});

describe("readTable", () => {
  test("converts the base time from minutes", () => {
    const table = readTable(
      {
        ...defaultForm,
        timed: true,
        timeBaseMinutes: "1.5",
        timePerTurnSeconds: "7",
      },
      DEFAULT_TIME_CONTROL,
    );
    expect(table.options.timeControl).toStrictEqual({
      baseSeconds: 90,
      perTurnSeconds: 7,
    });
  });

  test("keeps the remembered clock in place of an invalid one", () => {
    const remembered = { baseSeconds: 300, perTurnSeconds: 15 };
    const table = readTable(
      {
        ...defaultForm,
        timed: true,
        timeBaseMinutes: "0",
        timePerTurnSeconds: "",
      },
      remembered,
    );
    expect(table.options.timeControl).toStrictEqual(remembered);
  });

  test("keeps no clock for an untimed table", () => {
    const table = readTable(
      { ...defaultForm, timeBaseMinutes: "10" },
      DEFAULT_TIME_CONTROL,
    );
    expect(table.options.timeControl).toBeUndefined();
  });

  test("uses the defaults for an unknown variant and an invalid player count", () => {
    const table = readTable(
      { ...defaultForm, variantName: "Not a variant", maxPlayers: "99" },
      DEFAULT_TIME_CONTROL,
    );
    expect(table.options.variantId).toBe(getVariant("No Variant").id);
    expect(table.maxPlayers).toBe(defaultSettings.createTable.maxPlayers);
  });
});

test("a replay takes its turn from 1 and ignores spaces", () => {
  expect(
    readFormDeal({ ...defaultForm, replayGameId: " 12 ", replayTurn: "3" }),
  ).toStrictEqual({ type: "replay", gameId: 12, turn: 2 });
});
