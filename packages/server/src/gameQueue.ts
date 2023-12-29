import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import type { CompositionTypeSatisfiesEnum } from "isaacscript-common-ts";
import { getRedisGame, setRedisGame } from "./redis";
import type { GameID } from "./types/GameID";
import type { UserID } from "./types/UserID";

enum GameQueueElementType {
  SetPlayerConnected,
}

type GameQueueElement = SetPlayerConnectedData;

type _Test = CompositionTypeSatisfiesEnum<
  GameQueueElement,
  GameQueueElementType
>;

interface SetPlayerConnectedData {
  type: GameQueueElementType.SetPlayerConnected;
  gameID: GameID;
  userID: UserID;
  connected: boolean;
}

const QUEUE_FUNCTIONS = {
  [GameQueueElementType.SetPlayerConnected]: setPlayerConnected,
} as const satisfies Record<
  GameQueueElementType,
  (element: GameQueueElement) => Promise<void>
>;

const gameQueue: queueAsPromised<GameQueueElement, void> = fastq.promise(
  processQueue,
  1,
);

async function processQueue(element: GameQueueElement) {
  const func = QUEUE_FUNCTIONS[element.type];
  await func(element);
}

async function setPlayerConnected(data: SetPlayerConnectedData) {
  const { gameID, userID, connected } = data;

  const game = await getRedisGame(gameID);
  if (game === undefined) {
    return;
  }

  const matchingPlayer = game.players.find((player) => player.id === userID);
  if (matchingPlayer === undefined) {
    return;
  }

  matchingPlayer.connected = connected;

  await setRedisGame(game);
}

// ------------------
// Exported functions
// ------------------

export function enqueueSetPlayerConnected(
  gameID: GameID,
  userID: UserID,
  connected: boolean,
): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  gameQueue.push({
    type: GameQueueElementType.SetPlayerConnected,
    gameID,
    userID,
    connected,
  });
}
