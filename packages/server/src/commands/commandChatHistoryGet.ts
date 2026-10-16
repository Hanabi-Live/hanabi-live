import type { ClientCommandChatHistoryGetData } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { getChatList } from "../chat";
import { wsSend } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export async function commandChatHistoryGet(
  wsUser: WSUser,
  data: ClientCommandChatHistoryGetData,
): Promise<void> {
  const { list, hasMore } = await getChatList(
    "lobby",
    data.amount,
    data.beforeID,
  );
  wsSend(wsUser.connection, ServerCommand.chatHistory, { list, hasMore });
}
