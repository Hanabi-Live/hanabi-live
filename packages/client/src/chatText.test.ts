import { describe, expect, test } from "vitest";
import { chatSegments, chatTextHtml } from "./chatText.ts";

describe("chatSegments", () => {
  test("finds links, and leaves the emote names inside of them as they are", () => {
    expect(chatSegments("see https://example.com/Kappa Kappa")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        text: "https://example.com/Kappa",
        href: "https://example.com/Kappa",
      },
      { type: "text", text: " " },
      {
        type: "emote",
        name: "Kappa",
        src: "/public/img/emotes/twitch/Kappa.png",
      },
    ]);
  });

  test("finds Discord emotes, the heart anywhere, and colon emotes only between spaces", () => {
    expect(chatSegments("<:Pog:123> a<3 D: xD:")).toEqual([
      {
        type: "emote",
        name: "Pog",
        src: "https://cdn.discordapp.com/emojis/123.png",
      },
      { type: "text", text: " a" },
      { type: "emote", name: "<3", src: "/public/img/emotes/twitch/3.png" },
      { type: "text", text: " " },
      { type: "emote", name: "D:", src: "/public/img/emotes/betterttv/D.png" },
      { type: "text", text: " xD:" },
    ]);
  });

  test("finds suggested commands and the notice label only when asked", () => {
    const text = "[Server Notice] Try @/setleader bob@";
    expect(chatSegments(text)).toEqual([{ type: "text", text }]);
    expect(chatSegments(text, { commands: true, notice: true })).toEqual([
      { type: "notice", text: "[Server Notice]" },
      { type: "text", text: " Try " },
      { type: "command", command: "/setleader bob" },
    ]);
  });
});

describe("chatTextHtml", () => {
  test("escapes the text and the links", () => {
    expect(chatTextHtml('<b>"hi"</b> https://example.com/?a="x"')).toBe(
      '&lt;b&gt;&quot;hi&quot;&lt;/b&gt; <a href="https://example.com/?a=&quot;x" target="_blank" rel="noopener noreferrer">https://example.com/?a=&quot;x</a>&quot;',
    );
  });
});
