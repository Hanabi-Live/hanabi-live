import type { Table } from "./interfaces/Table";
import { getTable } from "./tables";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

export interface PregameStartIntent {
  readonly table: Table;
  readonly token: object;
  readonly owner: WSUser;
  readonly variant: string;
  readonly players: readonly string[];
}

export function cancelPregameStart(table: Table): void {
  const current = table;
  clearTimeout(table.pregameStartTimer);
  current.pregameStartTimer = undefined;
  current.pregameStartToken = undefined;
  current.datetimePlannedStart = undefined;
}

function presentOwner(table: Table) {
  const owner = wsUsers.get(table.ownerID);
  return owner !== undefined
    && owner.tableID === table.id
    && owner.connection.readyState === owner.connection.OPEN
    && table.players.some(
      (player) => player.userID === owner.userID && player.present,
    )
    ? owner
    : undefined;
}

/** Capture under the table queue, then start only after releasing it. */
export function capturePregameStart(
  table: Table,
): PregameStartIntent | undefined {
  const owner = presentOwner(table);
  if (owner === undefined) {
    return undefined;
  }
  const current = table;
  const token = {};
  current.pregameStartToken = token;
  return {
    table,
    token,
    owner,
    variant: table.options.variantName,
    players: table.players.map((player) => player.name),
  };
}

export function isPregameStartCurrent(intent: PregameStartIntent): boolean {
  const { table, token, owner, variant, players } = intent;
  return (
    getTable(table.id) === table
    && table.pregameStartToken === token
    && !table.running
    && !table.replay
    && table.recoveryBlocked !== true
    && presentOwner(table) === owner
    && table.options.variantName === variant
    && table.players.length === players.length
    && table.players.every((player, index) => player.name === players[index])
  );
}
