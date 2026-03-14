import type { UserID } from "@hanabi-live/data";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getCookieValue } from "../httpSession";
import {
  identityTokenIsExpired,
  identityTokenLookupHash,
  identityTokenPasswordHashMatches,
  identityTokenRegenerate,
} from "../identityToken";
import { logger } from "../logger";
import { models } from "../models";
import {
  httpIdentityLookup,
  httpIdentityTokenGet,
  httpIdentityTokenPost,
} from "./httpIdentity";

jest.mock("../httpSession", () => ({
  getCookieValue: jest.fn(),
}));

jest.mock("../identityToken", () => ({
  identityTokenIsExpired: jest.fn(),
  identityTokenLookupHash: jest.fn(),
  identityTokenPasswordHashMatches: jest.fn(),
  identityTokenRegenerate: jest.fn(),
}));

jest.mock("../logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock("../models", () => ({
  models: {
    users: {
      getUsername: jest.fn(),
    },
    userIdentityTokens: {
      getUsernameByTokenLookupHash: jest.fn(),
    },
  },
}));

const mockedGetCookieValue = jest.mocked(getCookieValue);
const mockedIdentityTokenRegenerate = jest.mocked(identityTokenRegenerate);
const mockedIdentityTokenLookupHash = jest.mocked(identityTokenLookupHash);
const mockedIdentityTokenIsExpired = jest.mocked(identityTokenIsExpired);
const mockedIdentityTokenPasswordHashMatches = jest.mocked(
  identityTokenPasswordHashMatches,
);
const mockedGetUsername = jest.mocked(models.users.getUsername);
const mockedGetUsernameByTokenLookupHash = jest.mocked(
  models.userIdentityTokens.getUsernameByTokenLookupHash,
);
const mockedLoggerError = jest.mocked(logger.error);

function toUserID(userID: number): UserID {
  return userID as UserID;
}

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

describe("identity token API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 for token generation when not logged in", async () => {
    mockedGetCookieValue.mockReturnValue(undefined);

    const request = {} as FastifyRequest;
    const rec = createReplyRecorder();

    await httpIdentityTokenGet(request, rec.reply);

    expect(rec.statusCode).toBe(401);
    expect(rec.payload).toEqual({ error: "You must be logged in." });
  });

  test("returns token payload for GET generation", async () => {
    const expiresAt = new Date("2026-03-07T00:00:00Z");
    mockedGetCookieValue.mockReturnValue(toUserID(42));
    mockedGetUsername.mockResolvedValue("test-user");
    mockedIdentityTokenRegenerate.mockResolvedValue({
      token: "token-1",
      expiresAt,
      tokenHash: "hash",
      tokenLookupHash: "lookup",
    });

    const request = {} as FastifyRequest;
    const rec = createReplyRecorder();

    await httpIdentityTokenGet(request, rec.reply);

    expect(rec.statusCode).toBeUndefined();
    expect(rec.payload).toEqual({
      username: "test-user",
      token: "token-1",
      expires_at: expiresAt.toUTCString(),
    });
  });

  test("returns token payload for POST regeneration", async () => {
    const expiresAt = new Date("2026-03-08T00:00:00Z");
    mockedGetCookieValue.mockReturnValue(toUserID(42));
    mockedGetUsername.mockResolvedValue("test-user");
    mockedIdentityTokenRegenerate.mockResolvedValue({
      token: "token-2",
      expiresAt,
      tokenHash: "hash",
      tokenLookupHash: "lookup",
    });

    const request = {} as FastifyRequest;
    const rec = createReplyRecorder();

    await httpIdentityTokenPost(request, rec.reply);

    expect(rec.statusCode).toBeUndefined();
    expect(rec.payload).toEqual({
      username: "test-user",
      token: "token-2",
      expires_at: expiresAt.toUTCString(),
    });
  });

  test("returns 500 for generation errors", async () => {
    mockedGetCookieValue.mockReturnValue(toUserID(42));
    mockedGetUsername.mockResolvedValue("test-user");
    mockedIdentityTokenRegenerate.mockRejectedValue(new Error("boom"));

    const request = {} as FastifyRequest;
    const rec = createReplyRecorder();

    await httpIdentityTokenPost(request, rec.reply);

    expect(rec.statusCode).toBe(500);
    expect(rec.payload).toEqual({ error: "Internal Server Error" });
    expect(mockedLoggerError).toHaveBeenCalled();
  });

  test("returns 400 when lookup token is missing", async () => {
    const request = { body: { token: "" } } as FastifyRequest<{
      Body: { token: string };
    }>;
    const rec = createReplyRecorder();

    await httpIdentityLookup(request, rec.reply);

    expect(rec.statusCode).toBe(400);
    expect(rec.payload).toEqual({ error: "Missing identity token." });
  });

  test("returns 404 when lookup hash is not found", async () => {
    mockedIdentityTokenLookupHash.mockReturnValue("lookup-hash");
    mockedGetUsernameByTokenLookupHash.mockResolvedValue(undefined);

    const request = { body: { token: "valid-token" } } as FastifyRequest<{
      Body: { token: string };
    }>;
    const rec = createReplyRecorder();

    await httpIdentityLookup(request, rec.reply);

    expect(rec.statusCode).toBe(404);
    expect(rec.payload).toEqual({ error: "Identity token not found." });
  });

  test("returns 404 when token is expired", async () => {
    mockedIdentityTokenLookupHash.mockReturnValue("lookup-hash");
    mockedGetUsernameByTokenLookupHash.mockResolvedValue({
      username: "test-user",
      tokenHash: "stored-hash",
      expiresAt: new Date("2026-03-01T00:00:00Z"),
    });
    mockedIdentityTokenIsExpired.mockReturnValue(true);

    const request = { body: { token: "valid-token" } } as FastifyRequest<{
      Body: { token: string };
    }>;
    const rec = createReplyRecorder();

    await httpIdentityLookup(request, rec.reply);

    expect(rec.statusCode).toBe(404);
    expect(rec.payload).toEqual({ error: "Identity token not found." });
  });

  test("returns 404 when hash comparison fails", async () => {
    mockedIdentityTokenLookupHash.mockReturnValue("lookup-hash");
    mockedGetUsernameByTokenLookupHash.mockResolvedValue({
      username: "test-user",
      tokenHash: "stored-hash",
      expiresAt: new Date("2026-03-08T00:00:00Z"),
    });
    mockedIdentityTokenIsExpired.mockReturnValue(false);
    mockedIdentityTokenPasswordHashMatches.mockResolvedValue(false);

    const request = { body: { token: "valid-token" } } as FastifyRequest<{
      Body: { token: string };
    }>;
    const rec = createReplyRecorder();

    await httpIdentityLookup(request, rec.reply);

    expect(rec.statusCode).toBe(404);
    expect(rec.payload).toEqual({ error: "Identity token not found." });
  });

  test("returns username for valid lookup token", async () => {
    const token = "a".repeat(128);
    mockedIdentityTokenLookupHash.mockReturnValue("lookup-hash");
    mockedGetUsernameByTokenLookupHash.mockResolvedValue({
      username: "test-user",
      tokenHash: "stored-hash",
      expiresAt: new Date("2026-03-08T00:00:00Z"),
    });
    mockedIdentityTokenIsExpired.mockReturnValue(false);
    mockedIdentityTokenPasswordHashMatches.mockResolvedValue(true);

    const request = { body: { token } } as FastifyRequest<{
      Body: { token: string };
    }>;
    const rec = createReplyRecorder();

    await httpIdentityLookup(request, rec.reply);

    expect(mockedIdentityTokenLookupHash).toHaveBeenCalledWith(token);
    expect(rec.statusCode).toBeUndefined();
    expect(rec.payload).toEqual({ username: "test-user" });
  });
});
