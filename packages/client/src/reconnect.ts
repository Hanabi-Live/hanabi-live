// Exponential backoff keeps retries bounded when network access is unavailable.
export class ReconnectBackoff {
  private attempt = 0;

  public nextDelay(): number {
    const ceiling = Math.min(100 * 2 ** Math.min(this.attempt, 9), 30_000);
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
