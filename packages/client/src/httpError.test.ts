import { httpError } from "@hanabi-live/data";
import { describe, expect, test } from "vitest";

describe("httpError", () => {
  test("shows the message from a server failure's JSON body", async () => {
    const response = Response.json(
      {
        message:
          "Account login failed: The database is unavailable. [Reference: abc123]",
        code: "databaseUnavailable",
      },
      {
        status: 503,
        headers: {
          "x-error-id": "abc123",
        },
      },
    );
    const error = await httpError(response, "Logging in");
    expect(error.message).toBe(
      "Logging in failed (HTTP 503). Account login failed: The database is unavailable. [Reference: abc123]",
    );
  });
});
