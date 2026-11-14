import { tableIdSchema } from "@hanabi-live/data";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { Screen } from "./types/Screen.ts";

vi.mock("../Globals.ts", () => ({
  globals: {
    currentScreen: "Lobby",
    tableId: undefined,
  },
}));
vi.mock("../game/main.ts", () => ({ hide: vi.fn() }));
vi.mock("../game/ui/reactive/views/spectatorsView.ts", () => ({}));
vi.mock("../modals.ts", () => ({}));
vi.mock("../sounds.ts", () => ({}));
vi.mock("./history.ts", () => ({}));
vi.mock("./login.ts", () => ({}));
vi.mock("./playerSettings.ts", () => ({}));
vi.mock("./pregame/pregame.ts", () => ({ hide: vi.fn() }));
vi.mock("./url.ts", () => ({}));
const { globals } = await import("../Globals.ts");
const gameMain = await import("../game/main.ts");
const pregame = await import("./pregame/pregame.ts");
const { lobbyCommands } = await import("./lobbyCommands.ts");

const TABLE_ID = tableIdSchema.parse(1);

describe('the "tableLeft" command', () => {
  beforeEach(() => {
    vi.mocked(pregame.hide).mockClear();
    vi.mocked(gameMain.hide).mockClear();
    globals.tableId = TABLE_ID;
  });

  test.each([
    ["PreGame", 1, 0],
    ["Game", 0, 1],
    // The server also sends "tableLeft" after we leave a game or replay, which may return us to a
    // history screen rather than the lobby.
    ["History", 0, 0],
    ["HistoryOtherScores", 0, 0],
    ["Lobby", 0, 0],
  ] as const)(
    "on the %s screen hides the pre-game %i times and the game %i times",
    (screen, pregameCalls, gameCalls) => {
      store.dispatch(screenChanged(Screen[screen]));

      lobbyCommands.get("tableLeft")?.({ tableId: TABLE_ID });

      expect(pregame.hide).toHaveBeenCalledTimes(pregameCalls);
      expect(gameMain.hide).toHaveBeenCalledTimes(gameCalls);
      expect(globals.tableId).toBeUndefined();
    },
  );

  test("ignores a table that we are not at", () => {
    store.dispatch(screenChanged(Screen.Game));

    lobbyCommands.get("tableLeft")?.({ tableId: tableIdSchema.parse(2) });

    expect(gameMain.hide).not.toHaveBeenCalled();
    expect(globals.tableId).toBe(TABLE_ID);
  });
});
