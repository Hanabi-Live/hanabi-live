export class CommandAdmission {
  private accepting = true;
  private readonly pending = new Set<Promise<void>>();

  get paused(): boolean {
    return !this.accepting;
  }

  async run(work: () => void | Promise<void>): Promise<boolean> {
    if (!this.accepting) {
      return false;
    }
    const completion = Promise.withResolvers<undefined>();
    this.pending.add(completion.promise);
    try {
      await work();
      return true;
    } finally {
      this.pending.delete(completion.promise);
      completion.resolve(undefined);
    }
  }

  pause(): void {
    this.accepting = false;
  }

  async drain(): Promise<void> {
    this.pause();
    const expired = Promise.withResolvers<never>();
    const timer = setTimeout(() => {
      expired.reject(
        new Error("Commands are still running; the server must remain paused."),
      );
    }, 30_000);
    try {
      await Promise.race([Promise.allSettled(this.pending), expired.promise]);
    } finally {
      clearTimeout(timer);
    }
  }

  resume(): void {
    if (this.pending.size > 0) {
      throw new Error(
        "Cannot resume while admitted commands are still running.",
      );
    }
    this.accepting = true;
  }
}

export const incomingCommands = new CommandAdmission();
