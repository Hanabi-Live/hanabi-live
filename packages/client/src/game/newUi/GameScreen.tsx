// The redesigned game screen. It draws a game, or its replay, from the same store as the classic
// screen.

import type { CardOrder, Clue, PlayerIndex } from "@hanabi-live/game";
import {
  getCardsPerHand,
  getClueCost,
  getTotalCardsInDeck,
  getUnadjustedClueTokens,
  isAtMaxClueTokens,
} from "@hanabi-live/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { store, useAppSelector } from "../../store.ts";
import * as gameChat from "../chat.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import {
  formatEfficiency,
  getEfficiencyStats,
  getEfficiencyTooltip,
  getMaxTurns,
  getMaxTurnsTooltip,
  isLowScorePhase,
  shouldModifyEfficiency,
} from "../efficiency.ts";
import { askForEfficiency } from "../efficiencyModifier.ts";
import { currentVariant } from "../gameSession.ts";
import { getPauseAction, pause, unpause } from "../pause.ts";
import type { ClientClue } from "../types/ClientAction.ts";
import { backToLobby } from "../ui/backToLobby.ts";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";
import { getGameInfoTooltip } from "../ui/gameInfoTooltip.ts";
import { getPaceRiskColor } from "../ui/paceRiskColor.ts";
import * as replay from "../ui/replay.ts";
import { getSpectatorsTooltip } from "../ui/spectatorsTooltip.ts";
import { canChooseSeat, getViewedSeat, viewAs } from "../ui/viewAs.ts";
import type { CardClueMarker } from "./Card.tsx";
import { CardFace } from "./Card.tsx";
import type { CardNotes } from "./CardNote.tsx";
import { rightClickNote } from "./CardNote.tsx";
import { ChatPanel } from "./ChatPanel.tsx";
import { ClueLog } from "./ClueLog.tsx";
import { ClueMenu } from "./ClueMenu.tsx";
import { DropZones } from "./DropZones.tsx";
import { EndGameMenu } from "./EndGame.tsx";
import {
  EMPATHY_TOGGLE_SPACE,
  Hands,
  NAME_COLUMN_MAX_WIDTH,
  NameColumnSizer,
} from "./Hands.tsx";
import { HeldCardGhost } from "./HeldCardGhost.tsx";
import { HighlightArrow } from "./HighlightArrow.tsx";
import { PausePanel } from "./PausePanel.tsx";
import { PlayAgain } from "./PlayAgain.tsx";
import { getPlayerActions, getPlayerLog, PlayerLog } from "./PlayerLog.tsx";
import { hasReplayControls, ReplayControls } from "./ReplayControls.tsx";
import type { ZoneState } from "./SharedCards.tsx";
import {
  CardBack,
  DiscardPile,
  PlayArea,
  TableTokens,
} from "./SharedCards.tsx";
import { StatusStrip } from "./StatusStrip.tsx";
import { ViewAsMenu } from "./ViewAsMenu.tsx";
import {
  canDrawArrowNow,
  getArrowView,
  getShownArrowTarget,
  toggleArrow,
} from "./arrow.ts";
import { getArrowTargetAt } from "./arrowAnchor.ts";
import {
  DISCARD_CARD_MAX_WIDTH,
  getHandCardWidth,
  getTableCardWidth,
  NAMES_BESIDE_CARDS_MIN_CARD_WIDTH,
} from "./cardSizes.ts";
import {
  getCardsTouchedBefore,
  getClueMarker,
  getClueMarkers,
  getPreviewMarker,
} from "./clueMarkers.ts";
import { useElementSize, useMediaQuery, useNow } from "./hooks.ts";
import { newUiArrowChanged } from "./newUiSlice.ts";
import {
  canDiscardNow,
  editCard,
  getActionState,
  sendAction,
  showClue,
  showDiscard,
  showReplayTurn,
  showStrike,
  toggleReplay,
} from "./screenActions.ts";
import { getScreenModeStyle } from "./screenMode.ts";
import { measure } from "./screenScale.ts";
import {
  getClueForTurn,
  getClueLogEntries,
  getDeckEmpathy,
  getDiscardRows,
  getHole,
  getNotesHtml,
  getSeats,
  getShownIdentities,
  getStacks,
  getStrikeSegments,
  isScoreHidden,
} from "./screenView.ts";
import { formatPace, getTouchedCards, isClueAllowed } from "./tableView.ts";
import { useCardDrag } from "./useCardDrag.ts";
import { useCardMotion } from "./useCardMotion.ts";
import type { ClueHotkeys } from "./useHotkeys.ts";
import { useClueHotkeys, useSpacebarEmpathy } from "./useHotkeys.ts";

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

/** How often the clock on the current player's name updates. */
const CLOCK_TICK_MILLISECONDS = 500;

/** How the chat names us among the people watching. */
const YOU = "You";

export function GameScreen({
  onSwitchToClassic,
}: {
  readonly onSwitchToClassic: () => void;
}): React.JSX.Element {
  useNow(CLOCK_TICK_MILLISECONDS);
  const state = useAppSelector((root) => root.game.current);
  const votes = useAppSelector((root) => root.game.votes);
  const connections = useAppSelector((root) => root.game.connections);
  const chatOpen = useAppSelector((root) => root.newUi.chatOpen);
  const chatPoppedOut = useAppSelector((root) => root.newUi.chatPoppedOut);
  const chatUnread = useAppSelector((root) => root.gameChat.unread);
  const zenOn = useAppSelector((root) => root.gameChat.zen);
  const unreadNotes = useAppSelector((root) => root.newUi.unreadNotes);
  const arrow = useAppSelector((root) => root.newUi.arrow);
  const mediumWidth = useMediaQuery(MEDIUM_WIDTH_QUERY);
  const chatOverlay = useMediaQuery(CHAT_OVERLAY_WIDTH_QUERY);
  const stacked = useMediaQuery(STACKED_WIDTH_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  // On a touch screen or a narrow window, the play stacks and the discard pile can be off the
  // screen, so the viewer taps a card and then "Play" or "Discard" instead of dragging it. Only one
  // of the two ways works at a time.
  const tapToMove = touch || stacked;
  const [menuCard, setMenuCard] = useState<CardOrder>();

  // The player whose clue menu is open, and the clue chosen in it.
  const [clueTarget, setClueTarget] = useState<PlayerIndex>();
  const [clue, setClue] = useState<Clue>();
  const chooseClueTarget = useCallback(
    (playerIndex: PlayerIndex | undefined) => {
      setClueTarget(playerIndex);
      if (playerIndex === undefined) {
        setClue(undefined);
      }
    },
    [],
  );
  const closeClueMenu = useCallback(() => {
    chooseClueTarget(undefined);
  }, [chooseClueTarget]);
  // The card that the mouse is over, for the clue log.
  const [hoveredCard, setHoveredCard] = useState<CardOrder>();
  const [editingCards, setEditingCards] = useState(false);
  // The card whose note the viewer is typing.
  const [noteCard, setNoteCard] = useState<CardOrder>();
  // Whether the viewer holds the pointer down on the deck, to see which cards can still be in it.
  const [deckEmpathy, setDeckEmpathy] = useState(false);

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
  // The player whose actions the screen lists, after a click on their name.
  const [logSeat, setLogSeat] = useState<PlayerIndex>();
  const closePlayerLog = useCallback(() => {
    setLogSeat(undefined);
  }, []);

  const { globalEmpathy, globalEmpathyNotes } = useSpacebarEmpathy();
  const clueHotkeys = useRef<ClueHotkeys>(undefined);
  useClueHotkeys(clueHotkeys);

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

  // The arrow goes away when the screen shows another turn, so that it does not come back with the
  // turn.
  const arrowView = state === undefined ? undefined : getArrowView(state);
  useEffect(() => {
    if (arrow !== undefined && arrow.view !== arrowView) {
      store.dispatch(newUiArrowChanged(undefined));
    }
  }, [arrow, arrowView]);

  // Editing cards ends with the hypothetical.
  const inHypothetical = state?.replay.hypothetical !== undefined;
  useEffect(() => {
    if (!inHypothetical) {
      setEditingCards(false);
    }
  }, [inHypothetical]);

  const {
    held,
    pointerRef,
    heldRectRef,
    clearDrop,
    finishReturn,
    pressCard,
    playZoneRef,
    discardZoneRef,
  } = useCardDrag();
  const { rootRef, screenScale } = useCardMotion(
    state,
    held?.phase === "drop" ? held.order : undefined,
    heldRectRef,
    clearDrop,
  );

  if (state?.visibleState === undefined) {
    return (
      <div className="tw:fixed tw:inset-0 tw:flex tw:items-center tw:justify-center tw:bg-game-bg tw:text-game-muted tw:select-none">
        Loading the game...
      </div>
    );
  }

  const { visibleState, ongoingGame, metadata } = state;
  const shownArrow = getShownArrowTarget(arrow, state);
  const variant = currentVariant();
  const { settings } = store.getState().session;
  const { options } = metadata;
  const inReplay = state.replay.segment !== undefined;
  // Zen mode is for players in a game. A finished game shows the chat as usual.
  const zen = zenOn && !state.finished;
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
  const outOfCluesOnTurn =
    ourTurn && !clueAvailable && !editingCards && !paused;

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
    connections,
  );
  /** The card, if it is still in a hand. */
  function inHands(order: CardOrder | undefined): CardOrder | undefined {
    return seats.some((seat) => seat.cards.some((card) => card.order === order))
      ? order
      : undefined;
  }
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
    // The game screen marks notes unread only while the game goes on.
    unreadNotes: new Set(state.finished ? [] : unreadNotes),
    noteCard,
    // Notes are only for games that are still going.
    onRightClickCard: state.finished
      ? undefined
      : (event, order) => {
          // The screen draws an arrow on the card instead (see below).
          if (canDrawArrowNow(event)) {
            return;
          }
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

  const otherPlayers = seats.filter(
    (seat) => seat.playerIndex !== actingPlayerIndex,
  );
  // The clue menu is open only while the viewer can clue.
  const menuTarget = canClue ? clueTarget : undefined;
  const shownIdentities = getShownIdentities(state);
  function getTouched(
    target: PlayerIndex | undefined,
    choice: Clue | undefined,
  ) {
    const hand = target === undefined ? undefined : visibleState.hands[target];
    return hand === undefined || choice === undefined
      ? []
      : getTouchedCards(variant, hand, shownIdentities, choice);
  }

  function isAllowed(target: PlayerIndex, choice: Clue) {
    return isClueAllowed(
      choice,
      getTouched(target, choice).length,
      variant,
      options,
    );
  }
  const touched = getTouched(menuTarget, clue);

  // While the player chooses a clue, its tokens show on the cards that it would touch, as the
  // classic screen shows arrows. They take the place of the last clue's tokens and rail.
  const previewing = clue !== undefined && menuTarget !== undefined;
  function getPreviewMarkers(): ReadonlyMap<CardOrder, CardClueMarker> {
    if (clue === undefined) {
      return new Map<CardOrder, CardClueMarker>();
    }
    const marker = getPreviewMarker(
      clue,
      actingPlayerIndex,
      settings.colorblindMode,
    );
    const touchedBefore = getCardsTouchedBefore(visibleState.clues);
    return new Map(
      touched.map((order) => [
        order,
        {
          marker,
          touchedBefore: touchedBefore.has(order),
        },
      ]),
    );
  }
  const canGive = previewing && isAllowed(menuTarget, clue);

  const clueTargets = otherPlayers.map((seat) => ({
    playerIndex: seat.playerIndex,
    name: seat.name,
  }));

  function giveClue() {
    if (!canGive) {
      return;
    }
    const receiverIndex = menuTarget;
    closeClueMenu();

    if (clue.type === "color") {
      const colorIndex = variant.clueColors.findIndex(
        (color) => color.name === clue.value.name,
      ) as Extract<ClientClue, { type: "color" }>["color"];
      sendAction({
        type: "clue",
        receiverIndex,
        clue: {
          type: "color",
          color: colorIndex,
        },
      });
    } else {
      sendAction({
        type: "clue",
        receiverIndex,
        clue: {
          type: "rank",
          rank: clue.value,
        },
      });
    }
  }

  clueHotkeys.current = {
    canClue,
    variant,
    clueTargets,
    clueTarget: menuTarget,
    onChooseTarget: chooseClueTarget,
    // A key chooses a clue in the open menu. With only one other player, such as in a 2-player
    // game, it opens their menu.
    onChooseClue: (choice) => {
      const target =
        menuTarget
        ?? (otherPlayers.length === 1
          ? otherPlayers[0]?.playerIndex
          : undefined);
      if (target === undefined || !isAllowed(target, choice)) {
        return;
      }

      setClueTarget(target);
      setClue(choice);
    },
    onGive: giveClue,
  };

  let hypotheticalHint = "Click a player's name to give them a clue.";
  if (editingCards) {
    hypotheticalHint = "Click a card in a hand to change it into another card.";
  } else if (actingPlayerIndex === undefined) {
    hypotheticalHint = "The hypothetical game is over.";
  } else if (!clueAvailable) {
    hypotheticalHint = "The team has no clues. Play or discard a card.";
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
  if (held?.phase === "drag") {
    playZoneState = held.zone === "play" ? "hovered" : "available";
    // The last card of the deck can usually only be played, so the discard pile does not take it.
    if (held.discardAllowed) {
      if (canDiscard) {
        discardZoneState = held.zone === "discard" ? "hovered" : "available";
      } else {
        discardZoneState = held.zone === "blocked" ? "blocked" : "unavailable";
      }
    }
  }

  const heldView =
    held === undefined
      ? undefined
      : seats
          .find((seat) => seat.acting)
          ?.cards.find((card) => card.order === held.order);

  // With the "Bottom-Deck Blind Plays" option, the player whose turn it is can play the last card
  // of the deck instead of drawing it. The cards are numbered in the order that they are drawn, so
  // the last card of the deck has the last number.
  const deckOrder = (getTotalCardsInDeck(variant) - 1) as CardOrder;
  const deckPlayable =
    options.deckPlays
    && ourTurn
    && !editingCards
    && actionState.cardsRemainingInTheDeck === 1;
  const scoreHidden = isScoreHidden(state);

  // A game of "All or Nothing" has no final round. The game sends one more turn after the last, to
  // show the times, so the turns left never go below 0.
  const { endTurnNum } = visibleState.turn;
  const turnsLeft =
    endTurnNum === undefined || options.allOrNothing
      ? undefined
      : Math.max(endTurnNum - visibleState.turn.turnNum, 0);

  const efficiencyStats = getEfficiencyStats(
    visibleState.stats,
    state.notes.efficiencyModifier,
    shouldModifyEfficiency(state),
  );

  return (
    <div
      // A browser draws a button in its own font, with normal letter spacing. Here, a button takes
      // the font and the letter spacing of the page instead, so that it matches the text around it,
      // and a name measured outside a button fits in one. A button's own classes still win. No text
      // on the screen can be selected, so that clicks and drags never highlight it. The text boxes,
      // such as the chat input, still let the player select what they type.
      className="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:select-none tw:bg-game-bg tw:[background-image:var(--game-screen-table)] tw:[background-size:512px,auto,auto] tw:[background-blend-mode:overlay,normal,normal] tw:text-game-text tw:[:where(&)_button]:[font-family:inherit] tw:[:where(&)_button]:[letter-spacing:inherit]"
      // A right-click on a card or a number draws an arrow on it, when the viewer can draw one.
      onContextMenu={(event) => {
        const target = getArrowTargetAt(event.target as Element);
        if (target === undefined || !canDrawArrowNow(event)) {
          return;
        }

        event.preventDefault();
        toggleArrow(target);
      }}
      ref={rootRef}
      style={{
        zoom: screenScale,
        ...getScreenModeStyle(state),
      }}
    >
      {/* The chat sits above the bar along the bottom, so that the bar's buttons stay in place
          whether the chat is open or not, with "Lobby" in the bottom-right corner. */}
      <div className="tw:relative tw:flex tw:min-h-0 tw:flex-1">
        <main className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
          <div className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:justify-center tw:gap-9 tw:px-7 tw:pt-6 tw:pb-5 tw:narrow-1440:gap-6 tw:narrow-1440:px-5 tw:narrow-980:flex-col tw:narrow-980:justify-start tw:narrow-980:gap-4 tw:narrow-980:overflow-y-auto tw:narrow-980:px-3 tw:narrow-980:pt-3">
            {/* The columns are positioned, so that they are in front of these boxes. */}
            <DropZones
              discardState={discardZoneState}
              discardZoneRef={discardZoneRef}
              handsElement={handsElement}
              playState={playZoneState}
              playZoneRef={playZoneRef}
              reducedMotion={settings.reducedMotion}
            />
            <div
              className="tw:relative tw:flex tw:shrink-0 tw:narrow-980:justify-center"
              ref={setPlayAreaElement}
            >
              <PlayArea
                cardWidth={tableCardWidth}
                colorblindMode={settings.colorblindMode}
                deck={{
                  cardsInDeck: visibleState.cardsRemainingInTheDeck,
                  turnsLeft,
                  deckPlays: options.deckPlays,
                  play: deckPlayable
                    ? {
                        held: held?.fromDeck === true,
                        tapToMove,
                        menuOpen: menuCard === deckOrder,
                        // Only an inverted suit plays when it is discarded.
                        canDiscard: variant.hasInverted
                          ? canDiscard
                          : undefined,
                        onPointerDown: (event) => {
                          if (event.button === 0) {
                            pressCard(
                              deckOrder,
                              event.clientX,
                              event.clientY,
                              event.currentTarget,
                              { discardAllowed: variant.hasInverted },
                            );
                          }
                        },
                        onTap: () => {
                          setMenuCard((current) =>
                            current === deckOrder ? undefined : deckOrder,
                          );
                        },
                        onPlay: () => {
                          setMenuCard(undefined);
                          sendAction({
                            type: "play",
                            order: deckOrder,
                          });
                        },
                        onDiscard: () => {
                          setMenuCard(undefined);
                          if (canDiscardNow()) {
                            sendAction({
                              type: "discard",
                              order: deckOrder,
                            });
                          }
                        },
                      }
                    : undefined,
                  // Holding the space bar shows every player's view, and the deck's too.
                  empathy:
                    deckEmpathy || globalEmpathy
                      ? getDeckEmpathy(state)
                      : undefined,
                  onHoldEmpathy: setDeckEmpathy,
                  colorblindMode: settings.colorblindMode,
                  variant,
                  reducedMotion: settings.reducedMotion,
                }}
                hole={getHole(state)}
                notes={cardNotes}
                stacks={stacks}
                tokens={
                  <TableTokens
                    atMaxClues={isAtMaxClueTokens(
                      visibleState.clueTokens,
                      variant,
                    )}
                    clues={getUnadjustedClueTokens(
                      visibleState.clueTokens,
                      variant,
                    )}
                    oneClueLeft={
                      visibleState.clueTokens === getClueCost(variant)
                    }
                    onShowStrike={showStrike}
                    outOfClues={visibleState.clueTokens < getClueCost(variant)}
                    realLifeMode={settings.realLifeMode}
                    strikes={visibleState.strikes.length}
                    strikeSegments={getStrikeSegments(state)}
                  />
                }
                variant={variant}
                zoneState={playZoneState}
              />
            </div>

            <div className="tw:flex tw:min-w-0 tw:max-w-[760px] tw:flex-1 tw:flex-col tw:gap-3.5 tw:narrow-980:order-first tw:narrow-980:max-w-none tw:narrow-980:flex-none">
              <div
                className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:narrow-980:flex-none"
                ref={setHandsElement}
              >
                <NameColumnSizer onWidthChange={setNameWidth} seats={seats} />
                <Hands
                  canChooseClueTarget={canClue}
                  canDiscard={canDiscard}
                  canMoveCards={canMoveCards}
                  cardWidth={handCardWidth}
                  clueMarkers={
                    previewing
                      ? getPreviewMarkers()
                      : getClueMarkers(
                          shownClue,
                          visibleState.clues,
                          settings.colorblindMode,
                        )
                  }
                  clueMenu={
                    menuTarget === undefined ? undefined : (
                      <ClueMenu
                        canGive={canGive}
                        clue={clue}
                        colorblindMode={settings.colorblindMode}
                        isAllowed={(choice) => isAllowed(menuTarget, choice)}
                        name={metadata.playerNames[menuTarget] ?? ""}
                        onChooseClue={setClue}
                        onClose={closeClueMenu}
                        onGive={giveClue}
                        onShowActions={() => {
                          closeClueMenu();
                          setLogSeat(menuTarget);
                        }}
                        reducedMotion={settings.reducedMotion}
                        variant={variant}
                      />
                    )
                  }
                  clueTarget={menuTarget}
                  colorblindMode={settings.colorblindMode}
                  draggedCard={held?.order}
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
                      pressCard(
                        order,
                        event.clientX,
                        event.clientY,
                        event.currentTarget,
                      );
                    }
                  }}
                  onCardTap={(order) => {
                    setMenuCard((current) =>
                      current === order ? undefined : order,
                    );
                  }}
                  onChooseClueTarget={chooseClueTarget}
                  onDiscard={(order) => {
                    setMenuCard(undefined);
                    if (canDiscardNow()) {
                      sendAction({
                        type: "discard",
                        order,
                      });
                    }
                  }}
                  onEditCard={editingCards ? editCard : undefined}
                  onHoldEmpathy={setHeldEmpathy}
                  onHoverCard={setHoveredCard}
                  onPause={pause}
                  onPlay={(order) => {
                    setMenuCard(undefined);
                    sendAction({
                      type: "play",
                      order,
                    });
                  }}
                  onShowPlayerLog={setLogSeat}
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
                  outOfClues={outOfCluesOnTurn}
                  pauseAction={getPauseAction(state)}
                  reducedMotion={settings.reducedMotion}
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
                {paused && !inReplay && (
                  <PausePanel
                    onUnpause={state.playing ? unpause : undefined}
                    pausedBy={pausedBy}
                    reducedMotion={settings.reducedMotion}
                  />
                )}
              </div>
            </div>

            <div className="tw:relative tw:flex tw:w-[300px] tw:shrink-0 tw:flex-col tw:gap-3 tw:narrow-1440:w-[240px] tw:narrow-980:w-full">
              <DiscardPile
                atMaxClues={isAtMaxClueTokens(visibleState.clueTokens, variant)}
                cardWidth={Math.min(tableCardWidth, DISCARD_CARD_MAX_WIDTH)}
                colorblindMode={settings.colorblindMode}
                doubleDiscard={
                  settings.hGroupConventions
                  && visibleState.stats.doubleDiscardCard !== undefined
                }
                notes={cardNotes}
                onShowDiscard={showDiscard}
                realLifeMode={settings.realLifeMode}
                reducedMotion={settings.reducedMotion}
                rows={discardRows}
                variant={variant}
                zoneState={discardZoneState}
              />
              <ClueLog
                entries={getClueLogEntries(state)}
                // A card that left the hands while hovered, such as one just played, no longer
                // counts.
                hoveredCard={inHands(hoveredCard)}
                onShowClue={showClue}
                shownSegment={shownClue?.segment}
              />
            </div>
          </div>
        </main>

        <ChatPanel
          open={chatOpen}
          overlay={chatOverlay}
          poppedOut={chatPoppedOut}
          // Zen mode hides who is watching and the unread messages, as on the classic screen.
          spectators={
            zen
              ? []
              : spectators.map((spectator) =>
                  spectator.username === metadata.ourUsername
                    ? YOU
                    : spectator.username,
                )
          }
          spectatorsTooltip={getSpectatorsTooltip(
            spectators,
            state.finished,
            YOU,
          )}
          unread={zen ? 0 : chatUnread}
          zen={zen}
        />
      </div>

      <StatusStrip
        colorblindMode={settings.colorblindMode}
        efficiencyModified={efficiencyStats.modified}
        efficiencyTooltip={getEfficiencyTooltip(
          efficiencyStats,
          "Click the number to add a modifier.",
        )}
        futureEfficiency={formatEfficiency(efficiencyStats.futureEfficiency)}
        // The game's length changes as the clock ticks, and the screen draws again with it.
        gameInfoTooltip={getGameInfoTooltip()}
        hardVariant={metadata.hardVariant && settings.hGroupConventions}
        // The replay controls have no turn, so the turn here says how far into the game it is. A
        // spoiler-free replay hides how long the game lasts.
        lastTurn={
          (state.replay.segment !== undefined || state.finished)
          && state.replay.hypothetical === undefined
          && state.replay.shared?.spoilerFree !== true
            ? state.ongoingGame.turn.turnNum + 1
            : undefined
        }
        lowScorePhase={
          settings.hGroupConventions
          && isLowScorePhase(visibleState.score, variant.suits.length)
        }
        // In "Throw It in a Hole" variants, the players cannot see the score, so they see how many
        // cards they played instead, as on the classic screen.
        maxScore={scoreHidden ? undefined : visibleState.stats.maxScore}
        minEfficiency={metadata.minEfficiency.toFixed(
          EFFICIENCY_DECIMAL_PLACES,
        )}
        onClassicView={onSwitchToClassic}
        onEfficiencyClick={askForEfficiency}
        onLobby={backToLobby}
        onTurnClick={replay.promptTurn}
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
        // In a replay, its controls are in the bar along the bottom, so that the hands keep most of
        // the height of the screen.
        replayControls={
          hasReplayControls(state) ? (
            <ReplayControls
              editingCards={editingCards}
              hypotheticalHint={hypotheticalHint}
              onToggleEditCards={() => {
                setEditingCards(!editingCards);
              }}
              state={state}
            />
          ) : undefined
        }
        replayToggle={
          state.finished
            ? undefined
            : {
                inReplay,
                currentName:
                  ongoingGame.turn.currentPlayerIndex === undefined
                    ? undefined
                    : metadata.playerNames[ongoingGame.turn.currentPlayerIndex],
                ourTurn:
                  state.playing
                  && ongoingGame.turn.currentPlayerIndex
                    === metadata.ourPlayerIndex,
                reducedMotion: settings.reducedMotion,
                onToggle: toggleReplay,
              }
        }
        score={
          scoreHidden
            ? visibleState.stats.numAttemptedCardsPlayed
            : visibleState.score
        }
        scoreLabel={scoreHidden ? "Plays" : "Score"}
        tableMenu={
          state.playing && !state.finished ? (
            <EndGameMenu
              numPlayers={metadata.options.numPlayers}
              votes={votes}
            />
          ) : (
            state.replay.shared?.canPlayAgain === true && (
              <PlayAgain
                ourUsername={metadata.ourUsername}
                playerNames={metadata.playerNames}
                shared={state.replay.shared}
                speedrun={metadata.options.speedrun}
              />
            )
          )
        }
        turn={visibleState.turn.turnNum + 1}
        turnTooltip={getMaxTurnsTooltip(
          getMaxTurns(
            visibleState.stats,
            visibleState.score,
            visibleState.turn.turnNum,
            visibleState.turn.endTurnNum,
            options.numPlayers,
          ),
          visibleState.turn.turnNum,
        )}
        variantName={currentVariant().name}
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

      {shownArrow !== undefined && (
        <HighlightArrow
          deck={visibleState.deck}
          // A new arrow drops in, even on a card that had one before.
          key={shownArrow}
          reducedMotion={settings.reducedMotion}
          root={rootRef}
          target={shownArrow}
        />
      )}

      {logSeat !== undefined && (
        <PlayerLog
          colorblindMode={settings.colorblindMode}
          entries={getPlayerActions(
            getPlayerLog(visibleState.log, metadata.playerNames, logSeat),
            metadata.playerNames[logSeat] ?? "",
            visibleState.deck,
            getClueLogEntries(state),
            variant,
          )}
          name={metadata.playerNames[logSeat] ?? ""}
          onClose={closePlayerLog}
          onShowTurn={(turn) => {
            closePlayerLog();
            showReplayTurn(turn);
          }}
          variant={variant}
        />
      )}

      {held?.fromDeck === true && (
        <HeldCardGhost
          held={held}
          heldRectRef={heldRectRef}
          key={held.order}
          onReturned={finishReturn}
          pointerRef={pointerRef}
          reducedMotion={settings.reducedMotion}
          // The card goes back to the deck.
          slotElement={() => {
            const deck = rootRef.current?.querySelector("[data-deck]");
            return deck === null || deck === undefined
              ? undefined
              : measure(deck);
          }}
          width={tableCardWidth}
        >
          <CardBack width={tableCardWidth} />
        </HeldCardGhost>
      )}

      {held !== undefined && heldView !== undefined && (
        <HeldCardGhost
          held={held}
          heldRectRef={heldRectRef}
          key={held.order}
          onReturned={finishReturn}
          pointerRef={pointerRef}
          reducedMotion={settings.reducedMotion}
          slotElement={() => {
            const slot = rootRef.current?.querySelector(
              `[data-card-order="${CSS.escape(held.order.toString())}"]`,
            );
            return slot === null || slot === undefined
              ? undefined
              : measure(slot);
          }}
          width={handCardWidth}
        >
          <CardFace
            clued={heldView.clued}
            colorblindMode={settings.colorblindMode}
            critical={heldView.critical}
            identityFromNote={heldView.identityFromNote}
            noteBorder={heldView.noteBorder}
            noteMark={heldView.noteMark}
            possibleRanks={heldView.possibleRanks}
            possibleSuitIndexes={heldView.possibleSuitIndexes}
            rank={heldView.rank}
            suitIndex={heldView.suitIndex}
            trash={heldView.trash}
            trashIcon={heldView.trashIcon}
            variant={variant}
            width={handCardWidth}
          />
        </HeldCardGhost>
      )}
    </div>
  );
}
