import type {
  CardIdentity,
  CardNote,
  CardOrder,
  CardState,
  Color,
  NumPlayers,
  Rank,
  Suit,
  SuitIndex,
  SuitRankTuple,
  Variant,
} from "@hanabi-live/game";
import {
  CardStatus,
  DEFAULT_CARD_RANKS,
  PipState,
  START_CARD_RANK,
  StackDirection,
  UNKNOWN_SUIT_NAME,
  canCardPossiblyBeFromEmpathy,
  getCardBorderPresentation,
  getCardIdentityToShow,
  getCardPipPresentation,
  getColorForPrismCard,
  getIdentityFromNote,
  getInitialCardState,
  getSuit,
  getSuitAbbreviationForVariant,
  hasReversedSuits,
  isCardClued,
  isCardDiscarded,
  isCardIdentityFromNote,
  isCardPlayed,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import Konva from "konva";
import * as tooltips from "../../tooltips";
import { noteEqual, noteHasMeaning, parseNote } from "../reducers/notesReducer";
import type { UICard } from "../types/UICard";
import * as HanabiCardInit from "./HanabiCardInit";
import * as HanabiCardMouse from "./HanabiCardMouse";
import { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  CARD_CENTER,
  CARD_FADE,
  CARD_H,
  CARD_SHADOW_OFFSET,
  CARD_W,
  DRAGGED_CARD_SHADOW_OFFSET,
  FULL_TURN_DEGREES,
  HALF_TURN_DEGREES,
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
  possibleCardsFromNoteAndClues,
} from "./noteCheckImpossibility";
import * as notes from "./notes";

const DECK_BACK_IMAGE = "deck-back";
const UNKNOWN_SUIT = getSuit(UNKNOWN_SUIT_NAME);

/** How long a card takes to rise, fall, or move its shadow. */
const RAISE_DURATION_SECONDS = 0.05;

/** How far a card with positive clues on it is raised, as a fraction of the card's height. */
const CLUED_CARD_RAISE = 0.1;

/**
 * How far a dragged card is lifted up and to the left, as a fraction of the card's width and
 * height.
 */
const DRAGGED_CARD_LIFT = 0.02;

/** How many times a card spins as it vanishes into the hole in "Throw It in a Hole" variants. */
const VORTEX_TURNS = 4;

/**
 * How large a card is when it finishes vanishing into the hole. (Konva cannot invert the transform
 * of a node with a scale of 0.)
 */
const VORTEX_FINAL_SCALE = 0.01;

/**
 * Where the arrow of a reversed suit sits on a card, as a fraction of the card's height: beside the
 * rank pips when they are shown, or near the bottom otherwise.
 */
const REVERSED_ARROW_Y = {
  MIDDLE: 0.5,
  BOTTOM: 0.79,
} as const;

/** Represents a single card. It has a `LayoutChild` parent. */
export class HanabiCard extends Konva.Group implements NodeWithTooltip, UICard {
  // ---------------
  // Class variables
  // ---------------

  private readonly variant: Variant;

  tween: Konva.Tween | undefined = undefined; // Required in order to be able to cancel animations
  tweenFinalPosition: { x: number; y: number } | undefined = undefined;
  tweenFinalScale: { x: number; y: number } | undefined = undefined;
  private vortexTween: Konva.Tween | undefined = undefined;
  cursor: CursorType = "default";
  private empathy = false;
  dragging = false;
  wasRecentlyTapped = false;
  touchstartTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  isStackBase: boolean;

  private readonly bare: Konva.Image;
  private bareName = "";

  private readonly cluedBorder: Konva.Group;
  private readonly chopMoveBorder: Konva.Group;
  private readonly finesseBorder: Konva.Group;
  private readonly discardPermissionBorder: Konva.Group;

  private readonly suitPips: Konva.Group;
  private readonly rankPips: Konva.Group;
  private readonly suitPipsMap: Map<number, Konva.Shape>;
  private readonly suitPipsPositiveMap: Map<number, Konva.Shape>;
  private readonly suitPipsXMap: Map<number, Konva.Shape>;
  private readonly rankPipsMap: Map<number, RankPip>;
  private readonly rankPipsXMap: Map<number, Konva.Shape>;
  private readonly criticalIndicator: Konva.Image;
  private readonly arrow: Konva.Group | undefined = undefined;
  private readonly arrowBase: Konva.Shape | undefined = undefined;

  noteIndicator: NoteIndicator;
  private readonly trashcan: Konva.Image;
  private readonly questionMark: Konva.Image;
  private readonly exclamationMark: Konva.Image;
  private readonly ghost: Konva.Image;
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

  readonly order: CardOrder;

  /** The state of a card that is not in the deck, such as a stack base. */
  private readonly fallbackState: CardState;

  /**
   * The card's entry in the visible deck. Otherwise, the fixed state of a card that is not in the
   * deck.
   */
  get state(): CardState {
    return (
      globals.store?.getState().visibleState?.deck[this.order]
      ?? this.fallbackState
    );
  }

  get note(): CardNote {
    return globals.state.notes.ourNotes[this.order]!;
  }

  private _tweening = false;
  get tweening(): boolean {
    return this._tweening;
  }

  get tooltipName(): string {
    return `card-${this.order}`;
  }

  private _visibleSuitIndex: SuitIndex | undefined = undefined;
  get visibleSuitIndex(): SuitIndex | undefined {
    return this._visibleSuitIndex;
  }

  private _visibleRank: Rank | undefined = undefined;
  get visibleRank(): Rank | undefined {
    return this._visibleRank;
  }

  // -----------
  // Constructor
  // -----------

  constructor(
    order: CardOrder,
    suitIndex: SuitIndex | undefined,
    rank: Rank | undefined,
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
    this.position(CARD_CENTER);
    this.offset(CARD_CENTER);

    this.order = order;
    const initialState = getInitialCardState(order, this.variant, numPlayers);
    this.fallbackState = {
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
    this.discardPermissionBorder = HanabiCardInit.discardPermissionBorder();
    this.add(this.discardPermissionBorder);

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
    if (arrowElements !== undefined) {
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
    this.ghost = HanabiCardInit.ghost();
    this.add(this.ghost);
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
    if (suitIndex !== undefined || rank !== undefined) {
      this.setBareImage();
    }
  }

  registerMouseHandlers = HanabiCardMouse.registerMouseHandlers;
  setCursor = HanabiCardMouse.setCursor;

  // -------------
  // Tween methods
  // -------------

  startedTweening(posX: number, scale: number): void {
    this._tweening = true;
    this.tweenFinalPosition = { x: posX, y: 0 };
    this.tweenFinalScale = { x: scale, y: scale };
  }

  finishedTweening(): void {
    if (!this._tweening) {
      return;
    }
    this._tweening = false;
    this.tweenFinalPosition = undefined;
    this.tweenFinalScale = undefined;
  }

  /**
   * Shrinks and spins the card about its center, so that it looks like it is being sucked into the
   * hole in "Throw It in a Hole" variants. This is separate from the tween of the `LayoutChild`,
   * which moves the card to the hole at the same time.
   */
  vortex(duration: number, onFinish: () => void): void {
    this.stopVortex();
    this.vortexTween = new Konva.Tween({
      node: this,
      duration,
      scaleX: VORTEX_FINAL_SCALE,
      scaleY: VORTEX_FINAL_SCALE,
      rotation: VORTEX_TURNS * FULL_TURN_DEGREES,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseIn,
      onFinish: () => {
        onFinish();
        this.stopVortex();
      },
    });
    this.vortexTween.play();
  }

  /** Restores the normal size and rotation of a card that was sucked into the hole. */
  private stopVortex(): void {
    if (this.vortexTween !== undefined) {
      this.vortexTween.destroy();
      this.vortexTween = undefined;
    }
    this.scale({ x: 1, y: 1 });
    this.rotation(0);
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

    // Cards that are morphed to be blank should not be draggable, unless the player's own note
    // identifies them (e.g. a card drawn during an in-game hypothetical).
    const morphedBlank = this.isMorphedBlank();
    this.layout.blank = // Also let the LayoutChild know about it
      morphedBlank
      && getIdentityFromNote(this.note, this.state, globals.state.playing)
        === undefined;
    this.layout.checkSetDraggable();

    // Set the visible state. (This must be after the morphed blank check.)
    if (suitToShow === undefined) {
      this._visibleSuitIndex = undefined;
    } else {
      const suitIndexToShow = this.variant.suits.indexOf(suitToShow) as
        SuitIndex | -1;
      this._visibleSuitIndex =
        suitIndexToShow === -1 ? undefined : suitIndexToShow;
    }
    this._visibleRank = rankToShow;

    // Setting "this.bareName" will automatically update how the card appears the next time that the
    // "card" layer is drawn.
    this.bareName = this.getBareName(morphedBlank, suitToShow, rankToShow);

    // Show or hide pips, shadow, etc.
    this.showCardElements(morphedBlank, suitToShow, rankToShow);

    this.noteIndicator.setIdentitySource(
      isCardIdentityFromNote(this.identityPresentationOptions(cardIdentity)),
    );

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
    const cardIdentity = globals.state.cardIdentities[this.order];
    assertDefined(
      cardIdentity,
      `Failed to get the previously known card identity for card: ${this.order}`,
    );

    return cardIdentity;
  }

  private identityPresentationOptions(cardIdentity: CardIdentity) {
    return {
      cardIdentity,
      state: this.state,
      note: this.note,
      empathy: this.empathy,
      morphedIdentity: this.isMorphed() ? this.getMorph() : undefined,
      isStackBase: this.isStackBase,
      finished: globals.state.finished,
    };
  }

  private getIdentityToShow(cardIdentity: CardIdentity): CardIdentity {
    return getCardIdentityToShow(
      this.identityPresentationOptions(cardIdentity),
    );
  }

  getSuitToShow(cardIdentity: CardIdentity): Suit | undefined {
    const { suitIndex } = this.getIdentityToShow(cardIdentity);
    return suitIndexToSuit(suitIndex, this.variant) ?? undefined;
  }

  getRankToShow(cardIdentity: CardIdentity): Rank | undefined {
    return this.getIdentityToShow(cardIdentity).rank;
  }

  isMorphed(): boolean {
    if (globals.state.replay.hypothetical === undefined) {
      return false;
    }

    const morphedIdentity = this.getMorph();
    return morphedIdentity !== undefined;
  }

  getMorph(): CardIdentity | undefined {
    return globals.state.replay.hypothetical?.morphedIdentities[this.order];
  }

  getMorphedIdentity(): CardIdentity {
    // A blank morph only hides the card (for example, a card drawn during the hypothetical), so the
    // player's own note still identifies it.
    const morph = this.getMorph();
    if (this.isMorphed() && !this.isMorphedBlank()) {
      return morph!;
    }

    if (globals.state.replay.hypothetical !== undefined) {
      const noteIdentity = getIdentityFromNote(
        this.note,
        this.state,
        globals.state.playing,
      );
      if (noteIdentity !== undefined) {
        return noteIdentity;
      }
    }

    if (this.isMorphed()) {
      return morph!;
    }

    // We do not track the card identities for the stack bases. (For stack bases, the suit and rank
    // is always baked into the state from the get-go.)
    if (this.isStackBase) {
      return this.state;
    }

    return globals.state.cardIdentities[this.order]!;
  }

  getMorphedPossibilities(): readonly SuitRankTuple[] {
    const { suitIndex, rank } = this.getMorphedIdentity();
    if (suitIndex !== undefined && rank !== undefined) {
      return [[suitIndex, rank]];
    }

    const possibleCardsWithoutObservation =
      globals.state.replay.hypothetical !== undefined && globals.state.playing
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
      return this.isUnknownHypotheticalDraw();
    }

    const morphedIdentity = this.getMorph()!;
    return (
      morphedIdentity.rank === undefined
      && morphedIdentity.suitIndex === undefined
    );
  }

  /**
   * A card that a hypothetical draws from beyond the real game's deck has no identity to reveal, so
   * it stays blank even when drawn cards are shown.
   */
  private isUnknownHypotheticalDraw(): boolean {
    if (globals.state.replay.hypothetical === undefined || this.isStackBase) {
      return false;
    }

    const { order } = this;
    const cardIdentity = globals.state.cardIdentities[order];
    return (
      order >= globals.state.ongoingGame.deck.length
      && cardIdentity !== undefined
      && cardIdentity.suitIndex === undefined
      && cardIdentity.rank === undefined
    );
  }

  /**
   * Used to compute the card's "bare name", which is used to render the correct image (e.g.
   * "card-${suit}-${bareNameRank}"). The "card" image when nothing is on the stacks has the special
   * name "card-${suit}-${CARD_IMAGE_STACK_BASE_RANK_NAME}".
   */
  getBareName(
    morphedBlank: boolean,
    suitToShow: Suit | undefined,
    rankToShow: Rank | undefined,
  ): string {
    // If a card is morphed to a undefined identity, the card should appear blank no matter what.
    if (morphedBlank) {
      return DECK_BACK_IMAGE;
    }

    // If a card has a "blank" note on it, the user wants to force the card to appear blank.
    if (
      this.note.blank
      && !this.empathy
      && !isCardPlayed(this.state)
      && !isCardDiscarded(this.state)
      && !globals.state.finished
    ) {
      return DECK_BACK_IMAGE;
    }

    // In Real-Life mode, always show the vanilla card back if the card is not fully revealed.
    if (
      globals.lobby.settings.realLifeMode
      && (suitToShow === undefined || rankToShow === undefined)
      && !this.isStackBase
    ) {
      return DECK_BACK_IMAGE;
    }

    const bareNameSuit = suitToShow?.name ?? UNKNOWN_SUIT.name;
    const bareNameRank = this.getBareNameRank(rankToShow);

    return `card-${bareNameSuit}-${bareNameRank}`;
  }

  getBareNameRank(rankToShow: Rank | undefined): string {
    // If a non-null rank is provided, it should take the highest precedence. (We want players to
    // make notes on the stack bases in "Throw it in a Hole" variants.)
    if (rankToShow !== undefined) {
      return rankToShow.toString();
    }

    if (this.isStackBase) {
      return CARD_IMAGE_STACK_BASE_RANK_NAME;
    }

    return CARD_IMAGE_UNKNOWN_CARD_RANK_NAME;
  }

  // --------------
  // Border methods
  // --------------

  private getBorderPresentation() {
    return getCardBorderPresentation(
      this.state,
      this.note,
      globals.state.finished,
    );
  }

  setBorder(): void {
    const border = this.getBorderPresentation();
    this.cluedBorder.visible(border.clued);
    this.chopMoveBorder.visible(border.chopMoved);
    this.finesseBorder.visible(border.finessed);
    this.discardPermissionBorder.visible(border.discardPermission);
  }

  private shouldShowClueBorder() {
    return this.getBorderPresentation().clued;
  }

  // -----------
  // Pip methods
  // -----------

  updatePips(): void {
    const presentation = getCardPipPresentation(
      this.variant,
      this.state,
      this.note,
      this.empathy,
    );

    for (const suitPip of presentation.suitPips) {
      const pip = this.suitPipsMap.get(suitPip.suitIndex);
      const pipPositive = this.suitPipsPositiveMap.get(suitPip.suitIndex);
      const x = this.suitPipsXMap.get(suitPip.suitIndex);
      if (pip !== undefined && x !== undefined) {
        updatePip(suitPip.state, suitPip.positive, pip, x, pipPositive);
      }
    }

    for (const rankPip of presentation.rankPips) {
      const pip = this.rankPipsMap.get(rankPip.rank);
      const x = this.rankPipsXMap.get(rankPip.rank);
      if (pip !== undefined && x !== undefined) {
        updatePip(rankPip.state, rankPip.positive, pip, x);
      }
    }
  }

  // --------------------------
  // Other card element methods
  // --------------------------

  showCardElements(
    morphedBlank: boolean,
    suitToShow: Suit | undefined,
    rankToShow: Rank | undefined,
  ): void {
    // Show or hide the pips.
    if (globals.lobby.settings.realLifeMode || morphedBlank) {
      this.suitPips.hide();
      this.rankPips.hide();
    } else {
      const suitUnknown = suitToShow === undefined;
      const rankUnknown = rankToShow === undefined;
      this.suitPips.visible(suitUnknown && !this.isStackBase);
      this.rankPips.visible(rankUnknown && !this.isStackBase);
    }

    // Show or hide the "question mark" image.
    this.questionMark.visible(
      this.note.questionMark
        && !this.empathy
        && !isCardPlayed(this.state)
        && !isCardDiscarded(this.state)
        && !globals.state.finished,
    );

    // Show or hide the "exclamation mark" image.
    this.exclamationMark.visible(
      this.note.exclamationMark
        && !this.empathy
        && !isCardPlayed(this.state)
        && !isCardDiscarded(this.state)
        && !globals.state.finished,
    );

    // Show or hide the "ghost" image.
    this.ghost.visible(
      this.note.spook
        && !this.empathy
        && !isCardPlayed(this.state)
        && !isCardDiscarded(this.state)
        && !globals.state.finished,
    );

    // Show or hide the "trash" image.
    this.trashcan.visible(
      this.note.knownTrash
        && !this.empathy
        && !isCardPlayed(this.state)
        && !isCardDiscarded(this.state)
        && !globals.state.finished,
    );

    // Show or hide the "fix" image.
    this.wrench.visible(
      this.note.needsFix
        && !this.empathy
        && !isCardPlayed(this.state)
        && !isCardDiscarded(this.state)
        && !globals.state.finished,
    );

    // Show or hide the direction arrows.
    if (this.arrow !== undefined && globals.state.visibleState !== undefined) {
      if (this.visibleSuitIndex === undefined || this.isStackBase) {
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
    if (!hasReversedSuits(this.variant)) {
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

    this.arrow!.rotation(
      direction === StackDirection.Up ? HALF_TURN_DEGREES : 0,
    );
    if (suit.fill === "multi") {
      // Show the colors in the same order as on the card, from top to bottom, in either direction.
      const { y, height } = this.arrowBase!.getSelfRect();
      const top = direction === StackDirection.Up ? y + height : y;
      const bottom = direction === StackDirection.Up ? y : y + height;
      const lastColorIndex = suit.fillColors.length - 1;
      this.arrowBase!.fillLinearGradientStartPoint({ x: 0, y: top });
      this.arrowBase!.fillLinearGradientEndPoint({ x: 0, y: bottom });
      this.arrowBase!.fillLinearGradientColorStops(
        suit.fillColors.flatMap((color, i) => [i / lastColorIndex, color]),
      );
      this.arrowBase!.fillPriority("linear-gradient");
    } else {
      this.arrowBase!.fill(suit.fill);
      this.arrowBase!.fillPriority("color");
    }
    if (this.rankPips.isVisible() === true) {
      this.setArrowMiddleRight();
    } else {
      this.setArrowBottomRight();
    }
  }

  private readonly setArrowMiddleRight = () => {
    this.arrow!.y(REVERSED_ARROW_Y.MIDDLE * CARD_H);
  };

  private readonly setArrowBottomRight = () => {
    this.arrow!.y(REVERSED_ARROW_Y.BOTTOM * CARD_H);
  };

  setStatus(): void {
    const { visibleState } = globals.state;
    // Do not show any status in real life mode.
    if (visibleState === undefined || globals.lobby.settings.realLifeMode) {
      return;
    }

    const status =
      this.visibleSuitIndex === undefined || this.visibleRank === undefined
        ? CardStatus.NeedsToBePlayed // Default status; not faded and not critical.
        : visibleState.cardStatus[this.visibleSuitIndex][this.visibleRank];

    this.setFade(status === CardStatus.Trash);
    this.setCritical(status === CardStatus.Critical);

    const isKnownTrash =
      !isCardPlayed(this.state)
      && !isCardDiscarded(this.state)
      && this.state.isKnownTrashFromEmpathy;
    this.setTrashMiniIndicator(isKnownTrash);

    this.setDDA(
      this.state.inDoubleDiscard
        && status !== CardStatus.Critical
        && !isKnownTrash,
    );
  }

  private setTrashMiniIndicator(isTrash: boolean) {
    const known = this.visibleRank !== undefined;
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
    const known = this.visibleRank !== undefined;
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
      dda
      && !this.shouldShowClueBorder()
      && this.trashcan.isVisible() === false
      && globals.lobby.settings.hGroupConventions
      && !globals.metadata.hardVariant
    );
  }

  private setFade(isTrash: boolean) {
    const opacity = this.shouldSetFade(isTrash) ? CARD_FADE : 1;
    this.opacity(opacity);
  }

  private shouldSetFade(isTrash: boolean) {
    // Override any logic and always fade the card if it is explicitly marked as known trash.
    if (
      this.trashcan.isVisible() === true
      && this.state.numPositiveClues === 0
    ) {
      return true;
    }

    return (
      isTrash
      && !isCardClued(this.state)
      && !isCardPlayed(this.state)
      && !isCardDiscarded(this.state)
      && !this.note.blank
      && !this.note.chopMoved
      && !this.variant.throwItInAHole
      && !globals.options.speedrun
    );
  }

  private setCritical(critical: boolean) {
    const visible = this.shouldSetCritical(critical);
    this.criticalIndicator.visible(visible);
  }

  private shouldSetCritical(critical: boolean) {
    return (
      critical && !isCardPlayed(this.state) && !isCardDiscarded(this.state)
    );
  }

  setShadowOffset(duration = RAISE_DURATION_SECONDS): void {
    // Shadow special effects
    const shadowOffset = this.dragging
      ? DRAGGED_CARD_SHADOW_OFFSET
      : CARD_SHADOW_OFFSET;
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

    this.setShadowOffset();

    // Cards are raised when:
    // - they have one or more positive clues on them
    // - they are being dragged
    const raise = this.shouldBeRaisedFromClues() ? CLUED_CARD_RAISE : 0;
    const lift = this.dragging ? DRAGGED_CARD_LIFT : 0;
    const offsetX = CARD_CENTER.x + lift * CARD_W;
    const offsetY = CARD_CENTER.y + (raise + lift) * CARD_H;
    if (globals.animateFast) {
      this.offsetX(offsetX);
      this.offsetY(offsetY);
    } else {
      animate(this, {
        offsetX,
        offsetY,
        duration: RAISE_DURATION_SECONDS,
      });
    }
  }

  private shouldBeRaisedFromClues() {
    // On Keldon mode, only the player should see the cards raised on their own hand.
    const shouldShowOnKeldonMode =
      this.state.location === globals.metadata.ourPlayerIndex
      && !globals.state.finished;

    return (
      this.shouldShowClueBorder()
      && !this.layout.isDragging()
      && (!globals.lobby.settings.keldonMode || shouldShowOnKeldonMode)
    );
  }

  setNoteIndicator(): void {
    const visible = this.shouldShowNoteIndicator();
    this.noteIndicator.visible(visible);

    // Spectators
    if (visible && !globals.state.playing && !globals.state.finished) {
      this.noteIndicator.setTilted(true);
    }

    globals.layers.card.batchDraw();
  }

  shouldShowNoteIndicator(): boolean {
    // If we are a player in an ongoing game, show the note indicator if we have a non-blank note on
    // it.
    if (globals.state.playing) {
      const ourNote = globals.state.notes.ourNotes[this.order]?.text ?? "";
      return ourNote !== "";
    }

    // Morphed cards (in a hypothetical) should never show the note indicator.
    if (this.isMorphed()) {
      return false;
    }

    // We are not a player in an ongoing game. Only show the note indicator if there is one or more
    // non-blank notes.
    const note = globals.state.notes.allNotes[this.order];
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
    this.layout.rotation(-hand.rotation());
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
      layoutChild === undefined
      || layoutChild.parent === null
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      || layoutChild.parent === undefined
      || globals.elements.deck === undefined
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
      globals.elements.deck.add(layoutChild);
      layoutChild.setAbsolutePosition(pos);

      // Animate to the deck.
      this.startedTweening(0, scale);
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
    assertDefined(
      this.state.suitIndex,
      `Failed to animate card ${this.order} to the play stacks since it has a undefined suit index.`,
    );

    const suit = this.variant.suits[this.state.suitIndex];
    assertDefined(
      suit,
      `Failed to animate card ${this.order} to the play stacks since the suit was not found at index: ${this.state.suitIndex}`,
    );

    const playStack = globals.elements.playStacks.get(suit);
    assertDefined(
      playStack,
      `Failed to animate card ${this.order} to the play stacks since the play stack was not found for suit: ${suit.name}`,
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
    assertDefined(
      this.state.suitIndex,
      `Failed to animate card ${this.order} to the discard pile since it has a undefined suit index.`,
    );

    const suit = this.variant.suits[this.state.suitIndex];
    assertDefined(
      suit,
      `Failed to animate card ${this.order} to the discard pile since the suit was not found at index: ${this.state.suitIndex}`,
    );

    const discardStack = globals.elements.discardStacks.get(suit);
    assertDefined(
      discardStack,
      `Failed to animate card ${this.order} to the discard pile since the discard stack was not found for suit: ${suit.name}`,
    );

    discardStack.addChild(this.layout);

    // We need to bring the discarded card to the top so that when it tweens to the discard pile, it
    // will fly on top of the play stacks and other player's hands. However, if we use
    // "globals.elements.discardStacks.get(suit).moveToTop()" like we do in the
    // "animateToPlayStacks()" function, then the discard stacks will not be arranged in the correct
    // order. Thus, move all of the discard piles to the top in order so that they will be properly
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

    // A card can leave the hole before it has finished vanishing into it, such as when rewinding.
    this.stopVortex();

    // A held card can leave the hand, such as when it is played with a hotkey. Otherwise, it would
    // keep the raised look of a held card in its new location.
    if (this.dragging) {
      this.dragging = false;
      // Ending a drag fires "dragend", which would otherwise try to play or discard the card again.
      this.layout.off("dragend");
      this.layout.draggable(false);
    }

    // Hide the card tooltip when the card moves to a different parent.
    if (globals.activeHover === this) {
      const tooltip = `#tooltip-${this.tooltipName}`;
      tooltips.close(tooltip);
    }

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
    notes.set(this.order, note);
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
      noteHasMeaning(this.variant, currentNote)
      && noteEqual(currentNote, parseNote(this.variant, bracketNoteString))
    ) {
      return bracketNoteString;
    }
    return noteString;
  }

  /**
   * Strips all content from a note string that is not inside square brackets.
   * e.g. "[cm] some prose [r4] more prose" --> "[cm] [r4]"
   */
  static stripProse(noteString: string): string {
    // Consume an unterminated suffix instead of retrying at each opening bracket.
    const brackets = noteString.match(/\[[^\]]*\]?/gu) ?? [];
    return brackets.filter((bracket) => bracket.endsWith("]")).join(" ");
  }

  isBorderAffecting(noteString: string): boolean {
    const parsed = parseNote(this.variant, noteString);
    return parsed.chopMoved || parsed.finessed || parsed.discardPermission;
  }

  updateNote(
    noteAdded: string,
    updateFunc: (a: string, b: string) => string, // how to combine last pipe section and noteAdded
    keepLast = false, // true to repeat (and add to) the last pipe section
    protect = true, // true to add [] to meaningful updates
    stripProse = false, // true to strip prose and conflicting border tokens
  ): void {
    const existingNote = globals.state.notes.ourNotes[this.order]?.text ?? "";
    const noteText = existingNote.trim();
    const note = protect ? this.protectedNote(noteAdded) : noteAdded;
    const lastPipe = noteText.lastIndexOf("|");
    const currentNoteString = noteText.slice(lastPipe + 1).trim();
    const noteString = this.protectedNote(currentNoteString);
    const currentNote = parseNote(this.variant, noteString);
    let newNoteString = updateFunc(noteString, note);

    if (stripProse) {
      newNoteString = HanabiCard.stripProse(newNoteString);
      if (this.isBorderAffecting(note)) {
        newNoteString = newNoteString
          .split(/(?<=\])\s+(?=\[)/u)
          .filter((token) => token === note || !this.isBorderAffecting(token))
          .join(" ");
      }
    }

    const newNoteText = keepLast
      ? noteText
      : noteText.slice(0, Math.max(lastPipe, 0)).trim();
    // Case of: updating note does not change note meaning.
    if (
      noteHasMeaning(this.variant, parseNote(this.variant, note))
      && noteEqual(currentNote, parseNote(this.variant, newNoteString))
    ) {
      return;
    }
    this.setNote(
      `${newNoteText}${newNoteText === "" ? "" : " | "}${newNoteString}`,
    );
  }

  prependTurnCountNote(noteAdded: string): void {
    this.updateNote(noteAdded, (a: string, b: string): string => {
      const turnStripped = a.replace(/^#\d+ /u, "");
      return `${b} ${turnStripped}`;
    });
  }

  prependNote(noteAdded: string): void {
    this.updateNote(noteAdded, (a: string, b: string): string => `${b} ${a}`);
  }

  appendNoteOnly(noteAdded: string): void {
    this.updateNote(
      noteAdded,
      (a: string, b: string): string => `${a} ${b}`,
      false,
      true,
      true,
    );
  }

  appendNote(noteAdded: string): void {
    this.updateNote(
      noteAdded,
      (a: string, b: string): string => `${a} ${b}`,
      true,
      true,
      true,
    );
  }

  checkSpecialNote(): void {
    const note = globals.state.notes.ourNotes[this.order]!;
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
          !canCardPossiblyBeFromEmpathy(this.state, suitIndex, rank),
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
      const colors: string[] = Array.from(suit.clueColors, (color) =>
        getColorHTML(color),
      );
      lines.push(`Touched by ${colors.join(", ")} color clues`);
    }

    if (suit.prism) {
      const ranks = variant.upOrDown
        ? [START_CARD_RANK, ...DEFAULT_CARD_RANKS]
        : DEFAULT_CARD_RANKS;
      const cards = ranks.map((rank) => {
        const rankName = rank === START_CARD_RANK ? "START" : rank.toString();
        const colorHTML = getColorHTML(getColorForPrismCard(variant, rank));
        return `${rankName} is ${colorHTML}`;
      });

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

    if (suit.inverted) {
      lines.push("Inverted: Plays on at attempted discard and vice-versa.");
    }

    const abbreviation = getSuitAbbreviationForVariant(suit, variant);

    return `
      <div class="small-tooltip-text">
        <div class="align-center">
          ${suit.displayName} (${abbreviation})
        </div>
        ${lines.join("<br>")}
      </div>
    `.trim();
  }

  getLayoutParent(): LayoutChild {
    return this._layout;
  }
}

export function updatePip(
  pipState: PipState,
  hasPositiveClues: boolean,
  pip: Konva.Shape | RankPip,
  x: Konva.Shape,
  pipPositive?: Konva.Shape,
): void {
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
