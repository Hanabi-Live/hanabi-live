// Exponential backoff keeps retries bounded when network access is unavailable.
export class ReconnectBackoff {
  private attempt = 0;

  public nextDelay(): number {
    const delay = Math.min(1000 * 2 ** Math.min(this.attempt, 5), 30_000);
    this.attempt++;
    return delay;
  }

  public reset(): void {
    this.attempt = 0;
  }
}
