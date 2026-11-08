// Exponential backoff keeps retries bounded when network access is unavailable.

import { SECOND_IN_MILLISECONDS } from "complete-common";

/** The ceiling of the first retry's delay, which doubles with each attempt after it. */
const BASE_DELAY_MS = 100;

/** The ceiling of every retry's delay. */
const MAX_DELAY_MS = 30 * SECOND_IN_MILLISECONDS;

/** Enough doublings to reach the maximum delay, which keeps the exponent small. */
const MAX_DOUBLINGS = Math.ceil(Math.log2(MAX_DELAY_MS / BASE_DELAY_MS));

export class ReconnectBackoff {
  private attempt = 0;

  public nextDelay(): number {
    const ceiling = Math.min(
      BASE_DELAY_MS * 2 ** Math.min(this.attempt, MAX_DOUBLINGS),
      MAX_DELAY_MS,
    );
    const delay =
      this.attempt === 0
        ? 0
        : Math.floor(ceiling / 2 + (Math.random() * ceiling) / 2);
    this.attempt++;
    return delay;
  }

  public reset(): void {
    this.attempt = 0;
  }
}
