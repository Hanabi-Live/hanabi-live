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
    if (response.status < 500 && response.status !== 429) {
      return response;
    }
    throw new Error(`Cookie check failed with status ${response.status}.`);
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
    return await fetch("/test-cookie", {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
