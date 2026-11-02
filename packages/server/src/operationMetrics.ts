const DURATION_LIMITS = [
  0.001,
  0.005,
  0.01,
  0.05,
  0.1,
  0.5,
  1,
  5,
  10,
  Infinity,
] as const;

interface Metric {
  inFlight: number;
  completed: number;
  failed: number;
  totalDurationSeconds: number;
  maxDurationSeconds: number;
  buckets: Map<number, number>;
}

function report(metric: Metric) {
  return {
    inFlight: metric.inFlight,
    completed: metric.completed,
    failed: metric.failed,
    totalDurationSeconds: metric.totalDurationSeconds,
    maxDurationSeconds: metric.maxDurationSeconds,
    durationBucketsSeconds: Object.fromEntries(
      [...metric.buckets].map(([limit, count]) => [
        limit === Infinity ? "+Inf" : String(limit),
        count,
      ]),
    ),
  };
}

export class OperationMetrics {
  private readonly operations = new Map<string, Metric>();

  async measure<T>(name: string, work: () => T | Promise<T>): Promise<T> {
    const metric = this.operations.get(name) ?? {
      inFlight: 0,
      completed: 0,
      failed: 0,
      totalDurationSeconds: 0,
      maxDurationSeconds: 0,
      buckets: new Map(DURATION_LIMITS.map((limit) => [limit, 0])),
    };
    this.operations.set(name, metric);
    metric.inFlight++;
    const started = performance.now();
    let failed = true;
    try {
      const result = await work();
      failed = false;
      return result;
    } finally {
      const elapsed = (performance.now() - started) / 1000;
      metric.inFlight--;
      metric.completed++;
      if (failed) {
        metric.failed++;
      }
      metric.totalDurationSeconds += elapsed;
      metric.maxDurationSeconds = Math.max(metric.maxDurationSeconds, elapsed);
      for (const [limit, count] of metric.buckets) {
        if (elapsed <= limit) {
          metric.buckets.set(limit, count + 1);
        }
      }
    }
  }

  snapshot(): Readonly<Record<string, ReturnType<typeof report>>> {
    return Object.fromEntries(
      [...this.operations].map(([name, metric]) => [name, report(metric)]),
    );
  }
}

export const commandMetrics = new OperationMetrics();
export const storageMetrics = new OperationMetrics();
let failedCheckpoints = 0;
let encodedBytes = 0;

export function recordCheckpoint(data: string): void {
  encodedBytes += Buffer.byteLength(data);
}

export function recordCheckpointFailure(): void {
  failedCheckpoints++;
}

export function getRecoveryMetrics(): {
  readonly operations: ReturnType<OperationMetrics["snapshot"]>;
  readonly failedCheckpoints: number;
  readonly encodedBytes: number;
  readonly pendingTransactions: number;
} {
  const operations = storageMetrics.snapshot();
  return {
    operations,
    failedCheckpoints,
    encodedBytes,
    pendingTransactions: Object.values(operations).reduce(
      (total, metric) => total + metric.inFlight,
      0,
    ),
  };
}
