// @vitest-environment jsdom
import { SERVER_COMMAND_SCHEMAS, Status } from "@hanabi-live/data";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  fireEvent.click(screen.getByRole("button", { name: /Bob/u }));
  return send;
}

it("selects the private recipient and channel in the same commit, including reopening the same person", () => {
  const channels: Array<string | null> = [];
  let observing = false;
  lobby(() => {
    if (observing) {
      channels.push(screen.getByRole("log").getAttribute("aria-label"));
    }
  });
  observing = true;
  fireEvent.click(screen.getByRole("button", { name: "Message" }));
  observing = false;
  expect(channels.length).toBeGreaterThan(0);
  expect(channels.every((channel) => channel === "private messages")).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("Chat message"), {
    target: { value: "Private draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lobby" }));
  expect(
    screen.getByLabelText("Chat message").getAttribute("placeholder"),
  ).toBe("Say something kind...");
  fireEvent.click(screen.getByRole("button", { name: "Message" }));
  expect(screen.getByRole("log").getAttribute("aria-label")).toBe(
    "private messages",
  );
  expect(screen.getByDisplayValue("Private draft")).toBeDefined();
});

it("keeps recipient edits focused and isolates private drafts from public chat and other recipients", async () => {
  const send = lobby(vi.fn());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Message" }));
  await user.type(screen.getByLabelText("Chat message"), "For Bob only");
  await user.click(screen.getByRole("button", { name: "Lobby" }));
  expect(screen.queryByDisplayValue("For Bob only")).toBeNull();
  await user.type(screen.getByLabelText("Chat message"), "Hello lobby");
  await user.click(screen.getByRole("button", { name: /^Messages/u }));
  expect(screen.getByDisplayValue("For Bob only")).toBeDefined();
  const recipient = screen.getByLabelText("Message recipient");
  await user.clear(recipient);
  await user.type(recipient, "Carol");
  expect(document.activeElement).toBe(recipient);
  expect(screen.getByDisplayValue("Carol")).toBeDefined();
  expect(screen.queryByDisplayValue("For Bob only")).toBeNull();
  await user.type(screen.getByLabelText("Chat message"), "For Carol only");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(send).toHaveBeenLastCalledWith("chatPM", {
    recipient: "Carol",
    msg: "For Carol only",
  });
  await user.click(screen.getByRole("button", { name: "Lobby" }));
  expect(screen.getByDisplayValue("Hello lobby")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Message" }));
  expect(screen.getByDisplayValue("For Bob only")).toBeDefined();
});
