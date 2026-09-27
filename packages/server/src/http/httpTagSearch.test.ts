import type { GameID } from "@hanabi-live/data";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { FastifyReply, FastifyRequest } from "fastify";
import { models } from "../models";
import { sanitizeTag } from "../tagUtils";
import { httpAPITagSearch } from "./httpTagSearch";

jest.mock("../models", () => ({
  models: {
    gameTags: { getGameIDsForTag: jest.fn() },
    games: { getHistory: jest.fn() },
  },
}));
jest.mock("../logger", () => ({ logger: { error: jest.fn() } }));

const getGameIDsForTag = jest.mocked(models.gameTags.getGameIDsForTag);
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

function makeRequest(tag: string): FastifyRequest<{ Params: { tag: string } }> {
  return { params: { tag } } as FastifyRequest<{ Params: { tag: string } }>;
}

describe("tag search API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns matching games regardless of tag author and preserves history tags", async () => {
    const gameID = 15 as GameID;
    const matchingGame = { id: gameID, tags: "alice tag, bob tag" };
    // Duplicate IDs represent multiple users attaching this same tag to one game.
    getGameIDsForTag.mockResolvedValue([gameID, gameID]);
    getHistory.mockResolvedValue([
      { id: 8 as GameID, tags: "older game tags" },
      matchingGame,
    ] as never);
    const rec = createReplyRecorder();

    await httpAPITagSearch(makeRequest("shared tag"), rec.reply);

    expect(getGameIDsForTag).toHaveBeenCalledWith("shared tag");
    expect(getHistory).toHaveBeenCalledWith([gameID]);
    expect(rec.payload).toEqual([
      matchingGame,
      { id: 8 as GameID, tags: "older game tags" },
    ]);
  });

  test("normalizes case, transliteration, and non-space whitespace", async () => {
    getGameIDsForTag.mockResolvedValue([]);
    getHistory.mockResolvedValue([]);
    const rec = createReplyRecorder();

    await httpAPITagSearch(makeRequest("  CAF\u00C9\u00A0Tag  "), rec.reply);

    expect(getGameIDsForTag).toHaveBeenCalledWith("cafe tag");
    expect(rec.payload).toEqual([]);
  });

  test("returns an empty array when no games match", async () => {
    getGameIDsForTag.mockResolvedValue([]);
    getHistory.mockResolvedValue([]);
    const rec = createReplyRecorder();

    await httpAPITagSearch(makeRequest("absent"), rec.reply);

    expect(rec.payload).toEqual([]);
  });

  test("rejects blank and overlong tags with 404 validation responses", async () => {
    const blankRec = createReplyRecorder();
    await httpAPITagSearch(makeRequest(" \u00A0 "), blankRec.reply);
    expect(blankRec.statusCode).toBe(404);
    expect(blankRec.payload).toBe("Tags cannot be blank.");

    const longRec = createReplyRecorder();
    await httpAPITagSearch(makeRequest("x".repeat(101)), longRec.reply);
    expect(longRec.statusCode).toBe(404);
    expect(longRec.payload).toBe("Tags cannot be longer than 100 characters.");
    expect(getGameIDsForTag).not.toHaveBeenCalled();
  });

  test("sanitizeTag preserves the Go behavior for invalid UTF-16 input", () => {
    expect(sanitizeTag("\uD800")).toEqual({
      error: "Tags must contain valid UTF8 characters.",
    });
  });
});
