import type { CardOrder } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { State } from "./types/State.ts";

const send = vi.fn();
vi.mock("../Globals.ts", () => ({
  globals: {
    connection: {
      send,
    },
    joinedTableId: 42,
  },
}));
const { canDrawArrow, sendArrow } = await import("./highlightArrow.ts");

const NO_KEYS = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
} as const;
const CTRL = {
  ...NO_KEYS,
  ctrlKey: true,
} as const;

function makeState(
  finished: boolean,
  shared?: { amLeader: boolean; useSharedSegments: boolean },
): State {
  return {
    finished,
    replay: {
      shared,
    },
  } as unknown as State;
}

beforeEach(() => {
  send.mockClear();
});

describe("canDrawArrow", () => {
  test("a right-click draws an arrow in a solo replay", () => {
    expect(canDrawArrow(makeState(true), NO_KEYS)).toBe(true);
  });

  test("only the leader who follows the shared turns draws one in a shared replay", () => {
    expect(
      canDrawArrow(
        makeState(true, {
          amLeader: true,
          useSharedSegments: true,
        }),
        NO_KEYS,
      ),
    ).toBe(true);
    expect(
      canDrawArrow(
        makeState(true, {
          amLeader: true,
          useSharedSegments: false,
        }),
        CTRL,
      ),
    ).toBe(false);
    expect(
      canDrawArrow(
        makeState(true, {
          amLeader: false,
          useSharedSegments: true,
        }),
        CTRL,
      ),
    ).toBe(false);
  });

  test("during a game, only Ctrl + right-click draws one", () => {
    expect(canDrawArrow(makeState(false), CTRL)).toBe(true);
    expect(canDrawArrow(makeState(false), NO_KEYS)).toBe(false);
    expect(
      canDrawArrow(makeState(false), {
        ...CTRL,
        shiftKey: true,
      }),
    ).toBe(false);
  });
});

describe("sendArrow", () => {
  const leader = makeState(true, {
    amLeader: true,
    useSharedSegments: true,
  });

  test("the leader shows a card or a part of the board to the followers", () => {
    sendArrow(leader, 7 as CardOrder);
    sendArrow(leader, "pace");
    sendArrow(leader, undefined);
    expect(send.mock.calls).toEqual([
      [
        "replayAction",
        {
          tableId: 42,
          action: {
            type: "arrow",
            target: {
              type: "card",
              order: 7,
            },
          },
        },
      ],
      [
        "replayAction",
        {
          tableId: 42,
          action: {
            type: "arrow",
            target: {
              type: "board",
              element: "pace",
            },
          },
        },
      ],
      [
        "replayAction",
        {
          tableId: 42,
          action: {
            type: "arrow",
          },
        },
      ],
    ]);
  });

  test("an arrow outside a shared replay stays local", () => {
    sendArrow(makeState(true), 7 as CardOrder);
    expect(send).not.toHaveBeenCalled();
  });
});
