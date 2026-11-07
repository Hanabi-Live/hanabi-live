// @vitest-environment jsdom
import { SERVER_COMMAND_SCHEMAS, Status } from "@hanabi-live/data";
import { options } from "@hanabi-live/game";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { decodeEvent } from "../src/protocol";
import { actions, createLobbyStore } from "../src/store";
import { App } from "../src/ui/App";
import { GameDialog } from "../src/ui/GameDialog";
import { PeoplePanel } from "../src/ui/PeoplePanel";
import { TablesPanel } from "../src/ui/TablesPanel";
import { welcome } from "./messages";

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

it("keeps the exact table-send error in the open form", () => {
  const connection = new LobbyConnection(createLobbyStore(), vi.fn());
  vi.spyOn(connection, "send").mockImplementation(
    (_command, _data, onError) => {
      onError?.("Cannot send tableCreate: maxPlayers must be a number.");
      return false;
    },
  );
  const close = vi.fn();
  render(
    <MemoryRouter>
      <GameDialog close={close} connection={connection} welcome={welcome()} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create table" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Cannot send tableCreate: maxPlayers must be a number.",
  );
  expect(close).not.toHaveBeenCalled();
});

it("preserves an open editor's draft and update target when its table disappears", () => {
  const event = decodeEvent(
    `game ${JSON.stringify({
      tableID: 7,
      name: "Original table",
      owner: 1,
      maxPlayers: 2,
      passwordProtected: false,
      players: [],
      options: { ...options.parse({}), numPlayers: 0 },
    })}`,
  );
  if (event?.command !== "game") {
    throw new Error("Missing pregame event");
  }
  const connection = new LobbyConnection(createLobbyStore(), vi.fn());
  const send = vi.spyOn(connection, "send").mockReturnValue(true);
  const close = vi.fn();
  const user = welcome();
  const view = render(
    <MemoryRouter>
      <GameDialog
        close={close}
        connection={connection}
        game={event.data}
        welcome={user}
      />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Table name"), {
    target: { value: "Retained draft" },
  });
  view.rerender(
    <MemoryRouter>
      <GameDialog close={close} connection={connection} welcome={user} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Update table" }));
  expect(screen.getByLabelText("Table name").getAttribute("value")).toBe(
    "Retained draft",
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "no longer available",
  );
  expect(send).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it("keeps a submitted draft until confirmation and preserves it after rejection", () => {
  const connection = new LobbyConnection(createLobbyStore(), vi.fn());
  let reject: ((message: string) => void) | undefined;
  let accept: (() => void) | undefined;
  const send = vi
    .spyOn(connection, "send")
    .mockImplementation((_command, _data, onError, onComplete) => {
      reject = onError;
      accept = onComplete;
      return true;
    });
  const close = vi.fn();
  render(
    <MemoryRouter>
      <GameDialog close={close} connection={connection} welcome={welcome()} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Table name"), {
    target: { value: "Retained submission" },
  });
  fireEvent.change(screen.getByLabelText("Variant"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("Variant"), {
    target: { value: "Black (5 Suits)" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create table" }));
  expect(close).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Create table" }).closest("fieldset")
      ?.disabled,
  ).toBe(true);
  const dice = screen.getByRole("button", { name: "Choose a random variant" });
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    fireEvent.click(dice);
    expect(screen.getByLabelText("Variant").getAttribute("value")).toBe(
      "Black (5 Suits)",
    );
  } finally {
    random.mockRestore();
  }
  expect(dice.getAttribute("aria-disabled")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  act(() => reject?.("The server rejected these options."));
  expect(screen.getByRole("alert").textContent).toContain(
    "rejected these options",
  );
  expect(screen.getByLabelText("Table name").getAttribute("value")).toBe(
    "Retained submission",
  );
  fireEvent.click(screen.getByRole("button", { name: "Create table" }));
  act(() => accept?.());
  expect(send).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
});

it("keeps the current user and friends first without moving away users out of alphabetical order", () => {
  const store = createLobbyStore();
  store.dispatch(
    actions.received({
      command: "welcome",
      data: { ...welcome(), friends: ["Zoe"] },
    }),
  );
  for (const [index, name] of ["Aaron", "Alice", "Bob", "Zoe"].entries()) {
    store.dispatch(
      actions.received({
        command: "user",
        data: SERVER_COMMAND_SCHEMAS.user.parse({
          userID: index + 1,
          name,
          status: Status.Lobby,
          inactive: name === "Aaron",
          hyphenated: false,
        }),
      }),
    );
  }
  const connection = new LobbyConnection(store, vi.fn());
  const view = render(
    <Provider store={store}>
      <PeoplePanel connection={connection} join={vi.fn()} />
    </Provider>,
  );
  expect(
    [...view.container.querySelectorAll(".person-main")].map(
      (element) => element.textContent,
    ),
  ).toEqual(["Alice", "Zoe", "Aaron", "Bob"]);
});

it("preserves classic table grouping and oldest-first ordering within each group", () => {
  const store = createLobbyStore();
  store.dispatch(
    actions.received({
      command: "welcome",
      data: { ...welcome(), friends: ["Bob"] },
    }),
  );
  const scenarios = [
    { id: 20, name: "Joined", joined: true },
    { id: 30, name: "Friend", running: true, players: ["Bob"] },
    { id: 5, name: "Open" },
    { id: 4, name: "Password", passwordProtected: true },
    { id: 3, name: "Running newer", running: true },
    { id: 1, name: "Running older", running: true },
    {
      id: 2,
      name: "Review",
      running: true,
      sharedReplay: true,
      players: ["Bob"],
    },
  ];
  for (const scenario of scenarios) {
    const event = decodeEvent(
      `table ${JSON.stringify({
        joined: false,
        maxPlayers: 5,
        numPlayers: 2,
        ownerID: 1,
        options: options.parse({}),
        passwordProtected: false,
        players: ["Carol"],
        progress: 0,
        running: false,
        sharedReplay: false,
        spectators: [],
        timeBase: 0,
        timePerTurn: 0,
        timed: false,
        variant: "No Variant",
        ...scenario,
      })}`,
    );
    if (!event) {
      throw new Error("Missing table event");
    }
    store.dispatch(actions.received(event));
  }
  const connection = new LobbyConnection(store, vi.fn());
  const view = render(
    <Provider store={store}>
      <TablesPanel connection={connection} join={vi.fn()} />
    </Provider>,
  );
  expect(
    [...view.container.querySelectorAll(".classic-row-name")].map((element) =>
      element.textContent.trim(),
    ),
  ).toEqual([
    "Joined",
    "Friend",
    "Open",
    "Password",
    "Running older",
    "Running newer",
    "Review",
  ]);
});

it("uses saved timer preferences when editing an untimed table rather than its unlimited runtime clock", () => {
  const store = createLobbyStore();
  const user = welcome();
  const event = decodeEvent(
    `game ${JSON.stringify({
      tableID: 7,
      name: "Untimed table",
      owner: 1,
      maxPlayers: 2,
      passwordProtected: false,
      players: [],
      options: {
        ...options.parse({}),
        numPlayers: 0,
        timed: false,
        timeBase: 999_999,
        timePerTurn: 0,
      },
    })}`,
  );
  if (event?.command !== "game") {
    throw new Error("Missing pregame event");
  }
  const connection = new LobbyConnection(store, vi.fn());
  const send = vi.spyOn(connection, "send").mockReturnValue(true);
  const setting = vi.spyOn(connection, "setting").mockReturnValue(true);
  render(
    <MemoryRouter>
      <GameDialog
        close={vi.fn()}
        connection={connection}
        game={event.data}
        welcome={user}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByLabelText("Timed game"));
  expect(
    screen.getByLabelText("Base time (minutes)").getAttribute("value"),
  ).toBe(String(user.settings.createTableTimeBaseMinutes));
  expect(screen.getByLabelText("Seconds per turn").getAttribute("value")).toBe(
    String(user.settings.createTableTimePerTurnSeconds),
  );
  fireEvent.click(screen.getByLabelText("Timed game"));
  fireEvent.click(screen.getByRole("button", { name: "Update table" }));
  expect(send).toHaveBeenCalledWith(
    "tableUpdate",
    expect.objectContaining({ tableID: 7 }),
    expect.any(Function),
    expect.any(Function),
  );
  expect(setting).not.toHaveBeenCalledWith(
    "createTableTimeBaseMinutes",
    expect.anything(),
  );
});

it("waits for updated table options before reopening the editor by button or keyboard", () => {
  const store = createLobbyStore();
  store.dispatch(actions.received({ command: "welcome", data: welcome() }));
  const event = decodeEvent(
    `game ${JSON.stringify({
      tableID: 7,
      name: "Waiting for options",
      owner: 1,
      maxPlayers: 4,
      passwordProtected: false,
      players: [],
      options: { ...options.parse({}), numPlayers: 0 },
    })}`,
  );
  if (event?.command !== "game") {
    throw new Error("Missing pregame event");
  }
  store.dispatch(actions.received(event));
  const connection = new LobbyConnection(store, vi.fn());
  let confirmed: (() => void) | undefined;
  vi.spyOn(connection, "send").mockImplementation(
    (command, _data, _onError, onComplete) => {
      store.dispatch(actions.requestSent(command));
      confirmed = onComplete;
      return true;
    },
  );
  vi.spyOn(connection, "setting").mockReturnValue(true);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/table/7"]}>
        <App connection={connection} />
      </MemoryRouter>
    </Provider>,
  );
  const edit = screen.getByRole("button", { name: "Table options" });
  fireEvent.click(edit);
  fireEvent.change(screen.getByLabelText("Maximum players"), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update table" }));
  expect(edit.hasAttribute("disabled")).toBe(true);
  fireEvent.click(edit);
  fireEvent.keyDown(document.body, { code: "KeyC", altKey: true });
  expect(
    screen.getByRole("button", { name: "Update table" }).closest("fieldset")
      ?.disabled,
  ).toBe(true);
  act(() => {
    store.dispatch(
      actions.received({
        command: "game",
        data: { ...event.data, maxPlayers: 2 },
      }),
    );
    confirmed?.();
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(edit.hasAttribute("disabled")).toBe(false);
  fireEvent.keyDown(document.body, { code: "KeyC", altKey: true });
  expect(screen.getByLabelText("Maximum players").getAttribute("value")).toBe(
    "2",
  );
});
