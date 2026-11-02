import { at, variantFor } from "./rules";
import type { EngineEvent, EngineState } from "./types";

export type Recipient =
  | { readonly kind: "player"; readonly playerIndex: number }
  | { readonly kind: "spectator"; readonly shadowingPlayerIndex?: number };

function equivalentPlayer(
  state: EngineState,
  recipient: Recipient,
): number | undefined {
  const index =
    recipient.kind === "player"
      ? recipient.playerIndex
      : recipient.shadowingPlayerIndex;
  if (index === undefined) {
    return undefined;
  }
  if (
    !Number.isSafeInteger(index)
    || index < 0
    || index >= state.players.length
  ) {
    if (recipient.kind === "player") {
      throw new RangeError("Invalid game recipient.");
    }
    return undefined;
  }
  return index;
}

/** Scrub historical draws as draws, not using the holder's current hand. */
function scrubEvent(
  state: EngineState,
  event: EngineEvent,
  recipient: Recipient,
): EngineEvent {
  const index = equivalentPlayer(state, recipient);
  if (index === undefined) {
    return event;
  }
  const player = at(state.players, index);
  if (event.type === "draw") {
    const count = state.players.length;
    const hidden =
      event.playerIndex === index
      || (state.options.detrimentalCharacters
        && (player.character === "Slow-Witted"
          || (player.character === "Blind Spot"
            && event.playerIndex === (index + 1) % count)
          || (player.character === "Oblivious"
            && event.playerIndex === (index + count - 1) % count)));
    if (hidden) {
      return { ...event, suitIndex: -1, rank: -1 };
    }
  } else if (event.type === "cardIdentity") {
    if (event.playerIndex === index) {
      return { ...event, suitIndex: -1, rank: -1 };
    }
  } else if (
    (event.type === "play" || (event.type === "discard" && event.failed))
    && variantFor(state).throwItInAHole
  ) {
    return { ...event, suitIndex: -1, rank: -1 };
  }
  return event;
}

/** Only this event projection is recipient-safe; EngineState contains the full deck. */
export function eventsForRecipient(
  state: EngineState,
  recipient: Recipient,
  events: readonly EngineEvent[] = state.events,
): readonly EngineEvent[] {
  equivalentPlayer(state, recipient);
  return events.map((event) => scrubEvent(state, event, recipient));
}
