import type { ServerCommandChatData } from "@hanabi-live/data";

// Pure pagination state; only persisted lobby chat IDs participate in the cursor.
export class LobbyChatHistoryState {
  private oldestID: number | undefined;
  public hasMore = false;
  public loading = false;

  public reset(list: readonly ServerCommandChatData[], hasMore: boolean): void {
    this.oldestID = getOldestLobbyChatID(list);
    this.hasMore = hasMore && this.oldestID !== undefined;
    this.loading = false;
  }

  public begin(): number | undefined {
    if (!this.hasMore || this.loading || this.oldestID === undefined) {
      return undefined;
    }
    this.loading = true;
    return this.oldestID;
  }

  public complete(
    list: readonly ServerCommandChatData[],
    hasMore: boolean,
  ): void {
    if (!this.loading) {
      return;
    }
    const pageOldestID = getOldestLobbyChatID(list);
    if (
      pageOldestID !== undefined
      && (this.oldestID === undefined || pageOldestID < this.oldestID)
    ) {
      this.oldestID = pageOldestID;
    }
    this.hasMore = hasMore && pageOldestID !== undefined;
    this.loading = false;
  }

  public cancel(): void {
    this.loading = false;
  }
}

export function getOldestLobbyChatID(
  list: readonly ServerCommandChatData[],
): number | undefined {
  let oldestID: number | undefined;
  for (const message of list) {
    if (message.room !== "lobby" || message.chatID === undefined) {
      continue;
    }
    if (oldestID === undefined || message.chatID < oldestID) {
      oldestID = message.chatID;
    }
  }
  return oldestID;
}
