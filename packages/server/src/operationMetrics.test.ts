import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { OperationMetrics } from "./operationMetrics";

afterEach(() => {
  jest.useRealTimers();
});

describe("aggregate operation metrics", () => {
  test("tracks concurrent work and cumulative latency buckets without retaining input data", async () => {
    jest.useFakeTimers();
    const metrics = new OperationMetrics();
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    const one = metrics.measure("action", async () => await first.promise);
    const two = metrics.measure("action", async () => await second.promise);
    expect(metrics.snapshot()["action"]?.inFlight).toBe(2);
    await jest.advanceTimersByTimeAsync(5);
    first.resolve("private-result-one");
    expect(await one).toBe("private-result-one");
    await jest.advanceTimersByTimeAsync(5);
    second.resolve("private-result-two");
    expect(await two).toBe("private-result-two");
    const snapshot = metrics.snapshot();
    expect(snapshot["action"]).toMatchObject({
      inFlight: 0,
      completed: 2,
      failed: 0,
      totalDurationSeconds: 0.015,
      maxDurationSeconds: 0.01,
      durationBucketsSeconds: { "0.001": 0, "0.005": 1, "0.01": 2, "+Inf": 2 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("private-result");
  });

  test("propagates failures and records their completed duration", async () => {
    const metrics = new OperationMetrics();
    const failure = new Error("storage unavailable");
    await expect(
      metrics.measure("checkpoint", () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(metrics.snapshot()["checkpoint"]).toMatchObject({
      inFlight: 0,
      completed: 1,
      failed: 1,
      durationBucketsSeconds: { "+Inf": 1 },
    });
  });
});
