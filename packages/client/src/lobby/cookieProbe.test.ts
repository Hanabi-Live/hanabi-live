import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { checkCookieWithRetry } from "./cookieProbe";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe("cached login cookie check", () => {
  test.each([200, 204, 401, 403])(
    "handles HTTP %s without retrying",
    async (status) => {
      const request = jest
        .fn<() => Promise<Response>>()
        .mockResolvedValue(new Response(null, { status }));
      globalThis.fetch = request;

      const result = await checkCookieWithRetry();

      expect(result.status).toBe(status);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  test("recovers from a rejected request after a backoff", async () => {
    jest.useFakeTimers();
    const request = jest
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = request;

    const pending = checkCookieWithRetry();
    await jest.advanceTimersByTimeAsync(1000);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("retries transient HTTP errors but stops after three attempts", async () => {
    jest.useFakeTimers();
    const request = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    globalThis.fetch = request;

    const pending = expect(checkCookieWithRetry()).rejects.toThrow(
      "Cookie check failed with status 503.",
    );
    await jest.advanceTimersByTimeAsync(3000);

    await pending;
    expect(request).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("aborts a stalled request and retries", async () => {
    jest.useFakeTimers();
    const request = jest
      .fn<typeof fetch>()
      .mockImplementationOnce(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = request;

    const pending = checkCookieWithRetry();
    await jest.advanceTimersByTimeAsync(11_000);

    const response = await pending;
    expect(response.status).toBe(204);
    expect(request).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
