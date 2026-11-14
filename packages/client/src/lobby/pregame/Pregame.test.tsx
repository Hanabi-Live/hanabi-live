// @vitest-environment jsdom

import { tableIdSchema, userIdSchema } from "@hanabi-live/data";
import { defaultOptions } from "@hanabi-live/game";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection.ts";
import { globals } from "../../Globals.ts";
import { friendsChanged, usernameChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import type { Table } from "../tables/tablesSlice.ts";
import { tableChanged } from "../tables/tablesSlice.ts";
import { userChanged } from "../users/usersSlice.ts";
import { Pregame } from "./Pregame.tsx";
import type { Game } from "./pregameSlice.ts";
import { gameChanged } from "./pregameSlice.ts";

const TABLE_ID = tableIdSchema.parse(5);

function player(
  userId: number,
  username: string,
  present: boolean,
): Game["players"][number] {
  return {
    userId: userIdSchema.parse(userId),
    username,
    present,
    stats: {
      numGames: 10,
      variant: {
        numGames: 4,
        // This player has not played 3-player games.
        bestScores: [
          {
            numPlayers: 2,
            score: 25,
            modified: false,
          },
        ],
      },
    },
  };
}

const game: Game = {
  tableId: TABLE_ID,
  settings: {
    name: "my table",
    maxPlayers: 5,
    options: {
      ...defaultOptions,
      speedrun: true,
    },
  },
  owner: {
    userId: userIdSchema.parse(1),
    username: "alice",
  },
  passwordProtected: true,
  players: [player(1, "alice", true), player(2, "bob", false)],
};

const table = {
  tableId: TABLE_ID,
  settings: game.settings,
  playerNames: ["alice", "bob"],
  spectators: [
    {
      username: "me",
      shadowingPlayerIndex: 1,
    },
    { username: "dave" },
  ],
} as unknown as Table;

const send = vi.fn();

beforeEach(() => {
  store.dispatch(usernameChanged("me"));
  store.dispatch(friendsChanged(["dave"]));
  globals.tableId = TABLE_ID;
  globals.conn = { send } as unknown as Connection;
  send.mockClear();
  store.dispatch(tableChanged(table));
  store.dispatch(
    userChanged({
      userId: userIdSchema.parse(1),
      username: "alice",
      activity: {
        type: "pregame",
        tableId: TABLE_ID,
      },
      hGroupConventions: true,
      hGroupLevel: 3,
      bot: false,
      inactive: false,
    }),
  );
  store.dispatch(gameChanged(game));
  render(
    <Provider store={store}>
      <Pregame />
    </Provider>,
  );
});

afterEach(() => {
  cleanup();
  store.dispatch(gameChanged(undefined));
});

describe("Pregame", () => {
  test("shows the table, its players, and its spectators", () => {
    expect(screen.getByText("my table")).toBeTruthy();
    expect(screen.getByText("2 / 5")).toBeTruthy();
    // The password and the speedrun option.
    expect(
      document.querySelectorAll("#lobby-pregame-options > li"),
    ).toHaveLength(2);

    const boxes = document.querySelectorAll('[id^="lobby-pregame-player-"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.textContent).toContain("2-player best score:25");
    expect(screen.getByText("Level 3").getAttribute("href")).toContain(
      "level-3",
    );
    expect(boxes[1]!.textContent).toContain("AWAY");

    const spectators = document.querySelector("#lobby-pregame-spectators")!;
    expect(spectators.textContent).toContain("me (\u{1F575}\u{FE0F} bob)");
    expect(screen.getByText("dave").className).toBe("tw:text-friend");
  });

  test("a spectator shadows a player, and stops shadowing them", () => {
    act(() => {
      screen.getByText("alice").click();
    });
    expect(send).toHaveBeenLastCalledWith("tableSpectate", {
      tableId: TABLE_ID,
      shadowingPlayerIndex: 0,
    });

    // We are already shadowing Bob.
    act(() => {
      screen.getByText("bob \u{1F575}\u{FE0F}").click();
    });
    expect(send).toHaveBeenLastCalledWith("tableSpectate", {
      tableId: TABLE_ID,
      shadowingPlayerIndex: undefined,
    });
  });
});
