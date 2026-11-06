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
      <PeoplePanel connection={connection} message={vi.fn()} />
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
    { id: 2, name: "Review", running: true, sharedReplay: true },
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
      <TablesPanel connection={connection} create={vi.fn()} join={vi.fn()} />
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
  vi.spyOn(connection, "send").mockImplementation((command) => {
    store.dispatch(actions.requestSent(command));
    return true;
  });
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
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => {
    store.dispatch(
      actions.received({
        command: "game",
        data: { ...event.data, maxPlayers: 2 },
      }),
    );
  });
  expect(edit.hasAttribute("disabled")).toBe(false);
  fireEvent.keyDown(document.body, { code: "KeyC", altKey: true });
  expect(screen.getByLabelText("Maximum players").getAttribute("value")).toBe(
    "2",
  );
});
