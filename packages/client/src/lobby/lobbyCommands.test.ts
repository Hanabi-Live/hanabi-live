import { tableIdSchema } from "@hanabi-live/data";
import { describe, expect, test, vi } from "vitest";
import { Screen } from "./types/Screen.ts";

vi.mock("../Globals.ts", () => ({ globals: { currentScreen: "Lobby" } }));
vi.mock("../game/main.ts", () => ({}));
vi.mock("../game/ui/reactive/views/spectatorsView.ts", () => ({}));
vi.mock("../modals.ts", () => ({}));
vi.mock("../sounds.ts", () => ({}));
vi.mock("./history.ts", () => ({}));
vi.mock("./login.ts", () => ({}));
vi.mock("./playerSettings.ts", () => ({}));
vi.mock("./pregame/pregame.ts", () => ({ hide: vi.fn() }));
vi.mock("./url.ts", () => ({}));
const { globals } = await import("../Globals.ts");
const pregame = await import("./pregame/pregame.ts");
const { lobbyCommands } = await import("./lobbyCommands.ts");

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

      lobbyCommands.get("left")?.({ tableId: tableIdSchema.parse(1) });

      expect(pregame.hide).toHaveBeenCalledTimes(calls);
    },
  );
});
