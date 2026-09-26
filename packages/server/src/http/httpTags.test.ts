import type { GameID, UserID } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { FastifyReply, FastifyRequest } from "fastify";
import { models } from "../models";
import { httpAPITags } from "./httpTags";

jest.mock("../models", () => ({
  models: {
    users: { getIDByNormalizedUsername: jest.fn() },
    gameTags: { getForUser: jest.fn() },
    games: { getHistory: jest.fn() },
  },
}));
jest.mock("../logger", () => ({ logger: { error: jest.fn() } }));

const getUserID = jest.mocked(models.users.getIDByNormalizedUsername);
const getTags = jest.mocked(models.gameTags.getForUser);
const getHistory = jest.mocked(models.games.getHistory);

function createReplyRecorder(): {
  reply: FastifyReply;
  statusCode: number | undefined;
  payload: unknown;
} {
  let statusCode: number | undefined;
  let payload: unknown;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(data: unknown) {
      payload = data;
      return this;
    },
  } as unknown as FastifyReply;
  return {
    reply,
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };
}

function historyRecord(id: number) {
  return {
    id: id as GameID,
    tags: "other user's tag",
  };
}

describe("tagged games API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns only the user's sorted tags on all tagged games", async () => {
    getUserID.mockResolvedValue(7 as UserID);
    getTags.mockResolvedValue([
      { gameID: 10 as GameID, tag: "second" },
      { gameID: 10 as GameID, tag: "first" },
      { gameID: 20 as GameID, tag: "zeta" },
    ]);
    getHistory.mockResolvedValue([
      historyRecord(10),
      historyRecord(20),
    ] as never);
    const request = {
      params: { player1: "ALICE" },
    } as FastifyRequest<{ Params: { player1: string } }>;
    const rec = createReplyRecorder();

    await httpAPITags(request, rec.reply);

    expect(getUserID).toHaveBeenCalledWith("alice");
    expect(getHistory).toHaveBeenCalledWith([10, 20] as GameID[]);
    expect(rec.payload).toEqual([
      { id: 20 as GameID, tags: "zeta" },
      { id: 10 as GameID, tags: "first, second" },
    ]);
  });

  test("normalizes usernames without trimming surrounding whitespace", async () => {
    getUserID.mockResolvedValue(undefined);
    const rec = createReplyRecorder();

    await httpAPITags(
      { params: { player1: " Alice " } } as FastifyRequest<{
        Params: { player1: string };
      }>,
      rec.reply,
    );

    expect(getUserID).toHaveBeenCalledWith(" alice ");
    expect(rec.statusCode).toBe(404);
  });

  test("returns an empty array for an existing user with no tags", async () => {
    getUserID.mockResolvedValue(7 as UserID);
    getTags.mockResolvedValue([]);
    getHistory.mockResolvedValue([]);
    const rec = createReplyRecorder();

    await httpAPITags(
      { params: { player1: "alice" } } as FastifyRequest<{
        Params: { player1: string };
      }>,
      rec.reply,
    );

    expect(getHistory).toHaveBeenCalledWith([]);
    expect(rec.payload).toEqual([]);
  });

  test("returns 404 for an unknown user", async () => {
    getUserID.mockResolvedValue(undefined);
    const rec = createReplyRecorder();

    await httpAPITags(
      { params: { player1: "missing" } } as FastifyRequest<{
        Params: { player1: string };
      }>,
      rec.reply,
    );

    expect(rec.statusCode).toBe(404);
    expect(getTags).not.toHaveBeenCalled();
  });
});
