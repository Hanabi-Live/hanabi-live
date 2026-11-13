// The redesigned game screen. It draws a game, or its replay, from the same store as the classic
// screen.

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
  getCardsPerHand,
  getCharacterNameForPlayer,
  getClueCost,
  getClueName,
  getUnadjustedClueTokens,
  isAtMaxClueTokens,
  millisecondsToClockString,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import { clamp } from "complete-common";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as modals from "../../modals.ts";
import { store, useAppSelector } from "../../store.ts";
import * as gameChat from "../chat.ts";
import { getEmpathyNote } from "../empathyNote.ts";
import { getViewPlayerIndex } from "../ourSeat.ts";
import type { ClientAction, ClientClue } from "../types/ClientAction.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import { backToLobby } from "../ui/backToLobby.ts";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";
import { controlsHypothetical } from "../ui/controlsHypothetical.ts";
import { getGameInfoTooltip } from "../ui/gameInfoTooltip.ts";
import { getCardOrStackBase } from "../ui/getCardOrStackBase.ts";
import * as hypothetical from "../ui/hypothetical.ts";
import * as notes from "../ui/notes.ts";
import { getPaceRiskColor } from "../ui/paceRiskColor.ts";
import * as replay from "../ui/replay.ts";
import { getSpectatorsTooltip } from "../ui/spectatorsTooltip.ts";
import * as turn from "../ui/turn.ts";
import { canChooseSeat, getViewedSeat, viewAs } from "../ui/viewAs.ts";
import type { ClueMarkerView } from "./Card.tsx";
import {
  CARD_HEIGHT_PER_WIDTH,
  CardFace,
  CLUED_RAISE_PER_WIDTH,
} from "./Card.tsx";
import type { CardNotes } from "./CardNote.tsx";
import { rightClickNote } from "./CardNote.tsx";
import { ChatPanel } from "./ChatPanel.tsx";
import type { ClueLogEntry } from "./ClueLog.tsx";
import { ClueLog } from "./ClueLog.tsx";
import { CluePanel } from "./CluePanel.tsx";
import { EndGameMenu } from "./EndGame.tsx";
import type { Seat } from "./Hands.tsx";
import {
  CARD_GAP,
  EMPATHY_TOGGLE_SPACE,
  HAND_BOX_BOTTOM_PADDING,
  HAND_BOX_TOP_SPACE,
  Hands,
  NAME_COLUMN_MAX_WIDTH,
  NAME_GAP,
  NameColumnSizer,
} from "./Hands.tsx";
import { ReplayBar, TurnsBar } from "./ReplayBar.tsx";
import type { DiscardView, StackView, ZoneState } from "./SharedCards.tsx";
import {
  DECK_PILE_DEPTH,
  DiscardPile,
  PlayArea,
  TableTokens,
} from "./SharedCards.tsx";
import { StatusStrip } from "./StatusStrip.tsx";
import { ViewAsMenu } from "./ViewAsMenu.tsx";
import type { CardPositions, MoveEffects } from "./cardMotion.ts";
import {
  animateCardMoves,
  animateClue,
  areCardsMoving,
  MAX_ANIMATED_SEGMENT_CHANGE,
  measureCards,
  MOVE_BATCH_MILLISECONDS,
  stopCardMoves,
} from "./cardMotion.ts";
import {
  useElementSize,
  useMediaQuery,
  useNow,
  useWindowSize,
} from "./hooks.ts";
import type { Misplay } from "./playMotion.ts";
import {
  animateFinale,
  animateMaxScoreDrop,
  animateStackComplete,
  finishScoreSignals,
} from "./scoreMotion.ts";
import {
  getScreenScaleForWindow,
  setScreenScale,
  toScreenPixels,
} from "./screenScale.ts";
import type { CardView } from "./tableView.ts";
import {
  BLANK_NOTE,
  formatFutureEfficiency,
  formatPace,
  getCardView,
  getHandDisplayOrder,
  getTouchedCards,
  isClueAllowed,
} from "./tableView.ts";

/**
 * Window widths from the breakpoints in "public/css/tokens.css". The layout classes use the same
 * widths through the "narrow-1440" and "narrow-980" variants. At or below each one, the screen
 * makes room: first the side columns get narrower, then chat covers the table when open, and then
 * the columns stack and the page scrolls.
 */
const MEDIUM_WIDTH_QUERY = "(max-width: 1440px)";
const CHAT_OVERLAY_WIDTH_QUERY = "(max-width: 1280px)";
const STACKED_WIDTH_QUERY = "(max-width: 980px)";

/** A screen whose main pointer is a finger, which has no cursor to hover with. */
const TOUCH_QUERY = "(pointer: coarse)";

/** How far the pointer must move after pressing a card before the card starts to move with it. */
const DRAG_THRESHOLD_PIXELS = 6;

/** How often the clock on the current player's name updates. */
const CLOCK_TICK_MILLISECONDS = 500;

/** The smallest and largest card in a hand, in CSS pixels of width. */
const HAND_CARD_WIDTH = { MIN: 36, MAX: 150 } as const;

/**
 * When the columns stack, the names go beside the cards only if the cards are still at least this
 * wide. Otherwise, as on a phone, the names go above the cards, so that the cards get the whole
 * width.
 */
const NAMES_BESIDE_CARDS_MIN_CARD_WIDTH = 90;

/** The smallest and largest card on the play stacks and in the discard pile. */
const TABLE_CARD_WIDTH = { MIN: 30, MAX: 64 } as const;

/** The width in a stacked play area that is not cards: its padding and the gap before the deck. */
const STACKED_PLAY_AREA_OTHER_WIDTH = 48;

const HAND_BOX_HORIZONTAL_PADDING = 32;
const HAND_ROW_GAP = 6;

/**
 * The height in the play area that is not cards: its padding, its heading, and the deck's label.
 */
const PLAY_AREA_OTHER_HEIGHT = 130 + DECK_PILE_DEPTH;
const PLAY_STACK_GAP = 8;

type DropZone = "play" | "discard";

interface Drag {
  readonly order: CardOrder;
  readonly x: number;
  readonly y: number;
  readonly zone: DropZone | undefined;
}

/**
 * How long a card that the player dropped on the play stacks or the discard pile waits there for
 * the move to arrive. If the move does not arrive, such as when the server refuses it, the card
 * goes back to the hand.
 */
const DROP_WAIT_MILLISECONDS = 3000;

/** How the chat names us among the people watching. */
const YOU = "You";

/**
 * Where the card under the pointer sits, as the drag draws it (before its slight tilt), in the
 * screen's CSS pixels.
 */
function getDropRect(drag: Drag, cardWidth: number): DOMRect {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  return new DOMRect(
    toScreenPixels(drag.x) - cardWidth / 2,
    toScreenPixels(drag.y) - height / 2,
    cardWidth,
    height,
  );
}

/** Whether a key press goes into a text box, such as the chat, rather than to the game. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement
    && (target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement)
  );
}

/**
 * The keys that choose a color clue, in the order of the variant's colors, as on the classic
 * screen. They sit next to the number keys, which choose a rank.
 */
const COLOR_CLUE_KEYS = ["q", "w", "e", "r", "t", "y"] as const;

function isInside(element: HTMLElement | null, x: number, y: number): boolean {
  if (element === null) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** The handlers of the hidden copy of the clue panel, which no one can use. */
function ignore() {
  // The copy only holds the panel's space.
}

/** Plays the move in the game, or in the hypothetical when there is one. */
function sendAction(action: ClientAction) {
  if (globals.state.replay.hypothetical === undefined) {
    turn.end(action);
  } else {
    hypothetical.sendHypotheticalAction(action);
  }
}

/** The state that the player's moves change: the hypothetical's, or else the game's. */
function getActionState(state: State): GameState {
  return state.replay.hypothetical?.ongoing ?? state.ongoingGame;
}

function canDiscardNow(): boolean {
  return !isAtMaxClueTokens(
    getActionState(globals.state).clueTokens,
    globals.variant,
  );
}

/**
 * The identity of each card, as the screen shows it. In a hypothetical, an edited card shows its
 * new identity, and a drawn card shows nothing while the drawn cards are hidden.
 */
function getShownIdentities(state: State): readonly CardIdentity[] {
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

/** In a hypothetical with the cards turned on for editing, a card changes into another. */
function editCard(order: CardOrder) {
  const card = getCardOrStackBase(order);
  if (card !== undefined) {
    modals.askForMorph(card, globals.variant, globals.cardImages);
  }
}

/**
 * Returns the seats in the order that the screen shows them. The hands of the players in
 * `empathyPlayers` show their player's view of them, as the viewer's own hand always does. With
 * `empathyIncludesNotes`, that view also applies the notes that `getEmpathyNote` chooses. The
 * viewer's own hand always applies the viewer's notes.
 */
function getSeats(
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
    if (showClock && active && globals.clockPlayerIndex === playerIndex) {
      clock = millisecondsToClockString(globals.playerTimes[playerIndex] ?? 0);
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

function getStacks(state: State): readonly StackView[] {
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

function getDiscardRows(state: State): ReadonlyArray<readonly DiscardView[]> {
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
function getNotesHtml(
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
function getClueForTurn(gameState: GameState): StateClue | undefined {
  const { segment } = gameState.turn;
  if (segment === undefined) {
    return undefined;
  }

  return gameState.clues.findLast((clue) => clue.segment === segment - 1);
}

/** How a clue shows on the arrows and beside the name of the player who gave it. */
/** How the clue being chosen shows on the cards that it would touch. */
function getPreviewMarker(clue: Clue, colorblindMode: boolean): ClueMarkerView {
  return clue.type === "color"
    ? {
        type: "color",
        name: clue.value.name,
        fill: colorblindMode ? clue.value.fillColorblind : clue.value.fill,
      }
    : { type: "rank", label: clue.value.toString() };
}

function getClueMarker(
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
function getClueLogEntries(state: State): readonly ClueLogEntry[] {
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

/** Shows the turn just after a clue, in the in-game replay. */
function showClue(segment: number) {
  replay.goToSegment(segment + 1, true);
}

/** The markers for the cards that a clue touched. */
function getClueMarkers(
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

/** Shows the turn on which a discarded card left its hand, in the in-game replay. */
function showDiscard(order: CardOrder) {
  const segment = globals.state.ongoingGame.deck[order]?.segmentDiscarded;
  if (segment !== undefined) {
    showReplayTurn(segment);
  }
}

/**
 * Returns what the cards did on a move from one state to the next: the cards that were misplayed,
 * and whether plays and misplays show in full. They show only in a game in progress, as on the
 * classic screen, and not when the viewer steps through a replay.
 */
function getMoveEffects(
  state: State,
  before: GameState,
  after: GameState,
  segmentChange: number,
): MoveEffects {
  const { variant } = globals;
  const misplays = new Map<string, Misplay>();
  const earlierStrikes = new Set(before.strikes.map((strike) => strike.order));
  for (const [strikeIndex, strike] of after.strikes.entries()) {
    const suitIndex = after.deck[strike.order]?.suitIndex;
    if (earlierStrikes.has(strike.order) || suitIndex === undefined) {
      continue;
    }
    misplays.set(strike.order.toString(), {
      suitIndex,
      // The strikes are hidden in the "Throw It in a Hole" variant.
      strikeIndex: variant.throwItInAHole ? undefined : strikeIndex,
    });
  }

  return {
    // A play or a misplay comes a moment before its turn, so the segment does not change yet.
    live: state.replay.segment === undefined && segmentChange >= 0,
    misplays,
  };
}

/**
 * Shows the changes of the score on a move, as the classic screen does. The server sends a move in
 * several updates, so each one starts on the update that changes its numbers.
 *
 * - In a game in progress, a play that completes a stack celebrates it, and a play that gives the
 *   team a perfect score sets off the finale instead.
 * - A lost card that lowers the maximum score shows it, also in a replay, but not when the replay
 *   goes back.
 */
function animateScoreChanges(
  root: HTMLElement,
  before: GameState,
  after: GameState,
  live: boolean,
  segmentChange: number,
) {
  const { variant } = globals;
  if (live) {
    const completed = after.playStacks.findIndex(
      (stack, suitIndex) =>
        stack.length === variant.stackSize
        && before.playStacks[suitIndex]?.length === variant.stackSize - 1,
    );
    const playedCard = getLastPlayedCard(root, before, after);
    if (after.score === variant.maxScore && before.score < variant.maxScore) {
      animateFinale(root, variant.suits, playedCard);
    } else if (completed !== -1) {
      animateStackComplete(
        root,
        variant.suits,
        completed,
        playedCard,
        after.clueTokens > before.clueTokens ? before.clueTokens : undefined,
      );
    }
  }

  if (segmentChange >= 0 && after.stats.maxScore < before.stats.maxScore) {
    const discarded = new Set(before.discardStacks.flat());
    const lost = after.discardStacks
      .flat()
      .find((order) => !discarded.has(order));
    animateMaxScoreDrop(
      root,
      before.stats.maxScore,
      lost === undefined ? undefined : getCardElement(root, lost),
    );
  }
}

function getCardElement(
  root: HTMLElement,
  order: CardOrder,
): HTMLElement | undefined {
  return (
    root.querySelector<HTMLElement>(
      `[data-card-order="${CSS.escape(order.toString())}"]`,
    ) ?? undefined
  );
}

/** The card that was just played onto a stack, if there is one. */
function getLastPlayedCard(
  root: HTMLElement,
  before: GameState,
  after: GameState,
): HTMLElement | undefined {
  for (const [suitIndex, stack] of after.playStacks.entries()) {
    const order = stack.at(-1);
    if (
      order !== undefined
      && stack.length > (before.playStacks[suitIndex]?.length ?? 0)
    ) {
      return getCardElement(root, order);
    }
  }
  return undefined;
}

/**
 * For each strike box, the segment of its strike, as the classic screen's strike boxes have them.
 * In a replay, the boxes also stand for the strikes that come later, except in a spoiler-free
 * review. The strikes are hidden in the "Throw It in a Hole" variant.
 */
function getStrikeSegments(state: State): ReadonlyArray<number | undefined> {
  if (globals.variant.throwItInAHole) {
    return [];
  }

  const { strikes } = replay.isSpoilerFree()
    ? state.visibleState!
    : state.ongoingGame;
  return strikes.map((strike) => strike.segment);
}

/** Shows a turn in the in-game replay. */
function showReplayTurn(segment: number) {
  if (globals.state.replay.segment === undefined) {
    replay.enter(segment);
  } else {
    replay.goToSegment(segment, true);
  }
}

/**
 * Returns the width of the cards in the hands. When the columns stack, the page scrolls, so only
 * the width of the screen limits the cards.
 */
function getHandCardWidth(
  handsWidth: number,
  handsHeight: number,
  numPlayers: number,
  cardsPerHand: number,
  nameColumnWidth: number | undefined,
  stacked: boolean,
): number {
  const widthForCards =
    handsWidth
    - (nameColumnWidth === undefined ? 0 : nameColumnWidth + NAME_GAP)
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * (cardsPerHand - 1);
  const byWidth = widthForCards / cardsPerHand;
  const rowHeight =
    (handsHeight - HAND_ROW_GAP * (numPlayers - 1)) / numPlayers;
  const byHeight = stacked
    ? Infinity
    : // The padding above the cards grows with them (see "getHandBoxTopPadding").
      (rowHeight - HAND_BOX_BOTTOM_PADDING - HAND_BOX_TOP_SPACE)
      / (CARD_HEIGHT_PER_WIDTH + CLUED_RAISE_PER_WIDTH);
  return clamp(
    Math.floor(Math.min(byWidth, byHeight)),
    HAND_CARD_WIDTH.MIN,
    HAND_CARD_WIDTH.MAX,
  );
}

/**
 * Returns the width of the cards on the play stacks and in the discard pile. The play stacks and
 * the deck are one column of cards, or one row when the columns stack.
 */
function getTableCardWidth(
  playAreaWidth: number,
  playAreaHeight: number,
  numSuits: number,
  stacked: boolean,
): number {
  const gaps = PLAY_STACK_GAP * (numSuits - 1);
  const width = stacked
    ? (playAreaWidth - STACKED_PLAY_AREA_OTHER_WIDTH - gaps) / (numSuits + 1)
    : (playAreaHeight - PLAY_AREA_OTHER_HEIGHT - gaps)
      / ((numSuits + 1) * CARD_HEIGHT_PER_WIDTH);
  return clamp(Math.floor(width), TABLE_CARD_WIDTH.MIN, TABLE_CARD_WIDTH.MAX);
}

export function GameScreen({
  onSwitchToClassic,
}: {
  readonly onSwitchToClassic: () => void;
}): React.JSX.Element {
  useNow(CLOCK_TICK_MILLISECONDS);
  const state = useAppSelector((root) => root.game.current);
  const votes = useAppSelector((root) => root.game.votes);
  const chatOpen = useAppSelector((root) => root.newUi.chatOpen);
  const chatUnread = useAppSelector((root) => root.gameChat.unread);
  const mediumWidth = useMediaQuery(MEDIUM_WIDTH_QUERY);
  const chatOverlay = useMediaQuery(CHAT_OVERLAY_WIDTH_QUERY);
  const stacked = useMediaQuery(STACKED_WIDTH_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  // On a touch screen or a narrow window, the play stacks and the discard pile can be off the
  // screen, so the viewer taps a card and then "Play" or "Discard" instead of dragging it. Only one
  // of the two ways works at a time.
  const tapToMove = touch || stacked;
  const [menuCard, setMenuCard] = useState<CardOrder>();

  const [chosenClueTarget, setClueTarget] = useState<PlayerIndex>();
  const [clue, setClue] = useState<Clue>();
  // The card that the mouse button is held down on, for the clue log. Releasing it anywhere ends
  // the press, even after the pointer moved off the card, such as in a drag.
  const [pressedCard, setPressedCard] = useState<CardOrder>();
  useEffect(() => {
    function release() {
      setPressedCard(undefined);
    }
    globalThis.addEventListener("pointerup", release);
    globalThis.addEventListener("pointercancel", release);
    return () => {
      globalThis.removeEventListener("pointerup", release);
      globalThis.removeEventListener("pointercancel", release);
    };
  }, []);
  const [drag, setDrag] = useState<Drag>();
  // A card that the player dropped stays where it was dropped until its move arrives, and then the
  // move starts from there, not from the hand.
  const [drop, setDrop] = useState<Drag>();
  useEffect(() => {
    if (drop === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setDrop(undefined);
    }, DROP_WAIT_MILLISECONDS);
    return () => {
      clearTimeout(timeout);
    };
  }, [drop]);
  const [editingCards, setEditingCards] = useState(false);
  // The card whose note the viewer is typing.
  const [noteCard, setNoteCard] = useState<CardOrder>();

  const pendingDrag = useRef<{ order: CardOrder; x: number; y: number }>(
    undefined,
  );
  const dragRef = useRef<Drag>(undefined);
  const playZoneRef = useRef<HTMLElement>(null);
  const discardZoneRef = useRef<HTMLElement>(null);
  const [handsElement, setHandsElement] = useState<HTMLDivElement | null>(null);
  const [playAreaElement, setPlayAreaElement] = useState<HTMLDivElement | null>(
    null,
  );
  const handsSize = useElementSize(handsElement);
  const playAreaSize = useElementSize(playAreaElement);
  const [nameWidth, setNameWidth] = useState(0);

  // The hands that show their player's view of them: those whose eye button is on, and the one that
  // the viewer holds the pointer down on.
  const [empathyToggled, setEmpathyToggled] = useState<
    ReadonlySet<PlayerIndex>
  >(new Set());
  const [heldEmpathy, setHeldEmpathy] = useState<PlayerIndex>();

  // Holding the spacebar shows every hand as its player sees it, as on the classic screen. Ctrl +
  // Space also applies the viewer's notes.
  const [globalEmpathy, setGlobalEmpathy] = useState(false);
  const [globalEmpathyNotes, setGlobalEmpathyNotes] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || isTyping(event.target)) {
        return;
      }
      // Otherwise, the spacebar would also press the button that has the focus.
      event.preventDefault();
      setGlobalEmpathy(true);
      setGlobalEmpathyNotes(event.ctrlKey);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key !== " ") {
        return;
      }
      if (!isTyping(event.target)) {
        event.preventDefault();
      }
      setGlobalEmpathy(false);
    }

    // A window that loses the focus never gets the key's release.
    function onBlur() {
      setGlobalEmpathy(false);
    }

    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    globalThis.addEventListener("blur", onBlur);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
    };
  }, []);

  // The clue hotkeys (see `onClueKey.current` below). The listener stays the same, so it reads the
  // latest screen through the ref, which each render replaces.
  const onClueKey = useRef<(event: KeyboardEvent) => void>(undefined);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      onClueKey.current?.(event);
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // On a window too narrow for the chat panel beside the table, the chat starts collapsed.
  useEffect(() => {
    if (chatOverlay) {
      gameChat.hide();
    }
  }, [chatOverlay]);

  // A new turn clears the clue being chosen and any open card menu. In a hypothetical, its own
  // turns count.
  const turnNum =
    state === undefined ? undefined : getActionState(state).turn.turnNum;
  useEffect(() => {
    setClueTarget(undefined);
    setClue(undefined);
    setMenuCard(undefined);
  }, [turnNum]);

  // Editing cards ends with the hypothetical.
  const inHypothetical = state?.replay.hypothetical !== undefined;
  useEffect(() => {
    if (!inHypothetical) {
      setEditingCards(false);
    }
  }, [inHypothetical]);

  // The drag below reads the layout when the pointer moves, so it keeps the latest one here.
  const mainRef = useRef<HTMLElement>(null);
  const dropLayout = useRef({ stacked, handsElement });
  useEffect(() => {
    dropLayout.current = { stacked, handsElement };
  }, [stacked, handsElement]);

  // Move a card with the pointer, and play or discard it where the player drops it.
  useEffect(() => {
    function zoneAt(x: number, y: number): DropZone | undefined {
      // Beside the hands, the whole half of the table is the target: everything to the left of the
      // hands plays the card, and everything to the right discards it, from the top of the screen
      // to the bottom. The narrow layout puts the play stacks below the hands, so there only the
      // play stacks and the discard pile are targets.
      const main = mainRef.current?.getBoundingClientRect();
      const hands = dropLayout.current.handsElement?.getBoundingClientRect();
      if (
        !dropLayout.current.stacked
        && main !== undefined
        && hands !== undefined
      ) {
        if (x >= main.left && x < hands.left) {
          return "play";
        }
        if (x > hands.right && x <= main.right) {
          return "discard";
        }
        return undefined;
      }

      if (isInside(playZoneRef.current, x, y)) {
        return "play";
      }
      if (isInside(discardZoneRef.current, x, y)) {
        return "discard";
      }
      return undefined;
    }

    function onPointerMove(event: PointerEvent) {
      const pending = pendingDrag.current;
      if (pending === undefined) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - pending.x,
        event.clientY - pending.y,
      );
      if (dragRef.current === undefined && distance < DRAG_THRESHOLD_PIXELS) {
        return;
      }

      const next: Drag = {
        order: pending.order,
        x: event.clientX,
        y: event.clientY,
        zone: zoneAt(event.clientX, event.clientY),
      };
      dragRef.current = next;
      setDrag(next);
    }

    function onPointerUp(event: PointerEvent) {
      const { current } = dragRef;
      pendingDrag.current = undefined;
      dragRef.current = undefined;
      setDrag(undefined);
      if (current === undefined) {
        return;
      }

      const zone = zoneAt(event.clientX, event.clientY);
      const dropped = { ...current, x: event.clientX, y: event.clientY, zone };
      if (zone === "play") {
        setDrop(dropped);
        sendAction({ type: "play", order: current.order });
      } else if (zone === "discard" && canDiscardNow()) {
        setDrop(dropped);
        sendAction({ type: "discard", order: current.order });
      }
    }

    globalThis.addEventListener("pointermove", onPointerMove);
    globalThis.addEventListener("pointerup", onPointerUp);
    globalThis.addEventListener("pointercancel", onPointerUp);
    return () => {
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  // Move the cards when the game advances or the replay steps through a turn. The server sends one
  // move as several updates a few milliseconds apart (such as a play, then a draw, then the turn),
  // and the screen renders after each. So the updates within a short window count as one move:
  // each one starts the cards again from where they were before the move began, toward their newest
  // places. This runs before the page is painted, so the cards never flash in their new places.
  const rootRef = useRef<HTMLDivElement>(null);

  // The whole screen grows with the window (see "screenScale.ts"). The card moves below measure
  // with the new scale, so it is set first.
  const windowSize = useWindowSize();
  const screenScale = getScreenScaleForWindow(
    windowSize.width,
    windowSize.height,
  );
  useLayoutEffect(() => {
    setScreenScale(screenScale);
  }, [screenScale]);

  const shown = useRef<{
    /** Where the cards were the last time that nothing was moving. */
    readonly settledPositions: CardPositions;
    readonly shownState: GameState | undefined;
    /** The clue whose markers show, so that they fly in only once. */
    readonly shownClue: StateClue | undefined;
    readonly move:
      | {
          readonly startPositions: CardPositions;
          readonly startState: GameState;
          readonly startedAt: number;
        }
      | undefined;
  }>({
    settledPositions: new Map(),
    shownState: undefined,
    shownClue: undefined,
    move: undefined,
  });
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || state?.visibleState === undefined) {
      return;
    }
    const shownState = state.visibleState;

    const previous = shown.current;
    if (previous.shownState === undefined) {
      shown.current = {
        settledPositions: measureCards(root),
        shownState,
        shownClue: getClueForTurn(shownState),
        move: undefined,
      };
      return;
    }

    if (previous.shownState === shownState) {
      // Keep the positions up to date (for example, after a resize), unless cards are moving.
      if (!areCardsMoving()) {
        shown.current = { ...previous, settledPositions: measureCards(root) };
      }
      return;
    }

    const now = performance.now();
    let startPositions = previous.settledPositions;
    // A card that the player dropped starts its move from where it was dropped.
    if (drop !== undefined) {
      const dropped = startPositions.get(drop.order.toString());
      if (dropped !== undefined) {
        startPositions = new Map(startPositions).set(drop.order.toString(), {
          ...dropped,
          rect: getDropRect(drop, handCardWidth),
        });
      }
      setDrop(undefined);
    }
    const move =
      previous.move !== undefined
      && now - previous.move.startedAt <= MOVE_BATCH_MILLISECONDS
        ? previous.move
        : {
            startPositions,
            startState: previous.shownState,
            startedAt: now,
          };
    stopCardMoves();
    if (move !== previous.move) {
      finishScoreSignals();
    }
    const positions = measureCards(root);
    const segmentChange =
      (shownState.turn.segment ?? 0) - (move.startState.turn.segment ?? 0);
    if (Math.abs(segmentChange) <= MAX_ANIMATED_SEGMENT_CHANGE) {
      const effects = getMoveEffects(
        state,
        move.startState,
        shownState,
        segmentChange,
      );
      animateCardMoves(
        root,
        move.startPositions,
        positions,
        segmentChange > 0,
        effects,
      );

      if (!store.getState().session.settings.reducedMotion) {
        animateScoreChanges(
          root,
          previous.shownState,
          shownState,
          effects.live,
          segmentChange,
        );
      }
    }

    // A clue that was just given flies in from its giver, when the game moves forward a turn.
    const newClue = getClueForTurn(shownState);
    if (
      newClue !== undefined
      && newClue !== previous.shownClue
      && segmentChange > 0
      && segmentChange <= MAX_ANIMATED_SEGMENT_CHANGE
    ) {
      animateClue(root);
    }
    shown.current = {
      settledPositions: positions,
      shownState,
      shownClue: newClue,
      move,
    };
  });

  if (state?.visibleState === undefined) {
    return (
      <div className="tw:fixed tw:inset-0 tw:flex tw:items-center tw:justify-center tw:bg-game-bg tw:text-game-muted">
        Loading the game...
      </div>
    );
  }

  const { visibleState, metadata, ongoingGame } = state;
  const { variant } = globals;
  const { settings } = store.getState().session;
  const { options } = metadata;
  const inReplay = state.replay.segment !== undefined;
  const hypo = state.replay.hypothetical;
  // In a hypothetical that the viewer controls, they make every player's moves in turn.
  const controlsHypo = controlsHypothetical(state);
  const actionState = getActionState(state);
  const actingPlayerIndex =
    hypo === undefined
      ? metadata.ourPlayerIndex
      : actionState.turn.currentPlayerIndex;
  const ourTurn =
    hypo === undefined
      ? state.playing
        && !inReplay
        && ongoingGame.turn.currentPlayerIndex === metadata.ourPlayerIndex
      : controlsHypo && actingPlayerIndex !== undefined;
  const canMoveCards =
    hypo === undefined
      ? state.playing && !inReplay && (ourTurn || settings.preplay)
      : ourTurn && !editingCards;
  const canDiscard = canDiscardNow();
  const clueAvailable = actionState.clueTokens >= getClueCost(variant);
  const pausedBy =
    state.pause.pausingPlayerIndex === undefined
      ? undefined
      : metadata.playerNames[state.pause.pausingPlayerIndex];
  // A hypothetical goes on while the game is paused.
  const paused = hypo === undefined && pausedBy !== undefined;
  const canClue = ourTurn && clueAvailable && !editingCards && !paused;
  const showCluePanel =
    hypo === undefined ? state.playing && !inReplay : controlsHypo;
  const showReplayBar = inReplay || state.finished;

  const empathyPlayers = new Set<PlayerIndex>(
    globalEmpathy
      ? metadata.playerNames.map((_name, i) => i as PlayerIndex)
      : empathyToggled,
  );
  if (heldEmpathy !== undefined) {
    empathyPlayers.add(heldEmpathy);
  }
  const seats = getSeats(
    state,
    empathyPlayers,
    globalEmpathy && globalEmpathyNotes,
  );
  const shownClue = getClueForTurn(visibleState);
  const stacks = getStacks(state);
  const discardRows = getDiscardRows(state);
  const cardNotes: CardNotes = {
    // The cards on the screen: in the hands, on top of the play stacks, and in the discard pile.
    notesHtml: getNotesHtml([
      ...seats.flatMap((seat) => seat.cards.map((card) => card.order)),
      ...stacks
        .map((stack) => stack.topOrder)
        .filter((order) => order !== undefined),
      ...discardRows.flat().map((card) => card.order),
    ]),
    noteCard,
    // Notes are only for games that are still going.
    onRightClickCard: state.finished
      ? undefined
      : (event, order) => {
          if (rightClickNote(event, order)) {
            setNoteCard(order);
          }
        },
    onCloseNote: () => {
      setNoteCard(undefined);
    },
  };

  // The chat lists everyone who is watching, with us first as "You": our own name alone in a replay
  // would read as if the game were ours.
  const spectators = [
    ...state.spectators.filter(
      (spectator) => spectator.username === metadata.ourUsername,
    ),
    ...state.spectators.filter(
      (spectator) => spectator.username !== metadata.ourUsername,
    ),
  ];

  // With only one other player, such as in a 2-player game, the clue can only go to them, so they
  // do not need to be picked.
  const otherPlayers = seats.filter(
    (seat) => seat.playerIndex !== actingPlayerIndex,
  );
  const onlyClueTarget =
    otherPlayers.length === 1 ? otherPlayers[0]?.playerIndex : undefined;
  const clueTarget = chosenClueTarget ?? onlyClueTarget;
  const targetHand =
    clueTarget === undefined ? undefined : visibleState.hands[clueTarget];
  const touched =
    targetHand === undefined || clue === undefined
      ? []
      : getTouchedCards(variant, targetHand, getShownIdentities(state), clue);

  // While the player chooses a clue, its tokens show on the cards that it would touch, as the
  // classic screen shows arrows. They take the place of the last clue's tokens and rail.
  const previewing = clue !== undefined && clueTarget !== undefined;
  const canGive =
    canClue
    && clueTarget !== undefined
    && clue !== undefined
    && isClueAllowed(clue, touched.length, variant, options);

  const clueTargets = otherPlayers.map((seat) => ({
    playerIndex: seat.playerIndex,
    name: seat.name,
  }));

  function giveClue() {
    if (!canGive) {
      return;
    }

    if (clue.type === "color") {
      const colorIndex = variant.clueColors.findIndex(
        (color) => color.name === clue.value.name,
      ) as Extract<ClientClue, { type: "color" }>["color"];
      sendAction({
        type: "clue",
        receiverIndex: clueTarget,
        clue: { type: "color", color: colorIndex },
      });
    } else {
      sendAction({
        type: "clue",
        receiverIndex: clueTarget,
        clue: { type: "rank", rank: clue.value },
      });
    }
  }

  // The clue hotkeys of the classic screen: Tab or ";" picks the next player, "1" to "5" pick a
  // rank, "q" to "y" pick a color, and Ctrl + Enter gives the clue.
  onClueKey.current = (event) => {
    if (!canClue || isTyping(event.target)) {
      return;
    }

    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      giveClue();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      return;
    }

    if (event.key === "Tab" || event.key === ";") {
      event.preventDefault();
      const index = clueTargets.findIndex(
        (player) => player.playerIndex === clueTarget,
      );
      const next = clueTargets[(index + 1) % clueTargets.length];
      if (next !== undefined) {
        setClueTarget(next.playerIndex);
      }
      return;
    }

    const rank = variant.clueRanks[Number(event.key) - 1];
    if (rank !== undefined && /^\d$/u.test(event.key)) {
      setClue(newRankClue(rank));
      return;
    }
    const color =
      variant.clueColors[
        COLOR_CLUE_KEYS.indexOf(
          event.key.toLowerCase() as (typeof COLOR_CLUE_KEYS)[number],
        )
      ];
    if (color !== undefined) {
      setClue(newColorClue(color));
    }
  };

  let waitingText = "";
  if (hypo !== undefined) {
    if (editingCards) {
      waitingText = 'Turn off "Edit cards" to make a move.';
    } else if (actingPlayerIndex === undefined) {
      waitingText = "The hypothetical game is over.";
    } else if (!clueAvailable) {
      waitingText = "The team has no clues. Play or discard a card.";
    }
  } else if (paused && !inReplay) {
    waitingText = `${pausedBy} paused the game.`;
  } else if (!ourTurn) {
    const currentName =
      ongoingGame.turn.currentPlayerIndex === undefined
        ? undefined
        : metadata.playerNames[ongoingGame.turn.currentPlayerIndex];
    waitingText =
      inReplay || currentName === undefined
        ? "Return to the game to take your turn."
        : `Waiting for ${currentName}.`;
  } else if (!clueAvailable) {
    waitingText = "The team has no clues. Play or discard a card.";
  }

  // On a touch screen, the name column also holds the eye button that shows a player's view of
  // their hand.
  let nameColumnWidth: number | undefined =
    Math.min(
      nameWidth,
      mediumWidth ? NAME_COLUMN_MAX_WIDTH.MEDIUM : NAME_COLUMN_MAX_WIDTH.WIDE,
    ) + (touch ? EMPATHY_TOGGLE_SPACE : 0);
  function getHandCardWidthFor(columnWidth: number | undefined) {
    return getHandCardWidth(
      handsSize.width,
      handsSize.height,
      options.numPlayers,
      getCardsPerHand(options),
      columnWidth,
      stacked,
    );
  }
  let handCardWidth = getHandCardWidthFor(nameColumnWidth);
  if (stacked && handCardWidth < NAMES_BESIDE_CARDS_MIN_CARD_WIDTH) {
    nameColumnWidth = undefined;
    handCardWidth = getHandCardWidthFor(undefined);
  }
  const tableCardWidth = getTableCardWidth(
    playAreaSize.width,
    playAreaSize.height,
    variant.suits.length,
    stacked,
  );

  let playZoneState: ZoneState = "idle";
  let discardZoneState: ZoneState = "idle";
  if (drag !== undefined) {
    playZoneState = drag.zone === "play" ? "hovered" : "available";
    if (canDiscard) {
      discardZoneState = drag.zone === "discard" ? "hovered" : "available";
    } else {
      discardZoneState = "unavailable";
    }
  }

  const ghost = drag ?? drop;
  const draggedView =
    ghost === undefined
      ? undefined
      : seats
          .find((seat) => seat.acting)
          ?.cards.find((card) => card.order === ghost.order);

  // Only the efficiency of the game as it stands includes the player's own modifier.
  const efficiencyModifier =
    visibleState === ongoingGame ? state.notes.efficiencyModifier : 0;

  return (
    <div
      className="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:bg-game-bg tw:[background-image:var(--game-screen-table)] tw:text-game-text"
      ref={rootRef}
      style={{ zoom: screenScale }}
    >
      {/* The chat sits above the bar along the bottom, so that the bar's buttons stay in place
          whether the chat is open or not, with "Lobby" in the bottom-right corner. */}
      <div className="tw:relative tw:flex tw:min-h-0 tw:flex-1">
        <main
          className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col"
          ref={mainRef}
        >
          <div className="tw:flex tw:min-h-0 tw:flex-1 tw:justify-center tw:gap-9 tw:px-7 tw:pt-6 tw:pb-5 tw:narrow-1440:gap-6 tw:narrow-1440:px-5 tw:narrow-980:flex-col tw:narrow-980:justify-start tw:narrow-980:gap-4 tw:narrow-980:overflow-y-auto tw:narrow-980:px-3 tw:narrow-980:pt-3">
            <div
              className="tw:flex tw:shrink-0 tw:narrow-980:justify-center"
              ref={setPlayAreaElement}
            >
              <PlayArea
                cardsInDeck={visibleState.cardsRemainingInTheDeck}
                cardWidth={tableCardWidth}
                colorblindMode={settings.colorblindMode}
                notes={cardNotes}
                ref={playZoneRef}
                stacks={stacks}
                variant={variant}
                zoneState={playZoneState}
              />
            </div>

            <div className="tw:flex tw:min-w-0 tw:max-w-[760px] tw:flex-1 tw:flex-col tw:gap-3.5 tw:narrow-980:order-first tw:narrow-980:max-w-none tw:narrow-980:flex-none">
              <div
                className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:justify-center tw:narrow-980:flex-none"
                ref={setHandsElement}
              >
                <NameColumnSizer
                  onWidthChange={setNameWidth}
                  seats={seats}
                  showClock={
                    metadata.options.timeControl !== undefined
                    || settings.showTimerInUntimed
                  }
                />
                <Hands
                  canChooseClueTarget={canClue}
                  canDiscard={canDiscard}
                  canMoveCards={canMoveCards}
                  cardWidth={handCardWidth}
                  clueMarkers={
                    previewing
                      ? new Map(
                          touched.map((order) => [
                            order,
                            getPreviewMarker(clue, settings.colorblindMode),
                          ]),
                        )
                      : getClueMarkers(shownClue, settings.colorblindMode)
                  }
                  clueTarget={clueTarget}
                  colorblindMode={settings.colorblindMode}
                  draggedCard={ghost?.order}
                  empathyToggled={empathyToggled}
                  emptyClueTarget={
                    !previewing
                    && shownClue !== undefined
                    && shownClue.list.length === 0
                      ? shownClue.target
                      : undefined
                  }
                  menuCard={menuCard}
                  nameColumnWidth={nameColumnWidth}
                  notes={cardNotes}
                  onCardPointerDown={(event, order) => {
                    if (canMoveCards && !tapToMove && event.button === 0) {
                      pendingDrag.current = {
                        order,
                        x: event.clientX,
                        y: event.clientY,
                      };
                    }
                  }}
                  onCardTap={(order) => {
                    setMenuCard((current) =>
                      current === order ? undefined : order,
                    );
                  }}
                  onDiscard={(order) => {
                    setMenuCard(undefined);
                    if (canDiscardNow()) {
                      sendAction({ type: "discard", order });
                    }
                  }}
                  onEditCard={editingCards ? editCard : undefined}
                  onHoldEmpathy={setHeldEmpathy}
                  onPlay={(order) => {
                    setMenuCard(undefined);
                    sendAction({ type: "play", order });
                  }}
                  onPressCard={setPressedCard}
                  onToggleEmpathy={
                    touch
                      ? (playerIndex) => {
                          setEmpathyToggled((current) => {
                            const next = new Set(current);
                            if (next.has(playerIndex)) {
                              next.delete(playerIndex);
                            } else {
                              next.add(playerIndex);
                            }
                            return next;
                          });
                        }
                      : undefined
                  }
                  onViewAs={canChooseSeat() ? viewAs : undefined}
                  seats={seats}
                  shownClue={
                    previewing || shownClue === undefined
                      ? undefined
                      : {
                          giver: shownClue.giver,
                          target: shownClue.target,
                          marker: getClueMarker(
                            shownClue,
                            settings.colorblindMode,
                          ),
                        }
                  }
                  tapToMove={tapToMove}
                  touchedCards={new Set(touched)}
                  variant={variant}
                />
              </div>
              {/* The controls are below the hands, nearer the middle of the screen, and in the same
                  place in every game. They are in one slot that is always as tall as both the clue
                  panel and the replay bar: a hidden copy holds the space of the one not shown. So
                  the hands above it keep their place and size when the game pauses, ends, or goes
                  in and out of a replay. Only a hypothetical with both moves them: its bar is the
                  lower one, so that it stays where it is in a replay. On a narrow window, the page
                  scrolls and the controls go above the hands, with the replay bar first. */}
              <div className="tw:grid tw:shrink-0 tw:gap-3.5 tw:narrow-980:-order-1 tw:narrow-980:flex tw:narrow-980:flex-col">
                {!showCluePanel && (
                  <div className="tw:invisible tw:grid tw:[grid-area:1/1] tw:narrow-980:hidden">
                    <CluePanel
                      canClue={false}
                      canGive={false}
                      clue={undefined}
                      colorblindMode={settings.colorblindMode}
                      onChooseClue={ignore}
                      onChooseTarget={ignore}
                      onGive={ignore}
                      target={undefined}
                      targets={clueTargets}
                      variant={variant}
                      waitingText=""
                    />
                  </div>
                )}
                {!showReplayBar && (
                  <div className="tw:invisible tw:grid tw:[grid-area:1/1] tw:narrow-980:hidden">
                    <TurnsBar state={state} />
                  </div>
                )}
                {showCluePanel && (
                  <div className="tw:grid tw:[grid-area:1/1]">
                    <CluePanel
                      canClue={canClue}
                      canGive={canGive}
                      clue={clue}
                      colorblindMode={settings.colorblindMode}
                      onChooseClue={setClue}
                      onChooseTarget={setClueTarget}
                      onGive={giveClue}
                      target={clueTarget}
                      targets={clueTargets}
                      variant={variant}
                      waitingText={waitingText}
                    />
                  </div>
                )}
                {!showCluePanel && !inReplay && pausedBy !== undefined && (
                  <div
                    className="tw:self-center tw:justify-self-center tw:rounded-[14px] tw:bg-game-text tw:px-4 tw:py-2 tw:font-bold tw:text-card-ink tw:[grid-area:1/1]"
                    role="status"
                  >
                    {pausedBy} paused the game.
                  </div>
                )}
                {showReplayBar && (
                  <div
                    className={`tw:grid tw:narrow-980:-order-1 ${hypo !== undefined && showCluePanel ? "" : "tw:[grid-area:1/1]"}`}
                  >
                    <ReplayBar
                      editingCards={editingCards}
                      onToggleEditCards={() => {
                        setEditingCards(!editingCards);
                      }}
                      state={state}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="tw:flex tw:w-[300px] tw:shrink-0 tw:flex-col tw:gap-3 tw:narrow-1440:w-[240px] tw:narrow-980:w-full">
              <DiscardPile
                atMaxClues={isAtMaxClueTokens(visibleState.clueTokens, variant)}
                cardWidth={Math.min(tableCardWidth, TABLE_CARD_WIDTH.MAX)}
                colorblindMode={settings.colorblindMode}
                notes={cardNotes}
                onShowDiscard={showDiscard}
                ref={discardZoneRef}
                rows={discardRows}
                variant={variant}
                zoneState={discardZoneState}
              />
              <ClueLog
                entries={getClueLogEntries(state)}
                onShowClue={showClue}
                // A card that left the hands while pressed, such as one just played, no longer
                // counts.
                pressedCard={
                  seats.some((seat) =>
                    seat.cards.some((card) => card.order === pressedCard),
                  )
                    ? pressedCard
                    : undefined
                }
                shownSegment={shownClue?.segment}
              />
              <TableTokens
                atMaxClues={isAtMaxClueTokens(visibleState.clueTokens, variant)}
                clues={getUnadjustedClueTokens(
                  visibleState.clueTokens,
                  variant,
                )}
                onShowStrike={showReplayTurn}
                outOfClues={visibleState.clueTokens < getClueCost(variant)}
                strikes={visibleState.strikes.length}
                strikeSegments={getStrikeSegments(state)}
              />
            </div>
          </div>
        </main>

        <ChatPanel
          open={chatOpen}
          overlay={chatOverlay}
          spectators={spectators.map((spectator) =>
            spectator.username === metadata.ourUsername
              ? YOU
              : spectator.username,
          )}
          spectatorsTooltip={getSpectatorsTooltip(
            spectators,
            state.finished,
            YOU,
          )}
          unread={chatUnread}
        />
      </div>

      <StatusStrip
        canOpenReplay={!inReplay}
        endGameMenu={
          state.playing
          && !state.finished && (
            <EndGameMenu
              numPlayers={metadata.options.numPlayers}
              votes={votes}
            />
          )
        }
        finished={state.finished}
        futureEfficiency={formatFutureEfficiency(
          visibleState.stats,
          efficiencyModifier,
        )}
        gameInfoTooltip={getGameInfoTooltip(false)}
        // The replay bar has no turn of its own, so the turn here says how far into the game it is.
        // A spoiler-free replay hides how long the game lasts.
        lastTurn={
          (state.replay.segment !== undefined || state.finished)
          && state.replay.hypothetical === undefined
          && state.replay.shared?.spoilerFree !== true
            ? state.ongoingGame.turn.turnNum + 1
            : undefined
        }
        maxScore={visibleState.stats.maxScore}
        minEfficiency={metadata.minEfficiency.toFixed(
          EFFICIENCY_DECIMAL_PLACES,
        )}
        onClassicView={onSwitchToClassic}
        onLobby={backToLobby}
        onOpenReplay={() => {
          replay.enter();
        }}
        pace={formatPace(
          visibleState.stats.pace,
          visibleState.stats.finalRoundEffectivelyStarted,
          options.allOrNothing,
        )}
        // As on the classic screen, the pace takes a color by how risky it would be to discard,
        // except when it shows no number.
        paceColor={
          visibleState.stats.pace === undefined
          || visibleState.stats.finalRoundEffectivelyStarted
          || options.allOrNothing
            ? undefined
            : getPaceRiskColor(visibleState.stats.paceRisk)
        }
        score={visibleState.score}
        turn={visibleState.turn.turnNum + 1}
        variantName={globals.variant.name}
        viewAsMenu={
          canChooseSeat() && (
            <ViewAsMenu
              finished={state.finished}
              onViewAs={viewAs}
              playerNames={metadata.playerNames}
              viewedSeat={getViewedSeat()}
            />
          )
        }
      />

      {ghost !== undefined && draggedView !== undefined && (
        <div
          aria-hidden="true"
          className="tw:pointer-events-none tw:fixed tw:z-50 tw:rotate-6 tw:opacity-95 tw:drop-shadow-2xl"
          style={{
            left: getDropRect(ghost, handCardWidth).left,
            top: getDropRect(ghost, handCardWidth).top,
          }}
        >
          <CardFace
            colorblindMode={settings.colorblindMode}
            possibleRanks={draggedView.possibleRanks}
            possibleSuitIndexes={draggedView.possibleSuitIndexes}
            rank={draggedView.rank}
            suitIndex={draggedView.suitIndex}
            variant={variant}
            width={handCardWidth}
          />
        </div>
      )}
    </div>
  );
}
