import type { UserID } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { commandChat } from "./commands/commandChat";
import { wsError, wsSend, wsSendAll, wsWarning } from "./wsHelpers";
import { wsMessage } from "./wsMessage";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

jest.mock("./commands/commandChat", () => ({ commandChat: jest.fn() }));
jest.mock("./commands/commandChatPM", () => ({ commandChatPM: jest.fn() }));
jest.mock("./commands/commandChatPMHistoryGet", () => ({
  commandChatPMHistoryGet: jest.fn(),
}));
jest.mock("./logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./wsHelpers", () => ({
  wsError: jest.fn(),
  wsSend: jest.fn(),
  wsSendAll: jest.fn(),
  wsWarning: jest.fn(),
}));

const user = {
  userID: 1 as UserID,
  connection: { readyState: 1, OPEN: 1 },
} as WSUser;

describe("authenticated command dispatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (wsUsers as Map<UserID, WSUser>).clear();
    (wsUsers as Map<UserID, WSUser>).set(user.userID, user);
  });

  test("dispatches validated data only for the current authenticated session", async () => {
    const raw = Buffer.from('chat {"msg":"hello","room":"lobby"}');
    await wsMessage(user, raw);
    expect(commandChat).toHaveBeenCalledWith(user, {
      msg: "hello",
      room: "lobby",
    });
    jest.clearAllMocks();
    (wsUsers as Map<UserID, WSUser>).set(user.userID, { ...user });
    await wsMessage(user, raw);
    expect(commandChat).not.toHaveBeenCalled();
  });

  test("rejects malformed, unknown, and extra command fields explicitly", async () => {
    await wsMessage(user, Buffer.from(""));
    await wsMessage(user, Buffer.from('chat {"msg":2}'));
    await wsMessage(
      user,
      Buffer.from('chat {"msg":"hello","room":"lobby","userID":5}'),
    );
    await wsMessage(user, Buffer.from("unknown {}"));
    expect(commandChat).not.toHaveBeenCalled();
    expect(wsWarning).toHaveBeenCalledTimes(3);
    expect(wsError).toHaveBeenCalledTimes(1);
  });

  test("accepts request IDs attached by the existing browser to chat", async () => {
    await wsMessage(
      user,
      Buffer.from(
        'chat {"msg":"hello","room":"lobby","requestID":"browser-request"}',
      ),
    );
    expect(commandChat).toHaveBeenCalledWith(user, {
      msg: "hello",
      room: "lobby",
      requestID: "browser-request",
    });
  });

  test("accepts the payload-free name command and broadcasts authenticated presence", async () => {
    await wsMessage(user, Buffer.from("getName"));
    expect(wsSend).toHaveBeenCalledWith(user.connection, ServerCommand.name, {
      name: expect.any(String),
    });
    await wsMessage(user, Buffer.from('inactive {"inactive":true}'));
    expect(wsSendAll).toHaveBeenCalledWith(ServerCommand.userInactive, {
      userID: user.userID,
      inactive: true,
    });
    expect(user.inactive).toBe(true);
  });
});
