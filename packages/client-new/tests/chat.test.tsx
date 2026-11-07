// @vitest-environment jsdom
import { SERVER_COMMAND_SCHEMAS, Status } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Profiler } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { actions, createLobbyStore } from "../src/store";
import { App } from "../src/ui/App";
import { welcome } from "./messages";

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

function lobby(onRender: () => void) {
  const store = createLobbyStore();
  store.dispatch(actions.received({ command: "welcome", data: welcome() }));
  store.dispatch(
    actions.received({
      command: "user",
      data: SERVER_COMMAND_SCHEMAS.user.parse({
        userID: 2,
        name: "Bob",
        status: Status.Lobby,
        inactive: false,
        hyphenated: false,
      }),
    }),
  );
  const connection = new LobbyConnection(
    store,
    vi.fn(() => true),
  );
  store.dispatch(
    actions.received({
      command: "chat",
      data: SERVER_COMMAND_SCHEMAS.chat.parse({
        who: "Bob",
        room: "lobby",
        source: "user",
        msg: "Hello.",
        datetime: "2026-01-01T00:00:00Z",
      }),
    }),
  );
  const send = vi.spyOn(connection, "send").mockReturnValue(true);
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Profiler id="lobby" onRender={onRender}>
          <App connection={connection} />
        </Profiler>
      </MemoryRouter>
    </Provider>,
  );
  return { send, store };
}

it("shows private messages inline in the classic format", () => {
  const { store } = lobby(vi.fn());
  act(() => {
    for (const [who, recipient, msg] of [
      ["Bob", "Alice", "Incoming."],
      ["Alice", "Carol", "Outgoing."],
    ] as const) {
      store.dispatch(
        actions.received({
          command: "chat",
          data: SERVER_COMMAND_SCHEMAS.chat.parse({
            who,
            recipient,
            source: "user",
            msg,
            datetime: "2026-01-01T00:00:00Z",
          }),
        }),
      );
    }
  });
  const log = within(screen.getByRole("log", { name: "lobby messages" }));
  const labels = log
    .getAllByText(/^\[PM /u)
    .map((element) => [element.className, element.textContent]);
  expect(labels).toEqual([
    ["red", "[PM from Bob]"],
    ["red", "[PM to Carol]"],
  ]);
  expect(log.getByText("Incoming.")).toBeDefined();
});

it("replies to the latest incoming user PM, ignoring notices, public messages and sent PMs", () => {
  const { send, store } = lobby(vi.fn());
  act(() => {
    for (const message of [
      { who: "Bob", recipient: "Alice", source: "user" },
      { who: "Hanab Live", recipient: "Alice", source: "server" },
      { who: "Alice", recipient: "Carol", source: "user" },
      { who: "Dave", room: "lobby", source: "user" },
    ]) {
      store.dispatch(
        actions.received({
          command: "chat",
          data: SERVER_COMMAND_SCHEMAS.chat.parse({
            ...message,
            msg: "A message.",
            datetime: "2026-01-01T00:00:00Z",
          }),
        }),
      );
    }
  });
  fireEvent.change(screen.getByLabelText("Chat message"), {
    target: { value: "/r Reply to Bob" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(send).toHaveBeenLastCalledWith("chatPM", {
    recipient: "Bob",
    msg: "Reply to Bob",
  });

  act(() => {
    store.dispatch(
      actions.received({
        command: "chat",
        data: SERVER_COMMAND_SCHEMAS.chat.parse({
          who: "Carol",
          recipient: "Alice",
          source: "user",
          msg: "A newer PM.",
          datetime: "2026-01-01T00:01:00Z",
        }),
      }),
    );
  });
  fireEvent.change(screen.getByLabelText("Chat message"), {
    target: { value: "/r Reply to Carol" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(send).toHaveBeenLastCalledWith("chatPM", {
    recipient: "Carol",
    msg: "Reply to Carol",
  });
});

it("does not treat a server notice as a previous private correspondent", () => {
  const { send, store } = lobby(vi.fn());
  act(() => {
    store.dispatch(
      actions.received({
        command: "chat",
        data: SERVER_COMMAND_SCHEMAS.chat.parse({
          who: "Hanab Live",
          recipient: "Alice",
          source: "server",
          msg: "Your friends list is empty.",
          datetime: "2026-01-01T00:00:00Z",
        }),
      }),
    );
  });

  fireEvent.change(screen.getByLabelText("Chat message"), {
    target: { value: "/r Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(send).not.toHaveBeenCalledWith("chatPM", expect.anything());
  expect(
    screen.getByText(
      "There is no previous private message to reply to, or the reply is empty.",
    ),
  ).toBeDefined();
});

it("shows the server notice label in red and bolds player names like the classic client", () => {
  const { store } = lobby(vi.fn());
  act(() => {
    store.dispatch(
      actions.received({
        command: "chat",
        data: SERVER_COMMAND_SCHEMAS.chat.parse({
          who: "__server",
          source: "server",
          msg: "[Server Notice] See the roadmap.",
          datetime: "2026-01-01T00:00:00Z",
        }),
      }),
    );
  });
  const log = within(screen.getByRole("log", { name: "lobby messages" }));
  expect(log.getByText("[Server Notice]").className).toBe("red");
  expect(log.getByText(/See the roadmap\./u)).toBeDefined();
  expect(log.getByText("Bob").tagName).toBe("STRONG");
});

it("renders system messages without exposing an internal sender as a player", () => {
  const { store } = lobby(vi.fn());
  act(() => {
    store.dispatch(
      actions.received({
        command: "chat",
        data: SERVER_COMMAND_SCHEMAS.chat.parse({
          who: "__server",
          source: "server",
          msg: "The server has started.",
          datetime: "2026-01-01T00:00:00Z",
        }),
      }),
    );
  });
  expect(
    within(screen.getByRole("log", { name: "lobby messages" })).getByText(
      "The server has started.",
    ),
  ).toBeDefined();
  expect(screen.queryByText("__server")).toBeNull();
});
