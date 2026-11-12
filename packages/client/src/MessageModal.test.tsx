// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Connection } from "./Connection.ts";
import { globals } from "./Globals.ts";
import { MessageModal } from "./MessageModal.tsx";
import type { MessageModal as Modal } from "./messageModalSlice.ts";
import { messageModalClosed, messageModalShown } from "./messageModalSlice.ts";
import { closeModals, keepPlaying } from "./modals.ts";
import { store } from "./store.ts";

vi.mock("./modals.ts", () => ({
  closeModals: vi.fn(),
  confirm: vi.fn(),
  keepPlaying: vi.fn(),
}));
vi.mock("./lobby/signOut.ts", () => ({ signOut: vi.fn() }));

const send = vi.fn();

function show(modal: Modal) {
  render(
    <Provider store={store}>
      <MessageModal />
    </Provider>,
  );
  act(() => {
    store.dispatch(messageModalShown(modal));
  });
}

beforeEach(() => {
  globals.conn = { send } as unknown as Connection;
  send.mockClear();
  vi.mocked(closeModals).mockClear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  store.dispatch(messageModalClosed());
  vi.useRealTimers();
});

test("the idle warning counts down, and only players can keep the game going", () => {
  vi.useFakeTimers();
  show({ type: "idle", deadline: Date.now() + 299_000, canKeepPlaying: false });
  expect(document.querySelector("#idle-modal strong")?.textContent).toBe(
    "4:59",
  );
  expect(screen.queryByText("Keep Playing")).toBeNull();

  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(document.querySelector("#idle-modal strong")?.textContent).toBe(
    "3:59",
  );

  cleanup();
  show({ type: "idle", deadline: Date.now() + 299_000, canKeepPlaying: true });
  act(() => {
    screen.getByText("Keep Playing").click();
  });
  expect(keepPlaying).toHaveBeenCalledTimes(1);
});

test("the password modal starts with the last password, and Enter joins the table", () => {
  localStorage.setItem("joinTablePassword", "old");
  show({ type: "password", tableId: 5 });
  const input = document.querySelector<HTMLInputElement>(
    "#password-modal-password",
  )!;
  expect(input.value).toBe("old");

  fireEvent.change(input, { target: { value: "new" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledWith("tableJoin", {
    tableId: 5,
    password: "new",
  });
  expect(localStorage.getItem("joinTablePassword")).toBe("new");
  expect(closeModals).toHaveBeenCalledTimes(1);
});
