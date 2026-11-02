import { ServerCommand } from "@hanabi-live/data";
import { incomingCommands } from "./commandAdmission";
import { logger } from "./logger";
import { formatDuration } from "./publicPageUtils";
import { ShutdownRejectedError as ShutdownRejected } from "./shutdownError";
import { wsSendAll } from "./wsHelpers";

export { ShutdownRejectedError as ShutdownRejected } from "./shutdownError";

const SHUTDOWN_TIMEOUT = 30 * 60 * 1000;

interface ShuttingDownMetadata {
  readonly shuttingDown: boolean;
  readonly datetimeShutdownInit: string | undefined;
}

interface ShutdownActions {
  activeGames: () => number;
  clearPregames: () => Promise<void>;
  terminateGames: () => Promise<void>;
  notice: (message: string) => Promise<void>;
  prepareRestart: () => Promise<void>;
  stop: (restart: boolean) => Promise<void>;
}

export class ShutdownControl {
  private ready = false;
  private closed = false;
  private draining = false;
  private scheduled = false;
  private startedAt: string | undefined;
  private deadline = 0;
  private emptySince: number | undefined;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private stopping: Promise<void> | undefined;
  private checking = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly actions: ShutdownActions;

  constructor(actions: ShutdownActions) {
    this.actions = actions;
  }

  activate(): void {
    this.ready = true;
  }

  get busy(): boolean {
    return this.stopping !== undefined;
  }

  metadata(): ShuttingDownMetadata {
    return {
      shuttingDown: this.scheduled,
      datetimeShutdownInit: this.startedAt,
    };
  }

  timeLeft(): string {
    if (!this.scheduled) {
      return "The server is not scheduled to shutdown any time soon.";
    }
    const seconds = Math.max(
      0,
      Math.floor((this.deadline - performance.now()) / 1000),
    );
    return `Time left until server shutdown: ${formatDuration(seconds)}`;
  }

  isImminent(): boolean {
    return this.scheduled && this.deadline - performance.now() <= 5 * 60 * 1000;
  }

  private async ordered(work: () => Promise<void>) {
    const task = this.tail.then(work);
    // The caller receives the rejection; later state changes must still advance.
    this.tail = task.catch(() => undefined);
    await task;
  }

  private requireReady() {
    if (!this.ready || this.closed) {
      throw new ShutdownRejected(
        "The server is not ready for lifecycle operations.",
        { statusCode: 503 },
      );
    }
  }

  async schedule(): Promise<void> {
    await this.ordered(async () => {
      this.requireReady();
      if (this.scheduled || this.draining) {
        throw new ShutdownRejected("The server is already shutting down.");
      }
      this.scheduled = true;
      this.startedAt = new Date().toISOString();
      this.deadline = performance.now() + SHUTDOWN_TIMEOUT;
      this.emptySince = undefined;
      this.generation++;
      const { generation } = this;
      wsSendAll(ServerCommand.shutdown, this.metadata());
      for (const minutes of [10, 5]) {
        const timer = setTimeout(
          () => {
            this.warning(generation, minutes).catch((error: unknown) => {
              logger.error(`Shutdown warning failed: ${String(error)}`);
            });
          },
          SHUTDOWN_TIMEOUT - minutes * 60 * 1000,
        );
        timer.unref();
        this.timers.add(timer);
      }
      const poll = setInterval(() => {
        this.tick(generation).catch((error: unknown) => {
          logger.error(`Scheduled shutdown failed: ${String(error)}`);
        });
      }, 1000);
      poll.unref();
      this.timers.add(poll);
      const empty = this.actions.activeGames() === 0;
      await this.notice("The server will shutdown in 30 minutes.");
      if (empty && this.current(generation)) {
        this.requestStop(false);
      }
    });
  }

  async cancel(): Promise<void> {
    await this.ordered(async () => {
      this.requireReady();
      if (!this.scheduled || this.draining) {
        throw new ShutdownRejected(
          "The server is not awaiting shutdown, so you cannot cancel it.",
        );
      }
      this.scheduled = false;
      this.clearTimers();
      wsSendAll(ServerCommand.shutdown, this.metadata());
      await this.notice("Server shutdown has been canceled.");
    });
  }

  requestStop(restart: boolean): void {
    this.requireReady();
    if (this.busy) {
      throw new ShutdownRejected("The server is already draining.");
    }
    this.stop(restart).catch((error: unknown) => {
      logger.error(
        `Lifecycle operation failed (${incomingCommands.paused ? "commands remain paused" : "server remains running"}): ${String(error)}`,
      );
    });
  }

  async stop(restart: boolean): Promise<void> {
    this.requireReady();
    if (this.stopping !== undefined) {
      await this.stopping;
      return;
    }
    const task = this.performStop(restart);
    this.stopping = task;
    try {
      await task;
      this.closed = true;
      this.dispose();
    } finally {
      this.stopping = undefined;
    }
  }

  private async performStop(restart: boolean) {
    if (restart) {
      await this.actions.prepareRestart();
    }
    this.draining = true;
    this.clearTimers();
    await this.actions.stop(restart);
  }

  dispose(): void {
    this.clearTimers();
    this.ready = false;
    if (control === this) {
      control = undefined;
    }
  }

  private clearTimers() {
    this.generation++;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private current(generation: number) {
    return this.scheduled && !this.draining && this.generation === generation;
  }

  private async notice(message: string) {
    try {
      await this.actions.notice(message);
    } catch (error) {
      logger.error(`Scheduled maintenance notice failed: ${String(error)}`);
    }
  }

  private async warning(generation: number, minutes: number) {
    await incomingCommands.run(async () => {
      await this.ordered(async () => {
        if (!this.current(generation)) {
          return;
        }
        if (minutes === 5) {
          await this.actions.clearPregames();
        }
        if (this.current(generation)) {
          await this.notice(
            `The server will shutdown in ${minutes} minutes. Finish your game soon or it will be automatically terminated!`,
          );
        }
      });
    });
  }

  private async tick(generation: number) {
    if (this.checking) {
      return;
    }
    this.checking = true;
    try {
      await incomingCommands.run(async () => {
        await this.ordered(async () => {
          if (!this.current(generation)) {
            return;
          }
          const now = performance.now();
          if (this.actions.activeGames() === 0) {
            this.emptySince ??= now;
          } else {
            this.emptySince = undefined;
            if (now >= this.deadline) {
              await this.actions.terminateGames();
            }
          }
        });
      });
    } finally {
      this.checking = false;
    }
    if (
      this.current(generation)
      && this.emptySince !== undefined
      && performance.now() - this.emptySince >= 10_000
      && this.actions.activeGames() === 0
    ) {
      this.requestStop(false);
    }
  }
}

let control: ShutdownControl | undefined;

export function initializeShutdown(actions: ShutdownActions): ShutdownControl {
  if (control !== undefined) {
    throw new Error("Shutdown control is already initialized.");
  }
  control = new ShutdownControl(actions);
  return control;
}

export function getShutdownControl(): ShutdownControl | undefined {
  return control;
}

export function getShuttingDownMetadata(): ShuttingDownMetadata {
  return (
    control?.metadata() ?? {
      shuttingDown: false,
      datetimeShutdownInit: undefined,
    }
  );
}
