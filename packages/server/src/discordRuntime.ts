import { ServerCommand } from "@hanabi-live/data";
import { incomingCommands } from "./commandAdmission";
import { DiscordBridge } from "./discordBridge";
import { logger } from "./logger";
import { models } from "./models";
import { wsSendAll } from "./wsHelpers";

let bridge: DiscordBridge | undefined;

export function initializeDiscord(
  callbacks: Pick<
    ConstructorParameters<typeof DiscordBridge>[0],
    "classifyCommand" | "command"
  >,
): DiscordBridge {
  if (bridge !== undefined) {
    throw new Error("Discord integration is already initialized.");
  }
  bridge = new DiscordBridge({
    ...callbacks,
    environment: process.env,
    store: models.chatLog,
    admission: incomingCommands,
    publishChat: (message) => {
      wsSendAll(ServerCommand.chat, message);
    },
    publishDeletion: (chatID) => {
      wsSendAll(ServerCommand.chatDelete, { chatID, room: "lobby" });
    },
    log: (message) => {
      if (bridge?.status === "degraded") {
        logger.error(message);
      } else {
        logger.info(message);
      }
    },
  });
  return bridge;
}

export function getDiscordBridge(): DiscordBridge | undefined {
  return bridge;
}
