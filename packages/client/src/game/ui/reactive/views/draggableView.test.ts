import { defaultSettings } from "@hanabi-live/data";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { settingsChanged } from "../../../../sessionSlice.ts";
import { store } from "../../../../store.ts";
import type { State } from "../../../types/State.ts";

vi.mock("../../UiGlobals.ts", () => ({
  globals: {},
}));
const { draggablePlayerIndex } = await import("./draggableView.ts");

const OUR_PLAYER_INDEX = 1;
const OTHER_PLAYER_INDEX = 2;

function makeState({
  currentPlayerIndex = OUR_PLAYER_INDEX,
  playing = true,
  premove,
  hypothetical,
  ownHypothetical,
  shared,
}: {
  currentPlayerIndex?: number;
  playing?: boolean;
  premove?: unknown;
  hypothetical?: unknown;
  ownHypothetical?: unknown;
  shared?: unknown;
} = {}): State {
  return {
    playing,
    premove,
    metadata: {
      ourPlayerIndex: OUR_PLAYER_INDEX,
      options: {
        speedrun: false,
      },
    },
    ongoingGame: {
      turn: {
        currentPlayerIndex,
      },
    },
    visibleState: {
      turn: {
        currentPlayerIndex: OTHER_PLAYER_INDEX,
      },
    },
    replay: {
      hypothetical,
      ownHypothetical,
      shared,
    },
  } as unknown as State;
}

describe("draggablePlayerIndex", () => {
  beforeEach(() => {
    store.dispatch(settingsChanged(defaultSettings));
  });

  test("allows our cards on our turn", () => {
    expect(draggablePlayerIndex(makeState())).toBe(OUR_PLAYER_INDEX);
  });

  test("allows our cards on another turn only with pre-playing enabled", () => {
    const state = makeState({ currentPlayerIndex: OTHER_PLAYER_INDEX });
    expect(draggablePlayerIndex(state)).toBeUndefined();

    store.dispatch(
      settingsChanged({
        ...defaultSettings,
        preplay: true,
      }),
    );
    expect(draggablePlayerIndex(state)).toBe(OUR_PLAYER_INDEX);
  });

  test("blocks dragging while a premove is queued or when spectating", () => {
    expect(
      draggablePlayerIndex(
        makeState({
          premove: {
            type: 0,
          },
        }),
      ),
    ).toBeUndefined();
    expect(draggablePlayerIndex(makeState({ playing: false }))).toBeUndefined();
  });

  test("allows only the hypothetical leader to drag the current player's cards", () => {
    const hypothetical = {};
    expect(
      draggablePlayerIndex(
        makeState({
          hypothetical,
          ownHypothetical: hypothetical,
        }),
      ),
    ).toBe(OTHER_PLAYER_INDEX);
    expect(
      draggablePlayerIndex(
        makeState({
          hypothetical,
          shared: {
            amLeader: false,
          },
        }),
      ),
    ).toBeUndefined();
  });
});
