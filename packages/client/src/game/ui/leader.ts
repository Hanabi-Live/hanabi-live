// Passing the lead of a shared replay to someone else.

import * as modals from "../../modals.ts";
import { getHTMLElement } from "../../utils.ts";
import { globals } from "./UIGlobals.ts";

const leaderPlaceholder = getHTMLElement("#leader-placeholder");

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
    button.dataset["player"] = spectator.username;
    button.addEventListener("click", (event) => {
      const element = event.target as HTMLElement;
      setLeader(element.dataset["player"]);
    });
    button.type = "submit";

    leaderPlaceholder.append(button);
  }

  modals.showPrompt("#set-leader-modal");
}

function setLeader(player: string | undefined) {
  modals.closeModals();

  if (player === undefined) {
    return;
  }

  globals.lobby.conn!.send("tableSetLeader", {
    tableId: globals.lobby.tableId,
    username: player,
  });
}
