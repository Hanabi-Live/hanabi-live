import { describe, expect, test } from "@jest/globals";
import { LobbyChatDeletionState } from "./chatDeletion";

describe("lobby chat deletion", () => {
  test("a deleted lobby message is ignored if it arrives later", () => {
    const state = new LobbyChatDeletionState();
    expect(state.shouldSkipMessage("lobby", 123)).toBe(false);

    state.markDeleted(123);

    // Both live messages and chat history pass through the same filtering logic.
    expect(state.shouldSkipMessage("lobby", 123)).toBe(true);
    expect(state.shouldSkipMessage("lobby", 124)).toBe(false);
    expect(state.shouldSkipMessage("table42", 123)).toBe(false);
    expect(state.shouldSkipMessage("lobby", undefined)).toBe(false);
  });

  test("the deletion cache remains bounded", () => {
    const state = new LobbyChatDeletionState();
    for (let id = 1; id <= 10_001; id++) {
      state.markDeleted(id);
    }
    expect(state.shouldSkipMessage("lobby", 1)).toBe(false);
    expect(state.shouldSkipMessage("lobby", 2)).toBe(true);
    expect(state.shouldSkipMessage("lobby", 10_001)).toBe(true);
  });
});
