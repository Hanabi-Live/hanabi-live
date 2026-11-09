import type { Clock } from "@sinonjs/fake-timers";
import { install } from "@sinonjs/fake-timers";
import { afterEach, describe, expect, test, vi } from "vitest";
import { checkCookieWithRetry } from "./cookieProbe";

const originalFetch = globalThis.fetch;
let clock: Clock | undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clock?.uninstall();
});

describe("cached login cookie check", () => {
  test.each([200, 204, 401, 403])(
    "handles HTTP %s without retrying",
    async (status) => {
      const request = vi
        .fn<() => Promise<Response>>()
        .mockResolvedValue(new Response(null, { status }));
      globalThis.fetch = Object.assign(request, {
        preconnect: originalFetch.preconnect,
      });

      const result = await checkCookieWithRetry();

      expect(result.status).toBe(status);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  test("recovers from a rejected request after a backoff", async () => {
    clock = install({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    const request = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = Object.assign(request, {
      preconnect: originalFetch.preconnect,
    });

    const pending = checkCookieWithRetry();
    await clock.tickAsync(1000);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(clock.countTimers()).toBe(0);
  });

  test("retries transient HTTP errors but stops after three attempts", async () => {
    clock = install({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    const request = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    globalThis.fetch = Object.assign(request, {
      preconnect: originalFetch.preconnect,
    });

    const pending = checkCookieWithRetry().catch((error: unknown) => error);
    await clock.tickAsync(3000);

    expect(await pending).toEqual(
      new Error(
        "Checking your saved session failed (HTTP 503). The server returned no explanation.",
      ),
    );
    expect(request).toHaveBeenCalledTimes(3);
    expect(clock.countTimers()).toBe(0);
  });

  test("aborts a stalled request and retries", async () => {
    clock = install({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    const request = vi
      .fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>()
      .mockImplementationOnce(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = Object.assign(request, {
      preconnect: originalFetch.preconnect,
    });

    const pending = checkCookieWithRetry();
    await clock.tickAsync(11_000);

    const response = await pending;
    expect(response.status).toBe(204);
    expect(request).toHaveBeenCalledTimes(2);
    expect(clock.countTimers()).toBe(0);
  });
});
