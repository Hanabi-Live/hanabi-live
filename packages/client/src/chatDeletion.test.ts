import { describe, expect, test } from "vitest";
import { LobbyChatDeletionState } from "./chatDeletion";

describe("lobby chat deletion", () => {
  test("a deleted lobby message is ignored if it arrives later", () => {
    const state = new LobbyChatDeletionState();
    expect(state.shouldSkipMessage(undefined, 123)).toBe(false);

    state.markDeleted(123);

    // Both live messages and chat history pass through the same filtering logic.
    expect(state.shouldSkipMessage(undefined, 123)).toBe(true);
    expect(state.shouldSkipMessage(undefined, 124)).toBe(false);
    expect(state.shouldSkipMessage(42, 123)).toBe(false);
    expect(state.shouldSkipMessage(undefined, undefined)).toBe(false);
  });

  test("the deletion cache remains bounded", () => {
    const state = new LobbyChatDeletionState();
    for (let id = 1; id <= 10_001; id++) {
      state.markDeleted(id);
    }
    expect(state.shouldSkipMessage(undefined, 1)).toBe(false);
    expect(state.shouldSkipMessage(undefined, 2)).toBe(true);
    expect(state.shouldSkipMessage(undefined, 10_001)).toBe(true);
  });
});
