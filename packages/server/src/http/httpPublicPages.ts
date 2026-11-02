import type { GameID, UserID } from "@hanabi-live/data";
import { doesVariantIDExist, getVariantByID } from "@hanabi-live/game";
import * as argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { getTemplateVariables } from "../httpUtils";
import type { PublicStats } from "../interfaces/PublicStats";
import type { TemplateVariables } from "../interfaces/TemplateVariables";
import { models } from "../models";
import {
  formatDateJoined,
  formatDecimal,
  formatDuration,
  formatPercentage,
  getScoreSummary,
} from "../publicPageUtils";
import { getSharedMissingScoresRows } from "../sharedMissingScores";
import { sanitizeTag } from "../tagUtils";
import { normalizeString } from "../utils";

type PageRequest = FastifyRequest<{
  Params: Partial<Record<string, string>>;
  Querystring: Partial<Record<string, unknown>>;
}>;

// Preserve Go's first-error ordering, including a failed lookup before a later duplicate.
/* eslint-disable no-await-in-loop */
async function getPlayers(
  request: PageRequest,
  reply: FastifyReply,
  multiple = false,
): Promise<ReadonlyArray<{ id: UserID; username: string }> | undefined> {
  const users: Array<{ id: UserID; username: string }> = [];
  const seen = new Set<string>();
  for (let index = 1; index <= (multiple ? 6 : 1); index++) {
    const name = request.params[`player${index}`];
    if (name === undefined || name === "") {
      if (index === 1) {
        await reply
          .code(StatusCodes.NOT_FOUND)
          .type("text/plain")
          .send("Error: You must specify a player.");
        return undefined;
      }
      break;
    }
    const normalized = normalizeString(name);
    if (seen.has(normalized)) {
      await reply
        .code(StatusCodes.NOT_FOUND)
        .type("text/plain")
        .send("Error: You can not specify the same player twice.");
      return undefined;
    }
    seen.add(normalized);
    const user = await models.users.getByNormalizedUsername(normalized);
    if (user === undefined) {
      await reply
        .code(StatusCodes.NOT_FOUND)
        .type("text/plain")
        .send(
          multiple
            ? `Error: The player of "${name}" does not exist in the database.`
            : "Error: That player does not exist in the database.",
        );
      return undefined;
    }
    users.push(user);
  }
  return users;
}
/* eslint-enable no-await-in-loop */

function statsVariables(stats: PublicStats) {
  return {
    ...stats,
    numGamesTotal: stats.numGamesNormal + stats.numGamesOther,
    timePlayed: stats.timePlayed === 0 ? "-" : formatDuration(stats.timePlayed),
    timePlayedSpeedrun:
      stats.timePlayedSpeedrun === 0
        ? "-"
        : formatDuration(stats.timePlayedSpeedrun),
  };
}

async function render(
  reply: FastifyReply,
  variables: Omit<TemplateVariables, "projectName" | "version" | "isDev">,
) {
  return await reply.view("public-page", {
    ...getTemplateVariables(),
    ...variables,
  } satisfies TemplateVariables);
}

async function httpScores(request: PageRequest, reply: FastifyReply) {
  const users = await getPlayers(request, reply);
  const user = users?.[0];
  if (user === undefined) {
    return await reply;
  }
  const [stats, variantStats] = await Promise.all([
    models.publicStats.profile(user.id),
    models.userStats.getAll(user.id),
  ]);
  const summary = getScoreSummary(variantStats);
  return await render(reply, {
    title: "Scores",
    page: "scores",
    name: user.username,
    statsJSON: JSON.stringify({
      ...statsVariables(stats),
      dateJoined: formatDateJoined(stats.dateJoined),
      ...summary,
    }),
  });
}

async function httpHistory(request: PageRequest, reply: FastifyReply) {
  const users = await getPlayers(request, reply, true);
  const first = users?.[0];
  if (users === undefined || first === undefined) {
    return await reply;
  }
  const names = users.map((user) => user.username);
  const apiPath = `/api/v1/history/${names.map(encodeURIComponent).join("/")}`;
  if (Object.hasOwn(request.query, "api")) {
    return await reply.redirect(apiPath, StatusCodes.PERMANENT_REDIRECT);
  }
  return await render(reply, {
    title: "History",
    page: "history",
    name: first.username,
    apiPath,
    ...(names.length > 1 && {
      namesTitle: `Game History for ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`,
    }),
  });
}

async function httpMissingScores(request: PageRequest, reply: FastifyReply) {
  const users = await getPlayers(request, reply);
  const user = users?.[0];
  if (user === undefined) {
    return await reply;
  }
  const requested = request.params["numPlayers"] ?? "";
  const number = /^[+-]?\d+$/u.test(requested) ? Number(requested) : 0;
  const numPlayers = number >= 2 && number <= 6 ? number : 0;
  const stats = await models.userStats.getAll(user.id);
  const rows = (numPlayers === 0 ? [2, 3, 4, 5, 6] : [numPlayers]).flatMap(
    (players) =>
      getSharedMissingScoresRows(players, [stats], {
        excludedVariants: [],
        minEfficiency: undefined,
        maxEfficiency: undefined,
      }),
  );
  return await reply.view("missing-scores", {
    ...getTemplateVariables(),
    title: "Missing Scores",
    name: user.username,
    namesTitle: `${user.username}'s Profile`,
    playersJSON: JSON.stringify([{ name: user.username, excluded: false }]),
    rowsJSON: JSON.stringify(rows),
    statsJSON: JSON.stringify(getScoreSummary(stats)),
    requestedNumPlayers: numPlayers,
    singleMissingScores: true,
  } satisfies TemplateVariables);
}

async function httpTags(request: PageRequest, reply: FastifyReply) {
  const users = await getPlayers(request, reply);
  const user = users?.[0];
  if (user === undefined) {
    return await reply;
  }
  if (Object.hasOwn(request.query, "api")) {
    return await reply.redirect(
      `/api/v1/tags/${encodeURIComponent(user.username)}`,
      StatusCodes.PERMANENT_REDIRECT,
    );
  }
  const tags = await models.gameTags.getForUser(user.id);
  const byGame = new Map<GameID, string[]>();
  for (const { gameID, tag } of tags) {
    const values = byGame.get(gameID) ?? [];
    values.push(tag);
    byGame.set(gameID, values);
  }
  const games = await models.games.getHistory([...byGame.keys()]);
  return await render(reply, {
    title: "Tagged Games",
    page: "tagged",
    name: user.username,
    rowsJSON: JSON.stringify(
      games.map((game) => ({
        ...game,
        tags: (byGame.get(game.id) ?? [])
          .toSorted((left, right) =>
            Buffer.compare(Buffer.from(left), Buffer.from(right)),
          )
          .join(", "),
      })),
    ),
  });
}

async function httpSeed(request: PageRequest, reply: FastifyReply) {
  const { seed } = request.params;
  if (seed === undefined || seed === "") {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/plain")
      .send("Error: You must specify a seed.");
  }
  const apiPath = `/api/v1/seed/${encodeURIComponent(seed)}`;
  if (Object.hasOwn(request.query, "api")) {
    return await reply.redirect(apiPath, StatusCodes.PERMANENT_REDIRECT);
  }
  const scores = await models.publicStats.seedScores(seed);
  return await render(reply, {
    title: "History",
    page: "seed",
    namesTitle: `seed: ${seed}`,
    apiPath,
    scoreFreqsJSON: JSON.stringify(scores),
  });
}

async function httpVariant(request: PageRequest, reply: FastifyReply) {
  const value = request.params["id"];
  if (value === undefined || value === "") {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/plain")
      .send("Error: You must specify a variant ID.");
  }
  if (!/^[+-]?\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .type("text/plain")
      .send("Error: The variant ID must be a number.");
  }
  const id = Number(value);
  if (!doesVariantIDExist(id)) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .type("text/plain")
      .send("Error: That is not a valid variant ID.");
  }
  const apiPath = `/api/v1/variants/${id}`;
  if (Object.hasOwn(request.query, "api")) {
    return await reply.redirect(apiPath, StatusCodes.PERMANENT_REDIRECT);
  }
  const variant = getVariantByID(id);
  const [stats, scores] = await Promise.all([
    models.publicStats.variant(id),
    models.publicStats.variantScores(id),
  ]);
  return await render(reply, {
    title: "Variant Stats",
    page: "variant",
    namesTitle: `Global Statistics for ${variant.name}`,
    apiPath,
    statsJSON: JSON.stringify({
      ...statsVariables(stats),
      ...scores,
      maxScore: variant.maxScore,
      averageScore:
        scores.averageScore === 0 ? "-" : formatDecimal(scores.averageScore),
      maxScoreRate: formatPercentage(scores.numMaxScores, scores.numGames),
      strikeoutRate: formatPercentage(scores.numStrikeouts, scores.numGames),
    }),
  });
}

async function httpTag(request: PageRequest, reply: FastifyReply) {
  const value = request.params["tag"];
  if (value === undefined || value === "") {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/plain")
      .send("Error: You must specify a tag.");
  }
  const result = sanitizeTag(value);
  if ("error" in result) {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/plain")
      .send(result.error);
  }
  if (Object.hasOwn(request.query, "api")) {
    return await reply.redirect(
      `/api/v1/tag/${encodeURIComponent(result.tag)}`,
      StatusCodes.PERMANENT_REDIRECT,
    );
  }
  const ids = await models.gameTags.getGameIDsForTag(result.tag);
  const games = await models.games.getHistory([...new Set(ids)]);
  return await render(reply, {
    title: "History",
    page: "tagged",
    namesTitle: `Games With a Tag of: ${result.tag}`,
    rowsJSON: JSON.stringify(games),
  });
}

async function httpPasswordResetPost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const result = z
    .object({ password: z.string().min(1) })
    .safeParse(request.body);
  if (!result.success) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .type("text/plain")
      .send("Error: You must specify a username.");
  }
  const hash = await argon2.hash(result.data.password, {
    type: argon2.argon2id,
  });
  return await reply.type("text/plain").send(hash);
}

export function registerPublicPages(server: FastifyInstance): void {
  for (const route of ["/scores", "/profile"]) {
    server.get(route, httpScores);
    server.get(`${route}/:player1`, httpScores);
  }
  let history = "/history";
  server.get(history, httpHistory);
  for (let index = 1; index <= 6; index++) {
    history += `/:player${index}`;
    server.get(history, httpHistory);
  }
  for (const route of [
    "/missing-scores",
    "/missing-scores/:player1",
    "/missing-scores/:player1/:numPlayers",
  ]) {
    server.get(route, httpMissingScores);
  }
  server.get("/tags", httpTags);
  server.get("/tags/:player1", httpTags);
  server.get("/seed", httpSeed);
  server.get("/seed/:seed", httpSeed);
  server.get("/variant", httpVariant);
  server.get("/variant/:id", httpVariant);
  server.get("/tag", httpTag);
  server.get("/tag/:tag", httpTag);
  server.get(
    "/videos",
    async (_request, reply) =>
      await render(reply, { title: "Videos", page: "videos" }),
  );
  server.get(
    "/password-reset",
    async (_request, reply) =>
      await render(reply, { title: "Password Reset", page: "password-reset" }),
  );
  server.post("/password-reset", httpPasswordResetPost);
}
