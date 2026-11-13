import { VERSION } from "@hanabi-live/data";
import { describe, expect, test } from "vitest";
import { noticeHtml } from "./notice.ts";

describe("noticeHtml", () => {
  test("escapes a notice's text and breaks its lines", () => {
    expect(noticeHtml({ message: 'A "<b>" tag\nnext' })).toBe(
      "A &quot;&lt;b&gt;&quot; tag<br />next",
    );
  });

  test("lists both releases of an outdated client", () => {
    const html = noticeHtml({
      message: "plain",
      code: "outdatedClient",
      latestVersion: "<new>",
    });
    expect(html).toContain(`<li>You are on: <strong>${VERSION}</strong></li>`);
    expect(html).toContain("<li>The latest: <strong>&lt;new&gt;</strong></li>");
  });
});
