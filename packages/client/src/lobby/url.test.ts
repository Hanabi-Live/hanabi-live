import type { ServerCommandWelcomeData } from "@hanabi-live/data";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { globals } from "../Globals";
import * as history from "./history";
import type { GameJSON } from "./hypoCompress";
import { expand } from "./hypoCompress";
import { parseAndGoto } from "./url";

jest.mock("./history", () => ({
  show: jest.fn(),
  showFriends: jest.fn(),
  showOtherScoresFromURL: jest.fn(),
}));
jest.mock("../Globals", () => ({ globals: { conn: { send: jest.fn() } } }));
jest.mock("../utils", () => ({ setBrowserAddressBarPath: jest.fn() }));

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
    jest.clearAllMocks();
  });

  test.each([
    ["shared-replay-json", ",p4v0s3", "p4v0s3", "shared"],
    ["replay-json", ",legacy-1-p4v0s3", "legacy-1-p4v0s3", "solo"],
    ["shared-replay-json", "", "", "shared"],
    ["replay-json", ",", "", "solo"],
  ])("%s preserves embedded seed %s", (route, suffix, seed, visibility) => {
    const setItem = jest.fn();
    const send = jest.spyOn(globals.conn!, "send");
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

    const gameJSON = JSON.parse(expand(`${payload}${suffix}`)!) as GameJSON;
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

  test.each([
    ["#history", false],
    ["#history-friends", true],
  ])("restores lobby history route %s", (hash, friends) => {
    const show = jest.spyOn(history, "show");
    const showFriends = jest.spyOn(history, "showFriends");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live/lobby${hash}`),
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(show).toHaveBeenCalledTimes(1);
    expect(showFriends).toHaveBeenCalledTimes(friends ? 1 : 0);
  });

  test("restores the other scores history route", () => {
    const show = jest.spyOn(history, "show");
    const showFriends = jest.spyOn(history, "showFriends");
    const showOtherScores = jest.spyOn(history, "showOtherScoresFromURL");
    const url = "https://hanab.live/lobby#history-other-scores-friends-p4v0s1";
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(url),
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(show).toHaveBeenCalledTimes(1);
    expect(showFriends).toHaveBeenCalledTimes(1);
    expect(showOtherScores).toHaveBeenCalledWith("p4v0s1", true);
  });

  test.each([
    ["/game/123", -1],
    ["/game/123/shadow/0", 0],
    ["/game/123/shadow/2", 2],
  ])("route %s => seat %i", (pathname, shadowingPlayerIndex) => {
    const send = jest.spyOn(globals.conn!, "send");
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
