// Database fixtures intentionally exercise nullable legacy password fields.
// cspell:words addext keyout
/* eslint-disable unicorn/no-null */
import type { UserID } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import * as argon2 from "argon2";
import { assertDefined } from "complete-common";
import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs, { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { promisify } from "node:util";
import type { pino } from "pino";
import { WebSocket } from "ws";
import { z } from "zod";
import { env } from "./env";
import { createHTTPServer } from "./http";
import { models } from "./models";
import { decodeSessionCookie, SESSION_COOKIE_NAME } from "./sessionCookie";

jest.mock("./env", () => ({
  env: {
    DOMAIN: "localhost",
    SESSION_SECRET: "synthetic-session-key-".repeat(8),
    TLS_CERT_FILE: "",
    TLS_KEY_FILE: "",
  },
  IS_DEV: true,
}));
jest.mock("./logger", () => {
  const actual = jest.requireActual<{ pino: typeof pino }>("pino");
  return { logger: actual.pino({ level: "error" }) };
});
jest.mock("./models", () => ({
  models: {
    bannedIPs: { check: jest.fn() },
    users: {
      get: jest.fn(),
      create: jest.fn(),
      getSimilarUsername: jest.fn(),
      setPassword: jest.fn(),
      getUsername: jest.fn(),
      setLastLogin: jest.fn(),
      getWSData: jest.fn(),
      getDatetimeCreated: jest.fn(),
    },
    games: {
      getNumGamesForUser: jest.fn(),
      getGameIDsForUser: jest.fn(),
      getHistory: jest.fn(),
    },
    userSettings: { get: jest.fn() },
    userFriends: { getList: jest.fn() },
    chatLog: { get: jest.fn(), insert: jest.fn() },
  },
}));
jest.mock("./motd", () => ({
  getMessageOfTheDay: jest.fn(),
}));
jest.mock("./version", () => ({
  getClientVersion: () => 1,
}));
jest.mock("./redis", () => ({
  getRedisTablesWithUser: jest
    .fn<() => Promise<readonly never[]>>()
    .mockResolvedValue([]),
}));

const filename = path.resolve(
  __dirname,
  "../../../server/src/testdata/session_protocol.json",
);
const sampleSchema = z.object({
  userID: z.number(),
  timestamp: z.number(),
  cookie: z.string(),
});
const corpusSchema = z.object({
  key: z.string(),
  samples: z.array(sampleSchema),
});
const corpus = corpusSchema.parse(JSON.parse(readFileSync(filename, "utf8")));
const sample = corpus.samples.find((row) => row.userID === 42);
assertDefined(sample, "Missing synthetic Go session fixture.");

// Synthetic fixture from the old Go password implementation.
// cspell:disable
const LEGACY_HASH =
  "$argon2id$v=19$m=65536,t=1,p=2$HSb5x/B2rWrD/KfnvZ6g/Q$4I9HT3Tlhv7K5qAbHhfODmW0d8aL4tmlfkw4dOOsX2s";
// cspell:enable

const credentials = {
  username: "Alice",
  password: "compatibility-password",
  version: "bot",
};
let app: FastifyInstance | undefined;
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

describe("actual HTTP authentication entry point", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.SESSION_SECRET = corpus.key;
    env.TLS_CERT_FILE = "";
    env.TLS_KEY_FILE = "";
    jest.spyOn(Date, "now").mockReturnValue(sample.timestamp * 1000);
    jest.mocked(models.bannedIPs.check).mockResolvedValue(false);
    jest.mocked(models.users.get).mockResolvedValue({
      id: 42 as UserID,
      username: "Alice",
      passwordHash: LEGACY_HASH,
      oldPasswordHash: null,
    });
    jest.mocked(models.users.getUsername).mockResolvedValue("Alice");
    jest.mocked(models.users.setLastLogin).mockResolvedValue(undefined);
    jest.mocked(models.users.getWSData).mockResolvedValue({
      username: "Alice",
      normalizedUsername: "alice",
      hyphenated: false,
      friends: new Set<UserID>(),
      muted: false,
    });
    jest.mocked(models.users.getDatetimeCreated).mockResolvedValue(new Date(0));
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(0);
    jest.mocked(models.games.getGameIDsForUser).mockResolvedValue([]);
    jest.mocked(models.games.getHistory).mockResolvedValue([]);
    jest.mocked(models.userSettings.get).mockResolvedValue(undefined);
    jest.mocked(models.userFriends.getList).mockResolvedValue([]);
    jest.mocked(models.chatLog.get).mockResolvedValue([]);
    jest.mocked(models.users.setPassword).mockResolvedValue(undefined);
    jest.mocked(models.users.getSimilarUsername).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await setImmediate();
    jest.restoreAllMocks();
  });

  test("accepts Go cookies, issues matching cookies on login, and expires logout cookies", async () => {
    app = await createHTTPServer();
    const empty = await app.inject({ url: "/test-cookie" });
    expect(empty.statusCode).toBe(204);
    const existing = await app.inject({
      url: "/test-cookie",
      cookies: { [SESSION_COOKIE_NAME]: sample.cookie },
    });
    expect(existing.statusCode).toBe(200);
    const login = await app.inject({
      method: "POST",
      url: "/login",
      payload: new URLSearchParams(credentials).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find(
      (value) => value.name === SESSION_COOKIE_NAME,
    );
    assertDefined(cookie, "Login did not issue a session cookie.");
    expect(cookie.value).toBe(sample.cookie);
    const logout = await app.inject({
      url: "/logout",
      cookies: { [SESSION_COOKIE_NAME]: cookie.value },
    });
    expect(logout.statusCode).toBe(301);
    expect(logout.headers["cache-control"]).toBe("no-store");
    expect(logout.cookies[0]?.value).toBe("");
  });

  test("rejects a wrong password and exposes no cookie or account details", async () => {
    app = await createHTTPServer();
    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: { ...credentials, password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).toBe("That is not the correct password.");
    expect(response.cookies).toEqual([]);
    expect(models.users.setPassword).not.toHaveBeenCalled();
  });

  test("accepts the paired client version and rejects stale versions before authentication", async () => {
    app = await createHTTPServer();
    const stale = await app.inject({
      method: "POST",
      url: "/login",
      payload: { ...credentials, version: "2" },
    });
    expect(stale.statusCode).toBe(401);
    expect(models.users.get).not.toHaveBeenCalled();
    const current = await app.inject({
      method: "POST",
      url: "/login",
      payload: { ...credentials, version: "1" },
    });
    expect(current.statusCode).toBe(200);
  });

  test("upgrades an authenticated SHA-256 password before issuing a cookie", async () => {
    jest.mocked(models.users.get).mockResolvedValue({
      id: 42 as UserID,
      username: "Alice",
      passwordHash: null,
      oldPasswordHash: createHash("sha256")
        .update(`Hanabi password ${credentials.password}`)
        .digest("hex"),
    });
    app = await createHTTPServer();
    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: credentials,
    });
    expect(response.statusCode).toBe(200);
    const hash = jest.mocked(models.users.setPassword).mock.calls[0]?.[1];
    assertDefined(hash, "Legacy login did not update its password hash.");
    expect(await argon2.verify(hash, credentials.password)).toBe(true);
    expect(response.cookies).toHaveLength(1);
  });

  test("allows an empty password-change field for registration and preserves Go normalization", async () => {
    jest.mocked(models.users.get).mockResolvedValue(undefined);
    jest.mocked(models.users.create).mockResolvedValue({
      id: 17 as UserID,
      username: "\u{4F60}\u{597D}",
      passwordHash: LEGACY_HASH,
      oldPasswordHash: null,
    });
    app = await createHTTPServer();
    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: {
        ...credentials,
        username: "\u{4F60}\u{597D}",
        newPassword: "",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(models.users.getSimilarUsername).toHaveBeenCalledWith("ni hao ");
    const call = jest.mocked(models.users.create).mock.calls[0];
    assertDefined(call, "Registration did not persist the account.");
    expect(call[0]).toBe("\u{4F60}\u{597D}");
    expect(call[1]).toBe("ni hao ");
    expect(await argon2.verify(call[2], credentials.password)).toBe(true);
    const cookie = response.cookies[0];
    assertDefined(cookie, "Registration did not issue a cookie.");
    expect(decodeSessionCookie(cookie.value, corpus.key)).toBe(17);
  });

  test("checks current bans and orphaned cookies before upgrading WebSockets", async () => {
    app = await createHTTPServer();
    jest.mocked(models.bannedIPs.check).mockResolvedValueOnce(true);
    const banned = await app.inject({
      method: "POST",
      url: "/login",
      payload: credentials,
    });
    expect(banned.statusCode).toBe(401);
    expect(models.users.get).not.toHaveBeenCalled();
    jest.mocked(models.users.getUsername).mockResolvedValueOnce(undefined);
    const orphan = await app.inject({
      url: "/ws",
      cookies: { [SESSION_COOKIE_NAME]: sample.cookie },
    });
    expect(orphan.statusCode).toBe(401);
    expect(orphan.cookies[0]?.value).toBe("");
    expect(models.users.getWSData).not.toHaveBeenCalled();
  });

  test("authenticates the real WebSocket route and accepts ordinary chat larger than 123 bytes", async () => {
    app = await createHTTPServer();
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const closed = Promise.withResolvers<undefined>();
    app.websocketServer.once("connection", (peer) => {
      peer.once("close", () => {
        closed.resolve(undefined);
      });
    });
    jest.mocked(models.chatLog.insert).mockResolvedValue({
      chatID: 1,
      datetimeSent: new Date(0),
    });
    const socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${sample.cookie}` },
    });
    const welcome = Promise.withResolvers<undefined>();
    const chat = Promise.withResolvers<undefined>();
    socket.on("message", (raw) => {
      if (!Buffer.isBuffer(raw)) {
        throw new TypeError("Expected a text WebSocket frame.");
      }
      const message = raw.toString();
      if (message.startsWith("welcome ")) {
        welcome.resolve(undefined);
      }
      if (message.startsWith("chat ") && message.includes('"chatID":1')) {
        chat.resolve(undefined);
      }
    });
    try {
      await once(socket, "open");
      await welcome.promise;
      socket.send(
        `chat ${JSON.stringify({
          msg: "x".repeat(200),
          room: "lobby",
          requestID: "browser-command",
        })}`,
      );
      await chat.promise;
      expect(models.chatLog.insert).toHaveBeenCalledWith(
        42 as UserID,
        "x".repeat(200),
        "lobby",
      );
    } finally {
      socket.terminate();
      await closed.promise;
      await setImmediate();
    }
  });

  test("refuses partial TLS configuration and does not send internal exception details", async () => {
    env.TLS_CERT_FILE = "missing-test-certificate";
    await expect(createHTTPServer()).rejects.toThrow("must both be provided");
    env.TLS_CERT_FILE = "";
    jest
      .mocked(models.users.get)
      .mockRejectedValueOnce(new Error("private database detail"));
    app = await createHTTPServer();
    const response = await app.inject({
      method: "POST",
      url: "/login",
      payload: credentials,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).toBe("Internal server error.");
    expect(response.cookies).toEqual([]);
  });

  test("serves HTTPS using certificate and key file contents", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hanabi-tls-"));
    try {
      const certificate = path.join(directory, "certificate.pem");
      const key = path.join(directory, "key.pem");
      await run("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-keyout",
        key,
        "-out",
        certificate,
      ]);
      env.TLS_CERT_FILE = certificate;
      env.TLS_KEY_FILE = key;
      // This transport test must not create operator-owned ACME directories.
      jest.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
      app = await createHTTPServer();
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const status = await new Promise<number | undefined>(
        (resolve, reject) => {
          const request = get(
            `${address}/test-cookie`,
            {
              ca: readFileSync(certificate),
              agent: false,
            },
            (response) => {
              response.resume();
              response.once("end", () => {
                resolve(response.statusCode);
              });
            },
          );
          request.once("error", reject);
        },
      );
      expect(status).toBe(204);
    } finally {
      await app?.close();
      app = undefined;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
