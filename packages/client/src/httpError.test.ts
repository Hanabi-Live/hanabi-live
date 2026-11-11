import { httpError } from "@hanabi-live/data";
import { describe, expect, test } from "vitest";

describe("httpError", () => {
  test("shows the message from a server failure's JSON body", async () => {
    const response = Response.json(
      {
        message:
          "Account test-cookie failed: The database is unavailable. [Reference: abc123]",
        code: "databaseUnavailable",
        diagnosticId: "abc123",
      },
      { status: 503, headers: { "x-error-id": "abc123" } },
    );
    const error = await httpError(response, "Checking your saved session");
    expect(error.message).toBe(
      "Checking your saved session failed (HTTP 503). Account test-cookie failed: The database is unavailable. [Reference: abc123]",
    );
  });
});
