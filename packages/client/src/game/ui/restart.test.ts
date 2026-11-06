import { beforeEach, expect, mock, test } from "bun:test";

const send = mock();
const setEnabled = mock();
const contentsVisible = mock();
const waitingVisible = mock();
const start = mock();
const stop = mock();
const show = mock();

await mock.module("./UIGlobals", () => ({
  globals: {
    restartPending: false,
    lobby: { tableID: 42, conn: { send } },
    elements: {
      restartButton: { setEnabled },
      restartContents: { visible: contentsVisible },
      restartWaitingOnServer: { visible: waitingVisible },
      restartWaitingOnServerAnimation: { start, stop },
      restartArea: { show },
    },
    layers: { UI2: { batchDraw: mock() } },
  },
}));
const { globals } = await import("./UIGlobals");
const { request, setPending } = await import("./restart");

beforeEach(() => {
  mock.clearAllMocks();
  globals.restartPending = false;
});

test.each([true, false])(
  "restart with hidePregame=%s blocks repeated and competing requests",
  (hidePregame) => {
    send.mockImplementationOnce(() => {
      expect(globals.restartPending).toBe(true);
      expect(contentsVisible).toHaveBeenLastCalledWith(false);
      expect(waitingVisible).toHaveBeenLastCalledWith(true);
      expect(start).toHaveBeenCalledTimes(1);
    });

    request(hidePregame);
    request(hidePregame);
    request(!hidePregame);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("tableRestart", {
      tableID: 42,
      hidePregame,
    });
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(show).toHaveBeenCalledTimes(1);
  },
);

test("a rejected restart restores the controls and allows retrying", () => {
  request(true);
  setPending(false);

  expect(stop).toHaveBeenCalledTimes(1);
  expect(contentsVisible).toHaveBeenLastCalledWith(true);
  expect(waitingVisible).toHaveBeenLastCalledWith(false);
  expect(setEnabled).toHaveBeenLastCalledWith(true);

  request(false);

  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenLastCalledWith("tableRestart", {
    tableID: 42,
    hidePregame: false,
  });
});

test("rebuilding the pending UI does not allow another restart", () => {
  request(false);
  mock.clearAllMocks();

  setPending(globals.restartPending);
  request(true);

  expect(contentsVisible).toHaveBeenCalledWith(false);
  expect(waitingVisible).toHaveBeenCalledWith(true);
  expect(start).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});
