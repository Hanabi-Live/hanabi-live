import type { ServerCommandChatData } from "@hanabi-live/data";

type ChatSource = "user" | "server" | "discord";

interface ChatMessageContent {
  readonly text: string;
  readonly who?: string;
  readonly datetime: string;
}

// These are internal message variants. The legacy WebSocket shape is produced
// only at the boundary, so PM IDs, public IDs, and recipients cannot mix.
type InternalChatMessage =
  | (ChatMessageContent & {
      readonly kind: "lobby";
      readonly source: ChatSource;
      readonly room: string;
      readonly chatID?: number;
    })
  | (ChatMessageContent & {
      readonly kind: "table";
      readonly source: ChatSource;
      readonly room: string;
    })
  | (ChatMessageContent & {
      readonly kind: "private";
      readonly source: "user";
      readonly recipient: string;
      readonly pmID: number;
    })
  | (ChatMessageContent & {
      readonly kind: "notice";
      readonly source: "server";
      readonly room: string;
      readonly recipient?: string;
    });

/** Serialize internal chat variants without changing the existing wire contract. */
export function chatMessageToWire(
  message: InternalChatMessage,
): ServerCommandChatData {
  const common = {
    msg: message.text,
    ...(message.who !== undefined && { who: message.who }),
    discord: message.source === "discord",
    server: message.source === "server",
    datetime: message.datetime,
  };

  switch (message.kind) {
    case "lobby": {
      return {
        ...common,
        room: message.room,
        ...(message.chatID !== undefined && { chatID: message.chatID }),
      };
    }

    case "table": {
      return { ...common, room: message.room };
    }

    case "private": {
      return {
        ...common,
        pmID: message.pmID,
        recipient: message.recipient,
      };
    }

    case "notice": {
      return {
        ...common,
        room: message.room,
        ...(message.recipient !== undefined && {
          recipient: message.recipient,
        }),
      };
    }
  }
}
