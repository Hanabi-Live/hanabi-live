import type {
  ClientCommandChatPMHistoryGetData,
  UserID,
} from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { models } from "../models";
import { normalizeString } from "../utils";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export async function commandChatPMHistoryGet(
  wsUser: WSUser,
  data: ClientCommandChatPMHistoryGetData,
): Promise<void> {
  const { amount, beforeID, room, username } = data;
  if (amount < 1 || amount > 100) {
    wsWarning(
      wsUser.connection,
      "Private message history amount must be between 1 and 100.",
    );
    return;
  }

  let peerID: UserID | undefined;
  if (username !== undefined && username !== "") {
    peerID = await models.users.getIDByNormalizedUsername(
      normalizeString(username),
    );
    if (peerID === undefined) {
      wsWarning(
        wsUser.connection,
        `User "${escapeHTMLCharacters(username)}" does not exist.`,
      );
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
    ...(room !== undefined && room !== "" && { room }),
  });
}
