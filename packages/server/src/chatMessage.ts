import type { ServerCommandChatData } from "@hanabi-live/data";

type ChatSource = "user" | "server" | "discord";

interface ChatMessageContent {
  readonly text: string;
  readonly who?: string;
  readonly datetime: string;
}

/** Internal variants keep PM IDs, public IDs, and recipients separate. */
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

/** Serialize internal chat variants to the WebSocket chat payload. */
export function chatMessageToWire(
  message: InternalChatMessage,
): ServerCommandChatData {
  const common = {
    msg: message.text,
    ...(message.who !== undefined && { who: message.who }),
    source: message.source,
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
