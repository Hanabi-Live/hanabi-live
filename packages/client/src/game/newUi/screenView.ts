// What the redesigned game screen shows, from the game's state and the rest of the app. Unlike
// "tableView.ts", these functions read the store, the clocks, and the notes.

import type {
  CardIdentity,
  CardOrder,
  Clue,
  GameState,
  PlayerIndex,
  StateClue,
  SuitIndex,
} from "@hanabi-live/game";
import {
  getCharacterNameForPlayer,
  getClueName,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { store } from "../../store.ts";
import { getActivePlayerIndex, getPlayerTime } from "../clock.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import { getEmpathyNote } from "../empathyNote.ts";
import { getViewPlayerIndex } from "../ourSeat.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import * as notes from "../ui/notes.ts";
import * as replay from "../ui/replay.ts";
import type { ClueMarkerView } from "./Card.tsx";
import type { ClueLogEntry } from "./ClueLog.tsx";
import type { Seat } from "./Hands.tsx";
import type { DiscardView, StackView } from "./SharedCards.tsx";
import type { CardView } from "./tableView.ts";
import { BLANK_NOTE, getCardView, getHandDisplayOrder } from "./tableView.ts";

/**
 * The identity of each card, as the screen shows it. In a hypothetical, an edited card shows its
 * new identity, and a drawn card shows nothing while the drawn cards are hidden.
 */
export function getShownIdentities(state: State): readonly CardIdentity[] {
  const morphs = state.replay.hypothetical?.morphedIdentities;
  if (morphs === undefined || morphs.length === 0) {
    return state.cardIdentities;
  }

  // The array is sparse, with no entry for the cards that keep their identities.
  const identities = [...state.cardIdentities];
  for (const key of Object.keys(morphs)) {
    const order = Number(key);
    identities[order] = morphs[order]!;
  }
  return identities;
}

/**
 * Returns the seats in the order that the screen shows them. The hands of the players in
 * `empathyPlayers` show their player's view of them, as the viewer's own hand always does. With
 * `empathyIncludesNotes`, that view also applies the notes that `getEmpathyNote` chooses. The
 * viewer's own hand always applies the viewer's notes.
 */
export function getSeats(
  state: State,
  empathyPlayers: ReadonlySet<PlayerIndex>,
  empathyIncludesNotes: boolean,
): readonly Seat[] {
  const visibleState = state.visibleState!;
  const { metadata } = state;
  const { settings } = store.getState().session;
  const { numPlayers } = metadata.options;
  const hasSeat = state.playing || state.shadowing;
  // In the replay of a game that we played, our hand stays first.
  const firstPlayerIndex = getViewPlayerIndex(metadata);
  // The clock belongs to the game as it stands. A replay shows a past turn, so its current player
  // is not the one whose clock runs.
  const showClock =
    (metadata.options.timeControl !== undefined || settings.showTimerInUntimed)
    && state.replay.segment === undefined
    && !state.finished;
  const hypo = state.replay.hypothetical;
  const controlsHypo = controlsHypothetical(state);
  const identities = getShownIdentities(state);

  const seats: Seat[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const playerIndex = ((firstPlayerIndex + i) % numPlayers) as PlayerIndex;
    const you = hasSeat && playerIndex === metadata.ourPlayerIndex;
    // In a hypothetical that hides the drawn cards, the player who started it sees their own hand
    // only as the clues show it, as in the game.
    const empathy =
      you
      || empathyPlayers.has(playerIndex)
      || (hypo !== undefined
        && !hypo.showDrawnCards
        && playerIndex === hypo.startingPlayerIndex);
    const hand = visibleState.hands[playerIndex] ?? [];
    const cards: CardView[] = [];
    for (const order of getHandDisplayOrder(hand, settings.reverseHands)) {
      const cardState = visibleState.deck[order];
      if (cardState === undefined) {
        continue;
      }

      cards.push(
        getCardView({
          gameState: visibleState,
          cardState,
          cardIdentity: identities[order] ?? {
            suitIndex: undefined,
            rank: undefined,
          },
          note:
            empathy && empathyIncludesNotes
              ? getEmpathyNote(state, globals.variant, order)
              : (state.notes.ourNotes[order] ?? BLANK_NOTE),
          variant: globals.variant,
          empathy,
          // Our own notes always apply to our own hand, as on the classic screen: a note can show a
          // card's identity and remove possibilities.
          empathyIncludesNotes: empathy && (empathyIncludesNotes || you),
          finished: state.finished,
          realLifeMode: settings.realLifeMode,
        }),
      );
    }

    const active = visibleState.turn.currentPlayerIndex === playerIndex;
    let clock: string | undefined;
    if (showClock && active && getActivePlayerIndex() === playerIndex) {
      clock = millisecondsToClockString(getPlayerTime(playerIndex) ?? 0);
    }

    seats.push({
      playerIndex,
      name: metadata.playerNames[playerIndex] ?? "",
      active,
      you,
      acting: hypo === undefined ? you : controlsHypo && active,
      cards,
      clock,
    });
  }

  return seats;
}

export function getStacks(state: State): readonly StackView[] {
  const visibleState = state.visibleState!;
  const identities = getShownIdentities(state);
  return globals.variant.suits.map((_suit, i) => {
    const suitIndex = i as SuitIndex;
    const stack = visibleState.playStacks[suitIndex] ?? [];
    function rankOf(order: CardOrder | undefined) {
      return order === undefined
        ? undefined
        : (identities[order]?.rank ?? visibleState.deck[order]?.rank);
    }

    const top = stack.at(-1);
    return {
      suitIndex,
      topOrder: top,
      topRank: rankOf(top),
      belowRank: rankOf(stack.at(-2)),
    };
  });
}

/** Discarded cards go in order of rank, with cards of unknown rank last. */
function compareDiscards(a: DiscardView, b: DiscardView): number {
  return (
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
  );
}

export function getDiscardRows(
  state: State,
): ReadonlyArray<readonly DiscardView[]> {
  const visibleState = state.visibleState!;
  const identities = getShownIdentities(state);
  return visibleState.discardStacks
    .map((stack) =>
      stack
        .map((order): DiscardView => {
          const identity = identities[order];
          return {
            order,
            suitIndex: identity?.suitIndex,
            rank: identity?.rank,
          };
        })
        .toSorted(compareDiscards),
    )
    .filter((row: readonly DiscardView[]) => row.length > 0);
}

/** The notes that the tooltip of each card shows, for the cards that have notes. */
export function getNotesHtml(
  orders: Iterable<CardOrder>,
): ReadonlyMap<CardOrder, string> {
  const notesHtml = new Map<CardOrder, string>();
  for (const order of orders) {
    const html = notes.getShownNoteHtml(order);
    if (html !== "") {
      notesHtml.set(order, html);
    }
  }
  return notesHtml;
}

/** The clue that led to the turn that shows, if the last move was a clue. */
export function getClueForTurn(gameState: GameState): StateClue | undefined {
  const { segment } = gameState.turn;
  if (segment === undefined) {
    return undefined;
  }

  return gameState.clues.findLast((clue) => clue.segment === segment - 1);
}

/** How the clue being chosen shows on the cards that it would touch. */
export function getPreviewMarker(
  clue: Clue,
  colorblindMode: boolean,
): ClueMarkerView {
  return clue.type === "color"
    ? {
        type: "color",
        name: clue.value.name,
        fill: colorblindMode ? clue.value.fillColorblind : clue.value.fill,
      }
    : { type: "rank", label: clue.value.toString() };
}

/** How a clue shows on the arrows and beside the name of the player who gave it. */
export function getClueMarker(
  clue: StateClue,
  colorblindMode: boolean,
): ClueMarkerView {
  if (clue.type === "color") {
    const color = globals.variant.clueColors[clue.color];
    if (color !== undefined) {
      return {
        type: "color",
        name: color.name,
        fill: colorblindMode ? color.fillColorblind : color.fill,
      };
    }
  } else if (clue.type === "rank") {
    return { type: "rank", label: clue.rank.toString() };
  }

  return { type: "hidden" };
}

/** The clues of the game so far, for the clue log. */
export function getClueLogEntries(state: State): readonly ClueLogEntry[] {
  const { playerNames, characterAssignments } = state.metadata;
  const { colorblindMode } = store.getState().session.settings;
  return state.visibleState!.clues.map((clue) => ({
    segment: clue.segment,
    turn: clue.segment + 1,
    giverName: playerNames[clue.giver] ?? "",
    targetName: playerNames[clue.target] ?? "",
    clueName: getClueName(
      clue,
      globals.variant,
      getCharacterNameForPlayer(clue.giver, characterAssignments),
    ),
    marker: getClueMarker(clue, colorblindMode),
    touchedCards: clue.list,
    missedCards: clue.negativeList,
  }));
}

/** The markers for the cards that a clue touched. */
export function getClueMarkers(
  clue: StateClue | undefined,
  colorblindMode: boolean,
): ReadonlyMap<CardOrder, ClueMarkerView> {
  const markers = new Map<CardOrder, ClueMarkerView>();
  if (clue === undefined) {
    return markers;
  }

  const marker = getClueMarker(clue, colorblindMode);
  for (const order of clue.list) {
    markers.set(order, marker);
  }
  return markers;
}

/**
 * For each strike box, the segment of its strike, as the classic screen's strike boxes have them.
 * In a replay, the boxes also stand for the strikes that come later, except in a spoiler-free
 * review. The strikes are hidden in the "Throw It in a Hole" variant.
 */
export function getStrikeSegments(
  state: State,
): ReadonlyArray<number | undefined> {
  if (globals.variant.throwItInAHole) {
    return [];
  }

  const { strikes } = replay.isSpoilerFree()
    ? state.visibleState!
    : state.ongoingGame;
  return strikes.map((strike) => strike.segment);
}
