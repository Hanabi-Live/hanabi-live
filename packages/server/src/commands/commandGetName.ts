import { ServerCommand } from "@hanabi-live/data";
import { getRandomTableName } from "../words";
import { wsSend } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export function commandGetName(wsUser: WSUser): void {
  wsSend(wsUser.connection, ServerCommand.name, { name: getRandomTableName() });
}
