import { tableIdSchema } from "@hanabi-live/data";
import { describe, expect, test, vi } from "vitest";
import { Screen } from "./types/Screen";

vi.mock("../Globals", () => ({ globals: { currentScreen: "Lobby" } }));
vi.mock("../game/main", () => ({}));
vi.mock("../game/ui/reactive/views/spectatorsView", () => ({}));
vi.mock("../modals", () => ({}));
vi.mock("../sounds", () => ({}));
vi.mock("./history", () => ({}));
vi.mock("./login", () => ({}));
vi.mock("./playerSettings", () => ({}));
vi.mock("./pregame", () => ({ hide: vi.fn() }));
vi.mock("./tablesDraw", () => ({ tablesDraw: vi.fn() }));
vi.mock("./url", () => ({}));
const { globals } = await import("../Globals");
const pregame = await import("./pregame");
const { lobbyCommands } = await import("./lobbyCommands");

describe('the "left" command', () => {
  test.each([
    ["PreGame", 1],
    // The server also sends "left" after we leave a game or replay, which may return us to a
    // history screen rather than the lobby.
    ["History", 0],
    ["HistoryOtherScores", 0],
    ["Lobby", 0],
  ] as const)(
    "on the %s screen hides the pre-game %i times",
    (screen, calls) => {
      vi.mocked(pregame.hide).mockClear();
      globals.currentScreen = Screen[screen];

      lobbyCommands.get("left")?.({ tableID: tableIdSchema.parse(1) });

      expect(pregame.hide).toHaveBeenCalledTimes(calls);
    },
  );
});
