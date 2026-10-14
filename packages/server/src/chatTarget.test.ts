import { describe, expect, test } from "@jest/globals";
import { parseChatTarget } from "./chatTarget";

describe("parseChatTarget", () => {
  test("parses the lobby", () => {
    expect(parseChatTarget("lobby")).toEqual({ kind: "lobby" });
  });

  test("parses table IDs without exposing room strings internally", () => {
    expect(parseChatTarget("table123")).toEqual({
      kind: "table",
      tableID: 123,
    });
    expect(parseChatTarget("table00042")).toEqual({
      kind: "table",
      tableID: 42,
    });
    expect(parseChatTarget("table0")).toEqual({
      kind: "table",
      tableID: 0,
    });
  });

  test.each([
    "",
    "Lobby",
    "table",
    "table-1",
    "table+1",
    "table123extra",
    "prefix-table123",
    "tableXYZ123",
    "table 123",
    "table9007199254740992",
  ])("rejects invalid room %s", (room) => {
    expect(parseChatTarget(room)).toBeUndefined();
  });
});
