import type { ServerCommandData } from "@hanabi-live/data";
import { afterEach, describe, expect, test, vi } from "vitest";

import { replayImportSchema, tableIdSchema } from "@hanabi-live/data";

vi.mock("./history", () => ({
  show: vi.fn(),
  showOtherScores: vi.fn(),
}));
vi.mock("../Globals", () => ({
  globals: { conn: { send: vi.fn() } },
}));
vi.mock("../utils", () => ({ setBrowserAddressBarPath: vi.fn() }));
const { globals } = await import("../Globals");
const history = await import("./history");
const { expand } = await import("./hypoCompress");
const { parseAndGoto } = await import("./url");

function welcome(
  data: Partial<ServerCommandData["welcome"]> = {},
): ServerCommandData["welcome"] {
  return {
    firstTimeUser: false,
    playingAtTables: [],
    ...data,
  } as ServerCommandData["welcome"];
}

describe("replay URL loading", () => {
  const payload = "215abcde,00ba,0,";
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
    vi.clearAllMocks();
  });

  test.each([
    ["shared-replay-json", "p4v0s3", "p4v0s3", "shared"],
    ["replay-json", "p4v0e3", "p4v0e3", "solo"],
    ["replay-json", "", "", "solo"],
  ])("%s preserves embedded seed %s", (route, suffix, seed, visibility) => {
    const setItem = vi.fn();
    const send = vi.spyOn(globals.conn!, "send");
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

    parseAndGoto(welcome());

    const gameJSON = replayImportSchema.parse(
      JSON.parse(expand(`${payload}${suffix}`)!),
    );
    expect(send).toHaveBeenCalledWith("replayCreate", {
      source: "json",
      gameJSON: { ...gameJSON, seed },
      visibility,
    });
    expect(setItem).toHaveBeenCalledWith(
      "watchReplayJSON",
      expand(`${payload}${suffix}`),
    );
    expect(globalThis.location.hash).toBe("#42");
  });

  test("restores the personal history route", () => {
    const show = vi.spyOn(history, "show");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL("https://hanab.live/lobby#history"),
    });

    parseAndGoto(welcome());

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith();
  });

  test("restores the other scores history route", () => {
    const show = vi.spyOn(history, "show");
    const showOtherScores = vi.spyOn(history, "showOtherScores");
    const url = "https://hanab.live/lobby#history-other-scores-p4v0s1";
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(url),
    });

    parseAndGoto(welcome());

    expect(show).toHaveBeenCalledTimes(1);
    expect(showOtherScores).toHaveBeenCalledWith("p4v0s1");
    expect(show).toHaveBeenCalledWith(false);
  });

  test.each([
    ["/game/123", undefined],
    ["/game/123/shadow/0", 0],
    ["/game/123/shadow/2", 2],
  ])("route %s => seat %i", (pathname, shadowingPlayerIndex) => {
    const send = vi.spyOn(globals.conn!, "send");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live${pathname}`),
    });

    parseAndGoto(welcome());

    expect(send).toHaveBeenCalledWith("tableSpectate", {
      tableID: 123,
      shadowingPlayerIndex,
    });
  });

  const tableID = tableIdSchema.parse(123);

  test.each([
    ["/replay/456", { playingAtTables: [tableID] }],
    ["/replay/456", { spectatingAtTable: { tableID } }],
  ])("route %s takes precedence over reconnecting", (pathname, data) => {
    const send = vi.spyOn(globals.conn!, "send");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live${pathname}`),
    });

    parseAndGoto(welcome(data));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "replayCreate",
      expect.objectContaining({ databaseID: 456, visibility: "solo" }),
    );
  });

  test.each(["/lobby", "/game/123", "/game/123/shadow/0"])(
    "route %s returns to an ongoing game",
    (pathname) => {
      const send = vi.spyOn(globals.conn!, "send");
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: new URL(`https://hanab.live${pathname}`),
      });

      parseAndGoto(welcome({ playingAtTables: [tableID] }));

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith("tableReattend", { tableID });
    },
  );
});
