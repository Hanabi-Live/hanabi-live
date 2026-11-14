import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { State } from "./types/State.ts";

const send = vi.fn();
vi.mock("../Globals.ts", () => ({
  globals: { connection: { send }, joinedTableId: 42 },
}));
vi.mock("../notifications.ts", () => ({ send: vi.fn() }));
vi.mock("./ui/arrows.ts", () => ({ hideAll: vi.fn() }));
vi.mock("./ui/isOurTurn.ts", () => ({ isOurTurn: () => true }));
const { initialState } =
  await import("./reducers/initialStates/initialState.ts");
const { onOurTurn } = await import("./ourTurn.ts");
const { store } = await import("../store.ts");
const { gameStarted } = await import("./gameSlice.ts");

beforeEach(() => {
  vi.useFakeTimers();
  send.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

test("our turn sends the move that we queued, and clears it", () => {
  const state: State = {
    ...initialState(getDefaultMetadata(2)),
    premove: { type: "play", order: 3 as CardOrder },
  };
  store.dispatch(gameStarted(state));

  onOurTurn(state);

  expect(store.getState().game.current?.premove).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(send).toHaveBeenCalledWith("playerAction", {
    tableId: 42,
    action: { type: "play", order: 3 },
  });
});
