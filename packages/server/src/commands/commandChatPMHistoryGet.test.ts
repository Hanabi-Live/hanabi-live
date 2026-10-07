import type { UserID } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { models } from "../models";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { commandChatPMHistoryGet } from "./commandChatPMHistoryGet";

jest.mock("../models", () => ({
  models: {
    users: {
      getIDByNormalizedUsername: jest.fn(),
    },
    chatLogPM: {
      getHistory: jest.fn(),
    },
  },
}));

jest.mock("../wsHelpers", () => ({
  wsSend: jest.fn(),
  wsWarning: jest.fn(),
}));

const wsUser = {
  connection: {},
  userID: 1 as UserID,
  username: "Ada",
  normalizedUsername: "ada",
} as WSUser;

const mockedGetIDByNormalizedUsername = jest.mocked(
  models.users.getIDByNormalizedUsername,
);
const mockedGetHistory = jest.mocked(models.chatLogPM.getHistory);
const mockedWSSend = jest.mocked(wsSend);
const mockedWSWarning = jest.mocked(wsWarning);

describe("commandChatPMHistoryGet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses the authenticated user and resolves an optional peer", async () => {
    const peerID = 2 as UserID;
    mockedGetIDByNormalizedUsername.mockResolvedValue(peerID);
    mockedGetHistory.mockResolvedValue({
      list: [],
      hasMore: false,
    });

    await commandChatPMHistoryGet(wsUser, {
      username: "Alice",
      amount: 15,
      beforeID: 42,
      room: "table123",
    });

    expect(mockedGetIDByNormalizedUsername).toHaveBeenCalledWith("alice");
    expect(mockedGetHistory).toHaveBeenCalledWith(
      wsUser.userID,
      15,
      42,
      peerID,
    );
    expect(mockedWSSend).toHaveBeenCalledWith(
      wsUser.connection,
      ServerCommand.chatPMHistory,
      {
        list: [],
        hasMore: false,
        room: "table123",
      },
    );
  });

  test("queries all PMs for the authenticated user without a peer", async () => {
    mockedGetHistory.mockResolvedValue({
      list: [],
      hasMore: false,
    });

    await commandChatPMHistoryGet(wsUser, { amount: 5 });

    expect(mockedGetIDByNormalizedUsername).not.toHaveBeenCalled();
    expect(mockedGetHistory).toHaveBeenCalledWith(
      wsUser.userID,
      5,
      undefined,
      undefined,
    );
  });

  test("warns instead of querying history for an unknown peer", async () => {
    mockedGetIDByNormalizedUsername.mockResolvedValue(undefined);

    await commandChatPMHistoryGet(wsUser, {
      username: "Missing",
      amount: 5,
    });

    expect(mockedWSWarning).toHaveBeenCalledWith(
      wsUser.connection,
      'User "Missing" does not exist.',
    );
    expect(mockedGetHistory).not.toHaveBeenCalled();
    expect(mockedWSSend).not.toHaveBeenCalled();
  });
});
