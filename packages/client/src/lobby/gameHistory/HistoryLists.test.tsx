// @vitest-environment jsdom

import type { GameHistoryEntry, ServerCommandData } from "@hanabi-live/data";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { globals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { HistoryList, OtherScoresList } from "./HistoryLists.tsx";
import {
  historyReceived,
  historyRequested,
  moreOtherScoresRequested,
  otherScoresReceived,
  otherScoresRequested,
} from "./historySlice.ts";

vi.mock("../history.ts", () => ({
  hide: vi.fn(),
  showMore: vi.fn(),
  showMoreOtherScores: vi.fn(),
  showOtherScoresFromHistory: vi.fn(),
}));

const OUR_GAME_PLAYERS = ["me", "bob"] as const;

function game(
  id: number,
  finished: string,
  playerNames: readonly string[] = OUR_GAME_PLAYERS,
) {
  return {
    gameId: id,
    finishedAt: finished,
    numGamesOnSeed: 1,
    options: { numPlayers: 2, variantName: "No Variant" },
    playerNames,
    score: 20,
    seed: `p2v0s${id}`,
  } as unknown as GameHistoryEntry;
}

function reply(
  seed: string,
  games: readonly GameHistoryEntry[],
  offset = 0,
  total = games.length,
) {
  return {
    seed,
    variantName: "No Variant",
    games,
    offset,
    total,
  } as ServerCommandData["gameHistoryOtherScores"];
}

function renderComponent(component: React.JSX.Element) {
  render(<Provider store={store}>{component}</Provider>);
}

function firstCells(): readonly string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("td")!.textContent);
}

beforeEach(() => {
  globals.username = "me";
});

afterEach(cleanup);

describe("HistoryList", () => {
  test("says that it is loading, then lists the newest games first", () => {
    globals.totalGames = 2;
    act(() => {
      store.dispatch(historyRequested());
    });
    renderComponent(<HistoryList />);
    expect(screen.getByText("Loading history...")).toBeDefined();

    act(() => {
      store.dispatch(
        historyReceived([
          game(1, "2026-01-01T00:00:00.000Z"),
          game(2, "2026-02-01T00:00:00.000Z"),
        ]),
      );
    });

    expect(firstCells()).toStrictEqual(["#2", "#1"]);
    expect(screen.getAllByText("bob")).toHaveLength(2);
    // Every game is shown, so there is no more history to ask for.
    expect(screen.queryByText("Show More History")).toBeNull();

    act(() => {
      globals.totalGames = 3;
    });
    expect(screen.getByText("Show More History")).toBeDefined();
  });
});

describe("OtherScoresList", () => {
  test("ignores a late reply for another seed and emphasizes our game", () => {
    const lateReply = reply("p2v0s1", [game(1, "2026-01-01T00:00:00.000Z")]);
    store.dispatch(otherScoresRequested("p2v0s7"));
    store.dispatch(otherScoresReceived(lateReply));
    renderComponent(<OtherScoresList />);
    expect(screen.getAllByRole("row")).toHaveLength(1);

    const ourReply = reply("p2v0s7", [
      game(7, "2026-01-01T00:00:00.000Z"),
      game(8, "2026-01-01T00:00:00.000Z", ["alice", "bob"]),
    ]);
    act(() => {
      store.dispatch(otherScoresReceived(ourReply));
    });

    expect(firstCells()).toStrictEqual(["#7", "#8"]);
    expect(screen.getByText("#7").tagName).toBe("STRONG");
    expect(screen.getByText("#8").tagName).toBe("TD");
    expect(screen.getByText("me, bob").tagName).toBe("STRONG");
  });

  test("adds each page after the games before it, until every game is shown", () => {
    const firstPage = reply(
      "p2v0s9",
      [game(1, "2026-01-01T00:00:00.000Z")],
      0,
      3,
    );
    store.dispatch(otherScoresRequested("p2v0s9"));
    store.dispatch(otherScoresReceived(firstPage));
    renderComponent(<OtherScoresList />);
    expect(firstCells()).toStrictEqual(["#1"]);
    expect(screen.getByText("Show More Scores")).toBeDefined();

    const secondPage = reply(
      "p2v0s9",
      [
        game(2, "2026-01-01T00:00:00.000Z"),
        game(3, "2026-01-01T00:00:00.000Z"),
      ],
      1,
      3,
    );
    act(() => {
      store.dispatch(moreOtherScoresRequested());
      store.dispatch(otherScoresReceived(secondPage));
      // A repeated reply replaces its page instead of adding it again.
      store.dispatch(otherScoresReceived(secondPage));
    });

    expect(firstCells()).toStrictEqual(["#1", "#2", "#3"]);
    expect(screen.queryByText("Show More Scores")).toBeNull();
  });
});
