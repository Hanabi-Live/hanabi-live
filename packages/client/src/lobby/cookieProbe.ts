import { httpError, withTabAccount } from "@hanabi-live/data";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { HTTP_STATUS } from "../constants";
import { ReconnectBackoff } from "../reconnect";

/** The endpoint that reports whether the session cookie is still valid. */
export const TEST_COOKIE_PATH = "/test-cookie";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10 * SECOND_IN_MILLISECONDS;

export async function checkCookieWithRetry(): Promise<Response> {
  return await checkCookieAttempt(new ReconnectBackoff(), MAX_ATTEMPTS);
}

async function checkCookieAttempt(
  backoff: ReconnectBackoff,
  attemptsRemaining: number,
): Promise<Response> {
  try {
    const response = await fetchCookieOnce();
    // Only retry transient HTTP failures.
    if (
      response.status < HTTP_STATUS.INTERNAL_SERVER_ERROR
      && response.status !== HTTP_STATUS.TOO_MANY_REQUESTS
    ) {
      return response;
    }
    throw await httpError(response, "Checking your saved session");
  } catch (error: unknown) {
    if (attemptsRemaining === 1) {
      throw error;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, backoff.nextDelay());
    });
    return await checkCookieAttempt(backoff, attemptsRemaining - 1);
  }
}

/**
 * Fetches the session check once. It gives up after a timeout even if the request ignores the abort
 * signal.
 */
export async function fetchCookieOnce(): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fetch(withTabAccount(TEST_COOKIE_PATH), {
        cache: "no-store",
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("The session check timed out."));
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
