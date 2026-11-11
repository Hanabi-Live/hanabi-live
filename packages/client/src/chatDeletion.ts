// Remember deleted lobby message IDs so out-of-order events cannot restore them.
const MAX_REMEMBERED_DELETIONS = 10_000;

export class LobbyChatDeletionState {
  private readonly deletedChatIDs = new Set<number>();

  public markDeleted(chatId: number): void {
    this.deletedChatIDs.add(chatId);
    if (this.deletedChatIDs.size > MAX_REMEMBERED_DELETIONS) {
      const oldestID = this.deletedChatIDs.values().next().value;
      if (oldestID !== undefined) {
        this.deletedChatIDs.delete(oldestID);
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
      && this.deletedChatIDs.has(chatId)
    );
  }
}
