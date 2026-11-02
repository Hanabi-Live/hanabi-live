import type { ClientCommandData, TableID } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { clearTyping } from "../chatPresence";
import { ActionRejected } from "../engine/types";
import { getGameRuntime } from "../gameRuntime";
import { models } from "../models";
import { historicalReplay, importReplay } from "../replayImport";
import { enqueueTableOperation } from "../tableQueue";
import { getTable, getTableAudience } from "../tables";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";

function runtime(user: WSUser) {
  const instance = getGameRuntime();
  if (instance === undefined) {
    wsWarning(user.connection, "Game storage is not initialized.");
  }
  return instance;
}

export async function commandTableStart(
  user: WSUser,
  data: ClientCommandData["tableStart"],
): Promise<void> {
  await runtime(user)?.start(user, data);
}

export async function commandTableVoteForTermination(
  user: WSUser,
  data: ClientCommandData["tableVoteForTermination"],
): Promise<void> {
  await runtime(user)?.vote(user, data.tableID, data.requestID);
}
export async function commandGetGameInfo1(
  user: WSUser,
  data: ClientCommandData["getGameInfo1"],
): Promise<void> {
  await runtime(user)?.bootstrap(user, data.tableID, 1);
}
export async function commandGetGameInfo2(
  user: WSUser,
  data: ClientCommandData["getGameInfo2"],
): Promise<void> {
  await runtime(user)?.bootstrap(user, data.tableID, 2);
}
export async function commandLoaded(
  user: WSUser,
  data: ClientCommandData["loaded"],
): Promise<void> {
  await runtime(user)?.loaded(user, data);
}
export async function commandAction(
  user: WSUser,
  data: ClientCommandData["action"],
): Promise<void> {
  await runtime(user)?.action(user, data);
}
export async function commandPause(
  user: WSUser,
  data: ClientCommandData["pause"],
): Promise<void> {
  await runtime(user)?.pause(user, data);
}
export async function commandNote(
  user: WSUser,
  data: ClientCommandData["note"],
): Promise<void> {
  await runtime(user)?.note(user, data);
}
export async function commandTag(
  user: WSUser,
  data: ClientCommandData["tag"],
): Promise<void> {
  await runtime(user)?.tag(user, data);
}
export async function commandTagDelete(
  user: WSUser,
  data: ClientCommandData["tagDelete"],
): Promise<void> {
  await runtime(user)?.tag(user, data, "delete");
}
export async function commandTagsDeleteAll(
  user: WSUser,
  data: ClientCommandData["tagsDeleteAll"],
): Promise<void> {
  await runtime(user)?.tag(user, { ...data, msg: "" }, "deleteAll");
}
export async function commandTableUnattend(
  user: WSUser,
  data: ClientCommandData["tableUnattend"],
): Promise<void> {
  await runtime(user)?.unattend(user, data.tableID);
}
export async function commandTableSpectate(
  user: WSUser,
  data: ClientCommandData["tableSpectate"],
): Promise<void> {
  await runtime(user)?.spectate(user, data);
}
export async function commandReplayAction(
  user: WSUser,
  data: ClientCommandData["replayAction"],
): Promise<void> {
  await runtime(user)?.replay(user, data);
}

export async function commandTableSuggest(
  user: WSUser,
  data: ClientCommandData["tableSuggest"],
): Promise<void> {
  await runtime(user)?.suggest(user, data);
}

export async function commandReplayCreate(
  user: WSUser,
  data: ClientCommandData["replayCreate"],
): Promise<void> {
  const instance = runtime(user);
  if (instance === undefined) {
    return;
  }
  try {
    if (data.password !== "") {
      throw new ActionRejected("You cannot create a replay with a password.");
    }
    if (data.source === "json") {
      await instance.createReplay(
        user,
        importReplay(data.gameJSON),
        data.visibility === "shared",
      );
    } else {
      if (data.databaseID === undefined) {
        throw new ActionRejected("You must specify a database game ID.");
      }
      const record = await models.replays.get(data.databaseID);
      if (record === undefined) {
        throw new ActionRejected(
          `Game #${data.databaseID} does not exist in the database.`,
        );
      }
      await instance.createReplay(
        user,
        historicalReplay(record),
        data.visibility === "shared",
      );
    }
  } catch (error) {
    if (!(error instanceof ActionRejected)) {
      throw error;
    }
    if (wsUsers.get(user.userID) === user) {
      wsWarning(user.connection, error.message);
    }
  }
}

export async function commandTableRestart(
  user: WSUser,
  data: ClientCommandData["tableRestart"],
): Promise<void> {
  await runtime(user)?.restart(user, data);
}

export async function commandRunningReattend(
  user: WSUser,
  data: ClientCommandData["tableReattend"],
): Promise<void> {
  await runtime(user)?.reattend(user, data.tableID);
}
export async function commandRunningTerminate(
  user: WSUser,
  data: ClientCommandData["tableTerminate"],
): Promise<void> {
  await runtime(user)?.terminate(user, data.tableID, data.requestID);
}
export async function commandRunningSetLeader(
  user: WSUser,
  data: ClientCommandData["tableSetLeader"],
): Promise<void> {
  await runtime(user)?.setLeader(user, data.tableID, data.name);
}

export async function commandTableChat(
  user: WSUser,
  id: TableID,
  text: string,
  requestID?: string,
): Promise<void> {
  if (getTable(id)?.running === true) {
    await runtime(user)?.chat(user, id, text, requestID);
    return;
  }
  const admitted = await enqueueTableOperation(id, () => {
    if (
      wsUsers.get(user.userID) !== user
      || user.connection.readyState !== user.connection.OPEN
    ) {
      return;
    }
    const table = getTable(id);
    if (
      table === undefined
      || table.running
      || table.recoveryBlocked === true
      || (table.players.every((player) => player.userID !== user.userID)
        && table.spectators.every(
          (spectator) => spectator.userID !== user.userID,
        ))
    ) {
      wsWarning(user.connection, "You are not at an available table.");
      return;
    }
    const message = {
      msg: text,
      who: user.username,
      source: "user" as const,
      datetime: new Date().toISOString(),
      room: `table${id}`,
    };
    table.chat.push({ userID: user.userID, message });
    clearTyping(table, user.userID);
    for (const recipient of getTableAudience(table)) {
      wsSend(recipient.connection, ServerCommand.chat, message);
    }
  });
  if (!admitted) {
    wsWarning(
      user.connection,
      "Too many pending table commands. Please try again.",
    );
  }
}
