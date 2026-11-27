// The redesigned game screen. It draws a game, or its replay, from the same store as the classic
// screen.

import type { CardOrder, Clue, PlayerIndex, Variant } from "@hanabi-live/game";
import {
  getCardsPerHand,
  getClueCost,
  getTotalCardsInDeck,
  getUnadjustedClueTokens,
  isDiscardAllowed,
} from "@hanabi-live/game";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { pauseHoverTooltips } from "../../Tooltip.ts";
import * as sounds from "../../sounds.ts";
import { store, useAppSelector } from "../../store.ts";
import * as gameChat from "../chat.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import {
  formatEfficiency,
  getEfficiencyStats,
  getMaxTurns,
  getMaxTurnsTooltip,
  isLowScorePhase,
  shouldModifyEfficiency,
} from "../efficiency.ts";
import { askForEfficiency } from "../efficiencyModifier.ts";
import { getShownGameEnd } from "../gameEnd.ts";
import { currentVariant } from "../gameSession.ts";
import { getArrowTargetKey } from "../highlightArrow.ts";
import { isClueAllowed } from "../isClueAllowed.ts";
import { getPauseAction, pause, unpause } from "../pause.ts";
import type { ClientAction, ClientClue } from "../types/ClientAction.ts";
import { SoundType } from "../types/SoundType.ts";
import { backToLobby } from "../ui/backToLobby.ts";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";
import { getGameInfoTooltip } from "../ui/gameInfoTooltip.ts";
import * as notes from "../ui/notes.ts";
import { getPaceRiskColor } from "../ui/paceRiskColor.ts";
import * as replay from "../ui/replay.ts";
import { getSpectatorsTooltip } from "../ui/spectatorsTooltip.ts";
import { canChooseSeat, getViewedSeat, viewAs } from "../ui/viewAs.ts";
import type { CardClueMarker } from "./Card.tsx";
import { CARD_CORNER_PER_WIDTH, CardFace } from "./Card.tsx";
import type { CardNotes } from "./CardNote.tsx";
import { rightClickNote } from "./CardNote.tsx";
import { CHAT_RAIL_WIDTH, ChatButton, ChatPanel } from "./ChatPanel.tsx";
import type { LogTab } from "./ClueLog.tsx";
import { CLUE_LOG_TAB, ClueLog } from "./ClueLog.tsx";
import {
  CLUE_BUTTON_COLUMN_WIDTH,
  CLUE_BUTTON_RIGHT_ROOM,
  clueDrawerFitsBelow,
  ClueMenu,
  getClueDrawerWidth,
} from "./ClueMenu.tsx";
import { DISCARD_COLUMN_CLASS, DropZones } from "./DropZones.tsx";
import { EndGameMenu } from "./EndGame.tsx";
import {
  getNameColumnRoom,
  Hands,
  NAME_COLUMN_MAX_WIDTH,
  NameColumnSizer,
  PHONE_CLUE_RAIL_SPACE,
} from "./Hands.tsx";
import { HeldCardGhost } from "./HeldCardGhost.tsx";
import { HighlightArrow } from "./HighlightArrow.tsx";
import { LeaderDirection } from "./LeaderDirection.tsx";
import { PausePanel } from "./PausePanel.tsx";
import { PlayAgain } from "./PlayAgain.tsx";
import { getPlayerActions, getPlayerLog, PlayerLog } from "./PlayerLog.tsx";
import { QueuedMove } from "./QueuedMove.tsx";
import { ReconnectingPanel } from "./ReconnectingPanel.tsx";
import { hasReplayControls, ReplayControls } from "./ReplayControls.tsx";
import { SendingMark } from "./SendingMark.tsx";
import type { ZoneState } from "./SharedCards.tsx";
import {
  CardBack,
  DiscardPile,
  getNotedStackBase,
  PLAY_STACKS_PADDING,
  PlayArea,
  TableTokens,
} from "./SharedCards.tsx";
import { BAR_HEIGHT, StatusStrip } from "./StatusStrip.tsx";
import { ViewAsMenu } from "./ViewAsMenu.tsx";
import {
  canDrawArrowNow,
  getArrowView,
  getShownArrowTarget,
  showArrow,
  toggleArrow,
} from "./arrow.ts";
import { getArrowTargetAt } from "./arrowAnchor.ts";
import {
  getCardClickCommand,
  isDragPointer,
  usesSpeedrunClicks,
} from "./cardClicks.ts";
import {
  DISCARD_PLACE_PREFIX,
  HAND_PLACE_PREFIX,
  STACK_PLACE_PREFIX,
} from "./cardMotion.ts";
import {
  DISCARD_CARD_MAX_WIDTH,
  getHandCardWidth,
  getHandsTopPadding,
  getTableCardWidth,
  getWideHandsWidth,
  getWideLayoutRoom,
  NAMES_BESIDE_CARDS_MIN_CARD_WIDTH,
  namesFitBesideCards,
  TABLE_TOP_PADDING,
} from "./cardSizes.ts";
import {
  getCardsTouchedBefore,
  getClueMarker,
  getClueMarkers,
  getPreviewMarker,
} from "./clueMarkers.ts";
import {
  CHAT_OVERLAY_WIDTH_QUERY,
  STACKED_WIDTH_QUERY,
  useElementSize,
  useMediaQuery,
  useNow,
} from "./hooks.ts";
import { newUiArrowChanged } from "./newUiSlice.ts";
import {
  canDiscardNow,
  editCard,
  getActionState,
  sendAction,
  showClue,
  showDiscard,
  showDraw,
  showReplayTurn,
  showStrike,
  showTurnAndIndicateCard,
  toggleReplay,
} from "./screenActions.ts";
import { getScreenMode, getScreenModeStyle } from "./screenMode.ts";
import { measure } from "./screenScale.ts";
import {
  getActionLogEntries,
  getClueForTurn,
  getClueLogEntries,
  getDeckEmpathy,
  getDiscardRows,
  getHole,
  getMoveForTurn,
  getNotesHtml,
  getSeats,
  getShownIdentities,
  getStacks,
  getStrikeSegments,
  isScoreHidden,
} from "./screenView.ts";
import {
  BOTTOM_BAR_BUTTON_COLOR_CLASS,
  RAISED_BUTTON_CLASS,
} from "./surfaces.ts";
import {
  formatPace,
  getCluePreviewDeck,
  getTouchedCards,
} from "./tableView.ts";
import { useCardDrag } from "./useCardDrag.ts";
import type { CardInput, HoveredCard } from "./useCardInput.ts";
import { useCardInput } from "./useCardInput.ts";
import { useCardMotion } from "./useCardMotion.ts";
import type { ClueHotkeys } from "./useHotkeys.ts";
import { useClueHotkeys, useSpacebarEmpathy } from "./useHotkeys.ts";
import { useQueuedMove } from "./useQueuedMove.ts";

/** The space on each side of the table in the phone layout. */
const PHONE_SIDE_PADDING = "0.75em";

/** The space between the play stacks, the hands, and the discard pile in the phone layout. */
const PHONE_TABLE_GAP = 16;

/**
 * The bar moves into the panel of the right column when the hand cards would be narrower than this
 * with the bar (see "setSidePanel"). It is the width that the check finds for a five-player game on
 * a window that is 1920px wide and at least 900px tall, so that such a window keeps the bar.
 */
const PANEL_CARD_WIDTH = 82;

/**
 * The width of the screen, in its own CSS pixels (see "screenScale.ts"), from which the bar along
 * the bottom has room for one row in every game: the widest bar is a shared replay that we lead,
 * with the "Play again" button, and the longest names (see `VARIANT_NAME_MAX_WIDTH` in
 * "StatusStrip.tsx"). The bar spans the whole screen, below the chat. On a narrower screen, the bar
 * is a panel in the right column, so that it never needs a second row. A full-screen 16:9 window is
 * 1600px wide in these pixels, so it keeps the bar along the bottom.
 */
const BAR_ONE_ROW_WIDTH = 1600;

/** The tokens of no clue. */
const NO_CLUE_MARKERS: ReadonlyMap<CardOrder, CardClueMarker> = new Map();

/** How often the clock on the current player's name updates. */
const CLOCK_TICK_MILLISECONDS = 500;

/** The move that gives a clue, as the server takes it. */
function getClueAction(
  receiverIndex: PlayerIndex,
  clue: Clue,
  variant: Variant,
): ClientAction {
  if (clue.type === "color") {
    const colorIndex = variant.clueColors.findIndex(
      (color) => color.name === clue.value.name,
    ) as Extract<ClientClue, { type: "color" }>["color"];
    return {
      type: "clue",
      receiverIndex,
      clue: {
        type: "color",
        color: colorIndex,
      },
    };
  }

  return {
    type: "clue",
    receiverIndex,
    clue: {
      type: "rank",
      rank: clue.value,
    },
  };
}

export function GameScreen(): React.JSX.Element {
  useNow(CLOCK_TICK_MILLISECONDS);
  const state = useAppSelector((root) => root.game.current);
  const votes = useAppSelector((root) => root.game.votes);
  const connections = useAppSelector((root) => root.game.connections);
  const reconnecting = useAppSelector((root) => root.session.reconnecting);
  const friends = useAppSelector((root) => root.session.friends);
  // A solo replay has no one to chat with, so it has no chat, as on the classic screen.
  const hasChat = state?.finished !== true || state.replay.shared !== undefined;
  const chatOpen = useAppSelector((root) => root.newUi.chatOpen) && hasChat;
  const chatPoppedOut =
    useAppSelector((root) => root.newUi.chatPoppedOut) && hasChat;
  const chatUnread = useAppSelector((root) => root.gameChat.unread);
  const zenOn = useAppSelector((root) => root.gameChat.zen);
  const unreadNotes = useAppSelector((root) => root.newUi.unreadNotes);
  const arrow = useAppSelector((root) => root.newUi.arrow);
  const sentMove = useAppSelector((root) => root.newUi.sentMove);
  const settings = useAppSelector((root) => root.session.settings);
  const chatOverlay = useMediaQuery(CHAT_OVERLAY_WIDTH_QUERY);
  const narrowWindow = useMediaQuery(STACKED_WIDTH_QUERY);
  // The phone layout: the columns stack, and the page scrolls.
  const stacked = narrowWindow;
  // Whether the wide layout's bar is a panel in the right column (see "setSidePanel").
  const [sidePanel, setSidePanel] = useState(false);
  const panel = !stacked && sidePanel;
  // A tap on a card in a hand opens its note popup, since a touch screen has no hover or
  // right-click. A tap on the deck, when its card can be played, opens its menu. Dragging a card
  // plays or discards it.
  const [popupCard, setPopupCard] = useState<CardOrder>();
  const closePopup = useCallback(() => {
    setPopupCard(undefined);
  }, []);
  const togglePopup = useCallback((order: CardOrder) => {
    setPopupCard((current) => (current === order ? undefined : order));
  }, []);
  // The player whose clue menu is open, and the clue chosen in it.
  const [clueTarget, setClueTarget] = useState<PlayerIndex>();
  // In a 2-player game, the other player's clue menu opens by itself on each turn, until the viewer
  // closes it.
  const [clueMenuClosed, setClueMenuClosed] = useState(false);
  const [clue, setClue] = useState<Clue>();
  // The player that the viewer last gave a clue to. As on the classic screen, a clue key opens
  // their menu again on a later turn.
  const [lastClueTarget, setLastClueTarget] = useState<PlayerIndex>();
  // Whether the target's hand shows what the chosen clue would tell them. It turns off on each new
  // turn, as on the classic screen.
  const [cluePreview, setCluePreview] = useState(false);
  const chooseClueTarget = useCallback(
    (playerIndex: PlayerIndex | undefined) => {
      setClueTarget(playerIndex);
      setClueMenuClosed(playerIndex === undefined);
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
  const [hoveredCard, setHoveredCard] = useState<HoveredCard>();
  const [editingCards, setEditingCards] = useState(false);
  // The card whose note the viewer is typing.
  const [noteCard, setNoteCard] = useState<CardOrder>();
  // Whether the viewer holds the pointer down on the deck, to see which cards can still be in it.
  const [deckEmpathy, setDeckEmpathy] = useState(false);

  const [handsElement, setHandsElement] = useState<HTMLDivElement | null>(null);
  const [playAreaElement, setPlayAreaElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [tableElement, setTableElement] = useState<HTMLDivElement | null>(null);
  const handsSize = useElementSize(handsElement);
  const tableSize = useElementSize(tableElement);
  const playAreaSize = useElementSize(playAreaElement);
  const [nameWidth, setNameWidth] = useState(0);
  const [nameHeight, setNameHeight] = useState(0);
  const [nameStackHeight, setNameStackHeight] = useState(0);
  const onNameSizeChange = useCallback(
    (width: number, height: number, stackHeight: number) => {
      setNameWidth(width);
      setNameHeight(height);
      setNameStackHeight(stackHeight);
    },
    [],
  );

  // The hand that shows its player's view of it, while the viewer holds the pointer down on it.
  const [heldEmpathy, setHeldEmpathy] = useState<PlayerIndex>();
  const [fingerHold, setFingerHold] = useState(false);
  // The log that the box of logs shows.
  const [logTab, setLogTab] = useState<LogTab>(CLUE_LOG_TAB);
  // The player whose actions the screen lists, after a click on their name.
  const [logSeat, setLogSeat] = useState<PlayerIndex>();
  const closePlayerLog = useCallback(() => {
    setLogSeat(undefined);
  }, []);

  const globalEmpathy = useSpacebarEmpathy();
  const clueHotkeys = useRef<ClueHotkeys>(undefined);
  useClueHotkeys(clueHotkeys);

  // On a window too narrow for the chat panel beside the table, the chat starts collapsed.
  useEffect(() => {
    if (chatOverlay) {
      gameChat.hide();
    }
  }, [chatOverlay]);

  // A new turn clears the clue being chosen and any open note popup. In a hypothetical, its own
  // turns count.
  const turnNum =
    state === undefined ? undefined : getActionState(state).turn.turnNum;
  useEffect(() => {
    setClueTarget(undefined);
    setClueMenuClosed(false);
    setClue(undefined);
    setPopupCard(undefined);
    setCluePreview(false);
  }, [turnNum]);

  // In a 2-player game, the clue menu opens again when the viewer leaves the in-game replay.
  const replaying = state?.replay.segment !== undefined;
  useEffect(() => {
    if (!replaying) {
      setClueMenuClosed(false);
    }
  }, [replaying]);

  // The arrow goes away when the screen shows another turn, so that it does not come back with the
  // turn.
  const arrowView = state === undefined ? undefined : getArrowView(state);
  useEffect(() => {
    if (arrow !== undefined && arrow.view !== arrowView) {
      store.dispatch(newUiArrowChanged(undefined));
    }
  }, [arrow, arrowView]);

  // In a 2-player game, the clue menu also opens again when a hypothetical starts or ends. Its
  // first turn can be the turn on which the viewer closed the menu, such as with a click on
  // "Replay".
  const inHypothetical = state?.replay.hypothetical !== undefined;
  useEffect(() => {
    setClueMenuClosed(false);
  }, [inHypothetical]);

  // Editing cards ends with the hypothetical.
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
  } = useCardDrag(togglePopup);
  // A card that the player drags hides the bubbles of possible cards, so that they do not cover the
  // places to drop it.
  const draggingCard = held?.moved === true;
  // Holding the pointer down on a hand or holding Space opens the bubble of the card under the
  // pointer, until the player drags a card.
  const showHandPossibleCards =
    (heldEmpathy !== undefined || globalEmpathy) && !draggingCard;
  // No tooltip opens while the player drags a card, so that none covers the card or the places to
  // drop it.
  const cardInHand = held?.phase === "drag";
  useEffect(
    () => (cardInHand ? pauseHoverTooltips() : undefined),
    [cardInHand],
  );
  const cardInput = useRef<CardInput>(undefined);
  const cardInputHandlers = useCardInput(cardInput);
  const queued = useQueuedMove(state);

  // A card that the player dropped while it was another player's turn waits for their turn over the
  // play stacks or the discard pile (see "QueuedMove.tsx").
  const premove = state?.premove;
  const premoveOrder =
    premove?.type === "play" || premove?.type === "discard"
      ? premove.order
      : undefined;
  const clearDropRef = useRef(clearDrop);
  clearDropRef.current = clearDrop;
  useEffect(() => {
    if (premoveOrder !== undefined) {
      clearDropRef.current();
    }
  }, [premoveOrder]);

  const { rootRef, screenScale } = useCardMotion(
    state,
    held?.phase === "drop" ? held.order : undefined,
    heldRectRef,
    clearDrop,
  );

  const chatBeside = !chatOverlay && chatOpen && !chatPoppedOut;
  // In the wide layout, the bar is along the bottom of the screen in one row while the screen is at
  // least `BAR_ONE_ROW_WIDTH` wide and the cards keep a width of at least `PANEL_CARD_WIDTH`.
  // Otherwise, it moves to a panel at the bottom of the right column, so that the hands get the
  // whole height of the screen. So the bar along the bottom never needs a second row. Only the size
  // of the window, the players, and the chat decide where the bar is, not what the bar holds. So
  // the bar does not move when a replay starts, a hypothetical starts, or the game ends. In the
  // panel, the panel and the clue log share one box with tabs when the column is short (see
  // "StatusStrip.tsx").
  /** The width of the screen at the last render, to tell when the window gets narrower. */
  const screenWidth = useRef<number | undefined>(undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const previousScreenWidth = screenWidth.current;
    screenWidth.current = root?.clientWidth;
    if (
      narrowWindow
      || root === null
      || tableElement === null
      || playAreaElement === null
      || handsElement === null
      || state === undefined
    ) {
      return;
    }

    const { options } = state.metadata;
    function getRoom(rowWidth: number, handsHeight: number) {
      return getWideLayoutRoom(
        rowWidth,
        handsHeight,
        options.numPlayers,
        getCardsPerHand(options),
        nameWidth,
        getClueDrawerWidth(currentVariant()),
      );
    }

    // The elements are measured now, because the wide layout might have just started, before their
    // sizes were observed.
    const rowWidth = tableElement.clientWidth - playAreaElement.clientWidth;
    const handsHeight = handsElement.clientHeight;
    // When the window gets narrower, the chat beside the table collapses before the hands get
    // smaller. The screen's scale does not count, since the layout does not change with it. A
    // player who opens the chat again keeps it open until the window gets narrower again.
    if (
      chatBeside
      && previousScreenWidth !== undefined
      && root.clientWidth < previousScreenWidth
      && getRoom(rowWidth, handsHeight).handsNarrowed
    ) {
      gameChat.hide();
      return;
    }

    // The size of the hands with the bar along the bottom. The panel gives the hands the height of
    // the bar. It also hides the rail of the collapsed chat, which gives the table its width. The
    // check counts the rail, so that its width does not move the bar back.
    const railShown = hasChat && (!chatOpen || chatPoppedOut);
    const barRowWidth =
      rowWidth - (sidePanel && railShown ? CHAT_RAIL_WIDTH : 0);
    const barHandsHeight = handsHeight - (sidePanel ? BAR_HEIGHT : 0);
    const room = getRoom(barRowWidth, barHandsHeight);
    const cardWidth = getHandCardWidth(
      getWideHandsWidth(barRowWidth, room),
      barHandsHeight,
      options.numPlayers,
      getCardsPerHand(options),
      Math.min(nameWidth, NAME_COLUMN_MAX_WIDTH.WIDE),
      nameHeight,
      false,
    );
    setSidePanel(
      root.clientWidth < BAR_ONE_ROW_WIDTH || cardWidth < PANEL_CARD_WIDTH,
    );
  });

  // In the wide layout of a 2-player game, the clue menu of the lowest hand opens below it when the
  // table has room for it there. Then it covers nothing. The hand's clue button goes below it too.
  // The box of the hands reaches to the bottom of the table. With more players, the button stays to
  // the right of every hand, so that all of the hands look the same.
  const [clueBelowLowestHand, setClueBelowLowestHand] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const lowestHand =
      handsElement === null
        ? undefined
        : [...handsElement.querySelectorAll("[data-hand]")].at(-1);
    setClueBelowLowestHand(
      !stacked
        && state?.metadata.options.numPlayers === 2
        && handsElement !== null
        && lowestHand !== undefined
        && clueDrawerFitsBelow(
          measure(lowestHand),
          measure(handsElement).bottom,
          currentVariant(),
        ),
    );
  });

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
  // The move that the player sent on this turn, while it waits for the server. Until it arrives,
  // the player cannot make another move.
  const sendingMove =
    hypo === undefined && sentMove?.turnNum === ongoingGame.turn.turnNum
      ? sentMove.move
      : undefined;
  // Speedruns use clicks instead of dragging.
  const speedrunClicks = usesSpeedrunClicks(state, settings.speedrunFeatures);
  // A queued move must be canceled before another card moves. In the in-game replay, the player can
  // still play or discard a card from their hand, as on the classic screen. The move ends the
  // replay.
  const canMoveCards =
    hypo === undefined
      ? state.playing
        && !speedrunClicks
        && state.premove === undefined
        && sendingMove === undefined
        && !reconnecting
        && (ongoingGame.turn.currentPlayerIndex === metadata.ourPlayerIndex
          || settings.preplay)
      : ourTurn && !editingCards;
  // The cards that can move: those in the acting player's hand now. A replay shows cards that have
  // since left the hand.
  const movableCards = new Set(
    actingPlayerIndex === undefined ? [] : actionState.hands[actingPlayerIndex],
  );
  const canDiscard = canDiscardNow();
  const clueAvailable = actionState.clueTokens >= getClueCost(variant);
  const pausedBy =
    state.pause.pausingPlayerIndex === undefined
      ? undefined
      : metadata.playerNames[state.pause.pausingPlayerIndex];
  // A hypothetical goes on while the game is paused.
  const paused = hypo === undefined && pausedBy !== undefined;
  // At 0 clues, the clue buttons still show, crossed out, so that the viewer sees that they cannot
  // clue.
  const couldClue =
    ourTurn
    && !editingCards
    && !paused
    && sendingMove === undefined
    && !reconnecting;
  const canClue = couldClue && clueAvailable;
  const onlyOtherPlayer =
    actingPlayerIndex !== undefined && metadata.playerNames.length === 2
      ? ((1 - actingPlayerIndex) as PlayerIndex)
      : undefined;
  // The player whose clue menu is open. It is open only while the viewer can clue.
  const menuTarget = canClue
    ? (clueTarget ?? (clueMenuClosed ? undefined : onlyOtherPlayer))
    : undefined;

  const empathyPlayers = new Set<PlayerIndex>(
    globalEmpathy
      ? metadata.playerNames.map((_name, i) => i as PlayerIndex)
      : [],
  );
  if (heldEmpathy !== undefined) {
    empathyPlayers.add(heldEmpathy);
  }
  // With the flashlight in the clue menu on, the target's hand shows what the chosen clue would
  // tell them.
  const previewTarget = cluePreview ? menuTarget : undefined;
  const previewHand =
    previewTarget === undefined ? undefined : visibleState.hands[previewTarget];
  const previewTouched =
    previewHand === undefined || clue === undefined
      ? []
      : getTouchedCards(variant, previewHand, getShownIdentities(state), clue);
  const seats = getSeats(
    state,
    empathyPlayers,
    connections,
    previewTarget === undefined
      || clue === undefined
      || actingPlayerIndex === undefined
      ? undefined
      : {
          target: previewTarget,
          deck: getCluePreviewDeck(visibleState, metadata, variant, {
            giver: actingPlayerIndex,
            target: previewTarget,
            clue,
            touched: previewTouched,
          }),
        },
  );
  /**
   * The hovered card, if it is still where the mouse went over it: in a hand, on top of a play
   * stack, or in the discard pile. A card that leaves its place, such as one just played, no longer
   * counts.
   */
  function getHoveredCardInPlace(): CardOrder | undefined {
    if (hoveredCard === undefined) {
      return undefined;
    }
    const { order, place = "" } = hoveredCard;
    const location = visibleState.deck[order]?.location;
    if (place.startsWith(HAND_PLACE_PREFIX)) {
      return typeof location === "number" ? order : undefined;
    }
    if (place.startsWith(STACK_PLACE_PREFIX)) {
      return location === "playStack" ? order : undefined;
    }
    if (place.startsWith(DISCARD_PLACE_PREFIX)) {
      return location === "discard" ? order : undefined;
    }
    return undefined;
  }
  const shownClue = getClueForTurn(visibleState);
  const shownMove = getMoveForTurn(state);
  const shownGameEnd = getShownGameEnd(state);
  // On the turn on which the game ended, the end of the game takes the place of the last move, so
  // the moved card has no outline.
  const outlinedMove = shownGameEnd === undefined ? shownMove : undefined;
  const stacks = getStacks(state);
  const discardRows = getDiscardRows(state);
  const cardNotes: CardNotes = {
    // The cards on the screen: in the hands, on top of the play stacks, and in the discard pile,
    // and the stack bases that take notes.
    notesHtml: getNotesHtml([
      ...seats.flatMap((seat) => seat.cards.map((card) => card.order)),
      ...stacks
        .map((stack) => stack.topOrder)
        .filter((order) => order !== undefined),
      ...discardRows.flat().map((card) => card.order),
      ...stacks
        .map((stack) => getNotedStackBase(variant, stack.suitIndex))
        .filter((order) => order !== undefined),
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
          // A second right-click on the card closes its box without saving, as on the classic
          // screen.
          if (rightClickNote(event, order)) {
            setNoteCard((current) => (current === order ? undefined : order));
          }
        },
    onCloseNote: () => {
      setNoteCard(undefined);
    },
  };
  // Opens the box to type a card's note in, which takes the place of the card's note popup.
  function editNote(order: CardOrder) {
    if (cardNotes.onRightClickCard === undefined) {
      return;
    }
    setPopupCard(undefined);
    setNoteCard(order);
  }

  // The chat lists everyone who is watching, with us first.
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
      {
        clue: choice,
        numTouched: getTouched(target, choice).length,
        giverIndex: actingPlayerIndex,
        receiverIndex: target,
        lastClueType: visibleState.clues.at(-1)?.type,
      },
      variant,
      options,
      metadata.characterAssignments,
    );
  }
  const touched = getTouched(menuTarget, clue);

  // While the player chooses a clue, its tokens show on the cards that it would touch, as the
  // classic screen shows arrows. They take the place of the last clue's tokens and rail.
  const previewing = clue !== undefined && menuTarget !== undefined;
  // With the H-Group conventions setting, a token on a card that the viewer's note marks as chop
  // moved has a gray ring, as on the classic screen.
  const chopMoved = new Set<CardOrder>(
    settings.hGroupConventions
      ? state.notes.ourNotes
          .map((note, order) =>
            note.chopMoved ? (order as CardOrder) : undefined,
          )
          .filter((order) => order !== undefined)
      : [],
  );
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
          chopMoved: chopMoved.has(order),
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
    setLastClueTarget(receiverIndex);
    closeClueMenu();
    sendAction(getClueAction(receiverIndex, clue, variant));
  }

  cardInput.current = {
    context: {
      state,
      variant,
      identities: shownIdentities,
      chosenClue: menuTarget === undefined ? undefined : clue,
    },
    speedrunClicks,
    onHoverCard: setHoveredCard,
    run: (command, order) => {
      switch (command.type) {
        case "editNote": {
          editNote(order);
          break;
        }

        case "morph": {
          editCard(order);
          break;
        }

        case "showSegment": {
          showReplayTurn(command.segment);
          break;
        }

        case "showCard": {
          showTurnAndIndicateCard(command.segment, order);
          break;
        }

        case "showDraw": {
          showDraw(command.segment, order);
          break;
        }

        case "play":
        case "discard": {
          sendAction({
            type: command.type,
            order,
          });
          break;
        }

        case "clue": {
          sendAction(
            getClueAction(command.receiverIndex, command.clue, variant),
          );
          break;
        }

        case "refuse": {
          sounds.play(SoundType.Error);
          break;
        }
      }
    },
    // Notes are only for games that are still going.
    deleteNote: state.finished
      ? undefined
      : (order) => {
          if (notes.getOurNote(order) !== "") {
            notes.set(order, "");
          }
        },
  };

  // A press with the main button picks up the card, unless the click does something else, such as
  // Ctrl + click. Picking up the card replaces it on the screen, and then the browser loses the
  // click.
  function picksUpCard(event: React.PointerEvent, order: CardOrder): boolean {
    return (
      isDragPointer(event.pointerType)
      && event.button === 0
      && getCardClickCommand(
        event,
        order,
        cardInput.current!.context,
        speedrunClicks,
      ) === undefined
    );
  }

  // Opens a player's clue menu, or closes it. The chosen clue stays when that player can get it.
  function openClueMenu(playerIndex: PlayerIndex | undefined) {
    chooseClueTarget(playerIndex);
    if (
      playerIndex !== undefined
      && clue !== undefined
      && !isAllowed(playerIndex, clue)
    ) {
      setClue(undefined);
    }
  }

  clueHotkeys.current = {
    canClue,
    variant,
    clueTargets,
    clueTarget: menuTarget,
    onChooseTarget: openClueMenu,
    // A key chooses a clue in the open menu. With no menu open, it opens the menu of the only other
    // player, or of the player that the viewer last gave a clue to. Otherwise, the clue waits for
    // Tab to choose a player, as on the classic screen.
    onChooseClue: (choice) => {
      if (menuTarget !== undefined) {
        if (isAllowed(menuTarget, choice)) {
          setClueTarget(menuTarget);
          setClue(choice);
        }
        return;
      }

      const rememberedTarget = otherPlayers.find(
        (seat) => seat.playerIndex === lastClueTarget,
      )?.playerIndex;
      const target =
        otherPlayers.length === 1
          ? otherPlayers[0]?.playerIndex
          : rememberedTarget;
      if (target !== undefined && isAllowed(target, choice)) {
        setClueTarget(target);
        setClueMenuClosed(false);
        setClue(choice);
      } else if (otherPlayers.length > 1) {
        setClue(choice);
      }
    },
    onGive: giveClue,
  };

  // The parts of the wide layout beside the hands give up room only when the hands need it.
  const rowWidth = tableSize.width - playAreaSize.width;
  const wideRoom = getWideLayoutRoom(
    rowWidth,
    handsSize.height,
    options.numPlayers,
    getCardsPerHand(options),
    nameWidth,
    getClueDrawerWidth(variant),
  );
  const phoneNameWidth = Math.min(nameWidth, NAME_COLUMN_MAX_WIDTH.PHONE);
  let nameColumnWidth: number | undefined = stacked
    ? phoneNameWidth
    : Math.min(nameWidth, NAME_COLUMN_MAX_WIDTH.WIDE);
  // In the phone layout, the page scrolls. The play stacks are at the top, and the hands fit in the
  // rest of the height of the table on the screen, with the same space below them as above the
  // stacks.
  const phoneTableHeight = tableSize.height - 2 * TABLE_TOP_PADDING.STACKED;
  const handsHeight = stacked
    ? phoneTableHeight - playAreaSize.height - PHONE_TABLE_GAP
    : handsSize.height;
  const handsWidth = stacked
    ? handsSize.width
    : getWideHandsWidth(rowWidth, wideRoom);
  function getHandCardWidthFor(
    columnWidth: number | undefined,
    height = handsHeight,
  ) {
    return getHandCardWidth(
      handsWidth,
      height,
      options.numPlayers,
      getCardsPerHand(options),
      columnWidth,
      nameHeight,
      stacked,
    );
  }
  let handCardWidth = getHandCardWidthFor(nameColumnWidth);
  // In the phone layout with the names beside the cards, the clue button goes below the name, so
  // that the cards get the width that it would take. When the hand's box is too short for that name
  // column (see `getNameColumnRoom`), the hands would be taller than the room for them. Then, the
  // button goes to the right of the name.
  const clueButtonBesideName =
    stacked && nameStackHeight > getNameColumnRoom(handCardWidth);
  if (clueButtonBesideName) {
    nameColumnWidth = phoneNameWidth + CLUE_BUTTON_COLUMN_WIDTH;
    handCardWidth = getHandCardWidthFor(nameColumnWidth);
  }
  // In the phone layout, the cards on the table are no wider than the hand cards would be without
  // the play stacks above them. This keeps the stacks short, so that more hands fit below them.
  // (The hands without the stacks are used, since the size of the stacks changes the room for the
  // hands.)
  const phoneTableCardMaxWidth = stacked
    ? Math.max(
        getHandCardWidthFor(nameColumnWidth, phoneTableHeight),
        getHandCardWidthFor(undefined, phoneTableHeight),
      )
    : undefined;
  if (stacked && handCardWidth < NAMES_BESIDE_CARDS_MIN_CARD_WIDTH) {
    const widthWithNamesAbove = getHandCardWidthFor(undefined);
    if (
      widthWithNamesAbove > handCardWidth
      || !namesFitBesideCards(
        handsWidth,
        getCardsPerHand(options),
        nameColumnWidth,
      )
    ) {
      nameColumnWidth = undefined;
      handCardWidth = widthWithNamesAbove;
    }
  }
  const handsTopPadding = getHandsTopPadding(
    handCardWidth,
    nameColumnWidth !== undefined,
    stacked,
  );
  // Beside the hands, the play area and the discard pile start as low as the hands do, so that the
  // tops of the columns line up.
  const columnTopPadding = stacked ? 0 : handsTopPadding;
  const tableCardWidth = Math.min(
    getTableCardWidth(
      playAreaSize.width,
      playAreaSize.height - columnTopPadding,
      variant.suits.length,
      stacked,
    ),
    phoneTableCardMaxWidth ?? Infinity,
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
  // The move that the viewer queued shows only in the game as it stands, not in a replay of it.
  const queuedMove = inReplay || hypo !== undefined ? undefined : queued.move;
  const queuedView =
    queuedMove?.type === "play" || queuedMove?.type === "discard"
      ? seats
          .find((seat) => seat.you)
          ?.cards.find((card) => card.order === queuedMove.order)
      : undefined;
  const queuedCard = queuedView?.order;
  function getQueuedMoveElement(): React.JSX.Element | undefined {
    if (queuedMove === undefined) {
      return undefined;
    }
    if (queuedMove.type === "clue") {
      const name = metadata.playerNames[queuedMove.receiverIndex] ?? "";
      return (
        <QueuedMove
          cancelLabel={`Cancel the clue for ${name}`}
          onCancel={queued.cancel}
          reducedMotion={settings.reducedMotion}
          sent={queued.sent}
          text={`Clue for ${name} on your turn`}
        />
      );
    }
    if (queuedView === undefined) {
      return undefined;
    }
    const verb = queuedMove.type === "play" ? "play" : "discard";
    return (
      <QueuedMove
        cancelLabel={`Cancel the queued ${verb}`}
        onCancel={queued.cancel}
        reducedMotion={settings.reducedMotion}
        sent={queued.sent}
        text={
          queuedMove.type === "play"
            ? "Plays on your turn"
            : "Discards on your turn"
        }
      >
        {/* The card moves from here when its move arrives (see "useCardMotion.ts"). */}
        <div data-card-order={queuedView.order} data-card-place="queued">
          <CardFace
            blank={queuedView.blank}
            clued={queuedView.clued}
            colorblindMode={settings.colorblindMode}
            critical={queuedView.critical}
            doubleDiscard={queuedView.doubleDiscard}
            identityFromNote={queuedView.identityFromNote}
            noteBorder={queuedView.noteBorder}
            noteMarks={queuedView.noteMarks}
            pips={queuedView.pips}
            rank={queuedView.rank}
            stackDirection={queuedView.stackDirection}
            suitIndex={queuedView.suitIndex}
            trash={queuedView.trash}
            trashIcon={queuedView.trashIcon}
            variant={variant}
            width={tableCardWidth}
          />
        </div>
      </QueuedMove>
    );
  }
  const queuedMoveElement = getQueuedMoveElement();

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

  const tokensProps = {
    atMaxClues: !isDiscardAllowed(visibleState.clueTokens, variant),
    clues: getUnadjustedClueTokens(visibleState.clueTokens, variant),
    oneClueLeft: visibleState.clueTokens === getClueCost(variant),
    onShowStrike: showStrike,
    outOfClues: visibleState.clueTokens < getClueCost(variant),
    realLifeMode: settings.realLifeMode,
    reducedMotion: settings.reducedMotion,
    strikes: visibleState.strikes.length,
    strikeSegments: getStrikeSegments(state),
    strikesHidden: scoreHidden,
  };
  const discardPile = (
    <DiscardPile
      atMaxClues={!isDiscardAllowed(visibleState.clueTokens, variant)}
      cardWidth={Math.min(tableCardWidth, DISCARD_CARD_MAX_WIDTH)}
      colorblindMode={settings.colorblindMode}
      doubleDiscard={
        settings.hGroupConventions
        && visibleState.stats.doubleDiscardCard !== undefined
      }
      movedCard={outlinedMove}
      notes={cardNotes}
      onShowDiscard={showDiscard}
      realLifeMode={settings.realLifeMode}
      reducedMotion={settings.reducedMotion}
      rows={discardRows}
      variant={variant}
      zoneState={discardZoneState}
    />
  );

  const clueLog = (
    <ClueLog
      actions={getActionLogEntries(state)}
      dragging={held !== undefined}
      entries={getClueLogEntries(state)}
      // No card counts while the player holds a card: the held card is under the pointer, not the
      // card below it.
      hoveredCard={held === undefined ? getHoveredCardInPlace() : undefined}
      onShowClue={showClue}
      onShowSegment={showReplayTurn}
      onTab={setLogTab}
      reducedMotion={settings.reducedMotion}
      screenScrolls={stacked}
      shownSegment={visibleState.turn.segment}
      tab={logTab}
    />
  );

  // The bar is along the bottom of the screen, or in a panel at the bottom of the right column (see
  // "setSidePanel").
  const statusStrip = (
    <StatusStrip
      chatButton={
        hasChat && (
          <ChatButton
            className={`tw:size-9 ${BOTTOM_BAR_BUTTON_COLOR_CLASS} tw:text-game-text tw:aria-pressed:text-card-ink ${RAISED_BUTTON_CLASS}`}
            open={chatOpen}
            poppedOut={chatPoppedOut}
            pressedClassName="tw:bg-game-text tw:group-hover/layer:bg-white"
            unread={zen ? 0 : chatUnread}
            zen={zen}
            zenAvailable={!state.finished}
          />
        )
      }
      clueLog={clueLog}
      colorblindMode={settings.colorblindMode}
      efficiencyModified={efficiencyStats.modified}
      efficiencyStats={efficiencyStats}
      futureEfficiency={formatEfficiency(efficiencyStats.futureEfficiency)}
      // The game's length changes as the clock ticks, and the screen draws again with it.
      gameInfoTooltip={getGameInfoTooltip()}
      hardVariant={metadata.hardVariant && settings.hGroupConventions}
      lastTurn={
        (state.replay.segment !== undefined || state.finished)
        && state.replay.hypothetical === undefined
        && state.replay.shared?.spoilerFree !== true
          ? state.ongoingGame.turn.turnNum + 1
          : undefined
      }
      // The replay controls have no turn, so the turn here says how far into the game it is. A
      // spoiler-free replay hides how long the game lasts.
      logTab={logTab}
      lowScorePhase={
        settings.hGroupConventions
        && isLowScorePhase(visibleState.score, variant.suits.length)
      }
      // In "Throw It in a Hole" variants, the players cannot see the score, so they see how many
      // cards they played instead, as on the classic screen.
      maxScore={scoreHidden ? undefined : visibleState.stats.maxScore}
      minEfficiency={metadata.minEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES)}
      mode={getScreenMode(state)}
      onEfficiencyClick={askForEfficiency}
      onLobby={backToLobby}
      onLogTab={setLogTab}
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
      panel={panel}
      phoneLayout={stacked}
      reducedMotion={settings.reducedMotion}
      // In a replay, its controls are in the bar along the bottom, so that the hands keep most of
      // the height of the screen.
      replayControls={
        hasReplayControls(state) ? (
          <ReplayControls
            editingCards={editingCards}
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
          <EndGameMenu numPlayers={metadata.options.numPlayers} votes={votes} />
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
  );

  return (
    <div
      // A browser draws a button in its own font, with normal letter spacing. Here, a button takes
      // the font and the letter spacing of the page instead, so that it matches the text around it,
      // and a name measured outside a button fits in one. A button's own classes still win. No text
      // on the screen can be selected, so that clicks and drags never highlight it. The text boxes,
      // such as the chat input, still let the player select what they type. The text has one size
      // in each layout (see "tailwind.css"). A touch does not draw the browser's tap highlight, a
      // dark box over the element that it touched; the screen shows its own response to a tap.
      className="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:text-game-screen tw:select-none tw:[-webkit-tap-highlight-color:transparent] tw:phone:text-game-screen-compact tw:bg-game-bg tw:[background-image:var(--game-screen-table)] tw:[background-size:512px,auto,auto] tw:[background-blend-mode:overlay,normal,normal] tw:text-game-text tw:[:where(&)_button]:[font-family:inherit] tw:[:where(&)_button]:[letter-spacing:inherit]"
      {...cardInputHandlers}
      // The "phone" variant of the styles follows it (see "tailwind.css").
      data-phone-layout={stacked ? "" : undefined}
      // A right-click on a card, a player's name, or a number draws an arrow on it, when the viewer
      // can draw one.
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
        {/* The columns are positioned, so that they are in front of these boxes. */}
        <DropZones
          chatCoversTable={chatOverlay && chatOpen && !chatPoppedOut}
          discardState={discardZoneState}
          discardZoneRef={discardZoneRef}
          handsElement={handsElement}
          heldCard={held?.order}
          phoneLayout={stacked}
          playState={playZoneState}
          playZoneRef={playZoneRef}
          reducedMotion={settings.reducedMotion}
        />
        <main className="tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
          <div
            className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:justify-center tw:pb-5 tw:phone:flex-col tw:phone:justify-start tw:phone:overflow-y-auto tw:phone:px-(--phone-side-padding)"
            ref={setTableElement}
            style={
              {
                // The hands' margin subtracts this padding (see below).
                "--phone-side-padding": PHONE_SIDE_PADDING,
                paddingTop: stacked
                  ? TABLE_TOP_PADDING.STACKED
                  : TABLE_TOP_PADDING.WIDE,
                ...(stacked && { rowGap: PHONE_TABLE_GAP }),
                ...(!stacked && {
                  paddingInline: wideRoom.tableSidePadding,
                  columnGap: wideRoom.tableColumnGap,
                }),
              } as React.CSSProperties
            }
          >
            {/* The play stacks' box shows no outline. It moves up by its padding, so that the top
                of the stacks lines up with the tops of the hands and the discard pile. The
                "ui-screenshots" command checks it. */}
            <div
              className="tw:relative tw:flex tw:shrink-0 tw:phone:justify-center"
              ref={setPlayAreaElement}
              style={{
                paddingTop: columnTopPadding,
                marginTop: stacked ? undefined : -PLAY_STACKS_PADDING,
              }}
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
                        menuOpen: popupCard === deckOrder,
                        // Only an inverted suit plays when it is discarded.
                        canDiscard: variant.hasInverted
                          ? canDiscard
                          : undefined,
                        onPointerDown: (event) => {
                          if (picksUpCard(event, deckOrder)) {
                            pressCard(deckOrder, event, {
                              discardAllowed: variant.hasInverted,
                            });
                          }
                        },
                        onTap: () => {
                          setPopupCard((current) =>
                            current === deckOrder ? undefined : deckOrder,
                          );
                        },
                        onCloseMenu: closePopup,
                        onPlay: () => {
                          setPopupCard(undefined);
                          sendAction({
                            type: "play",
                            order: deckOrder,
                          });
                        },
                        onDiscard: () => {
                          setPopupCard(undefined);
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
                  showPossibleCards: !draggingCard,
                  handCardWidth,
                  colorblindMode: settings.colorblindMode,
                  variant,
                  reducedMotion: settings.reducedMotion,
                }}
                gameEnd={shownGameEnd}
                hole={getHole(state)}
                movedCard={outlinedMove}
                notes={cardNotes}
                stacks={stacks}
                // In the phone layout, the tokens are beside the discard pile instead.
                tokens={
                  stacked ? undefined : (
                    <TableTokens
                      placementClass="tw:mt-auto tw:self-stretch"
                      {...tokensProps}
                    />
                  )
                }
                variant={variant}
                zoneState={playZoneState}
              />
              {queuedMove?.type === "play" && queuedMoveElement}
            </div>

            {/* In the phone layout, the hands keep room on their left for the clue rail, which
                runs beside them (see "Hands.tsx"). The screen's padding is part of that room. In
                the wide layout, they keep room on their right for the clue buttons. */}
            <div
              className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-3.5 tw:phone:ml-(--clue-rail-margin) tw:phone:flex-none"
              style={
                {
                  maxWidth: stacked ? undefined : wideRoom.handsColumnMaxWidth,
                  paddingRight: stacked ? undefined : CLUE_BUTTON_RIGHT_ROOM,
                  "--clue-rail-margin": `calc(${PHONE_CLUE_RAIL_SPACE}px - var(--phone-side-padding))`,
                } as React.CSSProperties
              }
            >
              <div
                className="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:phone:flex-none"
                ref={setHandsElement}
                style={{ paddingTop: handsTopPadding }}
              >
                <NameColumnSizer
                  onSizeChange={onNameSizeChange}
                  phoneWidth={phoneNameWidth}
                  seats={seats}
                />
                <Hands
                  canChooseClueTarget={canClue}
                  canMoveCards={canMoveCards}
                  cardWidth={handCardWidth}
                  clueBelowLowestHand={clueBelowLowestHand}
                  clueButtonBesideName={clueButtonBesideName}
                  clueMarkers={getClueMarkers(
                    shownClue,
                    visibleState.clues,
                    settings.colorblindMode,
                    chopMoved,
                  )}
                  clueMenu={
                    menuTarget === undefined ? undefined : (
                      <ClueMenu
                        below={
                          stacked
                          || (clueBelowLowestHand
                            && seats.at(-1)?.playerIndex === menuTarget)
                        }
                        canGive={canGive}
                        clue={clue}
                        cluePreview={cluePreview}
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
                        onToggleCluePreview={() => {
                          setCluePreview(!cluePreview);
                        }}
                        openedItself={clueTarget === undefined}
                        reducedMotion={settings.reducedMotion}
                        variant={variant}
                      />
                    )
                  }
                  cluesSpent={couldClue && !clueAvailable}
                  clueTarget={menuTarget}
                  colorblindMode={settings.colorblindMode}
                  draggedCard={held?.order}
                  draggingCard={draggingCard && cardInHand}
                  emptyClueTarget={
                    shownClue !== undefined && shownClue.list.length === 0
                      ? shownClue.target
                      : undefined
                  }
                  fingerHold={fingerHold}
                  // The panel of a paused game covers the hands.
                  hidden={paused && !inReplay}
                  movableCards={movableCards}
                  nameColumnWidth={nameColumnWidth}
                  notes={cardNotes}
                  onCardPointerDown={(event, order) => {
                    if (!canMoveCards || !picksUpCard(event, order)) {
                      return;
                    }
                    // The arrow would get in the way of the card, so it goes away when it points at
                    // a card in the same hand, as on the classic screen.
                    const hand = seats.find((seat) =>
                      seat.cards.some((card) => card.order === order),
                    );
                    if (
                      hand !== undefined
                      && hand.cards.some((card) => card.order === shownArrow)
                    ) {
                      showArrow(undefined);
                    }
                    pressCard(order, event);
                  }}
                  onCardTap={togglePopup}
                  onChooseClueTarget={openClueMenu}
                  onClosePopup={closePopup}
                  onEditCard={editingCards ? editCard : undefined}
                  onEditNote={
                    cardNotes.onRightClickCard === undefined
                      ? undefined
                      : editNote
                  }
                  onHoldEmpathy={(playerIndex, byFinger = false) => {
                    setHeldEmpathy(playerIndex);
                    setFingerHold(playerIndex !== undefined && byFinger);
                  }}
                  onPause={pause}
                  onShowPlayerLog={setLogSeat}
                  pauseAction={getPauseAction(state)}
                  popupCard={popupCard}
                  previewing={previewing}
                  previewMarkers={
                    previewing ? getPreviewMarkers() : NO_CLUE_MARKERS
                  }
                  queuedCard={queuedCard}
                  reducedMotion={settings.reducedMotion}
                  seats={seats}
                  sendingCard={
                    sendingMove?.type === "play"
                    || sendingMove?.type === "discard"
                      ? sendingMove.order
                      : undefined
                  }
                  sendingClueTarget={
                    sendingMove?.type === "clue"
                      ? sendingMove.receiverIndex
                      : undefined
                  }
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
                  shownMover={shownMove?.player}
                  showPossibleCards={showHandPossibleCards}
                  speedrunClicks={speedrunClicks}
                  stacked={stacked}
                  touchedCards={new Set(touched)}
                  variant={variant}
                />
                {queuedMove?.type === "clue" && queuedMoveElement}
                {paused && !inReplay && (
                  <PausePanel
                    onUnpause={state.playing ? unpause : undefined}
                    pausedBy={pausedBy}
                    reducedMotion={settings.reducedMotion}
                  />
                )}
                {reconnecting && (
                  <ReconnectingPanel reducedMotion={settings.reducedMotion} />
                )}
              </div>
            </div>

            <div
              className={`tw:relative ${DISCARD_COLUMN_CLASS} tw:flex tw:shrink-0 tw:flex-col tw:gap-3 tw:phone:w-full`}
              style={{
                paddingTop: columnTopPadding,
                width: stacked ? undefined : wideRoom.discardColumnWidth,
              }}
            >
              {stacked ? (
                // The tokens share the row with the pile, so that they do not take a row of their
                // own. The pile is on the right, as the discard column is on a wide screen.
                <div className="tw:flex tw:gap-3">
                  <TableTokens
                    placementClass="tw:self-center"
                    {...tokensProps}
                  />
                  <div className="tw:min-w-0 tw:flex-1">{discardPile}</div>
                </div>
              ) : (
                discardPile
              )}
              {queuedMove?.type === "discard" && queuedMoveElement}
              {/* The status panel draws the clue log, since the two can share one box (see
                  "StatusStrip.tsx"). */}
              {panel ? statusStrip : clueLog}
            </div>
          </div>
          <LeaderDirection state={state} />
        </main>

        {hasChat && (
          <ChatPanel
            friends={friends}
            open={chatOpen}
            // Zen mode hides who is watching and the unread messages, as on the classic screen.
            ourUsername={metadata.ourUsername}
            overlay={chatOverlay}
            poppedOut={chatPoppedOut}
            railHidden={panel}
            reducedMotion={settings.reducedMotion}
            spectators={
              zen ? [] : spectators.map((spectator) => spectator.username)
            }
            spectatorsTooltip={getSpectatorsTooltip(spectators, state.finished)}
            unread={zen ? 0 : chatUnread}
            zen={zen}
            zenAvailable={!state.finished}
          />
        )}
      </div>

      {!panel && statusStrip}

      {shownArrow !== undefined && (
        <HighlightArrow
          deck={visibleState.deck}
          // A new arrow drops in, even on a card that had one before.
          key={getArrowTargetKey(shownArrow)}
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
          reducedMotion={settings.reducedMotion}
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
          {held.phase === "drop"
            && (sendingMove?.type === "play" || sendingMove?.type === "discard")
            && sendingMove.order === held.order && (
              <SendingMark
                label="Sending your move"
                labelEdge="bottom"
                radius={handCardWidth * CARD_CORNER_PER_WIDTH}
                reducedMotion={settings.reducedMotion}
              />
            )}
          <CardFace
            blank={heldView.blank}
            clued={heldView.clued}
            colorblindMode={settings.colorblindMode}
            critical={heldView.critical}
            doubleDiscard={heldView.doubleDiscard}
            identityFromNote={heldView.identityFromNote}
            noteBorder={heldView.noteBorder}
            noteMarks={heldView.noteMarks}
            // The card in the hand gives way to the held card, so the held card shows the bubble
            // that the card in the hand would show, until the player drags it.
            openPossibleCards={held.phase === "drag" && showHandPossibleCards}
            pips={heldView.pips}
            rank={heldView.rank}
            stackDirection={heldView.stackDirection}
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
