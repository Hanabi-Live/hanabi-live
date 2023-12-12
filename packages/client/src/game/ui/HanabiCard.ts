import type {
  CardOrder,
  Color,
  NumPlayers,
  Rank,
  Suit,
  SuitIndex,
  SuitRankTuple,
  Variant,
} from "@hanabi/data";
import { getSuit } from "@hanabi/data";
import type { CardState } from "@hanabi/game";
import { CardStatus, StackDirection } from "@hanabi/game";
import { assertDefined, assertNotNull, iRange } from "@hanabi/utils";
import Konva from "konva";
import { initialCardState } from "../reducers/initialStates/initialCardState";
import { noteEqual, noteHasMeaning, parseNote } from "../reducers/notesReducer";
import * as abbreviationRules from "../rules/abbreviation";
import * as cardRules from "../rules/card";
import * as variantRules from "../rules/variant";
import type { CardIdentity } from "../types/CardIdentity";
import type { CardNote } from "../types/CardNote";
import type { UICard } from "../types/UICard";
import * as HanabiCardInit from "./HanabiCardInit";
import * as HanabiCardMouse from "./HanabiCardMouse";
import { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  CARD_FADE,
  CARD_H,
  CARD_W,
} from "./constants";
import type { NodeWithTooltip } from "./controls/NodeWithTooltip";
import type { NoteIndicator } from "./controls/NoteIndicator";
import { RankPip } from "./controls/RankPip";
import { suitIndexToSuit } from "./convert";
import type { CursorType } from "./cursor";
import {
  CARD_IMAGE_STACK_BASE_RANK_NAME,
  CARD_IMAGE_UNKNOWN_CARD_RANK_NAME,
} from "./drawCards";
import { animate } from "./konvaHelpers";
import {
  checkNoteImpossibility,
  getRankFromNote,
  getSuitIndexFromNote,
  possibleCardsFromNoteAndClues,
} from "./noteCheckImpossibility";
import * as notes from "./notes";

enum PipState {
  Hidden,
  Eliminated,
  Visible,
}

const DECK_BACK_IMAGE = "deck-back";
const UNKNOWN_SUIT = getSuit("Unknown");

/** Represents a single card. It has a `LayoutChild` parent. */
export class HanabiCard extends Konva.Group implements NodeWithTooltip, UICard {
  // ---------------
  // Class variables
  // ---------------

  private readonly variant: Variant;

  tween: Konva.Tween | null = null; // Required in order to be able to cancel animations
  private tweenCallbacks: Array<() => void> = [];
  cursor: CursorType = "default";
  private empathy = false;
  dragging = false;
  wasRecentlyTapped = false;
  touchstartTimeout: ReturnType<typeof setTimeout> | null = null;

  isStackBase: boolean;

  private readonly bare: Konva.Image;
  private bareName = "";

  private readonly cluedBorder: Konva.Group;
  private readonly chopMoveBorder: Konva.Group;
  private readonly finesseBorder: Konva.Group;

  private readonly suitPips: Konva.Group;
  private readonly rankPips: Konva.Group;
  private readonly suitPipsMap: Map<number, Konva.Shape>;
  private readonly suitPipsPositiveMap: Map<number, Konva.Shape>;
  private readonly suitPipsXMap: Map<number, Konva.Shape>;
  private readonly rankPipsMap: Map<number, RankPip>;
  private readonly rankPipsXMap: Map<number, Konva.Shape>;
  private readonly criticalIndicator: Konva.Image;
  private readonly arrow: Konva.Group | null = null;
  private readonly arrowBase: Konva.Arrow | null = null;

  noteIndicator: NoteIndicator;
  private readonly trashcan: Konva.Image;
  private readonly questionMark: Konva.Image;
  private readonly exclamationMark: Konva.Image;
  private readonly wrench: Konva.Image;
  private readonly ddaIndicatorTop: Konva.Image;
  private readonly ddaIndicatorBottom: Konva.Image;
  private readonly trashMiniIndicatorTop: Konva.Image;
  private readonly trashMiniIndicatorBottom: Konva.Image;

  // -------------------
  // Getters and setters
  // -------------------

  private readonly _layout: LayoutChild;
  get layout(): LayoutChild {
    return this._layout;
  }

  // HACK: this is temporary to figure out what needs to be converted to reactive. In the end, the
  // state should not be exposed by the UI in any form and nobody should depend on the HanabiCard UI
  // state.
  private _state: CardState;
  get state(): CardState {
    return (
      globals.store?.getState()?.visibleState?.deck[this._state.order] ??
      this._state
    );
  }

  set state(state: CardState) {
    this._state = state;
  }

  get note(): CardNote {
    return globals.state.notes.ourNotes[this.state.order]!;
  }

  private _tweening = false;
  get tweening(): boolean {
    return this._tweening;
  }

  get tooltipName(): string {
    return `card-${this.state.order}`;
  }

  private _visibleSuitIndex: SuitIndex | null = null;
  get visibleSuitIndex(): SuitIndex | null {
    return this._visibleSuitIndex;
  }

  private _visibleRank: Rank | null = null;
  get visibleRank(): Rank | null {
    return this._visibleRank;
  }

  // -----------
  // Constructor
  // -----------

  constructor(
    order: CardOrder,
    suitIndex: SuitIndex | null,
    rank: Rank | null,
    isStackBase: boolean,
    variant: Variant,
    numPlayers: NumPlayers,
  ) {
    super();
    this.listening(true);
    this.variant = variant;

    // Cards should start off with a constant width and height.
    this.width(CARD_W);
    this.height(CARD_H);
    this.x(CARD_W / 2);
    this.y(CARD_H / 2);
    this.offset({
      x: 0.5 * CARD_W,
      y: 0.5 * CARD_H,
    });

    // Order is defined upon first initialization.
    const initialState = initialCardState(order, this.variant, numPlayers);
    this._state = {
      ...initialState,
      suitIndex, // Only initially specified for stack bases.
    };

    this.isStackBase = isStackBase;

    // ---------------------------------------
    // Initialize various elements of the card
    // ---------------------------------------

    this.bare = HanabiCardInit.image(() => this.bareName);
    this.add(this.bare);

    this.cluedBorder = HanabiCardInit.cluedBorder();
    this.add(this.cluedBorder);
    this.finesseBorder = HanabiCardInit.finesseBorder();
    this.add(this.finesseBorder);
    this.chopMoveBorder = HanabiCardInit.chopMoveBorder();
    this.add(this.chopMoveBorder);

    const pips = HanabiCardInit.pips(this.variant);
    this.suitPipsMap = pips.suitPipsMap;
    this.suitPipsPositiveMap = pips.suitPipsPositiveMap;
    this.suitPipsXMap = pips.suitPipsXMap;
    this.rankPipsMap = pips.rankPipsMap;
    this.rankPipsXMap = pips.rankPipsXMap;
    this.suitPips = pips.suitPips;
    this.rankPips = pips.rankPips;
    this.add(this.suitPips);
    this.add(this.rankPips);

    this.criticalIndicator = HanabiCardInit.criticalIndicator(
      this.variant.offsetCornerElements,
    );
    this.add(this.criticalIndicator);

    const arrowElements = HanabiCardInit.directionArrow(this.variant);
    if (arrowElements !== null) {
      this.arrow = arrowElements.arrow;
      this.arrowBase = arrowElements.arrowBase;
      this.add(this.arrow);
    }

    this.noteIndicator = HanabiCardInit.note(
      this.variant.offsetCornerElements,
      () => this.shouldShowNoteIndicator(),
    );
    this.add(this.noteIndicator);

    this.trashcan = HanabiCardInit.trashcan();
    this.add(this.trashcan);
    this.questionMark = HanabiCardInit.questionMark();
    this.add(this.questionMark);
    this.exclamationMark = HanabiCardInit.exclamationMark();
    this.add(this.exclamationMark);
    this.wrench = HanabiCardInit.wrench();
    this.add(this.wrench);
    this.ddaIndicatorTop = HanabiCardInit.ddaIndicatorTop();
    this.add(this.ddaIndicatorTop);
    this.ddaIndicatorBottom = HanabiCardInit.ddaIndicatorBottom(
      this.variant.offsetCornerElements,
    );
    this.add(this.ddaIndicatorBottom);
    this.trashMiniIndicatorTop = HanabiCardInit.trashMiniIndicatorTop();
    this.add(this.trashMiniIndicatorTop);
    this.trashMiniIndicatorBottom = HanabiCardInit.trashMiniIndicatorBottom(
      this.variant.offsetCornerElements,
    );
    this.add(this.trashMiniIndicatorBottom);

    // Register mouse events for hovering, clicking, etc.
    this.registerMouseHandlers();

    // Add a parent layout.
    this._layout = new LayoutChild(this);

    // Initialize the bare image.
    if (suitIndex !== null || rank !== null) {
      this.setBareImage();
    }
  }

  registerMouseHandlers = HanabiCardMouse.registerMouseHandlers;
  setCursor = HanabiCardMouse.setCursor;

  // -------------
  // Tween methods
  // -------------

  startedTweening(): void {
    this._tweening = true;

    if (this.isListening() === false) {
      // HACK: since Konva doesn't propagate listening hierarchically until v7, stop the image from
      // listening.
      this.bare.listening(false);
    }
  }

  finishedTweening(): void {
    this._tweening = false;

    if (this.isListening() === true) {
      // HACK: since Konva doesn't propagate listening hierarchically until v7, stop the image from
      // listening.
      this.bare.listening(true);
    }

    for (const callback of this.tweenCallbacks) {
      callback();
    }
    this.tweenCallbacks = [];
  }

  waitForTweening(callback: () => void): void {
    if (!this.tweening) {
      callback();
      return;
    }
    this.tweenCallbacks.push(callback);
  }

  // ----------------------------------------------
  // Image methods (for the bare image on the card)
  // ----------------------------------------------

  /**
   * Adjusts the "bare" image of the card (e.g. the HTML5 canvas drawing from
   * "globals.scaledCardImages"). Additionally, it toggles various card elements (pips, shadows,
   * fading, etc.).
   */
  setBareImage(): void {
    const cardIdentity = this.getCardIdentity();

    const suitToShow = this.getSuitToShow(cardIdentity);
    const rankToShow = this.getRankToShow(cardIdentity);

    // Cards that are morphed to be blank should not be draggable
    const morphedBlank = this.isMorphedBlank();
    this.layout.blank = morphedBlank; // Also let the LayoutChild know about it
    this.layout.checkSetDraggable();

    // Set the visible state. (This must be after the morphed blank check.)
    if (suitToShow === null) {
      this._visibleSuitIndex = null;
    } else {
      const suitIndexToShow = this.variant.suits.indexOf(suitToShow) as
        | SuitIndex
        | -1;
      this._visibleSuitIndex = suitIndexToShow === -1 ? null : suitIndexToShow;
    }
    this._visibleRank = rankToShow ?? null;

    // Setting "this.bareName" will automatically update how the card appears the next time that the
    // "card" layer is drawn.
    this.bareName = this.getBareName(morphedBlank, suitToShow, rankToShow);

    // Show or hide pips, shadow, etc.
    this.showCardElements(morphedBlank, suitToShow, rankToShow);

    // Set fading, criticality, etc.
    this.setStatus();

    globals.layers.card.batchDraw();
  }

  /**
   * We may know the identity through normal means (e.g. it is a card that is currently in someone
   * else's hand). We may also know the identity from a future game state (e.g. it is a card in our
   * hand that we have learned about in the future).
   */
  getCardIdentity(): CardIdentity {
    // First, check if we have an alternate identity (e.g. blank or morphed) for this card.
    if (this.isMorphed()) {
      return this.getMorph()!;
    }

    // We do not track the card identities for the stack bases. (For stack bases, the suit and rank
    // is always baked into the state from the get-go.)
    if (this.isStackBase) {
      return {
        suitIndex: this.state.suitIndex,
        rank: this.state.rank,
      };
    }

    // Card identities are stored on the global state for convenience.
    const cardIdentity = globals.state.cardIdentities[this.state.order];
    assertDefined(
      cardIdentity,
      `Failed to get the previously known card identity for card: ${this.state.order}`,
    );

    return cardIdentity;
  }

  getSuitToShow(cardIdentity: CardIdentity): Suit | null {
    // If we are in Empathy mode, only show the suit if there is only one possibility left.
    if (this.empathy) {
      if (this.state.suitIndex !== null && this.state.suitDetermined) {
        return this.variant.suits[this.state.suitIndex] ?? null;
      }

      if (this.isMorphed()) {
        const morphedIdentity = this.getMorph()!;
        if (
          morphedIdentity.rank !== null &&
          morphedIdentity.suitIndex !== null
        ) {
          return suitIndexToSuit(morphedIdentity.suitIndex, this.variant)!;
        }
      }

      return null;
    }

    // Show the suit if it is known.
    if (cardIdentity.suitIndex !== null) {
      const suit = suitIndexToSuit(cardIdentity.suitIndex, this.variant);
      return suit ?? null;
    }

    // If we have a note on the card and it only provides possibilities of the same suit, return
    // that suit.
    const suitIndexFromNote = getSuitIndexFromNote(this.note, this.state);
    if (suitIndexFromNote !== null) {
      return this.variant.suits[suitIndexFromNote]!;
    }

    return null;
  }

  getRankToShow(cardIdentity: CardIdentity): Rank | null {
    // If we are in Empathy mode, only show the rank if there is only one possibility left.
    if (this.empathy) {
      if (this.state.rankDetermined && this.state.rank !== null) {
        return this.state.rank;
      }

      if (this.isMorphed()) {
        const morphedIdentity = this.getMorph()!;
        if (
          morphedIdentity.rank !== null &&
          morphedIdentity.suitIndex !== null
        ) {
          return morphedIdentity.rank;
        }
      }

      return null;
    }

    // If we have a note on the card and it only provides possibilities of the same rank, show that
    // rank.
    const rankFromNote = getRankFromNote(this.note, this.state);

    // For stack bases in ongoing games, we want notes to have precedence over the real identity so
    // that players can morph the stack in "Throw It in a Hole" variants.
    if (
      rankFromNote !== undefined &&
      this.isStackBase &&
      !globals.state.finished
    ) {
      return rankFromNote;
    }

    // Show the rank if it is known.
    if (cardIdentity.rank !== null) {
      return cardIdentity.rank;
    }

    // If we have a note identity on the card, show the rank corresponding to the note.
    if (rankFromNote !== undefined) {
      return rankFromNote;
    }

    return null;
  }

  isMorphed(): boolean {
    if (globals.state.replay.hypothetical === null) {
      return false;
    }

    const morphedIdentity = this.getMorph();
    return morphedIdentity !== undefined;
  }

  getMorph(): CardIdentity | undefined {
    return globals.state.replay.hypothetical?.morphedIdentities[
      this.state.order
    ];
  }

  getMorphedIdentity(): CardIdentity {
    if (this.isMorphed()) {
      return this.getMorph()!;
    }

    if (globals.state.replay.hypothetical !== null && globals.state.playing) {
      const possibilities = possibleCardsFromNoteAndClues(
        this.note,
        this.state,
      );

      if (possibilities.length === 1) {
        const possibility = possibilities[0]!;
        const [suitIndex, rank] = possibility;
        return { suitIndex, rank };
      }
    }

    // We do not track the card identities for the stack bases. (For stack bases, the suit and rank
    // is always baked into the state from the get-go.)
    if (this.isStackBase) {
      return this.state;
    }

    return globals.state.cardIdentities[this.state.order]!;
  }

  getMorphedPossibilities(): readonly SuitRankTuple[] {
    const { suitIndex, rank } = this.getMorphedIdentity();
    if (suitIndex !== null && rank !== null) {
      return [[suitIndex, rank]];
    }

    const possibleCardsWithoutObservation =
      globals.state.replay.hypothetical !== null && globals.state.playing
        ? possibleCardsFromNoteAndClues(this.note, this.state)
        : this.state.possibleCardsFromClues;
    return possibleCardsWithoutObservation.filter(([suitIndexB, rankB]) =>
      this.state.possibleCards.some(
        ([suitIndexC, rankC]) => suitIndexB === suitIndexC && rankB === rankC,
      ),
    );
  }

  isMorphedBlank(): boolean {
    if (!this.isMorphed()) {
      return false;
    }

    const morphedIdentity = this.getMorph()!;
    return morphedIdentity.rank === null && morphedIdentity.suitIndex === null;
  }

  getBareName(
    morphedBlank: boolean,
    suitToShow: Suit | null,
    rankToShow: Rank | null,
  ): string {
    // If a card is morphed to a null identity, the card should appear blank no matter what.
    if (morphedBlank) {
      return DECK_BACK_IMAGE;
    }

    // If a card has a "blank" note on it, the user wants to force the card to appear blank.
    if (
      this.note.blank &&
      !this.empathy &&
      !cardRules.isCardPlayed(this.state) &&
      !cardRules.isCardDiscarded(this.state)
    ) {
      return DECK_BACK_IMAGE;
    }

    // In Real-Life mode, always show the vanilla card back if the card is not fully revealed.
    if (
      globals.lobby.settings.realLifeMode &&
      (suitToShow === null || rankToShow === null) &&
      !this.isStackBase
    ) {
      return DECK_BACK_IMAGE;
    }

    const bareNameSuit = suitToShow?.name ?? UNKNOWN_SUIT.name;
    const bareNameRank = this.getBareNameRank(rankToShow);

    return `card-${bareNameSuit}-${bareNameRank}`;
  }

  getBareNameRank(rankToShow: Rank | null): string {
    if (this.isStackBase) {
      return CARD_IMAGE_STACK_BASE_RANK_NAME;
    }

    if (rankToShow === null) {
      return CARD_IMAGE_UNKNOWN_CARD_RANK_NAME;
    }

    return rankToShow.toString();
  }

  // --------------
  // Border methods
  // --------------

  setBorder(): void {
    this.cluedBorder.visible(this.shouldShowClueBorder());
    this.chopMoveBorder.visible(this.shouldShowChopMoveBorder());
    this.finesseBorder.visible(this.shouldShowFinesseBorder());
  }

  private shouldShowAnyBorder() {
    return (
      !cardRules.isCardPlayed(this.state) &&
      !cardRules.isCardDiscarded(this.state)
    );
  }

  private shouldShowClueBorder() {
    return (
      this.shouldShowAnyBorder() &&
      !this.note.unclued &&
      (cardRules.isCardClued(this.state) || this.note.clued)
    );
  }

  private shouldShowChopMoveBorder() {
    return (
      this.note.chopMoved &&
      this.shouldShowAnyBorder() &&
      // The clue border and the finesse border have precedence over the chop move border
      !this.shouldShowClueBorder() &&
      !this.shouldShowFinesseBorder() &&
      !globals.state.finished
    );
  }

  private shouldShowFinesseBorder() {
    return (
      this.note.finessed &&
      this.shouldShowAnyBorder() &&
      // The clue border has precedence over the finesse border.
      !this.shouldShowClueBorder() &&
      !globals.state.finished
    );
  }

  // -----------
  // Pip methods
  // -----------

  updatePips(): void {
    const suitPipStates: PipState[] = this.variant.suits.map(
      () => PipState.Hidden,
    );

    /** This is a sparse array indexed by rank. */
    const rankPipStates: PipState[] = [];

    // Default all rank pips to hidden.
    for (const rank of this.variant.ranks) {
      rankPipStates[rank] = PipState.Hidden;
    }

    const possibilities = possibleCardsFromNoteAndClues(this.note, this.state);
    const ignoreNote = this.empathy;
    const possibleCardsFromClues = ignoreNote
      ? this.state.possibleCardsFromClues
      : possibilities;
    const possibleCards = this.empathy
      ? this.state.possibleCardsForEmpathy
      : this.state.possibleCards;

    // We look through each card that should have a visible pip (eliminated or not).
    for (const [suitIndex, rank] of possibleCardsFromClues) {
      // If the card is impossible, eliminate it.
      const pipState = possibleCards.some(
        ([s, r]) => s === suitIndex && r === rank,
      )
        ? PipState.Visible
        : PipState.Eliminated;

      // If the suit or rank became visible (is possible), do not overwrite it.
      suitPipStates[suitIndex] =
        suitPipStates[suitIndex] === PipState.Visible
          ? PipState.Visible
          : pipState;
      rankPipStates[rank] =
        rankPipStates[rank] === PipState.Visible ? PipState.Visible : pipState;
    }

    for (const [suitIndex, pipState] of suitPipStates.entries()) {
      const pip = this.suitPipsMap.get(suitIndex);
      const pipPositive = this.suitPipsPositiveMap.get(suitIndex);
      const x = this.suitPipsXMap.get(suitIndex);
      const suit = this.variant.suits[suitIndex]!;
      const possiblePositiveClues = this.state.positiveColorClues.filter(
        (color) => color.name === suit.name,
      );
      const hasPositiveColorClue = possiblePositiveClues.length > 0;
      if (pip !== undefined && x !== undefined) {
        updatePip(pipState, hasPositiveColorClue, pip, x, pipPositive);
      }
    }

    for (const [i, pipState] of rankPipStates.entries()) {
      const rank = i as Rank;
      const pip = this.rankPipsMap.get(rank);
      const x = this.rankPipsXMap.get(rank);
      if (pip !== undefined && x !== undefined) {
        const hasPositiveRankClue = this.state.positiveRankClues.includes(rank);
        updatePip(pipState, hasPositiveRankClue, pip, x);
      }
    }
  }

  // --------------------------
  // Other card element methods
  // --------------------------

  showCardElements(
    morphedBlank: boolean,
    suitToShow: Suit | null,
    rankToShow: Rank | null,
  ): void {
    // Show or hide the pips.
    if (globals.lobby.settings.realLifeMode || morphedBlank) {
      this.suitPips.hide();
      this.rankPips.hide();
    } else {
      const suitUnknown = suitToShow === null;
      const rankUnknown = rankToShow === null;
      this.suitPips.visible(suitUnknown && !this.isStackBase);
      this.rankPips.visible(rankUnknown && !this.isStackBase);
    }

    // Show or hide the "question mark" image.
    this.questionMark.visible(
      this.note.questionMark &&
        !this.empathy &&
        !cardRules.isCardPlayed(this.state) &&
        !cardRules.isCardDiscarded(this.state) &&
        !globals.state.finished,
    );

    // Show or hide the "exclamation mark" image.
    this.exclamationMark.visible(
      this.note.exclamationMark &&
        !this.empathy &&
        !cardRules.isCardPlayed(this.state) &&
        !cardRules.isCardDiscarded(this.state) &&
        !globals.state.finished,
    );

    // Show or hide the "trash" image.
    this.trashcan.visible(
      this.note.knownTrash &&
        !this.empathy &&
        !cardRules.isCardPlayed(this.state) &&
        !cardRules.isCardDiscarded(this.state) &&
        !globals.state.finished,
    );

    // Show or hide the "fix" image.
    this.wrench.visible(
      this.note.needsFix &&
        !this.empathy &&
        !cardRules.isCardPlayed(this.state) &&
        !cardRules.isCardDiscarded(this.state) &&
        !globals.state.finished,
    );

    // Show or hide the direction arrows.
    if (this.arrow !== null && globals.state.visibleState !== null) {
      if (this.visibleSuitIndex === null || this.isStackBase) {
        this.arrow.hide();
      } else {
        this.setDirectionArrow(
          this.visibleSuitIndex,
          globals.state.visibleState.playStackDirections[
            this.visibleSuitIndex
          ]!,
        );
      }
    }

    // Show or hide the shadow on the card.
    this.bare.shadowEnabled(!this.isStackBase && !globals.options.speedrun);
  }

  // Show or hide the direction arrow (for specific variants).
  setDirectionArrow(suitIndex: SuitIndex, direction: StackDirection): void {
    if (!variantRules.hasReversedSuits(this.variant)) {
      return;
    }

    const suit = this.variant.suits[suitIndex]!;

    let shouldShowArrow: boolean;
    if (this.variant.upOrDown) {
      // In "Up or Down" variants, the arrow should be shown when the stack direction is determined.
      // (And the arrow should be cleared when the stack is finished.)
      shouldShowArrow =
        direction === StackDirection.Up || direction === StackDirection.Down;
    } else if (suit.reversed) {
      // In variants with a reversed suit, the arrow should always be shown on the reversed suit.
      shouldShowArrow = true;
    } else {
      shouldShowArrow = false;
    }

    this.arrow!.visible(shouldShowArrow);
    if (!shouldShowArrow) {
      return;
    }

    this.arrow!.rotation(direction === StackDirection.Up ? 180 : 0);
    this.arrowBase!.stroke(suit.fill);
    if (suit.fill === "multi") {
      // We can't use a fill gradient because the "fill" is actually a big stroke. (The Konva arrow
      // object is not a shape, but instead a very thick line.) Instead, just use the the first
      // gradient color.
      this.arrowBase!.stroke(suit.fillColors[0]!);
    }
    if (this.rankPips.isVisible() === true) {
      this.setArrowMiddleRight();
    } else {
      this.setArrowBottomRight();
    }
  }

  private readonly setArrowMiddleRight = () => {
    this.arrow!.y(0.5 * CARD_H);
  };

  private readonly setArrowBottomRight = () => {
    this.arrow!.y(0.79 * CARD_H);
  };

  setStatus(): void {
    const { visibleState } = globals.state;
    if (visibleState === null) {
      return;
    }

    // Do not show any status in real life mode.
    if (globals.lobby.settings.realLifeMode) {
      return;
    }

    const status =
      this.visibleSuitIndex === null || this.visibleRank === null
        ? CardStatus.NeedsToBePlayed // Default status; not faded and not critical.
        : visibleState.cardStatus[this.visibleSuitIndex][this.visibleRank];

    this.setFade(status === CardStatus.Trash);
    this.setCritical(status === CardStatus.Critical);

    const isKnownTrash =
      !cardRules.isCardPlayed(this.state) &&
      !cardRules.isCardDiscarded(this.state) &&
      this.state.isKnownTrashFromEmpathy;
    this.setTrashMiniIndicator(isKnownTrash);

    this.setDDA(
      this.state.inDoubleDiscard &&
        status !== CardStatus.Critical &&
        !isKnownTrash,
    );
  }

  private setTrashMiniIndicator(isTrash: boolean) {
    const known = this.visibleRank !== null;
    if (isTrash && this.trashcan.isVisible() === false) {
      this.trashMiniIndicatorTop.visible(!known);
      this.trashMiniIndicatorBottom.visible(known);
    } else {
      this.trashMiniIndicatorTop.visible(false);
      this.trashMiniIndicatorBottom.visible(false);
    }
  }

  private setDDA(dda: boolean) {
    const visible = this.shouldSetDDA(dda);
    const known = this.visibleRank !== null;
    if (visible) {
      this.ddaIndicatorTop.visible(!known);
      this.ddaIndicatorBottom.visible(known);
    } else {
      this.ddaIndicatorTop.visible(false);
      this.ddaIndicatorBottom.visible(false);
    }
  }

  private shouldSetDDA(dda: boolean) {
    return (
      dda &&
      !this.shouldShowClueBorder() &&
      this.trashcan.isVisible() === false &&
      globals.lobby.settings.hyphenatedConventions &&
      !globals.metadata.hardVariant
    );
  }

  private setFade(isTrash: boolean) {
    const opacity = this.shouldSetFade(isTrash) ? CARD_FADE : 1;
    this.opacity(opacity);
  }

  private shouldSetFade(isTrash: boolean) {
    // Override any logic and always fade the card if it is explicitly marked as known trash.
    if (
      this.trashcan.isVisible() === true &&
      this.state.numPositiveClues === 0
    ) {
      return true;
    }

    return (
      isTrash &&
      !cardRules.isCardClued(this.state) &&
      !cardRules.isCardPlayed(this.state) &&
      !cardRules.isCardDiscarded(this.state) &&
      !this.note.blank &&
      !this.note.chopMoved &&
      !this.variant.throwItInAHole &&
      !globals.options.speedrun
    );
  }

  private setCritical(critical: boolean) {
    const visible = this.shouldSetCritical(critical);
    this.criticalIndicator.visible(visible);
  }

  private shouldSetCritical(critical: boolean) {
    return (
      critical &&
      !cardRules.isCardPlayed(this.state) &&
      !cardRules.isCardDiscarded(this.state)
    );
  }

  setShadowOffset(duration = 0.05): void {
    // Shadow special effects
    const shadowOffset = this.dragging
      ? Math.floor(0.12 * CARD_W)
      : Math.floor(0.04 * CARD_W);
    if (globals.animateFast) {
      this.bare.shadowOffsetX(shadowOffset);
      this.bare.shadowOffsetY(shadowOffset);
    } else {
      this.bare.to({
        // Tween
        shadowOffsetX: shadowOffset,
        shadowOffsetY: shadowOffset,
        duration,
      });
    }
  }

  setRaiseAndShadowOffset(): void {
    // Early return: no parent (being removed from scene).
    if (this.layout.parent === null) {
      return;
    }

    const duration = 0.05;
    this.setShadowOffset(duration);

    // Cards are raised when:
    // - they have one or more positive clues on them
    // - they are being dragged
    const baseOffsetY = this.shouldBeRaisedFromClues()
      ? 0.6 * CARD_H
      : 0.5 * CARD_H;
    const offsetX = this.dragging ? 0.52 * CARD_W : 0.5 * CARD_W;
    const offsetY = baseOffsetY + (this.dragging ? 0.02 * CARD_H : 0);
    if (globals.animateFast) {
      this.offsetX(offsetX);
      this.offsetY(offsetY);
    } else {
      animate(
        this,
        {
          offsetX,
          offsetY,
          duration,
        },
        false,
      );
    }
  }

  private shouldBeRaisedFromClues() {
    // On Keldon mode, only the player should see the cards raised on their own hand.
    const shouldShowOnKeldonMode =
      this.state.location === globals.metadata.ourPlayerIndex &&
      !globals.state.finished;

    return (
      this.shouldShowClueBorder() &&
      !this.layout.isDragging() &&
      (!globals.lobby.settings.keldonMode || shouldShowOnKeldonMode)
    );
  }

  setNoteIndicator(): void {
    const visible = this.shouldShowNoteIndicator();
    this.noteIndicator.visible(visible);

    // Spectators
    if (
      visible &&
      !globals.state.playing &&
      !globals.state.finished &&
      !this.noteIndicator.rotated
    ) {
      this.noteIndicator.rotate(15);
      this.noteIndicator.rotated = true;
    }

    globals.layers.card.batchDraw();
  }

  shouldShowNoteIndicator(): boolean {
    // If we are a player in an ongoing game, show the note indicator if we have a non-blank note on
    // it.
    if (globals.state.playing) {
      const ourNote =
        globals.state.notes.ourNotes[this.state.order]?.text ?? "";
      return ourNote !== "";
    }

    // Morphed cards (in a hypothetical) should never show the note indicator.
    if (this.isMorphed()) {
      return false;
    }

    // We are not a player in an ongoing game. Only show the note indicator if there is one or more
    // non-blank notes.
    const note = globals.state.notes.allNotes[this.state.order];
    if (note === undefined) {
      return false;
    }
    for (const noteObject of note) {
      if (noteObject.text !== "") {
        return true;
      }
    }
    return false;
  }

  // -----------------
  // Animation methods
  // -----------------

  animateToPlayerHand(holder: number): void {
    this.removeLayoutChildFromParent();

    const hand = globals.elements.playerHands[holder];
    if (hand === undefined) {
      return;
    }

    // Sometimes the `LayoutChild` can get hidden if another card is on top of it in a play stack
    // and the user rewinds to the beginning of the replay.
    this.layout.visible(true);
    this.layout.rotation(hand.rotation() * -1);
    this.layout.opacity(1); // Cards can be faded in certain variants.

    // Add it to the player's hand (which will automatically tween the card).
    hand.addChild(this.layout);
    hand.moveToTop();

    // In case listening was disabled, which happens in some variants.
    this.listening(true);
  }

  animateToDeck(): void {
    const layoutChild = this.layout;
    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      layoutChild === undefined ||
      layoutChild.parent === null ||
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      layoutChild.parent === undefined ||
      globals.elements.deck === null
    ) {
      // Do not do anything on first initialization.
      return;
    }
    this.removeLayoutChildFromParent();

    const scale = globals.elements.deck.cardBack.width() / CARD_W;
    if (globals.animateFast) {
      layoutChild.checkSetDraggable();
      this.setRaiseAndShadowOffset();
      layoutChild.hide();
    } else {
      layoutChild.opacity(1); // Cards can be hidden in certain variants.
      const pos = layoutChild.getAbsolutePosition();
      globals.elements.deck.add(layoutChild as unknown as Konva.Group);
      layoutChild.setAbsolutePosition(pos);

      // Animate to the deck.
      this.startedTweening();
      animate(
        layoutChild,
        {
          duration: CARD_ANIMATION_LENGTH_SECONDS,
          x: 0,
          y: 0,
          scale,
          rotation: 0,
          // eslint-disable-next-line @typescript-eslint/unbound-method
          easing: Konva.Easings.EaseOut,
          onFinish: () => {
            this.finishedTweening();
            layoutChild.checkSetDraggable();
            layoutChild.hide();
            this.removeLayoutChildFromParent();
          },
        },
        true,
      );
    }
  }

  animateToPlayStacks(): void {
    this.removeLayoutChildFromParent();

    // Adding the card to the play stack will automatically tween the card.
    assertNotNull(
      this.state.suitIndex,
      `Failed to animate card ${this.state.order} to the play stacks since it has a null suit index.`,
    );

    const suit = this.variant.suits[this.state.suitIndex];
    assertDefined(
      suit,
      `Failed to animate card ${this.state.order} to the play stacks since the suit was not found at index: ${this.state.suitIndex}`,
    );

    const playStack = globals.elements.playStacks.get(suit);
    assertDefined(
      playStack,
      `Failed to animate card ${this.state.order} to the play stacks since the play stack was not found for suit: ${suit.name}`,
    );

    playStack.addChild(this.layout);

    // We also want to move this stack to the top so that cards do not tween behind the other play
    // stacks when traveling to this stack.
    playStack.moveToTop();

    // In case listening was disabled, which happens in some variants.
    this.listening(true);
  }

  animateToHole(): void {
    this.removeLayoutChildFromParent();

    // Adding the card to the hole will automatically tween the card.
    const hole = globals.elements.playStacks.get("hole")!;
    hole.addChild(this.layout);

    // We do not want this card to interfere with writing notes on the stack bases.
    this.listening(false);
  }

  animateToDiscardPile(): void {
    this.removeLayoutChildFromParent();

    // Adding the card to the discard pile will automatically tween the card.
    assertNotNull(
      this.state.suitIndex,
      `Failed to animate card ${this.state.order} to the discard pile since it has a null suit index.`,
    );

    const suit = this.variant.suits[this.state.suitIndex];
    assertDefined(
      suit,
      `Failed to animate card ${this.state.order} to the discard pile since the suit was not found at index: ${this.state.suitIndex}`,
    );

    const discardStack = globals.elements.discardStacks.get(suit);
    assertDefined(
      discardStack,
      `Failed to animate card ${this.state.order} to the discard pile since the discard stack was not found for suit: ${suit.name}`,
    );

    discardStack.addChild(this.layout);

    // We need to bring the discarded card to the top so that when it tweens to the discard pile, it
    // will fly on top of the play stacks and other player's hands. However, if we use
    // "globals.elements.discardStacks.get(suit).moveToTop()" like we do in the
    // "animateToPlayStacks()" function, then the discard stacks will not be arranged in the correct
    // order. Thus, move all of the discord piles to the top in order so that they will be properly
    // overlapping (the bottom-most stack should have priority over the top).
    for (const stack of globals.elements.discardStacks.values()) {
      stack.moveToTop();
    }

    // In case listening was disabled, which happens in some variants.
    this.listening(true);
  }

  // A card's parent is a LayoutChild. The parent of the LayoutChild is the location of the card
  // (e.g. a player's hand, the play stacks, etc.). The LayoutChild is removed from the parent prior
  // to the card changing location.
  removeLayoutChildFromParent(): void {
    // Ensure that empathy is disabled prior to removing a card from a player's hand.
    this.setEmpathy(false);

    // Remove the card from the player's hand in preparation of adding it to either the play stacks
    // or the discard pile.
    if (this.layout.parent === null) {
      // If a tween is destroyed in the middle of animation, it can cause a card to be orphaned.
      // Ensure the position is reset to the deck, if unset.
      if (this.layout.x() === 0 && this.layout.y() === 0) {
        this.moveToDeckPosition();
      }
      return;
    }
    const pos = this.layout.getAbsolutePosition();
    this.layout.rotation(this.layout.parent.rotation());
    this.layout.remove();
    this.layout.setAbsolutePosition(pos);
  }

  moveToDeckPosition(): void {
    const deckPos = globals.elements.deck!.cardBack.getAbsolutePosition();
    this.layout.setAbsolutePosition(deckPos);
    const scale = globals.elements.deck!.cardBack.width() / CARD_W;
    this.layout.scale({
      x: scale,
      y: scale,
    });
  }

  // ------------
  // Note methods
  // ------------

  setNote(note: string): void {
    notes.set(this.state.order, note);
    notes.update(this, note);
    if (note !== "") {
      notes.show(this);
    }
  }

  protectedNote(noteString: string): string {
    const currentNote = parseNote(this.variant, noteString);
    const bracketNoteString = `[${noteString}]`;
    // Protect notes like 'k3' whose meaning is preserved by bracketing: '[k3]'
    if (
      noteHasMeaning(this.variant, currentNote) &&
      noteEqual(currentNote, parseNote(this.variant, bracketNoteString))
    ) {
      return bracketNoteString;
    }
    return noteString;
  }

  updateNote(
    noteAdded: string,
    updateFunc: (a: string, b: string) => string, // how to combine last pipe section and noteAdded
    keepLast = false, // true to repeat (and add to) the last pipe section
    protect = true, // true to add [] to meaningful updates
  ): void {
    const existingNote =
      globals.state.notes.ourNotes[this.state.order]?.text ?? "";
    const noteText = existingNote.trim();
    const note = protect ? this.protectedNote(noteAdded) : noteAdded;
    const lastPipe = noteText.lastIndexOf("|");
    const currentNoteString = noteText.slice(lastPipe + 1).trim();
    const noteString = this.protectedNote(currentNoteString);
    const currentNote = parseNote(this.variant, noteString);
    const newNoteString = updateFunc(noteString, note);
    const newNoteText = keepLast
      ? noteText
      : noteText.slice(0, Math.max(lastPipe, 0)).trim();
    // Case of: updating note does not change note meaning.
    if (
      noteHasMeaning(this.variant, parseNote(this.variant, note)) &&
      noteEqual(currentNote, parseNote(this.variant, newNoteString))
    ) {
      return;
    }
    this.setNote(
      `${newNoteText}${newNoteText === "" ? "" : " | "}${newNoteString}`,
    );
  }

  prependTurnCountNote(noteAdded: string): void {
    this.updateNote(noteAdded, (a: string, b: string): string => {
      const turnStripped = a.replace(/^#\d+ /, "");
      return `${b} ${turnStripped}`;
    });
  }

  prependNote(noteAdded: string): void {
    this.updateNote(noteAdded, (a: string, b: string): string => `${b} ${a}`);
  }

  appendNoteOnly(noteAdded: string): void {
    this.updateNote(noteAdded, (a: string, b: string): string => `${a} ${b}`);
  }

  appendNote(noteAdded: string): void {
    this.updateNote(
      noteAdded,
      (a: string, b: string): string => `${a} ${b}`,
      true,
    );
  }

  checkSpecialNote(): void {
    const note = globals.state.notes.ourNotes[this.state.order]!;
    checkNoteImpossibility(this.variant, this.state, note, this.isStackBase);

    // Morph the card if it has an "exact" card note. (Or clear the bare image if the note was
    // deleted/changed.)
    this.setBareImage();

    // Update the pips if the note changed them.
    this.updatePips();

    // Since we updated the note, we might need to redraw a special border around the card.
    this.setBorder();

    globals.layers.card.batchDraw();
  }

  checkNoteDisproved(): void {
    // If we wrote a card identity note and all the possibilities for that note have been
    // eliminated, unmorph the card
    // (e.g. a note of "r1" is now impossible because red 1 has 0 cards left)
    if (
      this.note.possibilities.every(
        ([suitIndex, rank]) =>
          !cardRules.canCardPossiblyBeFromEmpathy(this.state, suitIndex, rank),
      )
    ) {
      // Unmorph
      this.setBareImage();
    }
  }

  setEmpathy(enabled: boolean): void {
    if (this.empathy === enabled) {
      // No change
      return;
    }

    this.empathy = enabled;
    this.setBareImage();
    this.updatePips();
  }

  suitDescriptionNote(): string {
    const index = this.state.suitIndex ?? 0;
    const { variant } = this;
    const suit = variant.suits[index]!;
    const lines: string[] = [];

    if (suit.oneOfEach) {
      lines.push("Every card is unique.");
    }

    if (suit.clueColors.length > 1) {
      const colors: string[] = [];
      for (const color of suit.clueColors) {
        colors.push(getColorHTML(color));
      }
      lines.push(`Touched by ${colors.join(", ")} color clues`);
    }

    if (suit.prism) {
      const cards: string[] = [];

      if (variant.upOrDown) {
        const finalClueColor = variant.clueColors.at(-1);
        if (finalClueColor !== undefined) {
          const colorHTML = getColorHTML(finalClueColor);
          cards.push(`START is ${colorHTML}`);
        }
      }

      for (const rank of iRange(1, 5)) {
        const prismClueColorIndex = (rank - 1) % variant.clueColors.length;
        const prismClueColor = variant.clueColors[prismClueColorIndex];
        if (prismClueColor !== undefined) {
          const colorHTML = getColorHTML(prismClueColor);
          cards.push(`${rank} is ${colorHTML}`);
        }
      }

      lines.push(`Colors: ${cards.join(", ")}`);
    }

    if (suit.allClueColors) {
      lines.push("Touched by every color clue.");
    }

    if (suit.noClueColors) {
      lines.push("Not touched by any color clue.");
    }

    if (suit.allClueRanks) {
      lines.push("Touched by every number clue.");
    }

    if (suit.noClueRanks) {
      lines.push("Not touched by any number clue.");
    }

    if (variant.specialRankDeceptive && !suit.noClueRanks) {
      const deceptiveRank = variant.clueRanks[index % variant.clueRanks.length];
      lines.push(
        `Deceptive: ${variant.specialRank} is touched by number ${deceptiveRank} clue.`,
      );
    }

    const abbreviation = abbreviationRules.get(suit.name, variant);
    return `<div style="font-size: 0.75em;"><div style="text-align: center">${
      suit.displayName
    } (${abbreviation})</div>${lines.join("<br>")}</div>`;
  }

  getLayoutParent(): LayoutChild {
    return this._layout;
  }
}

function updatePip(
  pipState: PipState,
  hasPositiveClues: boolean,
  pip: Konva.Shape | RankPip,
  x: Konva.Shape,
  pipPositive?: Konva.Shape | undefined,
) {
  if (pipState === PipState.Hidden) {
    pip.hide();
    x.hide();
    pipPositive?.hide();
  } else {
    pip.show();
    if (hasPositiveClues && pipPositive !== undefined) {
      pip.hide();
      pipPositive.show();
    } else {
      pipPositive?.hide();
    }
    if (pipState === PipState.Eliminated) {
      x.show();
    } else {
      x.hide();
    }
  }

  // TODO: Positive clues on suits should use the same API as rank pips.
  if (pip instanceof RankPip) {
    if (hasPositiveClues && pipState !== PipState.Hidden) {
      pip.showPositiveClue();
    } else {
      pip.hidePositiveClue();
    }
  }
}

function getColorHTML(color: Color) {
  return `<span style="color: ${color.fillColorblind}">${color.name}</span>`;
}
