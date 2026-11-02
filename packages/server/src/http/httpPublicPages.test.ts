// cspell:words lodie elodie
import type { GameID, UserID } from "@hanabi-live/data";
import { serverCommandGameHistoryData } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import * as argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { Script } from "node:vm";
import type { pino } from "pino";
import { createHTTPServer } from "../http";
import { models } from "../models";

jest.mock("../env", () => ({
  env: {
    DOMAIN: "localhost",
    SESSION_SECRET: "synthetic-session-key-".repeat(8),
    TLS_CERT_FILE: "",
    TLS_KEY_FILE: "",
  },
  IS_DEV: true,
}));
jest.mock("../logger", () => {
  const actual = jest.requireActual<{ pino: typeof pino }>("pino");
  return { logger: actual.pino({ level: "silent" }) };
});
jest.mock("../version", () => ({ getClientVersion: () => 1 }));
jest.mock("../motd", () => ({ getMessageOfTheDay: jest.fn() }));
jest.mock("../models", () => ({
  models: {
    bannedIPs: { check: jest.fn() },
    users: { getByNormalizedUsername: jest.fn(), setPassword: jest.fn() },
    userStats: { getAll: jest.fn() },
    publicStats: {
      profile: jest.fn(),
      variant: jest.fn(),
      variantScores: jest.fn(),
      seedScores: jest.fn(),
    },
    gameTags: { getForUser: jest.fn(), getGameIDsForTag: jest.fn() },
    games: { getHistory: jest.fn() },
  },
}));

const EMPTY_STATS = {
  numGamesNormal: 0,
  numGamesOther: 0,
  numGamesSpeedrun: 0,
  timePlayed: 0,
  timePlayedSpeedrun: 0,
} as const;
const getUser = jest.mocked(models.users.getByNormalizedUsername);
let server: FastifyInstance;

beforeEach(async () => {
  jest.resetAllMocks();
  // The lookup mock implements the asynchronous model contract.
  // eslint-disable-next-line @typescript-eslint/require-await
  getUser.mockImplementation(async (name) => {
    if (name === "unknown") {
      return undefined;
    }
    return {
      id: 1 as UserID,
      username: name === "alice" ? "Alice" : name,
    };
  });
  jest.mocked(models.publicStats.profile).mockResolvedValue({
    ...EMPTY_STATS,
    dateJoined: new Date("2020-01-21T00:00:00Z"),
  });
  jest.mocked(models.publicStats.variant).mockResolvedValue(EMPTY_STATS);
  jest.mocked(models.publicStats.variantScores).mockResolvedValue({
    numGames: 0,
    bestScores: [0, 0, 0, 0, 0],
    numMaxScores: 0,
    averageScore: 0,
    numStrikeouts: 0,
  });
  jest.mocked(models.publicStats.seedScores).mockResolvedValue([]);
  jest.mocked(models.userStats.getAll).mockResolvedValue(new Map());
  jest.mocked(models.gameTags.getForUser).mockResolvedValue([]);
  jest.mocked(models.gameTags.getGameIDsForTag).mockResolvedValue([]);
  jest.mocked(models.games.getHistory).mockResolvedValue([]);
  server = await createHTTPServer();
});

afterEach(async () => {
  await server.close();
});

describe("registered public HTML pages", () => {
  test.each([
    "/scores",
    "/profile",
    "/history",
    "/missing-scores",
    "/tags",
    "/seed",
    "/variant",
    "/tag",
  ])("rejects missing path arguments: %s", async (url) => {
    const response = await server.inject(url);
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain("Error: You must specify");
  });

  test.each([
    "/scores/unknown",
    "/profile/unknown",
    "/history/unknown",
    "/missing-scores/unknown",
    "/tags/unknown",
    "/history/Alice/ALICE",
    "/tag/%20",
  ])("rejects unknown, duplicate or blank values: %s", async (url) => {
    const response = await server.inject(url);
    expect(response.statusCode).toBe(404);
  });

  test.each(["wat", "0.5", "999999", "-1", "9007199254740992"])(
    "rejects invalid variant %s",
    async (id) => {
      const response = await server.inject(`/variant/${id}`);
      expect(response.statusCode).toBe(400);
    },
  );

  test.each(["/scores/ALICE", "/profile/ALICE"])(
    "renders canonical profile and zero stats: %s",
    async (url) => {
      const response = await server.inject(url);
      expect(response.statusCode).toBe(200);
      expect(getUser).toHaveBeenCalledWith("alice");
      expect(response.body).toContain("Alice&#39;s Profile");
      expect(response.body).toContain("January 21st, 2020");
      expect(response.body).toContain('id="profile-buttons"');
      expect(response.body).toContain('href="/history/Alice"');
      expect(response.body).toContain("0 normally finished");
    },
  );

  test("normalizes Unicode lookups but uses the canonical stored name in links", async () => {
    getUser.mockResolvedValue({ id: 1 as UserID, username: "\u{C9}lodie" });
    const response = await server.inject(
      `/history/${encodeURIComponent("\u{C9}LODIE")}`,
    );
    expect(response.statusCode).toBe(200);
    expect(getUser).toHaveBeenCalledWith("elodie");
    expect(response.body).toContain('href="/scores/%C3%89lodie"');
    expect(response.body).toContain(
      'data-api-path="/api/v1/history/%C3%89lodie"',
    );
  });

  test("renders score statistics and modifier tooltips", async () => {
    jest.mocked(models.publicStats.profile).mockResolvedValue({
      ...EMPTY_STATS,
      dateJoined: new Date("2020-01-22T00:00:00Z"),
      numGamesNormal: 2,
      numGamesOther: 1,
      numGamesSpeedrun: 1,
      timePlayed: 3600,
      timePlayedSpeedrun: 90,
    });
    jest.mocked(models.userStats.getAll).mockResolvedValue(
      new Map([
        [
          0,
          {
            numGames: 3,
            averageScore: 20.25,
            numStrikeouts: 1,
            bestScores: [2, 3, 4, 5, 6].map((numPlayers) => ({
              numPlayers,
              score: 25,
              modifier: 16,
            })),
          },
        ],
      ]),
    );
    const response = await server.inject("/scores/Alice");
    expect(response.statusCode).toBe(200);
    for (const text of [
      "3 (2 normally finished)",
      "1 hour and 0 minutes",
      "2 minutes",
      "20.2",
      "33.3%",
      'href="/variant/0"',
      'data-tooltip-content="#modifier-allornothing"',
      "sorter-current-max-score",
      ".tablesorterPager(pager)",
    ]) {
      expect(response.body).toContain(text);
    }
  });

  test("renders all 1-6 player histories with safe canonical API URLs and pagination hooks", async () => {
    const names = ["ALICE", "Bob", "Cathy", "David", "Eve", "Frank"];
    for (let count = 1; count <= 6; count++) {
      // eslint-disable-next-line no-await-in-loop
      const response = await server.inject(
        `/history/${names.slice(0, count).join("/")}`,
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('data-api-path="/api/v1/history/Alice');
      expect(response.body).toContain('class="history personal-history"');
      expect(response.body).toContain('class="gotoPage"');
      expect(response.body).toContain("{sortList:col}&{filterList:fcol}");
      expect(response.body).toContain(
        'names.map(encodeURIComponent).join("/")',
      );
      expect(response.body).toContain(".text(String(value))");
    }
    const invalid = await server.inject("/history/A/B/C/D/E/F/G");
    expect(invalid.statusCode).toBe(404);
  });

  test("escapes untrusted names, seeds and tag headings without inline script interpolation", async () => {
    const value = "x</script><img src=x onerror=alert(1)>/&\"'";
    const encoded = encodeURIComponent(value);
    const response = await server.inject(`/history/${encoded}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(value);
    expect(response.body).toContain("&lt;img");
    expect(response.body).toContain("%2F");
    const seed = await server.inject(`/seed/${encoded}`);
    expect(seed.statusCode).toBe(200);
    expect(seed.body).not.toContain(value);
    expect(seed.body).toContain("&lt;img");
    const tag = await server.inject(`/tag/${encoded}`);
    expect(tag.statusCode).toBe(200);
    expect(tag.body).not.toContain(value);
    expect(tag.body).toContain("&lt;img");
  });

  test.each([
    ["/history/ALICE/Bob?api", "/api/v1/history/Alice/bob"],
    ["/variant/0?api", "/api/v1/variants/0"],
    ["/seed/a%2Fb%3F%23?api", "/api/v1/seed/a%2Fb%3F%23"],
    ["/tags/ALICE?api", "/api/v1/tags/Alice"],
    ["/tag/%20Cool%20?api", "/api/v1/tag/cool"],
  ])("redirects the legacy API request %s", async (url, target) => {
    const response = await server.inject(url);
    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe(target);
  });

  test("renders single-player missing-score summary, filtering and modifier hooks", async () => {
    const response = await server.inject("/missing-scores/ALICE/3");
    expect(response.statusCode).toBe(200);
    for (const text of [
      'id="profile-buttons"',
      'id="filter-by-players"',
      'value="3" selected',
      "missing-scores-row-players-3",
      "Efficiency",
      "this.dataset.profilePath",
      "Current Max Scores:",
    ]) {
      expect(response.body).toContain(text);
    }
    expect(response.body).not.toContain('id="advanced-filters"');
    expect(response.body).not.toContain(
      'class="missing-scores-row missing-scores-row-players-2"',
    );
    const all = await server.inject("/missing-scores/Alice/not-a-number");
    expect(all.statusCode).toBe(200);
    for (const players of [2, 3, 4, 5, 6]) {
      expect(all.body).toContain(`missing-scores-row-players-${players}`);
    }
  });

  test("renders an unplayed variant without NaN and a seed histogram", async () => {
    const variant = await server.inject("/variant/0");
    expect(variant.statusCode).toBe(200);
    expect(variant.body).toContain(
      "No-one has played a game on this variant yet.",
    );
    expect(variant.body).not.toContain("NaN");
    expect(variant.body).toContain('data-api-path="/api/v1/variants/0"');
    jest.mocked(models.publicStats.seedScores).mockResolvedValue([
      { score: 0, numTimes: 2 },
      { score: 25, numTimes: 1 },
    ]);
    const seed = await server.inject("/seed/p2v0s1");
    expect(seed.statusCode).toBe(200);
    expect(seed.body).toContain('id="scoreFreqs"');
    expect(seed.body).toContain("new Chart(chart");
    expect(seed.body).toContain("chart.dataset.frequencies");
    expect(seed.body).toContain('data-api-path="/api/v1/seed/p2v0s1"');
  });

  test("renders tagged history and only the requested user's sorted tags", async () => {
    jest.mocked(models.gameTags.getForUser).mockResolvedValue([
      { gameID: 10 as GameID, tag: "zulu" },
      { gameID: 10 as GameID, tag: "<alpha>" },
    ]);
    jest.mocked(models.games.getHistory).mockResolvedValue(
      serverCommandGameHistoryData.parse([
        {
          id: 10,
          options: {
            numPlayers: 2,
            variantID: 0,
            variantName: "No Variant",
            timed: false,
            timeBase: 120,
            timePerTurn: 10,
            speedrun: false,
            cardCycle: false,
            deckPlays: false,
            emptyClues: false,
            oneExtraCard: false,
            oneLessCard: false,
            allOrNothing: false,
            detrimentalCharacters: false,
          },
          seed: "a/b",
          score: 25,
          numTurns: 40,
          endCondition: 1,
          datetimeStarted: new Date("2026-01-01T00:00:00Z"),
          datetimeFinished: new Date("2026-01-01T01:00:00Z"),
          playerNames: ["Alice", "A/B"],
          numGamesOnThisSeed: 2,
          tags: "not this user's tag",
          incrementNumGames: false,
        },
      ]),
    );
    const response = await server.inject("/tags/Alice");
    expect(response.statusCode).toBe(200);
    for (const text of [
      'id="total-number-of-games">1',
      'id="history-row-0"',
      'href="/history/Alice/A%2FB"',
      'href="/seed/a%2Fb"',
      "&lt;alpha&gt;, zulu",
      'href="/replay/10"',
    ]) {
      expect(response.body).toContain(text);
    }
    expect(response.body).not.toContain("not this user");
  });

  test("renders videos and hashes passwords without changing an account", async () => {
    const videos = await server.inject("/videos");
    expect(videos.statusCode).toBe(200);
    expect(videos.body).toContain("VrFCekQb4nY");
    const form = await server.inject("/password-reset");
    expect(form.statusCode).toBe(200);
    for (const text of [
      'id="new-password"',
      'id="generated-hash"',
      'id="generate-hash-button"',
      'addEventListener("submit"',
      "new URLSearchParams",
      "administrator to manually reset",
    ]) {
      expect(form.body).toContain(text);
    }
    const password = "test+pass&word=\u{E9}";
    const response = await server.inject({
      method: "POST",
      url: "/password-reset",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ password }).toString(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/^\$argon2id\$/u);
    expect(await argon2.verify(response.body, password)).toBe(true);
    expect(models.users.setPassword).not.toHaveBeenCalled();
    const invalid = await server.inject({
      method: "POST",
      url: "/password-reset",
      payload: { password: "" },
    });
    expect(invalid.statusCode).toBe(400);
  });

  test("propagates SQL failures rather than showing empty successful statistics", async () => {
    jest
      .mocked(models.publicStats.variantScores)
      .mockRejectedValue(new Error("synthetic SQL failure"));
    const variant = await server.inject("/variant/0");
    expect(variant.statusCode).toBe(500);
    jest
      .mocked(models.userStats.getAll)
      .mockRejectedValue(new Error("synthetic SQL failure"));
    const scores = await server.inject("/scores/Alice");
    const missing = await server.inject("/missing-scores/Alice");
    const disabled = await server.inject("/stats");
    expect(scores.statusCode).toBe(500);
    expect(missing.statusCode).toBe(500);
    expect(disabled.statusCode).toBe(404);
  });

  test.each(["history", "seed", "variant"])(
    "initializes the %s browser pager against its paginated API",
    async (page) => {
      const url = page === "history" ? "/history/Alice" : `/${page}/0`;
      const response = await server.inject(url);
      const script = [
        ...response.body.matchAll(/<script>([\s\S]*?)<\/script>/gu),
      ]
        .map((match) => match[1] ?? "")
        .find((source) => source.includes("pager.ajaxUrl"));
      expect(script).toBeDefined();
      if (script === undefined) {
        throw new Error("Missing browser table initializer.");
      }
      let ready: (() => Promise<void>) | undefined;
      const sorter = jest.fn();
      const pager = jest.fn();
      const element = {
        length: 1,
        ready(callback: () => Promise<void>) {
          ready = callback;
        },
        tooltipster: jest.fn(),
        find: () => ({
          each: (callback: (index: number) => void) => {
            for (let index = 0; index < 7; index++) {
              callback(index);
            }
          },
        }),
        tablesorter(options: unknown) {
          sorter(options);
          return { tablesorterPager: pager };
        },
      };
      const jquery = Object.assign(() => element, {
        tablesorter: { addParser: jest.fn() },
      });
      const apiPath =
        page === "history"
          ? "/api/v1/history/Alice"
          : `/api/v1/${page === "variant" ? "variants" : "seed"}/0`;
      const fetch = jest
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('{"0":"No Variant"}'));
      new Script(script).runInNewContext({
        $: jquery,
        document: {
          getElementById: (id: string) =>
            id === "main" ? { dataset: { page, apiPath } } : undefined,
        },
        fetch,
      });
      if (ready === undefined) {
        throw new Error("Missing ready callback.");
      }
      await ready();
      expect(fetch).toHaveBeenCalledWith("/api/v1/variants");
      expect(sorter).toHaveBeenCalledWith(
        expect.objectContaining({
          sortList: [[page === "history" ? 0 : 2, 1]],
          widgets: ["zebra", "filter"],
        }),
      );
      const ajaxError = expect.objectContaining({
        error: expect.any(Function),
      });
      const query = "?page={page}&size={size}&{sortList:col}&{filterList:fcol}";
      expect(pager).toHaveBeenCalledWith(
        expect.objectContaining({
          ajaxUrl: `${apiPath}${query}`,
          ajaxProcessing: expect.any(Function),
          ajaxObject: ajaxError,
        }),
      );
    },
  );

  test("submits a password with URL encoding and exposes the returned hash, not HTML", async () => {
    const response = await server.inject("/password-reset");
    const script = [...response.body.matchAll(/<script>([\s\S]*?)<\/script>/gu)]
      .map((match) => match[1] ?? "")
      .find((source) => source.includes('fetch("/password-reset"'));
    if (script === undefined) {
      throw new Error("Missing password form script.");
    }
    let submit:
      ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
    const input = {
      value: "password+&=\u{E9}",
      hidden: true,
      disabled: false,
      textContent: "",
      focus: jest.fn(),
      select: jest.fn(),
      addEventListener(_event: string, callback: NonNullable<typeof submit>) {
        submit = callback;
      },
    };
    const output = { ...input, value: "" };
    const fetch = jest
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("synthetic hash"));
    new Script(script).runInNewContext({
      URLSearchParams,
      fetch,
      document: {
        getElementById: (id: string) =>
          id === "generated-hash" ? output : input,
      },
    });
    if (submit === undefined) {
      throw new Error("Missing submit handler.");
    }
    await submit({ preventDefault: jest.fn<() => void>() });
    const call = fetch.mock.calls[0];
    expect(call).toEqual([
      "/password-reset",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({ password: input.value }),
      }),
    ]);
    expect(output.value).toBe("synthetic hash");
    expect(output.select).toHaveBeenCalled();
    expect(input.disabled).toBe(false);
  });
});
