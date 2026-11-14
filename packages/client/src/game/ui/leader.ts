// Passing the lead of a shared replay to someone else.

import type { UserId } from "@hanabi-live/data";
import { globals as lobbyGlobals } from "../../Globals.ts";
import * as modals from "../../modals.ts";
import { globals } from "./UiGlobals.ts";

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

  const { leader } = globals.state.replay.shared;
  const others = globals.state.spectators.filter(
    (spectator) => spectator.username !== leader,
  );

  modals.showPrompt(
    {
      type: "choice",
      title: "Set New Leader",
      description:
        "Who is the person that you want to pass the replay leader to?",
      options: others.map((spectator) => spectator.username),
    },
    (username) => {
      const spectator = others.find((other) => other.username === username);
      if (spectator !== undefined) {
        setLeader(spectator.userId);
      }
    },
  );
}

export function setLeader(userId: UserId): void {
  modals.closeModals();
  lobbyGlobals.connection.send("tableSetOwner", {
    tableId: lobbyGlobals.joinedTableId,
    userId,
  });
}
