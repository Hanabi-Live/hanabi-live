// Remember deleted lobby message IDs so out-of-order events cannot restore them.
const MAX_REMEMBERED_DELETIONS = 10_000;

export class LobbyChatDeletionState {
  private readonly deletedChatIds = new Set<number>();

  public markDeleted(chatId: number): void {
    this.deletedChatIds.add(chatId);
    if (this.deletedChatIds.size > MAX_REMEMBERED_DELETIONS) {
      const oldestId = this.deletedChatIds.values().next().value;
      if (oldestId !== undefined) {
        this.deletedChatIds.delete(oldestId);
      }
    }
  }

  public shouldSkipMessage(
    tableId: number | undefined,
    chatId: number | undefined,
  ): boolean {
    return (
      tableId === undefined
      && chatId !== undefined
      && this.deletedChatIds.has(chatId)
    );
  }
}
