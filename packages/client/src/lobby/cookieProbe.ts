import { httpError, withTabAccount } from "@hanabi-live/data";
import { HTTP_STATUS } from "../constants";
import { ReconnectBackoff } from "../reconnect";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

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

async function fetchCookieOnce(): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(withTabAccount("/test-cookie"), {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
