import type {
  ClientCommandChatPMHistoryGetData,
  UserID,
} from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { models } from "../models";
import { normalizeUsername } from "../utils";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export async function commandChatPMHistoryGet(
  wsUser: WSUser,
  data: ClientCommandChatPMHistoryGetData,
): Promise<void> {
  const { amount, beforeID, room, username } = data;

  let peerID: UserID | undefined;
  if (username !== undefined) {
    peerID = await models.users.getIDByNormalizedUsername(
      normalizeUsername(username),
    );
    if (peerID === undefined) {
      wsWarning(wsUser.connection, `User "${username}" does not exist.`);
      return;
    }
  }

  const history = await models.chatLogPM.getHistory(
    wsUser.userID,
    amount,
    beforeID,
    peerID,
  );
  wsSend(wsUser.connection, ServerCommand.chatPMHistory, {
    ...history,
    ...(room !== undefined && { room }),
  });
}
