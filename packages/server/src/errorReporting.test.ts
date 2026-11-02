import { afterEach, describe, expect, jest, test } from "@jest/globals";
import * as sentry from "@sentry/node";
import { initializeErrorReporting, reportServerError } from "./errorReporting";

jest.mock("@sentry/node", () => ({ init: jest.fn() }));
jest.unstable_mockModule("@sentry/node", () => ({ init: sentry.init }));
const dsn = "https://synthetic@sentry.invalid/1";

afterEach(() => {
  jest.clearAllMocks();
});

describe("optional private error reporting", () => {
  test("development and absent configuration never initialize the SDK", async () => {
    await initializeErrorReporting(true, dsn, "test-release");
    const close = await initializeErrorReporting(
      false,
      undefined,
      "test-release",
    );
    reportServerError();
    expect(await close()).toBe(true);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  test("invalid configuration fails without exposing its contents", async () => {
    await expect(
      initializeErrorReporting(false, "private-invalid-value", "release"),
    ).rejects.toThrow(/^Invalid SENTRY_DSN\.$/u);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  test("reports only a generic error and allowlisted stack fields, then drains on close", async () => {
    const sdk = jest.requireActual<typeof sentry>("@sentry/node");
    const client = new sdk.NodeClient({
      dsn,
      integrations: [],
      stackParser: () => [],
      transport: () => ({
        send: jest
          .fn<() => Promise<{ statusCode: number }>>()
          .mockResolvedValue({ statusCode: 200 }),
        flush: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
      }),
    });
    const captureException = jest
      .spyOn(client, "captureException")
      .mockReturnValue("event");
    const closeClient = jest.spyOn(client, "close").mockResolvedValue(false);
    jest.mocked(sentry.init).mockReturnValue(client);
    const close = await initializeErrorReporting(false, dsn, "release");
    reportServerError();
    expect(captureException).toHaveBeenCalledWith(
      new Error("Server error; inspect local logs."),
    );
    const options = jest.mocked(sentry.init).mock.calls[0]?.[0];
    expect(options).toMatchObject({
      defaultIntegrations: false,
      enableRuntimeChannelInjection: false,
      dataCollection: { userInfo: false, httpBodies: [], frameContextLines: 0 },
      maxBreadcrumbs: 0,
    });
    const sanitized = options?.beforeSend?.(
      {
        type: undefined,
        event_id: "event",
        request: { url: "private-url", data: "private-body" },
        user: { username: "private-player" },
        extra: { hand: "private-cards" },
        breadcrumbs: [{ message: "private-chat" }],
        exception: {
          values: [
            {
              type: "PrivateType",
              value: "private-token",
              stacktrace: {
                frames: [
                  {
                    filename: "/private-directory/main.js",
                    function: "commandAction",
                    lineno: 23,
                    vars: { password: "private-password" },
                  },
                ],
              },
            },
          ],
        },
      },
      {},
    );
    expect(sanitized).toMatchObject({
      release: "release",
      exception: {
        values: [
          {
            type: "Error",
            value: "Server error; inspect local logs.",
            stacktrace: {
              frames: [
                { filename: "main.js", function: "commandAction", lineno: 23 },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain("private");
    expect(await close()).toBe(false);
    expect(closeClient).toHaveBeenCalledWith(2000);
    reportServerError();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
