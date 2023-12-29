import { Redis } from "ioredis";
import { IS_DEV } from "./env";
import type { Game } from "./interfaces/Game";
import { gameStringifyFunc } from "./interfaces/Game";
import { logger } from "./logger";
import type { GameID } from "./types/GameID";
import type { UserID } from "./types/UserID";

const REDIS_GAMES_KEY = "games";
const DEFAULT_REDIS_PORT = 6379;

const redis = new Redis({
  lazyConnect: true,
  showFriendlyErrorStack: IS_DEV,
});

export async function redisInit(): Promise<void> {
  // We want to connect before attaching the error handler so that we can exit the program if there
  // is an initial error.
  await redis.connect((error) => {
    if (error !== null && error !== undefined) {
      logger.error(
        `Failed to connect to the Redis server. Is Redis installed and listening on port ${DEFAULT_REDIS_PORT} (the default port)? (Redis should be configured to not require any authentication, which is the default.)`,
      );
      process.exit(1);
    }
  });
}

/*
export async function getRedisGames(): Promise<Map<GameID, Game>> {
  const gamesHash = await redis.hgetall(REDIS_GAMES_KEY);

  const games = new Map<GameID, Game>();

  for (const [gameIDString, gameJSON] of Object.entries(gamesHash)) {
    const gameID = parseIntSafe(gameIDString) as GameID;
    const game = JSON.parse(gameJSON) as Game;

    games.set(gameID, game);
  }

  return games;
}
*/

export async function getRedisGamesWithUser(userID: UserID): Promise<Game[]> {
  const gamesHash = await redis.hgetall(REDIS_GAMES_KEY);

  const games: Game[] = [];

  for (const gameJSON of Object.values(gamesHash)) {
    const game = JSON.parse(gameJSON) as Game;
    if (game.players.some((player) => player.id === userID)) {
      games.push(game);
    }
  }

  return games;
}

export async function getRedisGame(gameID: GameID): Promise<Game | undefined> {
  const jsonString = await redis.hget(REDIS_GAMES_KEY, gameID.toString());
  if (jsonString === null) {
    return undefined;
  }

  return JSON.parse(jsonString) as Game;
}

export async function setRedisGame(game: Game): Promise<void> {
  const gameJSON = gameStringifyFunc(game);
  await redis.hset(REDIS_GAMES_KEY, game.id, gameJSON);
}

/*
export async function deleteRedisGame(gameID: GameID): Promise<void> {
  await redis.hdel(REDIS_GAMES_KEY, gameID.toString());
}
*/
