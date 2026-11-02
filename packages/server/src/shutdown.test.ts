import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { incomingCommands } from "./commandAdmission";
import { ShutdownControl } from "./shutdown";

jest.mock("./logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./wsHelpers", () => ({ wsSendAll: jest.fn() }));

describe("scheduled shutdown ownership", () => {
  let active: number;
  const actions = {
    activeGames: () => active,
    clearPregames: jest.fn<() => Promise<void>>(),
    terminateGames: jest.fn<() => Promise<void>>(),
    notice: jest.fn<(message: string) => Promise<void>>(),
    prepareRestart: jest.fn<() => Promise<void>>(),
    stop: jest.fn<(restart: boolean) => Promise<void>>(),
  };
  let control: ShutdownControl;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    active = 1;
    actions.clearPregames.mockResolvedValue(undefined);
    actions.terminateGames.mockResolvedValue(undefined);
    actions.notice.mockResolvedValue(undefined);
    actions.prepareRestart.mockResolvedValue(undefined);
    actions.stop.mockResolvedValue(undefined);
    control = new ShutdownControl(actions);
    control.activate();
  });
  afterEach(async () => {
    control.dispose();
    await incomingCommands.drain();
    incomingCommands.resume();
    jest.useRealTimers();
  });

  test("cancellation invalidates pending warnings and preserves its wire timestamp", async () => {
    await control.schedule();
    const started = control.metadata().datetimeShutdownInit;
    await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(actions.notice).toHaveBeenLastCalledWith(
      expect.stringContaining("10 minutes"),
    );
    await control.cancel();
    expect(control.metadata()).toEqual({
      shuttingDown: false,
      datetimeShutdownInit: started,
    });
    await jest.advanceTimersByTimeAsync(40 * 60 * 1000);
    expect(actions.clearPregames).not.toHaveBeenCalled();
    expect(actions.stop).not.toHaveBeenCalled();
    expect(actions.notice).toHaveBeenLastCalledWith(
      "Server shutdown has been canceled.",
    );
  });

  test("clears pregames, terminates remaining games at the deadline, then grants the completion grace period", async () => {
    actions.terminateGames.mockImplementation(async () => {
      active = 0;
      await Promise.resolve();
    });
    await control.schedule();
    await jest.advanceTimersByTimeAsync(25 * 60 * 1000);
    expect(actions.clearPregames).toHaveBeenCalledTimes(1);
    expect(actions.notice).toHaveBeenLastCalledWith(
      expect.stringContaining("5 minutes"),
    );
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(actions.terminateGames).toHaveBeenCalledTimes(1);
    expect(actions.stop).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(11_000);
    expect(actions.stop).toHaveBeenCalledWith(false);
  });

  test("wall-clock adjustments do not change the remaining shutdown window", async () => {
    await control.schedule();
    jest.setSystemTime(Date.now() + 60 * 60 * 1000);
    expect(control.isImminent()).toBe(false);
    await jest.advanceTimersByTimeAsync(25 * 60 * 1000);
    expect(control.isImminent()).toBe(true);
  });

  test("an empty server shuts down without waiting for the scheduled deadline", async () => {
    active = 0;
    await control.schedule();
    await Promise.resolve();
    expect(actions.stop).toHaveBeenCalledWith(false);
  });

  test("failed restart preparation leaves the original shutdown schedule running", async () => {
    await control.schedule();
    actions.prepareRestart.mockRejectedValueOnce(new Error("invalid bundle"));
    await expect(control.stop(true)).rejects.toThrow("invalid bundle");
    expect(actions.stop).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(actions.notice).toHaveBeenLastCalledWith(
      expect.stringContaining("10 minutes"),
    );
    await control.cancel();
    expect(control.metadata().shuttingDown).toBe(false);
  });

  test("a failed drain cannot be canceled but can be retried", async () => {
    actions.stop.mockImplementationOnce(async () => {
      incomingCommands.pause();
      await Promise.resolve();
      throw new Error("uncertain checkpoint");
    });
    await control.schedule();
    await expect(control.stop(false)).rejects.toThrow("uncertain checkpoint");
    await expect(control.cancel()).rejects.toThrow("cannot cancel");
    expect(control.busy).toBe(false);
    await control.stop(true);
    expect(actions.prepareRestart).toHaveBeenCalledTimes(1);
    expect(actions.stop).toHaveBeenLastCalledWith(true);
  });
});
