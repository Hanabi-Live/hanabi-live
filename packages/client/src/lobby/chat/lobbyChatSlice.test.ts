import { expect, test } from "vitest";
import type { ChatLine } from "./ChatBox.tsx";
import {
  lobbyChatLineAdded,
  lobbyChatListed,
  lobbyChatReducer,
} from "./lobbyChatSlice.ts";

function line(key: number, fields: Partial<ChatLine> = {}): ChatLine {
  return {
    key,
    fadeIn: false,
    time: "12:34",
    fromServer: false,
    text: `line ${key}`,
    ...fields,
  };
}

test("a new list of past messages removes the old notices and the deleted messages", () => {
  const lines = [
    // Older than the list.
    line(1, { chatId: 10 }),
    line(2, { chatId: 20 }),
    // Deleted while we were away.
    line(3, { chatId: 21 }),
    // The message of the day, which comes again.
    line(4, { intro: true }),
    // A private message, and a line that the client wrote.
    line(5, {
      chatId: 22,
      privateMessage: {
        direction: "from",
        name: "alice",
      },
    }),
    line(6),
    // Newer than the list.
    line(7, { chatId: 40 }),
  ];
  let state = lobbyChatReducer(undefined, { type: "init" });
  for (const chatLine of lines) {
    state = lobbyChatReducer(state, lobbyChatLineAdded(chatLine));
  }

  state = lobbyChatReducer(state, lobbyChatListed([20, 30]));
  expect(state.lines.map((chatLine) => chatLine.key)).toStrictEqual([
    1, 2, 5, 6, 7,
  ]);
  expect(state.intro).toBe(true);

  // An empty list removes only the notices.
  state = lobbyChatReducer(state, lobbyChatListed([]));
  expect(state.lines).toHaveLength(5);
});
