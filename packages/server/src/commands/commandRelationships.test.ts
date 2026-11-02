import type { UserID } from "@hanabi-live/data";
import { SERVER_COMMAND_SCHEMAS, ServerCommand } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { models } from "../models";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";
import {
  commandChatFriend,
  commandChatLink,
  commandChatLinked,
  commandChatPlayerInfo,
  commandChatUnfriend,
  commandChatUnlink,
} from "./commandRelationships";

jest.mock("../models", () => ({
  models: {
    users: { getByNormalizedUsername: jest.fn() },
    userFriends: { set: jest.fn(), getList: jest.fn() },
    userLinkages: { set: jest.fn(), getList: jest.fn() },
    games: { getNumGamesForUser: jest.fn() },
  },
}));
jest.mock("../wsHelpers", () => ({
  wsSend: jest.fn(),
  wsWarning: jest.fn(),
}));

const user = {
  userID: 1 as UserID,
  username: "Alice",
  connection: {},
  friends: new Set<UserID>(),
} as WSUser;
const peer = { id: 2 as UserID, username: "Bob" };
const data = { name: "bOB", room: "" };

describe("friend, link and player information commands", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    user.friends.clear();
    (wsUsers as Map<UserID, WSUser>).clear();
    jest.mocked(models.users.getByNormalizedUsername).mockResolvedValue(peer);
    jest.mocked(models.userFriends.set).mockResolvedValue(true);
    jest.mocked(models.userFriends.getList).mockResolvedValue(["Bob"]);
    jest.mocked(models.userLinkages.set).mockResolvedValue(true);
    jest.mocked(models.userLinkages.getList).mockResolvedValue([]);
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(7);
  });

  test("updates the active friend cache only after persistence and sends the list", async () => {
    const stored = Promise.withResolvers<boolean>();
    jest.mocked(models.userFriends.set).mockReturnValueOnce(stored.promise);
    const pending = commandChatFriend(user, data);
    expect(user.friends.size).toBe(0);
    expect(wsSend).not.toHaveBeenCalled();
    stored.resolve(true);
    await pending;
    expect(models.users.getByNormalizedUsername).toHaveBeenCalledWith("bob");
    expect(models.userFriends.set).toHaveBeenCalledWith(
      user.userID,
      peer.id,
      true,
    );
    expect(user.friends.has(peer.id)).toBe(true);
    expect(wsSend).toHaveBeenLastCalledWith(
      user.connection,
      ServerCommand.friends,
      {
        friends: ["Bob"],
      },
    );
    const notice = jest.mocked(wsSend).mock.calls[0]?.[2];
    expect(SERVER_COMMAND_SCHEMAS.chat.safeParse(notice).success).toBe(true);
    expect(notice).toMatchObject({
      source: "server",
      recipient: "Alice",
      room: "",
    });
  });

  test("updates a replacement session rather than leaving its friend cache stale", async () => {
    const replacement = { ...user, friends: new Set<UserID>() };
    (wsUsers as Map<UserID, WSUser>).set(user.userID, replacement);
    await commandChatFriend(user, data);
    expect(replacement.friends.has(peer.id)).toBe(true);
    await commandChatUnfriend(user, data);
    expect(replacement.friends.has(peer.id)).toBe(false);
    expect(models.userFriends.set).toHaveBeenLastCalledWith(
      user.userID,
      peer.id,
      false,
    );
  });

  test("does not mutate the friend cache or send success on a database failure", async () => {
    jest
      .mocked(models.userFriends.set)
      .mockRejectedValueOnce(new Error("storage failed"));
    await expect(commandChatFriend(user, data)).rejects.toThrow(
      "storage failed",
    );
    expect(user.friends.size).toBe(0);
    expect(wsSend).not.toHaveBeenCalled();
  });

  test("rejects self-targeting, missing names and unknown users before writes", async () => {
    await commandChatFriend(user, { name: "ALICE", room: "" });
    await commandChatLink(user, { name: "", room: "" });
    jest
      .mocked(models.users.getByNormalizedUsername)
      .mockResolvedValueOnce(undefined);
    await commandChatUnfriend(user, { name: "missing", room: "" });
    expect(models.userFriends.set).not.toHaveBeenCalled();
    expect(models.userLinkages.set).not.toHaveBeenCalled();
    expect(wsWarning).toHaveBeenCalledTimes(3);
  });

  test("reports duplicate links and supports unlinking and listing", async () => {
    jest.mocked(models.userLinkages.set).mockResolvedValueOnce(false);
    await commandChatLink(user, data);
    expect(wsWarning).toHaveBeenCalledWith(
      user.connection,
      '"bOB" is already linked to your account.',
    );
    expect(wsSend).not.toHaveBeenCalled();
    await commandChatUnlink(user, data);
    expect(models.userLinkages.set).toHaveBeenLastCalledWith(
      user.userID,
      peer.id,
      false,
    );
    jest
      .mocked(models.userLinkages.getList)
      .mockResolvedValueOnce(["Bob", "<legacy>"]);
    await commandChatLinked(user, { room: "" });
    expect(wsSend).toHaveBeenLastCalledWith(
      user.connection,
      ServerCommand.chat,
      expect.objectContaining({
        msg: "Currently linked accounts: Bob, &lt;legacy&gt;",
      }),
    );
  });

  test("player info excludes speedruns and uses the canonical profile URL", async () => {
    await commandChatPlayerInfo(user, data);
    expect(models.games.getNumGamesForUser).toHaveBeenCalledWith(
      peer.id,
      false,
    );
    expect(wsSend).toHaveBeenCalledWith(
      user.connection,
      ServerCommand.chat,
      expect.objectContaining({
        msg: '"bOB" has played 7 non-speedrun games. More stats <a href="/scores/Bob" target="_blank" rel="noopener noreferrer">here</a>.',
      }),
    );
  });
});
