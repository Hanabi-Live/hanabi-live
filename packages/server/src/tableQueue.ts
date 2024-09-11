import type { TableID, UserID } from "@hanabi/data";
import type { CompositionTypeSatisfiesEnum } from "complete-common";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { getRedisTable, setRedisTable } from "./redis";

enum TableQueueElementType {
  SetPlayerConnected,
}

type TableQueueElement = SetPlayerConnectedData;

type _Test = CompositionTypeSatisfiesEnum<
  TableQueueElement,
  TableQueueElementType
>;

interface SetPlayerConnectedData {
  type: TableQueueElementType.SetPlayerConnected;
  tableID: TableID;
  userID: UserID;
  connected: boolean;
}

const QUEUE_FUNCTIONS = {
  [TableQueueElementType.SetPlayerConnected]: setPlayerConnected,
} as const satisfies Record<
  TableQueueElementType,
  (element: TableQueueElement) => Promise<void>
>;

const tableQueue: queueAsPromised<TableQueueElement, void> = fastq.promise(
  processQueue,
  1,
);

async function processQueue(element: TableQueueElement) {
  const func = QUEUE_FUNCTIONS[element.type];
  await func(element);
}

/** TODO: this is wrong, see "websocket_disconnect.go" */
async function setPlayerConnected(data: SetPlayerConnectedData) {
  const { tableID, userID, connected } = data;

  const game = await getRedisTable(tableID);
  if (game === undefined) {
    return;
  }

  const matchingPlayer = game.players.find(
    (player) => player.userID === userID,
  );
  if (matchingPlayer === undefined) {
    return;
  }

  matchingPlayer.present = connected;

  await setRedisTable(game);
}

// ------------------
// Exported functions
// ------------------

export function enqueueSetPlayerConnected(
  tableID: TableID,
  userID: UserID,
  connected: boolean,
): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  tableQueue.push({
    type: TableQueueElementType.SetPlayerConnected,
    tableID,
    userID,
    connected,
  });
}
