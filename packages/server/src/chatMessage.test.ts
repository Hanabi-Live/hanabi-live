import { describe, expect, test } from "@jest/globals";
import { chatMessageToWire } from "./chatMessage";

const datetime = "2026-10-14T12:00:00.000Z";

describe("chatMessageToWire", () => {
  test("serializes a lobby user message with its stable ID", () => {
    expect(
      chatMessageToWire({
        kind: "lobby",
        source: "user",
        text: "hi",
        who: "Ada",
        datetime,
        room: "lobby",
        chatID: 42,
      }),
    ).toEqual({
      msg: "hi",
      who: "Ada",
      discord: false,
      server: false,
      datetime,
      room: "lobby",
      chatID: 42,
    });
  });

  test("keeps the Discord source separate from the lobby destination", () => {
    expect(
      chatMessageToWire({
        kind: "lobby",
        source: "discord",
        text: "hello",
        who: "DiscordUser",
        datetime,
        room: "lobby",
        chatID: 43,
      }),
    ).toEqual({
      msg: "hello",
      who: "DiscordUser",
      discord: true,
      server: false,
      datetime,
      room: "lobby",
      chatID: 43,
    });
  });

  test("serializes table chat without adding a database chat ID", () => {
    expect(
      chatMessageToWire({
        kind: "table",
        source: "user",
        text: "clue",
        who: "Ada",
        datetime,
        room: "table00123",
      }),
    ).toEqual({
      msg: "clue",
      who: "Ada",
      discord: false,
      server: false,
      datetime,
      room: "table00123",
    });
  });

  test("serializes a PM without a room or public chat ID", () => {
    expect(
      chatMessageToWire({
        kind: "private",
        source: "user",
        text: "secret",
        who: "Ada",
        datetime,
        pmID: 88,
        recipient: "Alice",
      }),
    ).toEqual({
      msg: "secret",
      who: "Ada",
      discord: false,
      server: false,
      datetime,
      pmID: 88,
      recipient: "Alice",
    });
  });

  test("keeps a targeted server notice private to its recipient", () => {
    expect(
      chatMessageToWire({
        kind: "notice",
        source: "server",
        text: "Identity token",
        who: "Hanab Live",
        datetime,
        room: "table123",
        recipient: "Alice",
      }),
    ).toEqual({
      msg: "Identity token",
      who: "Hanab Live",
      discord: false,
      server: true,
      datetime,
      room: "table123",
      recipient: "Alice",
    });
  });

  test("does not insert a missing who field into a server notice", () => {
    expect(
      chatMessageToWire({
        kind: "notice",
        source: "server",
        text: "Join Discord",
        datetime,
        room: "lobby",
      }),
    ).toEqual({
      msg: "Join Discord",
      discord: false,
      server: true,
      datetime,
      room: "lobby",
    });
  });

  test("preserves an explicitly empty who for the message of the day", () => {
    expect(
      chatMessageToWire({
        kind: "notice",
        source: "server",
        text: "[Server Notice] Hello",
        who: "",
        datetime,
        room: "lobby",
      }),
    ).toEqual({
      msg: "[Server Notice] Hello",
      who: "",
      discord: false,
      server: true,
      datetime,
      room: "lobby",
    });
  });
});
