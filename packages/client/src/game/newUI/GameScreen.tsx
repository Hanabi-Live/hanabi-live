// The redesigned game screen. It draws an ongoing game from the same store as the classic screen.

import type {
  CardOrder,
  Clue,
  PlayerIndex,
  SuitIndex,
} from "@hanabi-live/game";
import {
  MAX_CLUES,
  getCardsPerHand,
  getClueCost,
  getUnadjustedClueTokens,
  isAtMaxClueTokens,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { clamp } from "complete-common";
import { useEffect, useRef, useState } from "react";
import type {
  ClientAction,
  ClientActionColorClue,
} from "../types/ClientAction";
import type { State } from "../types/State";
import { globals } from "../ui/UIGlobals";
import { backToLobby } from "../ui/backToLobby";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants";
import * as replay from "../ui/replay";
import * as turn from "../ui/turn";
import { ActionLog } from "./ActionLog";
import { CARD_HEIGHT_PER_WIDTH, CardFace } from "./Card";
import { ChatPanel } from "./ChatPanel";
import { CluePanel } from "./CluePanel";
import type { Seat } from "./Hands";
import { CARD_GAP, Hands, NAME_COLUMN_WIDTH } from "./Hands";
import type { DiscardView, StackView, ZoneState } from "./SharedCards";
import { DiscardPile, PlayArea, TableTokens } from "./SharedCards";
import { StatusStrip } from "./StatusStrip";
import { useElementSize, useGameState, useNewUIVersion, useNow } from "./hooks";
import * as newUIState from "./newUIState";
import type { CardView } from "./tableView";
import {
  BLANK_NOTE,
  formatFutureEfficiency,
  formatPace,
  getCardView,
  getHandDisplayOrder,
  getTouchedCards,
  isClueAllowed,
} from "./tableView";

/** How far the pointer must move after pressing a card before the card starts to move with it. */
const DRAG_THRESHOLD_PIXELS = 6;

/** How often the clock on the current player's name updates. */
const CLOCK_TICK_MILLISECONDS = 500;

/** The smallest and largest card in a hand, in CSS pixels of width. */
const HAND_CARD_WIDTH = { MIN: 36, MAX: 104 } as const;

/** The smallest and largest card on the play stacks and in the discard pile. */
const TABLE_CARD_WIDTH = { MIN: 30, MAX: 64 } as const;

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

function sendAction(action: ClientAction) {
  turn.end(action);
}

function canDiscardNow(): boolean {
  return !isAtMaxClueTokens(
    globals.state.ongoingGame.clueTokens,
    globals.variant,
  );
}

function getSeats(state: State): readonly Seat[] {
  const visibleState = state.visibleState!;
  const { metadata } = state;
  const { settings } = globals.lobby;
  const { numPlayers } = metadata.options;
  const hasSeat = state.playing || state.shadowing;
  const firstPlayerIndex = hasSeat ? metadata.ourPlayerIndex : 0;
  const showClock = metadata.options.timed || settings.showTimerInUntimed;

  const seats: Seat[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const playerIndex = ((firstPlayerIndex + i) % numPlayers) as PlayerIndex;
    const you = hasSeat && playerIndex === metadata.ourPlayerIndex;
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
          cardIdentity: state.cardIdentities[order] ?? {
            suitIndex: undefined,
            rank: undefined,
          },
          note: state.notes.ourNotes[order] ?? BLANK_NOTE,
          variant: globals.variant,
          empathy: you,
          finished: state.finished,
          realLifeMode: settings.realLifeMode,
        }),
      );
    }

    const active = visibleState.turn.currentPlayerIndex === playerIndex;
    let clock: string | undefined;
    if (showClock && active && globals.clockPlayerIndex === playerIndex) {
      const time = globals.playerTimes[playerIndex] ?? 0;
      // Untimed games count up the time that the player has taken.
      clock = millisecondsToClockString(metadata.options.timed ? time : -time);
    }

    seats.push({
      playerIndex,
      name: metadata.playerNames[playerIndex] ?? "",
      active,
      you,
      cards,
      clock,
    });
  }

  return seats;
}

function getStacks(state: State): readonly StackView[] {
  const visibleState = state.visibleState!;
  return globals.variant.suits.map((_suit, i) => {
    const suitIndex = i as SuitIndex;
    const top = visibleState.playStacks[suitIndex]?.at(-1);
    return {
      suitIndex,
      topRank:
        top === undefined
          ? undefined
          : (state.cardIdentities[top]?.rank ?? visibleState.deck[top]?.rank),
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
  return visibleState.discardStacks
    .map((stack) =>
      stack
        .map((order): DiscardView => {
          const identity = state.cardIdentities[order];
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

/** Shows the turn on which a discarded card left its hand, in the in-game replay. */
function showDiscard(order: CardOrder) {
  const segment = globals.state.ongoingGame.deck[order]?.segmentDiscarded;
  if (segment === undefined) {
    return;
  }

  if (globals.state.replay.active) {
    replay.goToSegment(segment, true);
  } else {
    replay.enter(segment);
  }
}

function getHandCardWidth(
  handsWidth: number,
  handsHeight: number,
  numPlayers: number,
  cardsPerHand: number,
): number {
  const widthForCards =
    handsWidth
    - NAME_COLUMN_WIDTH
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * cardsPerHand;
  const byWidth = widthForCards / cardsPerHand;
  const rowHeight =
    (handsHeight - HAND_ROW_GAP * (numPlayers - 1)) / numPlayers;
  const byHeight =
    (rowHeight - HAND_BOX_VERTICAL_PADDING) / CARD_HEIGHT_PER_WIDTH;
  return clamp(
    Math.floor(Math.min(byWidth, byHeight)),
    HAND_CARD_WIDTH.MIN,
    HAND_CARD_WIDTH.MAX,
  );
}

function getTableCardWidth(playAreaHeight: number, numSuits: number): number {
  // The play stacks and the deck are each one card tall.
  const heightForCards =
    playAreaHeight - PLAY_AREA_OTHER_HEIGHT - PLAY_STACK_GAP * (numSuits - 1);
  return clamp(
    Math.floor(heightForCards / ((numSuits + 1) * CARD_HEIGHT_PER_WIDTH)),
    TABLE_CARD_WIDTH.MIN,
    TABLE_CARD_WIDTH.MAX,
  );
}

export function GameScreen({
  onSwitchToClassic,
}: {
  readonly onSwitchToClassic: () => void;
}): React.JSX.Element {
  useNewUIVersion();
  useNow(CLOCK_TICK_MILLISECONDS);
  const state = useGameState();

  const [clueTarget, setClueTarget] = useState<PlayerIndex>();
  const [clue, setClue] = useState<Clue>();
  const [menuCard, setMenuCard] = useState<CardOrder>();
  const [drag, setDrag] = useState<Drag>();

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

  // A new turn clears the clue being chosen and any open card menu.
  const turnNum = state?.ongoingGame.turn.turnNum;
  useEffect(() => {
    setClueTarget(undefined);
    setClue(undefined);
    setMenuCard(undefined);
  }, [turnNum]);

  // The new screen does not show replays yet, so a finished game goes to the classic screen.
  const finished = state?.finished === true;
  useEffect(() => {
    if (finished) {
      onSwitchToClassic();
    }
  }, [finished, onSwitchToClassic]);

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

  if (state?.visibleState === undefined) {
    return (
      <div className="tw:fixed tw:inset-0 tw:flex tw:items-center tw:justify-center tw:bg-surface-sunken tw:text-text-label">
        Loading the game...
      </div>
    );
  }

  const { visibleState, metadata, ongoingGame } = state;
  const { variant } = globals;
  const { settings } = globals.lobby;
  const { options } = metadata;
  const inReplay = state.replay.active;
  const ourTurn =
    state.playing
    && !inReplay
    && ongoingGame.turn.currentPlayerIndex === metadata.ourPlayerIndex;
  const canMoveCards =
    state.playing && !inReplay && (ourTurn || settings.speedrunPreplay);
  const canDiscard = canDiscardNow();
  const clueAvailable = ongoingGame.clueTokens >= getClueCost(variant);
  const canClue = ourTurn && clueAvailable;

  const seats = getSeats(state);
  const targetHand =
    clueTarget === undefined ? undefined : visibleState.hands[clueTarget];
  const touched =
    targetHand === undefined || clue === undefined
      ? []
      : getTouchedCards(variant, targetHand, state.cardIdentities, clue);
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
      ) as ClientActionColorClue["colorIndex"];
      sendAction({ type: "colorClue", target: clueTarget, colorIndex });
    } else {
      sendAction({ type: "rankClue", target: clueTarget, rank: clue.value });
    }
  }

  let waitingText = "";
  if (!ourTurn) {
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

  const handCardWidth = getHandCardWidth(
    handsSize.width,
    handsSize.height,
    options.numPlayers,
    getCardsPerHand(options),
  );
  const tableCardWidth = getTableCardWidth(
    playAreaSize.height,
    variant.suits.length,
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
          .find((seat) => seat.you)
          ?.cards.find((card) => card.order === drag.order);

  const pausedBy =
    state.pause.playerIndex === undefined
      ? undefined
      : metadata.playerNames[state.pause.playerIndex];

  // Only the efficiency of the game as it stands includes the player's own modifier.
  const efficiencyModifier =
    visibleState === ongoingGame ? state.notes.efficiencyModifier : 0;

  return (
    <div className="tw:fixed tw:inset-0 tw:flex tw:bg-surface-sunken tw:text-text-strong">
      <main className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
        <div className="tw:flex tw:min-h-0 tw:flex-1 tw:justify-center tw:gap-9 tw:px-7 tw:pt-6 tw:pb-5">
          <div className="tw:flex tw:shrink-0" ref={setPlayAreaElement}>
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

          <div className="tw:flex tw:min-w-0 tw:max-w-[760px] tw:flex-1 tw:flex-col tw:gap-3.5">
            {inReplay && (
              <div
                className="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:rounded-[14px] tw:bg-clue tw:px-4 tw:py-2 tw:font-bold tw:text-card-ink"
                role="status"
              >
                <span className="tw:mr-auto">
                  Showing turn {visibleState.turn.turnNum + 1}, in the past
                </span>
                <button
                  aria-label="Previous turn"
                  className="tw:size-9 tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-surface tw:text-text-strong"
                  onClick={() => {
                    replay.back();
                  }}
                  type="button"
                >
                  <i aria-hidden="true" className="fas fa-chevron-left" />
                </button>
                <button
                  aria-label="Next turn"
                  className="tw:size-9 tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-surface tw:text-text-strong"
                  onClick={() => {
                    replay.forward();
                  }}
                  type="button"
                >
                  <i aria-hidden="true" className="fas fa-chevron-right" />
                </button>
                <button
                  className="tw:h-9 tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-surface tw:px-3 tw:font-bold tw:text-text-strong"
                  onClick={() => {
                    replay.exit();
                  }}
                  type="button"
                >
                  Back to the game
                </button>
              </div>
            )}
            {pausedBy !== undefined && (
              <div
                className="tw:shrink-0 tw:rounded-[14px] tw:bg-text-strong tw:px-4 tw:py-2 tw:font-bold tw:text-surface"
                role="status"
              >
                {pausedBy} paused the game.
              </div>
            )}
            {state.playing && (
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
              className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:justify-center"
              ref={setHandsElement}
            >
              <Hands
                canChooseClueTarget={canClue}
                canDiscard={canDiscard}
                canMoveCards={canMoveCards}
                cardWidth={handCardWidth}
                clueTarget={clueTarget}
                colorblindMode={settings.colorblindMode}
                draggedCard={drag?.order}
                menuCard={menuCard}
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
                onPlay={(order) => {
                  setMenuCard(undefined);
                  sendAction({ type: "play", order });
                }}
                seats={seats}
                touchedCards={new Set(touched)}
                variant={variant}
              />
            </div>
          </div>

          <div className="tw:flex tw:w-[300px] tw:shrink-0 tw:flex-col tw:gap-3">
            <DiscardPile
              cardWidth={Math.min(tableCardWidth, TABLE_CARD_WIDTH.MAX)}
              colorblindMode={settings.colorblindMode}
              onShowDiscard={showDiscard}
              ref={discardZoneRef}
              rows={getDiscardRows(state)}
              variant={variant}
              zoneState={discardZoneState}
            />
            <ActionLog log={visibleState.log} />
            <TableTokens
              clues={getUnadjustedClueTokens(visibleState.clueTokens, variant)}
              maxClues={MAX_CLUES}
              strikes={visibleState.strikes.length}
            />
          </div>
        </div>

        <StatusStrip
          canOpenReplay={!inReplay}
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
        />
      </main>

      <ChatPanel
        numPlayers={options.numPlayers}
        numSpectators={state.spectators.length}
        open={newUIState.isChatOpen()}
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
