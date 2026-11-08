import { beforeEach, describe, expect, test, vi } from "vitest";
import type { State } from "../../../types/State";

const settings = vi.hoisted(() => ({
  speedrunMode: false,
  speedrunPreplay: false,
}));
vi.mock("../../UIGlobals", () => ({ globals: { lobby: { settings } } }));
const { draggablePlayerIndex } = await import("./draggableView");

const OUR_PLAYER_INDEX = 1;
const OTHER_PLAYER_INDEX = 2;

function makeState({
  currentPlayerIndex = OUR_PLAYER_INDEX,
  playing = true,
  premove = null,
  hypothetical = null,
  shared = null,
}: {
  currentPlayerIndex?: number;
  playing?: boolean;
  premove?: unknown;
  hypothetical?: unknown;
  shared?: unknown;
} = {}): State {
  return {
    playing,
    premove,
    metadata: {
      ourPlayerIndex: OUR_PLAYER_INDEX,
      options: { speedrun: false },
    },
    ongoingGame: { turn: { currentPlayerIndex } },
    visibleState: { turn: { currentPlayerIndex: OTHER_PLAYER_INDEX } },
    replay: { hypothetical, shared },
  } as unknown as State;
}

describe("draggablePlayerIndex", () => {
  beforeEach(() => {
    settings.speedrunPreplay = false;
  });

  test("allows our cards on our turn", () => {
    expect(draggablePlayerIndex(makeState())).toBe(OUR_PLAYER_INDEX);
  });

  test("allows our cards on another turn only with pre-playing enabled", () => {
    const state = makeState({ currentPlayerIndex: OTHER_PLAYER_INDEX });
    expect(draggablePlayerIndex(state)).toBeNull();

    settings.speedrunPreplay = true;
    expect(draggablePlayerIndex(state)).toBe(OUR_PLAYER_INDEX);
  });

  test("blocks dragging while a premove is queued or when spectating", () => {
    expect(
      draggablePlayerIndex(makeState({ premove: { type: 0 } })),
    ).toBeNull();
    expect(draggablePlayerIndex(makeState({ playing: false }))).toBeNull();
  });

  test("allows only the hypothetical leader to drag the current player's cards", () => {
    const hypothetical = {};
    expect(draggablePlayerIndex(makeState({ hypothetical }))).toBe(
      OTHER_PLAYER_INDEX,
    );
    expect(
      draggablePlayerIndex(
        makeState({ hypothetical, shared: { amLeader: false } }),
      ),
    ).toBeNull();
  });
});
