import { beforeEach, expect, test, vi } from "vitest";

/** The server's reply to a restart, which `send` gives at once unless it is undefined. */
let reply: { ok: boolean } | undefined;
const send = vi.fn(
  (_command: string, _data: unknown, onReply: (answer: unknown) => void) => {
    if (reply !== undefined) {
      onReply(reply);
    }
  },
);
const setEnabled = vi.fn();
const contentsVisible = vi.fn();
const waitingVisible = vi.fn();
const start = vi.fn();
const stop = vi.fn();
const show = vi.fn();

vi.mock("../../Globals.ts", () => ({
  globals: { joinedTableId: 42, connection: { send } },
}));
vi.mock("./UiGlobals.ts", () => ({
  globals: {
    elements: {
      restartButton: { setEnabled },
      restartContents: { visible: contentsVisible },
      restartWaitingOnServer: { visible: waitingVisible },
      restartWaitingOnServerAnimation: { start, stop },
      restartArea: { show },
    },
    layers: { UI2: { batchDraw: vi.fn() } },
  },
}));
const gameSession = await import("../gameSession.ts");
const { request, setPending } = await import("./restart.ts");

beforeEach(() => {
  vi.clearAllMocks();
  gameSession.setRestartPending(false);
  reply = undefined;
});

test.each([true, false])(
  "restart with startNow=%s blocks repeated and competing requests",
  (startNow) => {
    send.mockImplementationOnce(() => {
      expect(gameSession.isRestartPending()).toBe(true);
      expect(contentsVisible).toHaveBeenLastCalledWith(false);
      expect(waitingVisible).toHaveBeenLastCalledWith(true);
      expect(start).toHaveBeenCalledTimes(1);
    });

    request(startNow);
    request(startNow);
    request(!startNow);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      "tableRestart",
      { tableId: 42, startNow },
      expect.any(Function),
    );
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(show).toHaveBeenCalledTimes(1);
  },
);

test("a refused restart restores the controls and allows retrying", () => {
  reply = { ok: false };
  request(true);

  expect(stop).toHaveBeenCalledTimes(1);
  expect(contentsVisible).toHaveBeenLastCalledWith(true);
  expect(waitingVisible).toHaveBeenLastCalledWith(false);
  expect(setEnabled).toHaveBeenLastCalledWith(true);

  request(false);

  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenLastCalledWith(
    "tableRestart",
    { tableId: 42, startNow: false },
    expect.any(Function),
  );
});

test("a restart that succeeds keeps waiting for the new table", () => {
  reply = { ok: true };
  request(true);

  expect(gameSession.isRestartPending()).toBe(true);
  expect(stop).not.toHaveBeenCalled();
});

test("rebuilding the pending UI does not allow another restart", () => {
  request(false);
  vi.clearAllMocks();

  setPending(gameSession.isRestartPending());
  request(true);

  expect(contentsVisible).toHaveBeenCalledWith(false);
  expect(waitingVisible).toHaveBeenCalledWith(true);
  expect(start).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});
