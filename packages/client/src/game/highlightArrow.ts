// The highlight arrow points at a card, at a player's name, or at a part of the board. In a replay,
// a right-click draws it. The leader of a shared replay shows it to everyone who follows the shared
// turns. During a game, Ctrl + right-click draws one that only the player sees. Both game screens
// draw it.

import type {
  replayBoardElementSchema,
  ServerEventData,
} from "@hanabi-live/data";
import type { CardOrder, PlayerIndex } from "@hanabi-live/game";
import type { z } from "zod";
import { globals as lobbyGlobals } from "../Globals.ts";
import type { ModifierKeys } from "./noteShortcuts.ts";
import type { State } from "./types/State.ts";

/** A part of the board that a highlight arrow can point at, besides cards. */
export type ReplayBoardElement = z.infer<typeof replayBoardElementSchema>;

/** A player's name, which a highlight arrow can point at. */
interface PlayerArrowTarget {
  readonly playerIndex: PlayerIndex;
}

/** What a highlight arrow points at: a card, a player's name, or a part of the board. */
export type ArrowTarget = CardOrder | PlayerArrowTarget | ReplayBoardElement;

function isSameArrowTarget(
  a: ArrowTarget | undefined,
  b: ArrowTarget | undefined,
): boolean {
  return typeof a === "object" && typeof b === "object"
    ? a.playerIndex === b.playerIndex
    : a === b;
}

/** A string that names the target, such as for a React key. */
export function getArrowTargetKey(target: ArrowTarget): string {
  return typeof target === "object"
    ? `player-${target.playerIndex}`
    : target.toString();
}

/**
 * What the shared replay's leader points at, as the server sends it. `undefined` hides the arrow.
 */
export type WireArrowTarget = Extract<
  ServerEventData["replayAction"]["action"],
  { type: "arrow" }
>["target"];

/**
 * Whether a right-click with these keys held down draws an arrow. In a replay, any right-click
 * does, so that it works while the player holds a push-to-talk key. Followers in a shared replay
 * cannot draw one, since it could look as if they were the leader. Neither can a leader who does
 * not follow the shared turns, since the others would not see it. During a game, Ctrl + right-click
 * draws an arrow that only the player sees.
 */
export function canDrawArrow(state: State, keys: ModifierKeys): boolean {
  const { shared } = state.replay;
  return state.finished
    ? shared === undefined || (shared.amLeader && shared.useSharedSegments)
    : shared === undefined
        && keys.ctrlKey
        && !keys.shiftKey
        && !keys.altKey
        && !keys.metaKey;
}

/**
 * The target of the arrow after a click on `target`, while the arrow points at `shown`. A click on
 * what the arrow points at hides it, unless `alwaysShow` is set.
 */
export function getToggledArrow(
  shown: ArrowTarget | undefined,
  target: ArrowTarget,
  alwaysShow = false,
): ArrowTarget | undefined {
  return alwaysShow || !isSameArrowTarget(shown, target) ? target : undefined;
}

export function fromWireArrowTarget(
  target: WireArrowTarget,
): ArrowTarget | undefined {
  if (target === undefined) {
    return undefined;
  }

  switch (target.type) {
    case "card": {
      return target.order;
    }

    case "player": {
      return { playerIndex: target.playerIndex };
    }

    case "board": {
      return target.element;
    }
  }
}

function toWireArrowTarget(target: ArrowTarget): NonNullable<WireArrowTarget> {
  if (typeof target === "number") {
    return {
      type: "card",
      order: target,
    };
  }

  if (typeof target === "object") {
    return {
      type: "player",
      playerIndex: target.playerIndex,
    };
  }

  return {
    type: "board",
    element: target,
  };
}

/** Shows the arrow to the followers, if we lead a shared replay and follow its shared turns. */
export function sendArrow(state: State, target: ArrowTarget | undefined): void {
  const { shared } = state.replay;
  if (shared === undefined || !shared.amLeader || !shared.useSharedSegments) {
    return;
  }

  const action: { type: "arrow"; target?: NonNullable<WireArrowTarget> } =
    target === undefined
      ? { type: "arrow" }
      : {
          type: "arrow",
          target: toWireArrowTarget(target),
        };
  lobbyGlobals.connection.send("replayAction", {
    tableId: lobbyGlobals.joinedTableId,
    action,
  });
}
