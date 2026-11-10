// Remember deleted lobby message IDs so out-of-order events cannot restore them.
const MAX_REMEMBERED_DELETIONS = 10_000;

export class LobbyChatDeletionState {
  private readonly deletedChatIDs = new Set<number>();

  public markDeleted(chatID: number): void {
    this.deletedChatIDs.add(chatID);
    if (this.deletedChatIDs.size > MAX_REMEMBERED_DELETIONS) {
      const oldestID = this.deletedChatIDs.values().next().value;
      if (oldestID !== undefined) {
        this.deletedChatIDs.delete(oldestID);
      }
    }
  }

  public shouldSkipMessage(
    tableID: number | undefined,
    chatID: number | undefined,
  ): boolean {
    return (
      tableID === undefined
      && chatID !== undefined
      && this.deletedChatIDs.has(chatID)
    );
  }
}
