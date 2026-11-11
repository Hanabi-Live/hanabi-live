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
  MAX_CLUES,
  getCardsPerHand,
  getCharacterNameForPlayer,
  getClueCost,
  getClueName,
  getUnadjustedClueTokens,
  isAtMaxClueTokens,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { clamp } from "complete-common";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as modals from "../../modals.ts";
import * as gameChat from "../chat.ts";
import { getViewPlayerIndex } from "../ourSeat.ts";
import type { ClientAction, ClientClue } from "../types/ClientAction.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import { backToLobby } from "../ui/backToLobby.ts";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";
import { controlsHypothetical } from "../ui/controlsHypothetical.ts";
import { getCardOrStackBase } from "../ui/getCardOrStackBase.ts";
import * as hypothetical from "../ui/hypothetical.ts";
import * as replay from "../ui/replay.ts";
import { getSpectatorsTooltip } from "../ui/spectatorsTooltip.ts";
import * as turn from "../ui/turn.ts";
import { canChooseSeat, getViewedSeat, viewAs } from "../ui/viewAs.ts";
import type { ClueMarkerView } from "./Card.tsx";
import { CARD_HEIGHT_PER_WIDTH, CardFace } from "./Card.tsx";
import { ChatPanel } from "./ChatPanel.tsx";
import type { ClueLogEntry } from "./ClueLog.tsx";
import { ClueLog } from "./ClueLog.tsx";
import { CluePanel } from "./CluePanel.tsx";
import type { Seat } from "./Hands.tsx";
import {
  CARD_GAP,
  Hands,
  NAME_COLUMN_MAX_WIDTH,
  NameColumnSizer,
} from "./Hands.tsx";
import { ReplayBar } from "./ReplayBar.tsx";
import type { DiscardView, StackView, ZoneState } from "./SharedCards.tsx";
import { DiscardPile, PlayArea, TableTokens } from "./SharedCards.tsx";
import { StatusStrip } from "./StatusStrip.tsx";
import { ViewAsMenu } from "./ViewAsMenu.tsx";
import type { CardPositions, MoveEffects } from "./cardMotion.ts";
import {
  MAX_ANIMATED_SEGMENT_CHANGE,
  MOVE_BATCH_MILLISECONDS,
  animateCardMoves,
  animateClue,
  areCardsMoving,
  measureCards,
  stopCardMoves,
} from "./cardMotion.ts";
import {
  useElementSize,
  useGameState,
  useMediaQuery,
  useNewUiVersion,
  useNow,
} from "./hooks.ts";
import * as newUiState from "./newUiState.ts";
import type { Misplay } from "./playMotion.ts";
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

/** How far the pointer must move after pressing a card before the card starts to move with it. */
const DRAG_THRESHOLD_PIXELS = 6;

/** How often the clock on the current player's name updates. */
const CLOCK_TICK_MILLISECONDS = 500;

/** The smallest and largest card in a hand, in CSS pixels of width. */
const HAND_CARD_WIDTH = { MIN: 36, MAX: 150 } as const;

/** The smallest and largest card on the play stacks and in the discard pile. */
const TABLE_CARD_WIDTH = { MIN: 30, MAX: 64 } as const;

/** The width in a stacked play area that is not cards: its padding and the gap before the deck. */
const STACKED_PLAY_AREA_OTHER_WIDTH = 48;

/** The space in each hand's box around its cards: padding above (for raised cards) and below. */
const HAND_BOX_VERTICAL_PADDING = 24;
const HAND_BOX_HORIZONTAL_PADDING = 32;
const HAND_ROW_GAP = 8;

/**
 * The height in the play area that is not cards: its padding, its heading, and the deck's label.
 */
const PLAY_AREA_OTHER_HEIGHT = 130;
const PLAY_STACK_GAP = 8;

type DropZone = "play" | "discard";

interface Drag {
  readonly order: CardOrder;
  readonly x: number;
  readonly y: number;
  readonly zone: DropZone | undefined;
}

function isInside(element: HTMLElement | null, x: number, y: number): boolean {
  if (element === null) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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

function getSeats(state: State): readonly Seat[] {
  const visibleState = state.visibleState!;
  const { metadata } = state;
  const { settings } = globals.lobby;
  const { numPlayers } = metadata.options;
  const hasSeat = state.playing || state.shadowing;
  // In the replay of a game that we played, our hand stays first.
  const firstPlayerIndex = getViewPlayerIndex(metadata);
  const showClock =
    metadata.options.timeControl !== undefined || settings.showTimerInUntimed;
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
          note: state.notes.ourNotes[order] ?? BLANK_NOTE,
          variant: globals.variant,
          empathy,
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

/** The clue that led to the turn that shows, if the last move was a clue. */
function getClueForTurn(gameState: GameState): StateClue | undefined {
  const { segment } = gameState.turn;
  if (segment === undefined) {
    return undefined;
  }

  return gameState.clues.findLast((clue) => clue.segment === segment - 1);
}

/** How a clue shows on the arrows and beside the name of the player who gave it. */
function getClueMarker(
  clue: StateClue,
  colorblindMode: boolean,
): ClueMarkerView {
  if (clue.type === "color") {
    const color = globals.variant.clueColors[clue.value];
    if (color !== undefined) {
      return {
        type: "color",
        name: color.name,
        fill: colorblindMode ? color.fillColorblind : color.fill,
      };
    }
  } else if (clue.type === "rank") {
    return { type: "rank", label: clue.value.toString() };
  }

  return { type: "hidden" };
}

/** The clues of the game so far, for the clue log. */
function getClueLogEntries(state: State): readonly ClueLogEntry[] {
  const { playerNames, characterAssignments } = state.metadata;
  const { colorblindMode } = globals.lobby.settings;
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
    live: !state.replay.active && segmentChange >= 0,
    misplays,
    getSuitColors: (suitIndex) => {
      const suit = variant.suits[suitIndex];
      if (suit === undefined) {
        return [];
      }
      if (suit.fill === "multi") {
        return suit.fillColors;
      }
      return [
        globals.lobby.settings.colorblindMode ? suit.fillColorblind : suit.fill,
      ];
    },
  };
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
  if (globals.state.replay.active) {
    replay.goToSegment(segment, true);
  } else {
    replay.enter(segment);
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
): number {
  const widthForCards =
    handsWidth
    - (nameColumnWidth ?? 0)
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * cardsPerHand;
  const byWidth = widthForCards / cardsPerHand;
  const rowHeight =
    (handsHeight - HAND_ROW_GAP * (numPlayers - 1)) / numPlayers;
  const byHeight =
    nameColumnWidth === undefined
      ? Infinity
      : (rowHeight - HAND_BOX_VERTICAL_PADDING) / CARD_HEIGHT_PER_WIDTH;
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
  useNewUiVersion();
  useNow(CLOCK_TICK_MILLISECONDS);
  const state = useGameState();
  const mediumWidth = useMediaQuery(MEDIUM_WIDTH_QUERY);
  const chatOverlay = useMediaQuery(CHAT_OVERLAY_WIDTH_QUERY);
  const stacked = useMediaQuery(STACKED_WIDTH_QUERY);

  const [clueTarget, setClueTarget] = useState<PlayerIndex>();
  const [clue, setClue] = useState<Clue>();
  const [menuCard, setMenuCard] = useState<CardOrder>();
  const [hoveredCard, setHoveredCard] = useState<CardOrder>();
  const [drag, setDrag] = useState<Drag>();
  const [editingCards, setEditingCards] = useState(false);

  const pendingDrag = useRef<{ order: CardOrder; x: number; y: number }>(
    undefined,
  );
  const dragRef = useRef<Drag>(undefined);
  const justDragged = useRef(false);
  const playZoneRef = useRef<HTMLElement>(null);
  const discardZoneRef = useRef<HTMLElement>(null);
  const [handsElement, setHandsElement] = useState<HTMLDivElement | null>(null);
  const [playAreaElement, setPlayAreaElement] = useState<HTMLDivElement | null>(
    null,
  );
  const handsSize = useElementSize(handsElement);
  const playAreaSize = useElementSize(playAreaElement);
  const [nameWidth, setNameWidth] = useState(0);

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

  // Move a card with the pointer, and play or discard it where the player drops it.
  useEffect(() => {
    function zoneAt(x: number, y: number): DropZone | undefined {
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

      // The click that follows the drag must not open the card's menu.
      justDragged.current = true;
      const zone = zoneAt(event.clientX, event.clientY);
      if (zone === "play") {
        sendAction({ type: "play", order: current.order });
      } else if (zone === "discard" && canDiscardNow()) {
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
    const move =
      previous.move !== undefined
      && now - previous.move.startedAt <= MOVE_BATCH_MILLISECONDS
        ? previous.move
        : {
            startPositions: previous.settledPositions,
            startState: previous.shownState,
            startedAt: now,
          };
    stopCardMoves();
    const positions = measureCards(root);
    const segmentChange =
      (shownState.turn.segment ?? 0) - (move.startState.turn.segment ?? 0);
    if (Math.abs(segmentChange) <= MAX_ANIMATED_SEGMENT_CHANGE) {
      animateCardMoves(
        root,
        move.startPositions,
        positions,
        segmentChange > 0,
        getMoveEffects(state, move.startState, shownState, segmentChange),
      );
    }

    // A clue that was just given flies in from its giver, when the game moves forward a turn.
    const newClue = getClueForTurn(shownState);
    if (
      newClue !== undefined
      && newClue !== previous.shownClue
      && segmentChange > 0
      && segmentChange <= MAX_ANIMATED_SEGMENT_CHANGE
    ) {
      animateClue(root, newClue.giver, newClue.target);
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
  const { settings } = globals.lobby;
  const { options } = metadata;
  const inReplay = state.replay.active;
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
      ? state.playing && !inReplay && (ourTurn || settings.speedrunPreplay)
      : ourTurn && !editingCards;
  const canDiscard = canDiscardNow();
  const clueAvailable = actionState.clueTokens >= getClueCost(variant);
  const canClue = ourTurn && clueAvailable && !editingCards;
  const showCluePanel =
    hypo === undefined ? state.playing && !inReplay : controlsHypo;

  const seats = getSeats(state);
  const shownClue = getClueForTurn(visibleState);
  const targetHand =
    clueTarget === undefined ? undefined : visibleState.hands[clueTarget];
  const touched =
    targetHand === undefined || clue === undefined
      ? []
      : getTouchedCards(variant, targetHand, getShownIdentities(state), clue);
  const canGive =
    canClue
    && clueTarget !== undefined
    && clue !== undefined
    && isClueAllowed(clue, touched.length, variant, options);

  function giveClue() {
    if (!canGive) {
      return;
    }

    if (clue.type === "color") {
      const colorIndex = variant.clueColors.findIndex(
        (color) => color.name === clue.value.name,
      ) as Extract<ClientClue, { type: "color" }>["value"];
      sendAction({
        type: "clue",
        target: clueTarget,
        clue: { type: "color", value: colorIndex },
      });
    } else {
      sendAction({
        type: "clue",
        target: clueTarget,
        clue: { type: "rank", value: clue.value },
      });
    }
  }

  let waitingText = "";
  if (hypo !== undefined) {
    if (editingCards) {
      waitingText = 'Turn off "Edit cards" to make a move.';
    } else if (actingPlayerIndex === undefined) {
      waitingText = "The hypothetical game is over.";
    } else if (!clueAvailable) {
      waitingText = "The team has no clues. Play or discard a card.";
    }
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

  let nameColumnWidth: number | undefined;
  if (!stacked) {
    nameColumnWidth = Math.min(
      nameWidth,
      mediumWidth ? NAME_COLUMN_MAX_WIDTH.MEDIUM : NAME_COLUMN_MAX_WIDTH.WIDE,
    );
  }
  const handCardWidth = getHandCardWidth(
    handsSize.width,
    handsSize.height,
    options.numPlayers,
    getCardsPerHand(options),
    nameColumnWidth,
  );
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

  const draggedView =
    drag === undefined
      ? undefined
      : seats
          .find((seat) => seat.acting)
          ?.cards.find((card) => card.order === drag.order);

  const pausedBy =
    state.pause.playerIndex === undefined
      ? undefined
      : metadata.playerNames[state.pause.playerIndex];

  // Only the efficiency of the game as it stands includes the player's own modifier.
  const efficiencyModifier =
    visibleState === ongoingGame ? state.notes.efficiencyModifier : 0;

  return (
    <div
      className="tw:fixed tw:inset-0 tw:flex tw:bg-game-bg tw:[background-image:var(--game-screen-table)] tw:text-game-text"
      ref={rootRef}
    >
      <main className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
        <div className="tw:flex tw:min-h-0 tw:flex-1 tw:justify-center tw:gap-9 tw:px-7 tw:pt-6 tw:pb-5 tw:narrow-1440:gap-6 tw:narrow-1440:px-5 tw:narrow-980:flex-col tw:narrow-980:justify-start tw:narrow-980:gap-4 tw:narrow-980:overflow-y-auto tw:narrow-980:px-3 tw:narrow-980:pt-3">
          <div
            className="tw:flex tw:shrink-0 tw:narrow-980:justify-center"
            ref={setPlayAreaElement}
          >
            <PlayArea
              cardsInDeck={visibleState.cardsRemainingInTheDeck}
              cardWidth={tableCardWidth}
              colorblindMode={settings.colorblindMode}
              ref={playZoneRef}
              stacks={getStacks(state)}
              variant={variant}
              zoneState={playZoneState}
            />
          </div>

          <div className="tw:flex tw:min-w-0 tw:max-w-[760px] tw:flex-1 tw:flex-col tw:gap-3.5 tw:narrow-980:order-first tw:narrow-980:max-w-none tw:narrow-980:flex-none">
            <ReplayBar
              editingCards={editingCards}
              onToggleEditCards={() => {
                setEditingCards(!editingCards);
              }}
              state={state}
            />
            {pausedBy !== undefined && (
              <div
                className="tw:shrink-0 tw:rounded-[14px] tw:bg-game-text tw:px-4 tw:py-2 tw:font-bold tw:text-card-ink"
                role="status"
              >
                {pausedBy} paused the game.
              </div>
            )}
            {showCluePanel && (
              <CluePanel
                canClue={canClue}
                canGive={canGive}
                clue={clue}
                colorblindMode={settings.colorblindMode}
                onChooseClue={setClue}
                onGive={giveClue}
                targetName={
                  clueTarget === undefined
                    ? undefined
                    : metadata.playerNames[clueTarget]
                }
                variant={variant}
                waitingText={waitingText}
              />
            )}
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
                clueMarkers={getClueMarkers(shownClue, settings.colorblindMode)}
                clueTarget={clueTarget}
                colorblindMode={settings.colorblindMode}
                draggedCard={drag?.order}
                emptyClueTarget={
                  shownClue !== undefined && shownClue.list.length === 0
                    ? shownClue.target
                    : undefined
                }
                menuCard={menuCard}
                nameColumnWidth={nameColumnWidth}
                onCardClick={(order) => {
                  if (justDragged.current) {
                    justDragged.current = false;
                    return;
                  }
                  setMenuCard((current) =>
                    current === order ? undefined : order,
                  );
                }}
                onCardPointerDown={(event, order) => {
                  if (canMoveCards && event.button === 0) {
                    justDragged.current = false;
                    pendingDrag.current = {
                      order,
                      x: event.clientX,
                      y: event.clientY,
                    };
                  }
                }}
                onChooseClueTarget={setClueTarget}
                onDiscard={(order) => {
                  setMenuCard(undefined);
                  if (canDiscardNow()) {
                    sendAction({ type: "discard", order });
                  }
                }}
                onEditCard={editingCards ? editCard : undefined}
                onHoverCard={setHoveredCard}
                onPlay={(order) => {
                  setMenuCard(undefined);
                  sendAction({ type: "play", order });
                }}
                onViewAs={canChooseSeat() ? viewAs : undefined}
                seats={seats}
                shownClue={
                  shownClue === undefined
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
                touchedCards={new Set(touched)}
                variant={variant}
              />
            </div>
          </div>

          <div className="tw:flex tw:w-[300px] tw:shrink-0 tw:flex-col tw:gap-3 tw:narrow-1440:w-[240px] tw:narrow-980:w-full">
            <DiscardPile
              cardWidth={Math.min(tableCardWidth, TABLE_CARD_WIDTH.MAX)}
              colorblindMode={settings.colorblindMode}
              onShowDiscard={showDiscard}
              ref={discardZoneRef}
              rows={getDiscardRows(state)}
              variant={variant}
              zoneState={discardZoneState}
            />
            <ClueLog
              entries={getClueLogEntries(state)}
              // A card that left the hands under the mouse, such as one just played, no longer
              // counts.
              hoveredCard={
                seats.some((seat) =>
                  seat.cards.some((card) => card.order === hoveredCard),
                )
                  ? hoveredCard
                  : undefined
              }
              onShowClue={showClue}
              shownSegment={shownClue?.segment}
            />
            <TableTokens
              atMaxClues={isAtMaxClueTokens(visibleState.clueTokens, variant)}
              clues={getUnadjustedClueTokens(visibleState.clueTokens, variant)}
              maxClues={MAX_CLUES}
              onShowStrike={showReplayTurn}
              strikes={visibleState.strikes.length}
              strikeSegments={getStrikeSegments(state)}
            />
          </div>
        </div>

        <StatusStrip
          canOpenReplay={!inReplay}
          finished={state.finished}
          futureEfficiency={formatFutureEfficiency(
            visibleState.stats,
            efficiencyModifier,
          )}
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
          score={visibleState.score}
          turn={visibleState.turn.turnNum + 1}
          variantName={options.variantName}
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
      </main>

      <ChatPanel
        open={newUiState.isChatOpen()}
        overlay={chatOverlay}
        spectators={state.spectators.map((spectator) => spectator.username)}
        spectatorsTooltip={getSpectatorsTooltip(
          state.spectators,
          state.finished,
        )}
        unread={globals.lobby.chatUnread}
      />

      {drag !== undefined && draggedView !== undefined && (
        <div
          aria-hidden="true"
          className="tw:pointer-events-none tw:fixed tw:z-50 tw:rotate-6 tw:opacity-95 tw:drop-shadow-2xl"
          style={{
            left: drag.x - handCardWidth / 2,
            top: drag.y - (handCardWidth * CARD_HEIGHT_PER_WIDTH) / 2,
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
