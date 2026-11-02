import { incomingCommands } from "./commandAdmission";
import { getGameRuntime } from "./gameRuntime";
import type { Table } from "./interfaces/Table";
import { logger } from "./logger";
import type { PregameStartIntent } from "./pregameStart";
import {
  cancelPregameStart,
  capturePregameStart,
  isPregameStartCurrent,
} from "./pregameStart";
import { tableNotice } from "./tableNotifications";
import { enqueueTableOperation } from "./tableQueue";
import { getTable, getTableIDs } from "./tables";
import { wsWarning } from "./wsHelpers";

export function cancelPregameTimers(): void {
  for (const id of getTableIDs()) {
    const table = getTable(id);
    if (table !== undefined) {
      cancelPregameStart(table);
    }
  }
}

export function preparePregameStart(
  table: Table,
): PregameStartIntent | undefined {
  const intent = capturePregameStart(table);
  if (intent === undefined) {
    tableNotice(
      table,
      "Aborting automatic game start since the table creator is away.",
    );
  }
  return intent;
}

export async function startPregame(
  intent: PregameStartIntent | undefined,
): Promise<void> {
  if (intent === undefined || !isPregameStartCurrent(intent)) {
    return;
  }
  const runtime = getGameRuntime();
  if (runtime === undefined) {
    wsWarning(intent.owner.connection, "The game runtime is unavailable.");
    return;
  }
  await runtime.start(
    intent.owner,
    {
      tableID: intent.table.id,
      intendedVariant: intent.variant,
      intendedPlayers: [...intent.players],
    },
    undefined,
    intent,
  );
}

export function schedulePregameStart(table: Table, seconds: number): void {
  cancelPregameStart(table);
  const current = table;
  const token = {};
  const planned = new Date(Date.now() + seconds * 1000);
  current.pregameStartToken = token;
  current.datetimePlannedStart = planned;
  arm(table, token, planned, seconds * 1000);
}

function arm(table: Table, token: object, planned: Date, delay: number) {
  const current = table;
  current.pregameStartTimer = setTimeout(() => {
    expire(table, token, planned).catch((error: unknown) => {
      logger.error(`Pregame start failed: ${String(error)}`);
    });
  }, delay);
  current.pregameStartTimer.unref();
}

async function expire(table: Table, token: object, planned: Date) {
  await incomingCommands.run(async () => {
    let intent: PregameStartIntent | undefined;
    const admitted = await enqueueTableOperation(table.id, () => {
      if (
        getTable(table.id) !== table
        || table.pregameStartToken !== token
        || table.datetimePlannedStart !== planned
        || table.running
        || table.replay
        || table.recoveryBlocked === true
      ) {
        return;
      }
      const current = table;
      current.pregameStartTimer = undefined;
      intent = preparePregameStart(table);
    });
    if (
      !admitted
      && getTable(table.id) === table
      && table.pregameStartToken === token
      && table.datetimePlannedStart === planned
    ) {
      arm(table, token, planned, 25);
    }
    await startPregame(intent);
  });
}
