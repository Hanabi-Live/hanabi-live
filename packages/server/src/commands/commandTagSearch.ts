import type { ClientCommandData } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { chatServerSendPM } from "../chat";
import { models } from "../models";
import { sanitizeTag } from "../tagUtils";
import { wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export async function commandTagSearch(
  user: WSUser,
  data: ClientCommandData["tagSearch"],
): Promise<void> {
  const parsed = sanitizeTag(data.msg);
  if (parsed.error !== undefined) {
    wsWarning(user.connection, parsed.error);
    return;
  }
  const ids = await models.gameTags.getGameIDsForTag(parsed.tag);
  chatServerSendPM(
    user,
    `Games matching "${escapeHTMLCharacters(parsed.tag)}": ${ids.join(", ")}`,
    data.room,
  );
}
