import type { GameID, UserID } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { models } from "../models";
import { wsSend, wsSendAll, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";
import { commandChat } from "./commandChat";
import { commandChatPM } from "./commandChatPM";
import {
  commandHistoryFriendsGet,
  commandHistoryGet,
  commandHistoryGetSeed,
} from "./commandHistory";
import { commandInactive } from "./commandInactive";
import { commandSetting } from "./commandSetting";

jest.mock("../models", () => ({
  models: {
    games: {
      getGameIDsForUser: jest.fn(),
      getGameIDsForUserFriends: jest.fn(),
      getGameIDsForSeed: jest.fn(),
      getHistory: jest.fn(),
    },
    userSettings: { set: jest.fn() },
    chatLog: { insert: jest.fn() },
    chatLogPM: { insert: jest.fn() },
  },
}));
jest.mock("../identityToken", () => ({
  identityTokenRegenerate: jest.fn(),
}));
jest.mock("../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../wsHelpers", () => ({
  wsSend: jest.fn(),
  wsSendAll: jest.fn(),
  wsWarning: jest.fn(),
}));

const user = {
  connection: {},
  userID: 1 as UserID,
  username: "Alice",
  normalizedUsername: "alice",
  muted: false,
  friends: new Set([2 as UserID]),
  hyphenated: false,
  inactive: false,
} as WSUser;

describe("lobby command parity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (wsUsers as Map<UserID, WSUser>).clear();
    user.hyphenated = false;
    user.inactive = false;
    jest
      .mocked(models.games.getGameIDsForUser)
      .mockResolvedValue([10 as GameID]);
    jest.mocked(models.games.getGameIDsForUserFriends).mockResolvedValue([]);
    jest.mocked(models.games.getGameIDsForSeed).mockResolvedValue([]);
    jest.mocked(models.games.getHistory).mockResolvedValue([]);
    jest.mocked(models.userSettings.set).mockResolvedValue(undefined);
  });

  test("routes authenticated personal, friend and seed histories to the correct messages", async () => {
    await commandHistoryGet(user, { offset: 10, amount: 5 });
    expect(models.games.getGameIDsForUser).toHaveBeenCalledWith(
      user.userID,
      10,
      5,
    );
    expect(wsSend).toHaveBeenCalledWith(
      user.connection,
      ServerCommand.gameHistory,
      [],
    );
    await commandHistoryFriendsGet(user, { offset: 0, amount: 10 });
    expect(models.games.getGameIDsForUserFriends).toHaveBeenCalledWith(
      user.userID,
      user.friends,
      0,
      10,
    );
    expect(wsSend).toHaveBeenCalledWith(
      user.connection,
      ServerCommand.gameHistoryFriends,
      [],
    );
    await commandHistoryGetSeed(user, { seed: "p2v0s1", friends: true });
    expect(models.games.getHistory).toHaveBeenLastCalledWith([], "seed");
    expect(wsSend).toHaveBeenLastCalledWith(
      user.connection,
      ServerCommand.gameHistoryOtherScores,
      { games: [], variantName: "n/a", friends: true, seed: "p2v0s1" },
    );
  });

  test("rejects negative pagination and invalid seeds before querying", async () => {
    await commandHistoryGet(user, { offset: -1, amount: 10 });
    await commandHistoryFriendsGet(user, { offset: 0, amount: -1 });
    await commandHistoryGetSeed(user, { seed: "bad seed", friends: false });
    expect(models.games.getGameIDsForUser).not.toHaveBeenCalled();
    expect(models.games.getGameIDsForUserFriends).not.toHaveBeenCalled();
    expect(models.games.getGameIDsForSeed).not.toHaveBeenCalled();
    expect(wsWarning).toHaveBeenCalledTimes(3);
  });

  test("persists typed settings and supports fractional time and zero volume", async () => {
    await commandSetting(user, {
      name: "createTableTimeBaseMinutes",
      setting: "2.5",
    });
    expect(models.userSettings.set).toHaveBeenLastCalledWith(
      user.userID,
      "createTableTimeBaseMinutes",
      2.5,
    );
    await commandSetting(user, { name: "volume", setting: "0" });
    expect(models.userSettings.set).toHaveBeenLastCalledWith(
      user.userID,
      "volume",
      0,
    );
    await commandSetting(user, {
      name: "hyphenatedConventions",
      setting: "true",
    });
    expect(user.hyphenated).toBe(true);
    jest
      .mocked(models.userSettings.set)
      .mockRejectedValueOnce(new Error("storage failed"));
    await expect(
      commandSetting(user, {
        name: "hyphenatedConventions",
        setting: "false",
      }),
    ).rejects.toThrow("storage failed");
    expect(user.hyphenated).toBe(true);
  });

  test.each([
    ["soundTimer", "1"],
    ["volume", "101"],
    ["volume", "-1"],
    ["volume", "1.5"],
    ["createTableTimeBaseMinutes", "NaN"],
    ["createTableTimeBaseMinutes", "0"],
    ["unknownColumn", "true"],
  ])("rejects invalid %s=%s without persistence", async (name, setting) => {
    await commandSetting(user, { name, setting });
    expect(models.userSettings.set).not.toHaveBeenCalled();
    expect(wsWarning).toHaveBeenCalledTimes(1);
  });

  test("updates the same session object used in the user list", () => {
    commandInactive(user, { inactive: true });
    expect(user.inactive).toBe(true);
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.userInactive, {
      userID: user.userID,
      inactive: true,
    });
  });

  test("publishes lobby chat only after persistence, using its database ID and time", async () => {
    const stored = Promise.withResolvers<{
      chatID: number;
      datetimeSent: Date;
    }>();
    jest.mocked(models.chatLog.insert).mockReturnValueOnce(stored.promise);
    const pending = commandChat(user, {
      msg: "<b>hello</b>",
      room: "lobby",
      requestID: "browser-request",
    });
    expect(wsSendAll).not.toHaveBeenCalled();
    stored.resolve({
      chatID: 42,
      datetimeSent: new Date("2026-01-01T00:00:00Z"),
    });
    await pending;
    expect(models.chatLog.insert).toHaveBeenCalledWith(
      user.userID,
      "&lt;b&gt;hello&lt;/b&gt;",
      "lobby",
    );
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.chat, {
      msg: "&lt;b&gt;hello&lt;/b&gt;",
      who: "Alice",
      source: "user",
      room: "lobby",
      chatID: 42,
      datetime: "2026-01-01T00:00:00.000Z",
    });
  });

  test("failed lobby persistence does not publish phantom chat", async () => {
    jest
      .mocked(models.chatLog.insert)
      .mockRejectedValueOnce(new Error("storage failed"));
    await expect(
      commandChat(user, { msg: "hello", room: "lobby" }),
    ).rejects.toThrow("storage failed");
    expect(wsSendAll).not.toHaveBeenCalled();
  });

  test("normalizes PM recipients using Go chat rules and echoes the persisted message", async () => {
    const recipient = {
      ...user,
      userID: 2 as UserID,
      username: "Bob",
      normalizedUsername: "bob",
      connection: {},
    } as WSUser;
    (wsUsers as Map<UserID, WSUser>).set(recipient.userID, recipient);
    jest.mocked(models.chatLogPM.insert).mockResolvedValueOnce({
      pmID: 17,
      datetimeSent: new Date("2026-01-01T00:00:00Z"),
    });
    await commandChatPM(user, { msg: "<hello>", recipient: "B\no\tb" });
    expect(models.chatLogPM.insert).toHaveBeenCalledWith(
      user.userID,
      recipient.userID,
      "&lt;hello&gt;",
    );
    expect(wsSend).toHaveBeenCalledTimes(2);
    expect(wsSend).toHaveBeenLastCalledWith(
      recipient.connection,
      ServerCommand.chat,
      expect.objectContaining({
        pmID: 17,
        recipient: "Bob",
        msg: "&lt;hello&gt;",
      }),
    );
  });

  test("rejects blank PM recipients and escapes unknown names in warnings", async () => {
    await commandChatPM(user, { msg: "hello", recipient: "\t\n" });
    expect(wsWarning).toHaveBeenLastCalledWith(
      user.connection,
      "Chat messages cannot be blank.",
    );
    await commandChatPM(user, { msg: "hello", recipient: "<missing>" });
    expect(wsWarning).toHaveBeenLastCalledWith(
      user.connection,
      'User "&lt;missing&gt;" is not currently online.',
    );
    expect(models.chatLogPM.insert).not.toHaveBeenCalled();
    expect(wsSend).not.toHaveBeenCalled();
  });
});
