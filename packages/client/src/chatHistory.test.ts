import type { ServerEventData } from "@hanabi-live/data";
import { expect, test } from "vitest";
import { chatHistoryId, withoutShown } from "./chatHistory.ts";

function message(text: string, sentAt = "2026-11-09T12:34:00.000Z") {
  return {
    text,
    sentAt,
    kind: {
      type: "public",
      author: {
        type: "user",
        username: "alice",
      },
    },
  } as ServerEventData["chat"];
}

test("a list that the server sends again adds only the new messages", () => {
  const first = [message("one"), message("two")];
  const shown = first.map((chat) => chatHistoryId(chat));
  expect(withoutShown([...first, message("three")], shown)).toStrictEqual([
    message("three"),
  ]);
});

test("each shown message skips one message, so a repeated message stays", () => {
  const shown = [chatHistoryId(message("same"))];
  expect(withoutShown([message("same"), message("same")], shown)).toHaveLength(
    1,
  );
});

test("the same time in another form is the same message", () => {
  expect(chatHistoryId(message("one", "2026-11-09T12:34:00Z"))).toBe(
    chatHistoryId(message("one")),
  );
  expect(chatHistoryId(message("one", "2026-11-09T12:34:01Z"))).not.toBe(
    chatHistoryId(message("one")),
  );
});
