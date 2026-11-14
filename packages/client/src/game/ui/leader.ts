// Passing the lead of a shared replay to someone else.

import type { UserId } from "@hanabi-live/data";
import * as modals from "../../modals.ts";
import { getHtmlElement } from "../../utils.ts";
import { globals } from "./UiGlobals.ts";

const leaderPlaceholder = getHtmlElement("#leader-placeholder");

/** Asks who should lead the shared replay, with a button for each other person in it. */
export function showPassLeaderDialog(): void {
  if (globals.state.replay.shared === undefined) {
    return;
  }

  if (globals.state.spectators.length === 1) {
    modals.showWarning(
      "You are the only person in the shared replay, so you cannot pass the leader to someone else.",
    );
    return;
  }

  leaderPlaceholder.replaceChildren();

  for (const spectator of globals.state.spectators) {
    if (spectator.username === globals.state.replay.shared.leader) {
      continue;
    }

    const button = document.createElement("button");

    button.textContent = spectator.username;
    button.classList.add("button");
    const { userId } = spectator;
    button.addEventListener("click", () => {
      setLeader(userId);
    });
    button.type = "submit";
    // The dialog would otherwise focus its close button, which comes first.
    button.autofocus = leaderPlaceholder.childElementCount === 0;

    leaderPlaceholder.append(button);
  }

  modals.showPrompt("#set-leader-modal");
}

export function setLeader(userId: UserId): void {
  modals.closeModals();
  globals.lobby.conn!.send("tableSetOwner", {
    tableId: globals.lobby.joinedTableId,
    userId,
  });
}
