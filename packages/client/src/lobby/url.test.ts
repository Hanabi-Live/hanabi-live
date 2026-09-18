import type { ServerCommandWelcomeData } from "@hanabi-live/data";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { globals } from "../Globals";
import { expand } from "./hypoCompress";
import { parseAndGoto } from "./url";

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
    ["shared-replay-json", ",p4v0s3", "p4v0s3"],
    ["replay-json", ",legacy-1-p4v0s3", "legacy-1-p4v0s3"],
    ["shared-replay-json", "", ""],
    ["replay-json", ",", ""],
  ])("%s preserves embedded seed %s", (route, suffix, seed) => {
    const setItem = jest.fn();
    const send = jest.spyOn(globals.conn!, "send");
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: new URL(`https://hanab.live/${route}/${payload}${suffix}#42`),
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { setItem },
    });

    parseAndGoto({ firstTimeUser: false } as ServerCommandWelcomeData);

    expect(send).toHaveBeenCalledWith(
      "replayCreate",
      expect.objectContaining({ gameJSON: expect.objectContaining({ seed }) }),
    );
    expect(setItem).toHaveBeenCalledWith(
      "watchReplayJSON",
      expand(`${payload}${suffix}`),
    );
    expect(globalThis.location.hash).toBe("#42");
  });
});
