import type { ClientCommandData } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { wsSendAll } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export function commandInactive(
  user: WSUser,
  data: ClientCommandData["inactive"],
): void {
  const wsUser = user;
  wsUser.inactive = data.inactive;
  wsSendAll(ServerCommand.userInactive, {
    userID: wsUser.userID,
    inactive: data.inactive,
  });
}
