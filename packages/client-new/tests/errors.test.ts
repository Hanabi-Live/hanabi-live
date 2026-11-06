import {
  errorDetails,
  httpError,
  validationErrorDetails,
} from "@hanabi-live/data";
import { expect, it } from "vitest";
import { z } from "zod";

it("retains server explanations, HTTP status and correlation IDs", async () => {
  const response = Response.json(
    {
      error: "The database query timed out after 2 seconds.",
    },
    {
      status: 504,
      headers: { "x-error-id": "abc123" },
    },
  );
  const error = await httpError(response, "Loading game history");
  expect(error.message).toContain("HTTP 504");
  expect(error.message).toContain("database query timed out after 2 seconds");
  expect(error.message).toContain("Reference: abc123");
  expect(errorDetails(error, "Loading game history")).toBe(error.message);
});

it("distinguishes empty HTTP errors and proxy HTML from a server explanation", async () => {
  const empty = await httpError(
    new Response("", { status: 503 }),
    "Signing out",
  );
  expect(empty.message).toContain("HTTP 503");
  expect(empty.message).toContain("no explanation");
  const proxy = await httpError(
    new Response("<html>proxy page</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    }),
    "Signing in",
  );
  expect(proxy.message).toContain("HTTP 502");
  expect(proxy.message).toContain("HTML error page");
  expect(proxy.message).not.toContain("<html>");
});

it("reports validation fields without echoing supplied secrets", () => {
  const result = z
    .object({ count: z.number() })
    .safeParse({ count: "synthetic-secret" });
  if (result.success) {
    throw new Error("Expected invalid input");
  }
  const detail = validationErrorDetails(result.error);
  expect(detail).toContain("count");
  expect(detail).toContain("number");
  expect(detail).not.toContain("synthetic-secret");
});

it("preserves browser exception categories and actionable permission advice", () => {
  const denied = errorDetails(
    new DOMException("User denied permission", "NotAllowedError"),
    "Playing audio",
  );
  expect(denied).toContain("NotAllowedError");
  expect(denied).toContain("User denied permission");
  expect(denied).toContain("Check browser permissions");
  const timeout = errorDetails(
    new DOMException("Timed out", "TimeoutError"),
    "Loading history",
  );
  expect(timeout).toContain("time limit");
});
