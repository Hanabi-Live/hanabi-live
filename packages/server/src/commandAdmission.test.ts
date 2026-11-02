import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { CommandAdmission } from "./commandAdmission";

afterEach(() => {
  jest.useRealTimers();
});

describe("application command admission", () => {
  test("pausing rejects new work while draining successful and failed admitted commands", async () => {
    const admission = new CommandAdmission();
    const release = Promise.withResolvers<undefined>();
    const success = admission.run(async () => {
      await release.promise;
    });
    const failure = admission.run(async () => {
      await release.promise;
      throw new Error("failed command");
    });
    const failed = expect(failure).rejects.toThrow("failed command");
    let finished = false;
    const draining = admission.drain().then(() => {
      finished = true;
    });
    try {
      const unexpected = jest.fn<() => void>();
      expect(await admission.run(unexpected)).toBe(false);
      expect(unexpected).not.toHaveBeenCalled();
      expect(finished).toBe(false);
      expect(() => {
        admission.resume();
      }).toThrow("still running");
    } finally {
      release.resolve(undefined);
      await Promise.all([success, failed, draining]);
    }
    admission.resume();
    expect(await admission.run(() => undefined)).toBe(true);
  });

  test("a timed-out drain remains paused until underlying commands settle", async () => {
    jest.useFakeTimers();
    const admission = new CommandAdmission();
    const release = Promise.withResolvers<undefined>();
    const command = admission.run(async () => {
      await release.promise;
    });
    try {
      const failed = expect(admission.drain()).rejects.toThrow("remain paused");
      await jest.advanceTimersByTimeAsync(30_001);
      await failed;
      expect(await admission.run(() => undefined)).toBe(false);
      expect(() => {
        admission.resume();
      }).toThrow("still running");
    } finally {
      release.resolve(undefined);
      await command;
    }
    await admission.drain();
    admission.resume();
    expect(await admission.run(() => undefined)).toBe(true);
  });
});
