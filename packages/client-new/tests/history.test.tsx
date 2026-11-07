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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { wireHistory } from "../src/protocol";
import { actions, createLobbyStore } from "../src/store";
import { ClassicHeader } from "../src/ui/ClassicHeader";
import { HistoryPanel, OtherScoresPanel } from "../src/ui/HistoryPanel";
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
      <MemoryRouter initialEntries={["/history"]}>
        <ClassicHeader
          connection={connection}
          create={vi.fn()}
          edit={vi.fn()}
          join={vi.fn()}
        />
        <Routes>
          <Route
            element={<HistoryPanel connection={connection} />}
            path="history"
          />
          <Route
            element={<OtherScoresPanel connection={connection} />}
            path="history/other-scores/:seed"
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare seed" }));
  return send;
}

it("shows other scores as a page with seed and navigation buttons", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json([game(20)]));
  vi.stubGlobal("fetch", fetcher);
  history();
  expect(await screen.findByText("#20")).toBeDefined();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("columnheader", { name: "Other Scores" }),
  ).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Seed" })).toBeDefined();
  expect(
    screen.getByRole("link", { name: "View seed data" }).getAttribute("href"),
  ).toBe("/seed/p2v0s1");
  fireEvent.click(screen.getByRole("link", { name: "Return to History" }));
  expect(await screen.findByText("#1")).toBeDefined();
});

it("pages large seed histories over HTTP without requesting an oversized WebSocket response", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(Array.from({ length: 10 }, (_, index) => game(index + 20))),
    )
    .mockResolvedValueOnce(Response.json([game(30)]));
  vi.stubGlobal("fetch", fetcher);
  const send = history();
  const page = within(document.body);
  expect(await page.findByText("#20")).toBeDefined();
  expect(send).not.toHaveBeenCalledWith("historyGetSeed", expect.anything());
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/seed-full/p2v0s1?size=10&page=0",
    expect.anything(),
  );
  fireEvent.click(page.getByRole("button", { name: "Next page" }));
  expect(await page.findByText("#30")).toBeDefined();
  expect(page.queryByText("#20")).toBeNull();
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/seed-full/p2v0s1?size=10&page=1",
    expect.anything(),
  );
  expect(
    page.getByRole("button", { name: "Next page" }).hasAttribute("disabled"),
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
  const page = within(document.body);
  const alert = await page.findByRole("alert");
  expect(alert.textContent).toContain("Loading seed history failed (HTTP 503)");
  expect(alert.textContent).toContain("Unavailable");
  expect(log).toHaveBeenCalled();
  fireEvent.click(page.getByRole("button", { name: "Retry comparison" }));
  expect(await page.findByText("#20")).toBeDefined();
  expect(page.queryByRole("alert")).toBeNull();
});
