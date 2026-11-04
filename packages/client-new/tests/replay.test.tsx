// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LobbyConnection } from "../src/connection";
import { createLobbyStore } from "../src/store";
import { ReplayPanel } from "../src/ui/ReplayPanel";

afterEach(cleanup);

function replay(input: string) {
  const connection = new LobbyConnection(createLobbyStore(), vi.fn());
  const send = vi.spyOn(connection, "send").mockReturnValue(true);
  render(<ReplayPanel connection={connection} disabled={false} />);
  fireEvent.change(screen.getByLabelText("Game ID or replay link"), {
    target: { value: input },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open replay" }));
  return send;
}

it.each([
  "123",
  "https://hanab.live/replay/123#7",
  "https://hanab.live/shared-replay/123/2?example=1#7",
])("opens the requested game from %s", (input) => {
  expect(replay(input)).toHaveBeenCalledWith("replayCreate", {
    source: "id",
    databaseID: 123,
    visibility: "solo",
    shadowingPlayerIndex: -1,
  });
});

it.each([
  "0",
  "9007199254740992",
  "https://hanab.live/scores/123#7",
  "https://hanab.live/replay/123bad#7",
])("rejects an invalid replay target %s", (input) => {
  expect(replay(input)).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe(
    "Enter a positive game ID or a replay link.",
  );
});
