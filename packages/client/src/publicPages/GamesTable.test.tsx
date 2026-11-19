// @vitest-environment jsdom

import { gameSummarySchema } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GameActions } from "./GamesTable.tsx";
import { GamesTable } from "./GamesTable.tsx";

const fetchMock = vi.fn<typeof fetch>();

const GAME = gameSummarySchema.parse({
  gameId: 7,
  options: {},
  seed: "p2v0s1",
  score: 20,
  numTurns: 30,
  endCondition: "normal",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T01:00:00.000Z",
  numGamesOnSeed: 3,
  playerNames: ["Alice", "Bob"],
  tags: [],
});

function urlOf(url: Parameters<typeof fetch>[0]): URL {
  const text = url instanceof Request ? url.url : url.toString();
  return new URL(text, "https://hanab.live");
}

/** A filter of the last request for games, or undefined if it had none. */
function lastFilter(name: "variant" | "player"): string | undefined {
  const [url] = fetchMock.mock.calls.at(-1)!;
  return urlOf(url).searchParams.get(`filter[${name}]`) ?? undefined;
}

async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

async function renderHistory(actions?: GameActions) {
  render(
    <GamesTable
      actions={actions}
      table={{
        type: "games",
        list: "history",
        apiPath: "/api/v1/history/Alice",
        frequencies: [],
        players: ["Alice"],
      }}
    />,
  );
  await settle();
}

function box(name: "Variant" | "With"): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name);
}

/** The suggestions that the Variant box shows. */
function suggestions(): readonly HTMLElement[] {
  return within(screen.getByRole("listbox", { hidden: true })).queryAllByRole(
    "option",
  );
}

async function type(name: "Variant" | "With", text: string) {
  fireEvent.focus(box(name));
  fireEvent.change(box(name), {
    target: {
      value: text,
    },
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => {
    await Promise.resolve();
    return Response.json({
      games: [GAME],
      total: 1,
    });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("GamesTable", () => {
  test("the Variant and With boxes send their trimmed text to the server", async () => {
    await renderHistory();
    await type("Variant", "  rain ");
    await type("With", " Bob, carol ");

    expect(lastFilter("variant")).toBe("rain");
    expect(lastFilter("player")).toBe("Bob, carol");
  });

  test("a picked variant name fills the Variant box", async () => {
    await renderHistory();
    await type("Variant", "rainbow");
    const [first] = suggestions();
    const name = first!.textContent;
    expect(name.toLowerCase()).toContain("rainbow");

    fireEvent.keyDown(box("Variant"), { key: "ArrowDown" });
    fireEvent.keyDown(box("Variant"), { key: "Enter" });
    await settle();

    expect(box("Variant").value).toBe(name);
    expect(lastFilter("variant")).toBe(name);
    expect(suggestions()).toHaveLength(0);
  });

  test("the buttons are links, which the lobby's actions take over", async () => {
    const actions = {
      watchReplay: vi.fn(),
      showOtherGames: vi.fn(),
    };
    await renderHistory(actions);
    const replay = screen.getByRole("link", { name: "Replay" });
    expect(replay.getAttribute("href")).toBe("/replay/7");

    fireEvent.click(replay);
    fireEvent.click(
      screen.getByRole("link", { name: "Watch in a shared replay" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Other scores: 2" }));

    expect(actions.watchReplay.mock.calls).toEqual([
      [7, false],
      [7, true],
    ]);
    expect(actions.showOtherGames).toHaveBeenCalledWith("p2v0s1");
  });
});
