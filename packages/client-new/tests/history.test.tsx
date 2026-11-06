// @vitest-environment jsdom
import { options } from "@hanabi-live/game";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { wireHistory } from "../src/protocol";
import { actions, createLobbyStore } from "../src/store";
import { HistoryPanel } from "../src/ui/HistoryPanel";
import { welcome } from "./messages";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function game(id: number) {
  return wireHistory.parse({
    id,
    options: options.parse({}),
    seed: "p2v0s1",
    score: 25,
    numTurns: 50,
    endCondition: 1,
    datetimeStarted: "2026-01-01T00:00:00Z",
    datetimeFinished: "2026-01-01T01:00:00Z",
    numGamesOnThisSeed: 9613,
    playerNames: ["Alice", "Bob"],
    tags: "",
    incrementNumGames: false,
  });
}

function history() {
  const store = createLobbyStore();
  store.dispatch(actions.received({ command: "welcome", data: welcome() }));
  store.dispatch(actions.received({ command: "gameHistory", data: [game(1)] }));
  const connection = new LobbyConnection(store, vi.fn());
  const send = vi.spyOn(connection, "send").mockReturnValue(true);
  render(
    <Provider store={store}>
      <MemoryRouter>
        <HistoryPanel connection={connection} />
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare seed" }));
  return send;
}

it("pages large seed histories over HTTP without requesting an oversized WebSocket response", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(Array.from({ length: 10 }, (_, index) => game(index + 20))),
    )
    .mockResolvedValueOnce(Response.json([game(30)]));
  vi.stubGlobal("fetch", fetcher);
  const send = history();
  const dialog = within(screen.getByRole("dialog"));
  expect(await dialog.findByText("#20")).toBeDefined();
  expect(send).not.toHaveBeenCalledWith("historyGetSeed", expect.anything());
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/seed-full/p2v0s1?size=10&page=0",
    expect.anything(),
  );
  fireEvent.click(dialog.getByRole("button", { name: "Next page" }));
  expect(await dialog.findByText("#30")).toBeDefined();
  expect(dialog.queryByText("#20")).toBeNull();
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/seed-full/p2v0s1?size=10&page=1",
    expect.anything(),
  );
  expect(
    dialog.getByRole("button", { name: "Next page" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("reports comparison failures and retries rather than showing an empty success", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(Response.json([game(20)]));
  vi.stubGlobal("fetch", fetcher);
  history();
  const dialog = within(screen.getByRole("dialog"));
  const alert = await dialog.findByRole("alert");
  expect(alert.textContent).toContain("Loading seed history failed (HTTP 503)");
  expect(alert.textContent).toContain("Unavailable");
  expect(log).toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Retry comparison" }));
  expect(await dialog.findByText("#20")).toBeDefined();
  expect(dialog.queryByRole("alert")).toBeNull();
});
