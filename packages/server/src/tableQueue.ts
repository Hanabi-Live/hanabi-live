import type { TableID } from "@hanabi-live/data";

interface Queue {
  tail: Promise<void>;
  size: number;
  cleanup: (() => void) | undefined;
}

const queues = new Map<TableID, Queue>();
let pending = 0;

/** Returns false on bounded admission failure. Different tables never await each other. */
export async function enqueueTableOperation(
  tableID: TableID,
  operation: () => void | Promise<void>,
): Promise<boolean> {
  const queue = queues.get(tableID) ?? {
    tail: Promise.resolve(),
    size: 0,
    cleanup: undefined,
  };
  if (queue.size >= 64 || pending >= 4096) {
    return false;
  }
  queues.set(tableID, queue);
  queue.size++;
  pending++;
  const task = queue.tail.then(operation);
  // eslint-disable-next-line unicorn/prefer-then-catch -- Cleanup errors must not run finalization twice.
  const finalized = task.then(
    () => {
      finish(tableID, queue);
    },
    (error: unknown) => {
      try {
        finish(tableID, queue);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Table operation and cleanup failed.",
          { cause: cleanupError },
        );
      }
      throw error;
    },
  );
  // The caller receives the rejection; the queue must still advance after it.
  queue.tail = finalized.catch(() => undefined);
  await finalized;
  return true;
}

function finish(tableID: TableID, queue: Queue) {
  const currentQueue = queue;
  currentQueue.size--;
  pending--;
  const { cleanup } = queue;
  currentQueue.cleanup = undefined;
  try {
    cleanup?.();
  } finally {
    if (queue.size === 0) {
      queues.delete(tableID);
    }
  }
}

/**
 * Coalesces disconnect cleanup into one reserved slot per active table. Cleanup runs between
 * commands, including after a failed command, and cannot be dropped by client queue saturation.
 */
export function scheduleTableCleanup(
  tableID: TableID,
  cleanup: () => void,
): void {
  const queue = queues.get(tableID);
  if (queue === undefined) {
    cleanup();
  } else {
    queue.cleanup = cleanup;
  }
}
