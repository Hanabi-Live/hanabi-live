import type { GameID, ServerCommandData, TableID } from "@hanabi-live/data";
import { ServerCommand, unpackWSMessage } from "@hanabi-live/data";
import { EndCondition, options } from "@hanabi-live/game";
import { expect, jest, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import { getWSMsg } from "./wsHelpers";

jest.mock("./logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

test("wire encoding preserves hidden identities and nullable termination votes", () => {
  const data: ServerCommandData[ServerCommand.gameActionList] = {
    tableID: 1 as TableID,
    list: [
      { type: "draw", playerIndex: 0, order: 0, suitIndex: -1, rank: -1 },
      // eslint-disable-next-line unicorn/no-null
      { type: "gameOver", endCondition: 1, playerIndex: -1, votes: null },
    ],
  };
  const message = getWSMsg(ServerCommand.gameActionList, data);
  assertDefined(message, "Missing validated wire message.");
  expect(unpackWSMessage(message)).toEqual(["gameActionList", data]);
});

test("wire history dates remain ISO strings and user text survives encoding", () => {
  const started = new Date("2020-01-01T00:00:00Z");
  const finished = new Date("2020-01-02T00:00:00Z");
  const row: ServerCommandData[ServerCommand.gameHistory][number] = {
    id: 42 as GameID,
    options: options.parse({}),
    seed: "p2v0s1",
    score: 25,
    numTurns: 25,
    endCondition: EndCondition.Normal,
    datetimeStarted: started,
    datetimeFinished: finished,
    numGamesOnThisSeed: 1,
    playerNames: ["Alice", "Bob"],
    incrementNumGames: true,
    tags: 'quotes " and backslash \\ and newline\n',
  };
  const message = getWSMsg(ServerCommand.gameHistory, [row]);
  assertDefined(message, "Missing validated history message.");
  expect(unpackWSMessage(message)).toEqual([
    "gameHistory",
    [
      {
        ...row,
        datetimeStarted: started.toISOString(),
        datetimeFinished: finished.toISOString(),
      },
    ],
  ]);
});
