import type { UserID } from "@hanabi-live/data";
import { ServerCommand, Status } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { WebSocket } from "ws";
import { getChatList } from "./chat";
import { cleanupDisconnectedTables } from "./commands/commandTable";
import { models } from "./models";
import type { SessionID } from "./types/SessionID";
import { wsSend, wsSendAll } from "./wsHelpers";
import { enqueueWSMsg, WSQueueElementType } from "./wsQueue";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

jest.mock("./logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./models", () => ({
  models: {
    games: {
      getNumGamesForUser: jest.fn(),
      getGameIDsForUser: jest.fn(),
      getGameIDsForUserFriends: jest.fn(),
      getHistory: jest.fn(),
    },
    users: { getDatetimeCreated: jest.fn() },
    userSettings: { get: jest.fn() },
    userFriends: { getList: jest.fn() },
  },
}));
jest.mock("./chat", () => ({ getChatList: jest.fn() }));
jest.mock("./motd", () => ({
  getMessageOfTheDay: jest
    .fn<() => Promise<undefined>>()
    .mockResolvedValue(undefined),
}));
jest.mock("./commands/commandTable", () => ({
  cleanupDisconnectedTables: jest.fn(),
}));
jest.mock("./words", () => ({ getRandomTableName: () => "Test table" }));
jest.mock("./wsHelpers", () => ({
  wsSend: jest.fn(),
  wsSendAll: jest.fn(),
  wsError: jest.fn(),
}));

function user(id = 1): WSUser & { close: () => void } {
  const close = jest.fn<() => void>();
  return {
    close,
    connection: {
      readyState: 1,
      OPEN: 1,
      close: () => {
        close();
      },
    } as WebSocket,
    sessionID: id as SessionID,
    userID: 1 as UserID,
    username: "Alice",
    normalizedUsername: "alice",
    ip: "127.0.0.1",
    muted: false,
    fakeUser: false,
    status: Status.Lobby,
    tableID: undefined,
    friends: new Set(),
    hyphenated: false,
    inactive: false,
  };
}

describe("WebSocket initialization ownership", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (wsUsers as Map<UserID, WSUser>).clear();
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(0);
    jest.mocked(models.games.getGameIDsForUser).mockResolvedValue([]);
    jest.mocked(models.games.getHistory).mockResolvedValue([]);
    jest.mocked(models.users.getDatetimeCreated).mockResolvedValue(new Date(0));
    jest.mocked(models.userSettings.get).mockResolvedValue(undefined);
    jest.mocked(models.userFriends.getList).mockResolvedValue([]);
    jest.mocked(getChatList).mockResolvedValue([]);
  });

  test("does not replace a healthy session or publish a partial failed login", async () => {
    const previous = user();
    await enqueueWSMsg(WSQueueElementType.Login, previous);
    jest.clearAllMocks();
    jest
      .mocked(models.games.getHistory)
      .mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      enqueueWSMsg(WSQueueElementType.Login, user(2)),
    ).rejects.toThrow("database unavailable");
    expect(wsUsers.get(previous.userID)).toBe(previous);
    expect(previous.close).not.toHaveBeenCalled();
    expect(wsSend).not.toHaveBeenCalled();
    expect(wsSendAll).not.toHaveBeenCalled();
  });

  test("retains the authenticated user object and rejects stale logout", async () => {
    const first = user();
    const second = user(2);
    await enqueueWSMsg(WSQueueElementType.Login, first);
    await enqueueWSMsg(WSQueueElementType.Login, second);
    expect(wsUsers.get(second.userID)).toBe(second);
    expect(first.close).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();
    await enqueueWSMsg(WSQueueElementType.Logout, first);
    expect(wsUsers.get(second.userID)).toBe(second);
    expect(cleanupDisconnectedTables).not.toHaveBeenCalled();
    expect(wsSendAll).not.toHaveBeenCalled();
    await enqueueWSMsg(WSQueueElementType.Logout, second);
    expect(wsUsers.has(second.userID)).toBe(false);
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.userLeft, {
      userID: second.userID,
    });
  });

  test("a slow older login cannot replace a newer initialized session", async () => {
    const delayed = Promise.withResolvers<number>();
    jest
      .mocked(models.games.getNumGamesForUser)
      .mockReturnValueOnce(delayed.promise);
    const older = user();
    const pending = enqueueWSMsg(WSQueueElementType.Login, older);
    const newer = user(2);
    await enqueueWSMsg(WSQueueElementType.Login, newer);
    delayed.resolve(0);
    await pending;
    expect(wsUsers.get(newer.userID)).toBe(newer);
    expect(newer.close).not.toHaveBeenCalled();
    expect(older.close).toHaveBeenCalledTimes(1);
  });

  test("reconnect probes send only welcome and do not load initial histories", async () => {
    const reconnecting = { ...user(), reconnect: true };
    await enqueueWSMsg(WSQueueElementType.Login, reconnecting);
    expect(jest.mocked(wsSend).mock.calls.map((call) => call[1])).toEqual([
      ServerCommand.welcome,
    ]);
    expect(wsSend).toHaveBeenCalledWith(
      reconnecting.connection,
      ServerCommand.welcome,
      expect.objectContaining({ connectionMode: "reconnect" }),
    );
    expect(getChatList).not.toHaveBeenCalled();
    expect(models.games.getGameIDsForUser).not.toHaveBeenCalled();
  });
});
