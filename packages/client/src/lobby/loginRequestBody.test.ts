import { describe, expect, test } from "vitest";
import { loginRequestBody } from "./loginRequestBody";

const request = {
  username: "alice",
  password: "secret",
  version: "1",
  darkMode: false,
  createAccount: false,
};

describe("loginRequestBody", () => {
  test("leaves out an absent new password", () => {
    expect(loginRequestBody(request).has("newPassword")).toBe(false);
  });

  test("sends a new password", () => {
    expect(
      loginRequestBody({ ...request, newPassword: "new" }).get("newPassword"),
    ).toBe("new");
  });
});
