import type { ServerCommandData } from "@hanabi-live/data";
import { afterEach, describe, expect, test, vi } from "vitest";

import { replayGameSchema, tableIdSchema } from "@hanabi-live/data";

vi.mock("./history.ts", () => ({
  show: vi.fn(),
  showOtherScores: vi.fn(),
}));
vi.mock("../Globals.ts", () => ({
  globals: { conn: { send: vi.fn() } },
}));
vi.mock("../utils.ts", () => ({ setBrowserAddressBarPath: vi.fn() }));
const { globals } = await import("../Globals.ts");
const history = await import("./history.ts");
const { expand } = await import("./hypoCompress.ts");
const { leaveTableLink, parseAndGoto } = await import("./url.ts");
const { setBrowserAddressBarPath } = await import("../utils.ts");

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
  const payload = "215abcde,00ab,0,";
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
    ["replay-json", "", undefined, "solo"],
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

    const gameJson = replayGameSchema.parse(
      JSON.parse(expand(`${payload}${suffix}`)!),
    );
    expect(send).toHaveBeenCalledWith("replayCreate", {
      type: "json",
      gameJson: { ...gameJson, seed },
      visibility,
    });
    expect(setItem).toHaveBeenCalledWith(
      "watchReplayJson",
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
      tableId: 123,
      shadowingPlayerIndex,
    });
  });

  const tableId = tableIdSchema.parse(123);

  test.each([
    ["/replay/456", { playingAtTables: [tableId] }],
    ["/replay/456", { spectatingAtTable: { tableId } }],
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
      expect.objectContaining({ gameId: 456, visibility: "solo" }),
    );
  });

  test.each([
    [{}, "tableJoin", { tableId: 123, password: "" }],
    [{ spectatingAtTable: { tableId } }, "tableSpectate", { tableId }],
  ])("route /pre-game/123 with %o sends %s", (data, command, commandData) => {
    const send = vi.spyOn(globals.conn!, "send");
    Object.defineProperties(globalThis, {
      location: {
        configurable: true,
        value: new URL("https://hanab.live/pre-game/123"),
      },
      localStorage: {
        configurable: true,
        value: { getItem: vi.fn(() => null) },
      },
    });

    parseAndGoto(welcome(data));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(command, commandData);
  });

  test.each(["/lobby", "/game/123", "/game/123/shadow/0"])(
    "route %s returns to an ongoing game",
    (pathname) => {
      const send = vi.spyOn(globals.conn!, "send");
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: new URL(`https://hanab.live${pathname}`),
      });

      parseAndGoto(welcome({ playingAtTables: [tableId] }));

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith("tableReattend", { tableId });
    },
  );

  test.each([
    ["/game/123", true],
    ["/game/123/shadow/1", true],
    ["/pre-game/123", true],
    ["/game/1234", false],
    ["/replay/123", false],
    ["/lobby", false],
  ])("a gone table at %s leaves its link: %s", (pathname, leaves) => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live${pathname}`),
    });

    leaveTableLink(123);

    expect(vi.mocked(setBrowserAddressBarPath).mock.calls).toStrictEqual(
      leaves ? [["/lobby"]] : [],
    );
  });
});
