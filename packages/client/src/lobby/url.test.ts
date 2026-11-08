import type { ServerCommandWelcomeData } from "@hanabi-live/data";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { replayGameSchema } from "@hanabi-live/data";

await mock.module("./history", () => ({
  show: mock(),
  showOtherScoresFromURL: mock(),
}));
await mock.module("../Globals", () => ({
  globals: { conn: { send: mock() } },
}));
await mock.module("../utils", () => ({ setBrowserAddressBarPath: mock() }));
const { globals } = await import("../Globals");
const history = await import("./history");
const { expand } = await import("./hypoCompress");
const { parseAndGoto } = await import("./url");

describe("replay URL loading", () => {
  const payload = "215abcde,00ba,0";
  const locationDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  afterEach(() => {
    if (locationDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "location");
    } else {
      Object.defineProperty(globalThis, "location", locationDescriptor);
    }
    if (storageDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    }
    mock.clearAllMocks();
  });

  test.each([
    ["shared-replay-json", ",p4v0s3", "p4v0s3", "shared"],
    ["replay-json", ",legacy-1-p4v0s3", "legacy-1-p4v0s3", "solo"],
    ["shared-replay-json", "", "", "shared"],
    ["replay-json", ",", "", "solo"],
  ])("%s preserves embedded seed %s", (route, suffix, seed, visibility) => {
    const setItem = mock();
    const send = spyOn(globals.conn!, "send");
    Object.defineProperties(globalThis, {
      location: {
        configurable: true,
        value: new URL(`https://hanab.live/${route}/${payload}${suffix}#42`),
      },
      localStorage: {
        configurable: true,
        value: { setItem },
      },
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    const gameJSON = replayGameSchema.parse(
      JSON.parse(expand(`${payload}${suffix}`)!),
    );
    expect(send).toHaveBeenCalledWith("replayCreate", {
      source: "json",
      gameJSON: { ...gameJSON, seed },
      visibility,
      shadowingPlayerIndex: -1,
    });
    expect(setItem).toHaveBeenCalledWith(
      "watchReplayJSON",
      expand(`${payload}${suffix}`),
    );
    expect(globalThis.location.hash).toBe("#42");
  });

  test("restores the personal history route", () => {
    const show = spyOn(history, "show");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("https://hanab.live/lobby#history"),
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith();
  });

  test("restores the other scores history route", () => {
    const show = spyOn(history, "show");
    const showOtherScores = spyOn(history, "showOtherScoresFromURL");
    const url = "https://hanab.live/lobby#history-other-scores-p4v0s1";
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(url),
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(show).toHaveBeenCalledTimes(1);
    expect(showOtherScores).toHaveBeenCalledWith("p4v0s1");
    expect(show).toHaveBeenCalledWith(false);
  });

  test.each([
    ["/game/123", -1],
    ["/game/123/shadow/0", 0],
    ["/game/123/shadow/2", 2],
  ])("route %s => seat %i", (pathname, shadowingPlayerIndex) => {
    const send = spyOn(globals.conn!, "send");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live${pathname}`),
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(send).toHaveBeenCalledWith("tableSpectate", {
      tableID: 123,
      shadowingPlayerIndex,
    });
  });
});
