// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GamesTable } from "./GamesTable.tsx";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** The paths of the requests for games, without their query strings. */
function gamePaths(): readonly string[] {
  return fetchMock.mock.calls
    .map(([url]) => pathOf(url))
    .filter((path) => path.startsWith("/api/v1/history"));
}

function pathOf(url: Parameters<typeof fetch>[0]): string {
  const text = url instanceof Request ? url.url : url.toString();
  return text.split("?", 1)[0]!;
}

async function renderHistory() {
  render(
    <GamesTable
      table={{
        type: "games",
        list: "history",
        apiPath: "/api/v1/history/Alice",
        frequencies: [],
        players: ["Alice"],
      }}
    />,
  );
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

async function typeTeammates(text: string) {
  fireEvent.change(screen.getByLabelText("With"), {
    target: {
      value: text,
    },
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

/** The server's reply to a request for a path. */
function respond(path: string): Response {
  if (path === "/api/v1/variants") {
    return json({ 0: "No Variant" });
  }
  if (path.endsWith("/Missing")) {
    return json({ message: 'No player is named "Missing".' }, 404);
  }
  return json({
    games: [],
    total: 0,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url) => {
    await Promise.resolve();
    return respond(pathOf(url));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("GamesTable", () => {
  test('"With" loads the games with the named players, without the owner or repeats', async () => {
    await renderHistory();
    await typeTeammates(" Bob, alice,carol ,BOB,");

    expect(gamePaths().at(-1)).toBe("/api/v1/history/Alice/Bob/carol");
  });

  test('"With" explains a name that no player has', async () => {
    await renderHistory();
    await typeTeammates("Missing");

    expect(screen.getByText('No player is named "Missing".')).toBeTruthy();
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });

  test('"With" does not load more players than a game has', async () => {
    await renderHistory();
    const requests = gamePaths().length;
    await typeTeammates("a, b, c, d, e, f");

    expect(screen.getByText("A game has at most 6 players.")).toBeTruthy();
    expect(gamePaths()).toHaveLength(requests);
  });
});
