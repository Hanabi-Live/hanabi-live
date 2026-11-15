// What the redesigned game screen shows, from the game's state and the rest of the app. Unlike
// "tableView.ts", these functions read the store, the clocks, and the notes.

import type {
  CardIdentity,
  CardOrder,
  CardState,
  GameState,
  PlayerIndex,
  StateClue,
  SuitIndex,
} from "@hanabi-live/game";
import {
  StackDirection,
  getCharacterNameForPlayer,
  getClueName,
  getDeckPossibilities,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { store } from "../../store.ts";
import {
  getActivePlayerIndex,
  getPlayerTime,
  getTurnTime,
  isLowOnTime,
} from "../clock.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import { getEmpathyNote } from "../empathyNote.ts";
import { getEmpathyStyle } from "../empathyStyle.ts";
import { currentVariant } from "../gameSession.ts";
import { getViewPlayerIndex } from "../ourSeat.ts";
import {
  getStackDirectionLabel,
  getSudokuStackLabels,
} from "../stackLabels.ts";
import type { State } from "../types/State.ts";
import * as notes from "../ui/notes.ts";
import * as replay from "../ui/replay.ts";
import type { ClueLogEntry } from "./ClueLog.tsx";
import type { Seat } from "./Hands.tsx";
import type {
  DeckEmpathy,
  DiscardView,
  HoleView,
  StackView,
} from "./SharedCards.tsx";
import { getClueMarker } from "./clueMarkers.ts";
import type { CardView } from "./tableView.ts";
import {
  BLANK_NOTE,
  getCardView,
  getHandDisplayOrder,
  getTurnWarning,
} from "./tableView.ts";

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

/** The cards of a player's hand as they would be after a clue that the viewer is choosing. */
export interface CluePreview {
  readonly target: PlayerIndex;
  readonly deck: readonly CardState[];
}

/**
 * Returns the seats in the order that the screen shows them. The hands of the players in
 * `empathyPlayers` show their player's view of them, as the viewer's own hand always does. With
 * `empathyIncludesNotes`, that view also applies the notes that `getEmpathyNote` chooses. The
 * viewer's own hand always applies the viewer's notes. With `cluePreview`, a hand shows its
 * player's view of it after a clue that the viewer is choosing.
 */
export function getSeats(
  state: State,
  empathyPlayers: ReadonlySet<PlayerIndex>,
  empathyIncludesNotes: boolean,
  connections: readonly boolean[],
  cluePreview?: CluePreview,
): readonly Seat[] {
  const visibleState = state.visibleState!;
  const { metadata } = state;
  const { settings } = store.getState().session;
  const { numPlayers } = metadata.options;
  const variant = currentVariant();
  const hasSeat = state.playing || state.shadowing;
  // In the replay of a game that we played, our hand stays first.
  const firstPlayerIndex = getViewPlayerIndex(metadata);
  const timed = metadata.options.timeControl !== undefined;
  // The clocks belong to the game as it stands, so a replay of a past turn does not show them.
  const showClock =
    (timed || settings.showTimerInUntimed)
    && state.replay.segment === undefined
    && !state.finished;
  const hypo = state.replay.hypothetical;
  const controlsHypo = controlsHypothetical(state);
  const identities = getShownIdentities(state);
  // As on the classic screen, the H-Group warnings show only to players who follow the conventions,
  // and real-life mode leaves them out, as it leaves out what the clue tokens allow.
  const turnWarning =
    settings.hGroupConventions && !settings.realLifeMode
      ? getTurnWarning(visibleState, variant)
      : undefined;

  const seats: Seat[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const playerIndex = ((firstPlayerIndex + i) % numPlayers) as PlayerIndex;
    const you = hasSeat && playerIndex === metadata.ourPlayerIndex;
    // In a hypothetical that hides the drawn cards, the player who started it sees their own hand
    // only as the clues show it, as in the game.
    const previewDeck =
      cluePreview?.target === playerIndex ? cluePreview.deck : undefined;
    const empathy =
      you
      || previewDeck !== undefined
      || empathyPlayers.has(playerIndex)
      || (hypo !== undefined
        && !hypo.showDrawnCards
        && playerIndex === hypo.startingPlayerIndex);
    const hand = visibleState.hands[playerIndex] ?? [];
    const cards: CardView[] = [];
    for (const order of getHandDisplayOrder(hand, settings.reverseHands)) {
      const cardState = (previewDeck ?? visibleState.deck)[order];
      if (cardState === undefined) {
        continue;
      }
      // The preview of a clue shows only what the clues tell the player, as on the classic screen.
      const includesNotes =
        previewDeck === undefined && empathy && (empathyIncludesNotes || you);

      cards.push(
        getCardView({
          gameState: visibleState,
          cardState,
          cardIdentity: identities[order] ?? {
            suitIndex: undefined,
            rank: undefined,
          },
          note:
            includesNotes && empathyIncludesNotes
              ? getEmpathyNote(state, variant, order)
              : (state.notes.ourNotes[order] ?? BLANK_NOTE),
          variant,
          empathy,
          // Our own notes always apply to our own hand, as on the classic screen: a note can show a
          // card's identity and remove possibilities.
          empathyIncludesNotes: includesNotes,
          finished: state.finished,
          realLifeMode: settings.realLifeMode,
          empathyStyle: getEmpathyStyle(),
          hGroupConventions:
            settings.hGroupConventions && !metadata.hardVariant,
        }),
      );
    }

    const active = visibleState.turn.currentPlayerIndex === playerIndex;
    // Every player's name has their clock: the time left in a timed game, or the time taken in an
    // untimed one.
    const playerTime = showClock ? getPlayerTime(playerIndex) : undefined;
    const clock =
      playerTime === undefined
        ? undefined
        : millisecondsToClockString(playerTime);
    // The clock shows its time, so its tooltip says what the time is. The tooltip of the clock that
    // runs gives the time taken on this turn instead.
    const turnTime =
      clock !== undefined && getActivePlayerIndex() === playerIndex
        ? getTurnTime()
        : undefined;
    let clockTooltip = timed ? "Time left" : "Time taken in this game";
    if (turnTime !== undefined) {
      clockTooltip = `Time taken on this turn: ${millisecondsToClockString(turnTime)}`;
    }

    seats.push({
      playerIndex,
      name: metadata.playerNames[playerIndex] ?? "",
      active,
      you,
      acting: hypo === undefined ? you : controlsHypo && active,
      cards,
      clock,
      clockTooltip,
      // A player counts as connected until the server says otherwise, and in a replay, which has no
      // players to wait for.
      disconnected: !state.finished && connections[playerIndex] === false,
      // The clocks do not run while the game is paused.
      lowTime:
        timed
        && playerTime !== undefined
        && getActivePlayerIndex() === playerIndex
        && state.pause.pausingPlayerIndex === undefined
        && isLowOnTime(playerTime),
      turnWarning: active ? turnWarning : undefined,
    });
  }

  return seats;
}

export function getStacks(state: State): readonly StackView[] {
  const visibleState = state.visibleState!;
  const identities = getShownIdentities(state);
  const variant = currentVariant();
  const sudokuLabels = variant.sudoku
    ? getSudokuStackLabels(
        variant,
        visibleState.playStacks,
        visibleState.playStackStarts,
      )
    : undefined;
  return variant.suits.map((_suit, i) => {
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
      label:
        sudokuLabels?.[i]
        ?? getStackDirectionLabel(
          variant,
          suitIndex,
          visibleState.playStackDirections[suitIndex]
            ?? StackDirection.Undecided,
        ),
    };
  });
}

/**
 * Whether the players cannot see the score, the maximum score, or the strikes, as in "Throw It in a
 * Hole" variants. Players and those who shadow them see the game from a seat, and the cards that
 * they play go into the hole. Spectators and replays see everything.
 */
export function isScoreHidden(state: State): boolean {
  return (
    currentVariant().throwItInAHole
    && (state.playing || state.shadowing)
    && !state.finished
  );
}

/**
 * The hole of a "Throw It in a Hole" variant. It is `undefined` in other variants, and when it is
 * empty for a viewer who does not count it.
 */
export function getHole(state: State): HoleView | undefined {
  if (!currentVariant().throwItInAHole) {
    return undefined;
  }

  const visibleState = state.visibleState!;
  const count = isScoreHidden(state)
    ? visibleState.stats.numAttemptedCardsPlayed
    : undefined;
  const topOrder = visibleState.hole.at(-1);
  const identity =
    topOrder === undefined ? undefined : getShownIdentities(state)[topOrder];
  return count === undefined && topOrder === undefined
    ? undefined
    : {
        count,
        topOrder,
        topSuitIndex: identity?.suitIndex,
        topRank: identity?.rank,
      };
}

/**
 * The suits and ranks that the cards left in the deck can still be, from the viewer's point of
 * view. The classic screen shows them on the deck while the viewer holds the mouse button on it.
 */
export function getDeckEmpathy(state: State): DeckEmpathy {
  const possibilities = getDeckPossibilities(
    state.visibleState!.deck,
    state.metadata,
  );
  const variant = currentVariant();
  return {
    possibleSuitIndexes: variant.suits
      .map((_suit, i) => i as SuitIndex)
      .filter((suitIndex) =>
        possibilities.some(([possibleSuit]) => possibleSuit === suitIndex),
      ),
    possibleRanks: variant.ranks.filter((rank) =>
      possibilities.some(([, possibleRank]) => possibleRank === rank),
    ),
  };
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
  return segment === undefined
    ? undefined
    : gameState.clues.findLast((clue) => clue.segment === segment - 1);
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
      currentVariant(),
      getCharacterNameForPlayer(clue.giver, characterAssignments),
    ),
    marker: getClueMarker(clue, colorblindMode),
    touchedCards: clue.list,
    missedCards: clue.negativeList,
  }));
}

/**
 * For each strike box, the segment of its strike, as the classic screen's strike boxes have them.
 * In a replay, the boxes also stand for the strikes that come later, except in a spoiler-free
 * review. The strikes are hidden from the players in "Throw It in a Hole" variants.
 */
export function getStrikeSegments(
  state: State,
): ReadonlyArray<number | undefined> {
  if (isScoreHidden(state)) {
    return [];
  }

  const { strikes } = replay.isSpoilerFree()
    ? state.visibleState!
    : state.ongoingGame;
  return strikes.map((strike) => strike.segment);
}
