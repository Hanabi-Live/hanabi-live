/* eslint-disable complete/require-ascii, @typescript-eslint/require-await */
import { describe, expect, jest, test } from "@jest/globals";
import {
  decodeDiscordHTML,
  discordOutboundText,
  normalizeDiscordMessage,
  renderDiscordMessage,
} from "./discordRendering";

describe("Go-compatible Discord rendering", () => {
  test.each([
    [
      "<img src=x onerror=alert(1)>",
      "hello @&lt;img src=x onerror=alert(1)&gt;",
    ],
    [
      "&lt;@123456789012345678&gt;",
      "hello @&amp;lt;@123456789012345678&amp;gt;",
    ],
    ["<@123456789012345678>", "hello @&lt;@123456789012345678&gt;"],
  ])(
    "escapes nickname %s without recursive replacement",
    async (nickname, expected) => {
      const lookup = jest.fn(async () => nickname);
      expect(
        await renderDiscordMessage("hello <@123456789012345678>", {
          nickname: lookup,
          role: lookup,
          channel: lookup,
        }),
      ).toBe(expected);
      expect(lookup).toHaveBeenCalledTimes(1);
    },
  );

  test("mentions, roles, channels, emoji and spoilers preserve safe client markup", async () => {
    expect(
      await renderDiscordMessage(
        '<@!123456789012345678> <@&123456789012345678> <#123456789012345678> <:wave:123456789012345678> 😀 ||<b>"secret"</b>|| ||two||',
        {
          nickname: async () => "Nick",
          role: async () => "Role & Crew",
          channel: async () => "<lobby>",
        },
      ),
    ).toBe(
      '@Nick @Role &amp; Crew #&lt;lobby&gt; &lt;:wave:123456789012345678&gt; 😀 <span class="spoiler">&lt;b&gt;&#34;secret&#34;&lt;/b&gt;</span> <span class="spoiler">two</span>',
    );
  });

  test("sanitizes and bounds by UTF-8 bytes before escaping", () => {
    expect(normalizeDiscordMessage("😀".repeat(76))).toBe("😀".repeat(75));
    expect(normalizeDiscordMessage("hello\nworld\u{0}")).toBe("helloworld");
    expect(
      normalizeDiscordMessage("a\u{301}\u{301}\u{301}\u{301}"),
    ).toBeUndefined();
    expect(normalizeDiscordMessage("  ")).toBeUndefined();
  });

  test("outbound text suppresses URL previews, escapes author markdown and decodes once", () => {
    expect(
      discordOutboundText(
        "*Alice*",
        "see https://example.com <https://example.com>",
      ),
    ).toBe(
      String.raw`<**\*Alice\***> see <https://example.com> <https://example.com>`,
    );
    expect(decodeDiscordHTML("&amp;lt;&lt;&gt;&#34;&#39;")).toBe("&lt;<>\"'");
    expect(discordOutboundText("", "ftp://example.com http:example.com")).toBe(
      "<ftp://example.com> http:example.com",
    );
  });
});
