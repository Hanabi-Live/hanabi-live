import type { UserID } from "@hanabi-live/data";
import { getVariant } from "@hanabi-live/game";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import { createEta } from "../eta";
import type { UserStatsRow } from "../interfaces/UserStatsRow";
import { models } from "../models";
import { httpSharedMissingScores } from "./httpSharedMissingScores";

jest.mock("../models", () => ({
  models: {
    users: { getByNormalizedUsername: jest.fn() },
    userStats: { getAll: jest.fn() },
  },
}));
jest.mock("../logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../httpUtils", () => ({
  getTemplateVariables: () => ({
    projectName: "Hanab Live",
    isDev: false,
    version: 1,
  }),
}));

const getUser = jest.mocked(models.users.getByNormalizedUsername);
const getStats = jest.mocked(models.userStats.getAll);

const USERS: ReadonlyMap<string, { id: UserID; username: string }> = new Map([
  ["alice", { id: 1 as UserID, username: "Alice" }],
  ["bob", { id: 2 as UserID, username: "Bob" }],
  ["cathy", { id: 3 as UserID, username: "Cathy" }],
]);

type Params = Parameters<typeof httpSharedMissingScores>[0]["params"];
type Query = Parameters<typeof httpSharedMissingScores>[0]["query"];

async function request(
  params: Readonly<Params>,
  query: Readonly<Query> = {},
  users: ReadonlyMap<string, { id: UserID; username: string }> = USERS,
): Promise<{
  statusCode: number | undefined;
  payload: unknown;
  view:
    { name: string; variables: Readonly<Record<string, unknown>> } | undefined;
}> {
  // The handler looks up the players in the order of the URL.
  for (const name of [
    params.player1,
    params.player2,
    params.player3,
    params.player4,
    params.player5,
    params.player6,
  ]) {
    if (name !== undefined) {
      getUser.mockResolvedValueOnce(users.get(name.toLowerCase()));
    }
  }

  let statusCode: number | undefined;
  let payload: unknown;
  let view:
    { name: string; variables: Readonly<Record<string, unknown>> } | undefined;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(data: unknown) {
      payload = data;
      return this;
    },
    view(name: string, variables: Readonly<Record<string, unknown>>) {
      view = { name, variables };
      return this;
    },
  } as unknown as FastifyReply;

  await httpSharedMissingScores(
    { params, query } as unknown as FastifyRequest<{
      Params: Params;
      Querystring: Query;
    }>,
    reply,
  );
  return { statusCode, payload, view };
}

/** @returns The names of the variants in the rows of the page. */
async function getRowNames(
  params: Readonly<Params>,
  query: Readonly<Query>,
): Promise<readonly string[]> {
  const { view } = await request(params, query);
  const rows = JSON.parse(String(view?.variables["rowsJSON"])) as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

beforeEach(() => {
  jest.resetAllMocks();
  getStats.mockResolvedValue(new Map());
});

describe("httpSharedMissingScores errors", () => {
  test.each([
    ["abc", 400, "Error: You must first specify the number of players."],
    ["3.5", 400, "Error: You must first specify the number of players."],
    [
      "99999999999999999999",
      400,
      "Error: You must first specify the number of players.",
    ],
    ["1", 400, "Error: Number of players must be between 2 and 6."],
    ["7", 400, "Error: Number of players must be between 2 and 6."],
  ])("number of players %j", async (numPlayers, statusCode, message) => {
    const result = await request({
      numPlayers,
      player1: "Alice",
      player2: "Bob",
    });
    expect(result.statusCode).toBe(statusCode);
    expect(result.payload).toBe(message);
  });

  test("no players", async () => {
    const result = await request({ numPlayers: "3" });
    expect(result.statusCode).toBe(404);
    expect(result.payload).toBe("Error: You must specify a player.");
  });

  test("only one player", async () => {
    const result = await request({ numPlayers: "3", player1: "Alice" });
    expect(result.statusCode).toBe(404);
    expect(result.payload).toBe(
      "Error: You must specify at least two players.",
    );
  });

  test("a player that does not exist", async () => {
    const result = await request({
      numPlayers: "3",
      player1: "Alice",
      player2: "Nobody",
    });
    expect(result.statusCode).toBe(404);
    expect(result.payload).toBe(
      'Error: The player of "Nobody" does not exist in the database.',
    );
  });

  test("the same player twice", async () => {
    const result = await request({
      numPlayers: "3",
      player1: "Alice",
      player2: "Bob",
      player3: "bob",
    });
    expect(result.statusCode).toBe(404);
    expect(result.payload).toBe(
      "Error: You can not specify the same player twice.",
    );
  });

  test.each([
    [
      { minEfficiency: "abc" },
      "Error: The minimum efficiency must be a number.",
    ],
    [
      { maxEfficiency: "1.2.3" },
      "Error: The maximum efficiency must be a number.",
    ],
    [
      { excludePlayers: "alice, BOB" },
      "Error: You can not exclude every player.",
    ],
  ])("bad filter %j", async (query, message) => {
    const result = await request(
      { numPlayers: "3", player1: "Alice", player2: "Bob" },
      query,
    );
    expect(result.statusCode).toBe(400);
    expect(result.payload).toBe(message);
  });

  test("a database failure", async () => {
    getStats.mockRejectedValueOnce(new Error("boom"));
    const result = await request({
      numPlayers: "3",
      player1: "Alice",
      player2: "Bob",
    });
    expect(result.statusCode).toBe(500);
    expect(result.payload).toBe("Internal Server Error");
  });
});

describe("httpSharedMissingScores page", () => {
  const params = {
    numPlayers: "3",
    player1: "alice",
    player2: "BOB",
    player3: "Cathy",
  };

  test("renders the unfiltered page", async () => {
    const { view, statusCode } = await request(params);
    expect(statusCode).toBeUndefined();
    expect(view?.name).toBe("missing-scores");
    expect(view?.variables).toMatchObject({
      title: "Missing Scores",
      namesTitle: "Missing Scores for Alice, Bob and Cathy",
      advancedFiltersActive: false,
    });
    expect(getStats).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(view?.variables["playersJSON"]))).toEqual([
      { name: "Alice", excluded: false },
      { name: "Bob", excluded: false },
      { name: "Cathy", excluded: false },
    ]);
  });

  test("does not pass empty filter values to the template", async () => {
    const { view } = await request(params, {
      excludePlayers: "",
      excludeVariants: "  ",
      minEfficiency: "",
    });
    expect(view?.variables).not.toHaveProperty("excludeVariants");
    expect(view?.variables).not.toHaveProperty("minEfficiency");
    expect(view?.variables).not.toHaveProperty("maxEfficiency");
    expect(view?.variables["advancedFiltersActive"]).toBe(false);
  });

  test("applies the filters", async () => {
    const { view } = await request(params, {
      excludePlayers: "cathy",
      excludeVariants: "Duck, Pink",
      minEfficiency: "1",
      maxEfficiency: " 1.5 ",
    });
    expect(view?.variables).toMatchObject({
      namesTitle: "Missing Scores for Alice, Bob and Cathy",
      advancedFiltersActive: true,
      excludeVariants: "Duck, Pink",
      minEfficiency: "1",
      maxEfficiency: "1.5",
    });
    expect(JSON.parse(String(view?.variables["playersJSON"]))).toEqual([
      { name: "Alice", excluded: false },
      { name: "Bob", excluded: false },
      { name: "Cathy", excluded: true },
    ]);

    // An excluded player's stats are not used.
    expect(getStats).toHaveBeenCalledTimes(2);

    const rows = JSON.parse(String(view?.variables["rowsJSON"])) as Array<{
      name: string;
      efficiency: string;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => /duck|pink/iu.test(row.name))).toBe(false);
    expect(
      rows.every(
        (row) => Number(row.efficiency) >= 1 && Number(row.efficiency) <= 1.5,
      ),
    ).toBe(true);
  });

  test("uses only the first value of a repeated query parameter", async () => {
    const { view } = await request(params, {
      excludeVariants: ["Duck", "Pink"],
    });
    expect(view?.variables["excludeVariants"]).toBe("Duck");
  });

  test("only the included players' scores are used", async () => {
    const perfect: ReadonlyMap<number, UserStatsRow> = new Map([
      [
        getVariant("Black (5 Suits)").id,
        {
          numGames: 1,
          bestScores: [2, 3, 4, 5, 6].map((numPlayers) => ({
            numPlayers,
            score: 25,
            modifier: 0,
          })),
          averageScore: 25,
          numStrikeouts: 0,
        },
      ],
    ]);

    // Only Cathy has a perfect score. (The stats are requested in the order of the players.)
    getStats
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map(perfect));
    expect(await getRowNames(params, {})).not.toContain("Black (5 Suits)");

    getStats.mockResolvedValueOnce(new Map()).mockResolvedValueOnce(new Map());
    expect(await getRowNames(params, { excludePlayers: "Cathy" })).toContain(
      "Black (5 Suits)",
    );
  });

  test("the values are accepted by the template engine and rendered", async () => {
    const { view } = await request(params, {
      excludePlayers: "Cathy",
      excludeVariants: "Rainbow (3 Suits), Pink",
      maxEfficiency: "1.5",
    });
    expect(view).toBeDefined();

    const eta = createEta();
    eta.configure({ views: path.resolve(__dirname, "..", "templates") });
    const html = eta.render("missing-scores", view?.variables ?? {});

    expect(html).toContain(
      '<h2 class="align-center">Missing Scores for Alice, Bob and Cathy</h2>',
    );
    expect(html).toContain("Filters active");
    expect(html).toContain('value="Rainbow (3 Suits), Pink"');
    expect(html).toContain('value="1.5"');

    // The checkboxes reflect the excluded player.
    expect(html).toMatch(/value="Alice"\s+checked/u);
    expect(html).toMatch(/value="Bob"\s+checked/u);
    expect(html).not.toMatch(/value="Cathy"\s+checked/u);

    // The rows are rendered.
    expect(html).toContain("missing-scores-row-players-3");
    expect(html).not.toContain("Rainbow (3 Suits)</td>");
  });

  test("renders the unfiltered page with the filters hidden", async () => {
    const { view } = await request(params);
    const eta = createEta();
    eta.configure({ views: path.resolve(__dirname, "..", "templates") });
    const html = eta.render("missing-scores", view?.variables ?? {});

    expect(html).not.toContain("Filters active");
    expect(html).toMatch(
      /<form\s+id="advanced-filters"\s+class="advanced-filters"\s+hidden/u,
    );
  });

  test("escapes player names in the page", async () => {
    const users = new Map([
      ...USERS,
      ["xss", { id: 9 as UserID, username: '<b>"x"</b>' }],
    ]);
    const { view } = await request(
      { numPlayers: "3", player1: "Alice", player2: "xss" },
      {},
      users,
    );
    const eta = createEta();
    eta.configure({ views: path.resolve(__dirname, "..", "templates") });
    const html = eta.render("missing-scores", view?.variables ?? {});

    expect(html).not.toContain('<b>"x"</b>');
    expect(html).toContain("&lt;b&gt;");
  });
});
