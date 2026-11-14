import type { GameState } from "@hanabi-live/game";
import { gameStateSource } from "../../gameStateSource.ts";
import type { State } from "../../types/State.ts";
import { globals } from "../UiGlobals.ts";
import { canPassTurnInHypothetical } from "../hypothetical.ts";
import type { Listener, Selector, Subscription } from "./observeStore.ts";
import { observeStore, SKIP } from "./observeStore.ts";
import * as animateFastView from "./views/animateFastView.ts";
import * as cardLayoutView from "./views/cardLayoutView.ts";
import * as cardsView from "./views/cardsView.ts";
import * as cluesView from "./views/cluesView.ts";
import * as currentPlayerAreaView from "./views/currentPlayerAreaView.ts";
import * as deckView from "./views/deckView.ts";
import * as draggableView from "./views/draggableView.ts";
import * as gameInfoView from "./views/gameInfoView.ts";
import * as hypotheticalView from "./views/hypotheticalView.ts";
import * as initView from "./views/initView.ts";
import * as logView from "./views/logView.ts";
import * as pauseView from "./views/pauseView.ts";
import * as premoveView from "./views/premoveView.ts";
import * as replayView from "./views/replayView.ts";
import * as spectatorsView from "./views/spectatorsView.ts";
import * as statsView from "./views/statsView.ts";
import * as turnView from "./views/turnView.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Subscriptions = Array<Subscription<State, any>>;

export class StateObserver {
  private unsubscribe: (() => void) | undefined = undefined;

  constructor() {
    this.registerObservers();
  }

  /** Observe the game's state, calling different functions when a particular path changes. */
  registerObservers(): void {
    // Clean up any existing subscribers.
    this.unregisterObservers();

    const subscriptions: Subscriptions = [
      ...earlyObservers,
      ...visibleStateObservers,
      ...ongoingGameObservers,
      ...replayObservers,
      ...otherObservers,
      ...lateObservers,
    ];

    this.unsubscribe = observeStore(gameStateSource, subscriptions);
  }

  unregisterObservers(): void {
    if (this.unsubscribe !== undefined) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
}

// ----------------------
// Subscription functions
// ----------------------

/** A shorthand function used to subscribe an observer to the state store. */
function sub<T>(s: Selector<State, T>, l: Listener<T>) {
  return {
    select: s,
    onChange: l,
  };
}

/** A shorthand function used to subscribe an observer to the visible state. */
function subVs<T>(s: Selector<GameState, T>, l: Listener<T>) {
  // We do not want anything to fire if the visible state is undefined
  // (e.g. when the UI is still initializing)
  // eslint-disable-next-line func-style
  const selector = (state: State) =>
    state.visibleState === undefined ? SKIP : s(state.visibleState);
  return sub(selector, l);
}

/**
 * A shorthand function used to subscribe an observer to the state, but only when the visible state
 * has already been initialized.
 */
function subAfterInit<T>(s: Selector<State, T>, l: Listener<T>) {
  // eslint-disable-next-line func-style
  const selector = (state: State) =>
    state.visibleState === undefined ? SKIP : s(state);
  return {
    select: selector,
    onChange: l,
  };
}

// ------------------------------
// List of observer subscriptions
// ------------------------------

/** These observers need to run before other observers. */
const earlyObservers: Subscriptions = [
  // This has to come first because it sets up animateFast correctly.
  subAfterInit((s) => s, animateFastView.onObserversStarted),

  // This has to come first because it tells the UI that we are changing to a shared replay.
  subAfterInit((s) => s.finished, replayView.onFinishedChanged),
];

const visibleStateObservers: Subscriptions = [
  // Game info
  subVs(
    (s) => ({
      turn: s.turn.turnNum,
      endTurn: s.turn.endTurnNum,
    }),
    gameInfoView.onTurnChanged,
  ),
  subVs(
    (s) => s.turn.currentPlayerIndex,
    gameInfoView.onCurrentPlayerIndexChanged,
  ),
  subVs(
    (s) => ({
      score: s.score,
      maxScore: s.stats.maxScore,
    }),
    gameInfoView.onScoreOrMaxScoreChanged,
  ),
  subVs(
    (s) => s.stats.numAttemptedCardsPlayed,
    gameInfoView.onNumAttemptedCardsPlayedChanged,
  ),
  subVs((s) => s.clueTokens, gameInfoView.onClueTokensChanged),
  subVs(
    (s) => ({
      clueTokens: s.clueTokens,
      doubleDiscard: s.stats.doubleDiscardCard,
    }),
    gameInfoView.onClueTokensOrDoubleDiscardChanged,
  ),

  // Stats
  subVs(
    (s) => ({
      pace: s.stats.pace,
      paceRisk: s.stats.paceRisk,
      finalRoundEffectivelyStarted: s.stats.finalRoundEffectivelyStarted,
    }),
    statsView.onPaceOrPaceRiskChanged,
  ),
  subAfterInit(
    (s) => ({
      cardsGotten: s.visibleState!.stats.cardsGotten,
      cardsGottenByNotes: s.visibleState!.stats.cardsGottenByNotes,
      efficiencyModifier: s.notes.efficiencyModifier,
      potentialCluesLost: s.visibleState!.stats.potentialCluesLost,
      maxScore: s.visibleState!.stats.maxScore,
      cluesStillUsableNotRounded:
        s.visibleState!.stats.cluesStillUsableNotRounded,
      finalRoundEffectivelyStarted:
        s.visibleState!.stats.finalRoundEffectivelyStarted,
    }),
    statsView.onEfficiencyChanged,
  ),
  sub(
    (s) => {
      if (s.visibleState !== undefined) {
        return {
          pace: s.visibleState.stats.pace,
          cluesStillUsable: s.visibleState.stats.cluesStillUsable,
          score: s.visibleState.score,
          maxScore: s.visibleState.stats.maxScore,
          turnNum: s.visibleState.turn.turnNum,
          endTurnNum: s.visibleState.turn.endTurnNum,
          numPlayers: s.metadata.options.numPlayers,
        };
      }
      return SKIP;
    },

    statsView.onMaxTurnsChanged,
  ),

  // Logs
  subVs((s) => s.log, logView.onLogChanged),

  // Cards. Each card will subscribe to changes to its own data. Must come before card layout, since
  // cards are constructed here.
  subVs((s) => s.deck.length, cardsView.onCardsPossiblyAdded),

  // Card layout - the order of the following subscriptions matters. Hands have to come first to
  // perform the adds/removes for the purposes of displaying animations.
  subVs((s) => s.hands, cardLayoutView.onHandsChanged),
  subVs((s) => s.discardStacks, cardLayoutView.onDiscardStacksChanged),
  subVs((s) => s.hole, cardLayoutView.onHoleChanged),
  // Play stacks come last so we can show the bases if they get empty.
  subVs((s) => s.playStacks, cardLayoutView.onPlayStacksChanged),
  // This must come after the play stacks, so that the completing card is already moving.
  subVs(
    (s) => ({
      playStacks: s.playStacks,
      clueTokens: s.clueTokens,
      score: s.score,
    }),
    cardLayoutView.onStackCompletionDataChanged,
  ),
  // This must come after the discard stacks, so that a misplayed card is already moving.
  subVs(
    (s) => ({ maxScore: s.stats.maxScore, discardStacks: s.discardStacks }),
    cardLayoutView.onMaxScoreOrDiscardStacksChanged,
  ),
  subVs(
    (s) => s.playStackDirections,
    cardLayoutView.onPlayStackDirectionsChanged,
  ),

  // Unsubscribe and reset removed cards. Must come after card layout so animations to deck are
  // correctly triggered.
  subVs((s) => s.deck.length, cardsView.onCardsPossiblyRemoved),

  // Clue arrows
  subVs(
    (s) => ({
      clues: s.clues,
      segment: s.turn.segment,
    }),
    cluesView.onLastClueOrSegmentChanged,
  ),

  // Deck
  subVs((s) => s.cardsRemainingInTheDeck, deckView.onCardsRemainingChanged),
  subVs((s) => s.deck, deckView.onDeckChanged),
];

const ongoingGameObservers: Subscriptions = [
  // Clue area
  subAfterInit(
    (s) => turnView.shouldShowTurnUi(s),
    turnView.shouldShowTurnUiChanged,
  ),

  // "No Clues" indicator and fade.
  subAfterInit(
    (s) => turnView.shouldIndicateNoClues(s),
    turnView.shouldIndicateNoCluesChanged,
  ),

  // Bottom-Deck Blind-Play UI
  subAfterInit(
    (s) => turnView.shouldEnableBottomDeckBlindPlay(s),
    turnView.shouldEnableBottomDeckBlindPlayChanged,
  ),

  // Alternating Clues UI. The last clue's type is undefined before the first clue and for a hidden
  // clue.
  subAfterInit(
    (s) => s.visibleState!.clues.at(-1)?.type,
    turnView.onLastClueTypeChanged,
  ),

  // Segment + current player index.
  subAfterInit(
    (s) => ({
      segment: s.ongoingGame.turn.segment,
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
    }),
    turnView.onOngoingTurnChanged,
  ),

  // "Your Turn" indicator
  subAfterInit(
    (s) => turnView.shouldShowYourTurnIndicator(s),
    turnView.shouldShowYourTurnIndicatorChanged,
  ),

  // The "Current Player" area should only be shown under certain conditions.
  subAfterInit(
    (s) => ({
      visible: currentPlayerAreaView.isVisible(s),
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
    }),
    currentPlayerAreaView.onChanged,
  ),

  // Strikes
  subAfterInit(
    (s) => ({
      ongoingStrikes: s.ongoingGame.strikes,
      visibleStrikes: s.visibleState!.strikes,
    }),
    gameInfoView.onOngoingOrVisibleStrikesChanged,
  ),
];

const replayObservers: Subscriptions = [
  // Database ID
  subAfterInit(
    (s) => replayView.getGameIdLabel(s) ?? SKIP,
    replayView.onGameIdLabelChanged,
  ),

  // Shared replay
  subAfterInit(
    (s) => s.replay.shared !== undefined,
    replayView.onSharedReplayEnter,
  ),
  subAfterInit(
    (s) => s.replay.shared?.leader ?? SKIP,
    replayView.onSharedLeaderChanged,
  ),
  subAfterInit(
    (s) => s.replay.shared?.amLeader ?? SKIP,
    replayView.onSharedAmLeaderChanged,
  ),
  subAfterInit(
    (s) =>
      s.replay.shared === undefined
        ? undefined
        : {
            leader: s.replay.shared.leader,
            amLeader: s.replay.shared.amLeader,
            canPlayAgain: s.replay.shared.canPlayAgain,
            restartDeclined: s.replay.shared.restartDeclined,
          },
    replayView.onRestartChanged,
  ),
  subAfterInit(
    (s) => ({
      leader: s.replay.shared?.leader,
      spectators: s.spectators,
    }),
    replayView.onLeaderOrSpectatorsChanged,
  ),

  // Hypothetical
  subAfterInit(
    (s) => hypotheticalView.shouldShowReplayArea(s),
    hypotheticalView.shouldShowReplayAreaChanged,
  ),
  subAfterInit(
    (s) => hypotheticalView.shouldEnableEnterHypoButton(s),
    hypotheticalView.shouldEnableEnterHypoButtonChanged,
  ),
  subAfterInit(
    (s) => hypotheticalView.shouldShowHypoControls(s),
    hypotheticalView.shouldShowHypoControlsChanged,
  ),
  subAfterInit(
    (s) => hypotheticalView.shouldShowToggleDrawnCards(s),
    hypotheticalView.shouldShowToggleDrawnCardsChanged,
  ),
  subAfterInit(
    (s) => ({
      hypotheticalActive: s.replay.hypothetical !== undefined,
      replayActive:
        s.replay.shared !== undefined || s.replay.segment !== undefined,
    }),
    hypotheticalView.onActiveChanged,
  ),
  subAfterInit(
    (s) => ({
      active: s.replay.hypothetical !== undefined,
      // We control our own hypothetical like a leader.
      amLeader:
        s.replay.shared === undefined
        || s.replay.shared.amLeader
        || s.replay.ownHypothetical !== undefined,
      sharedReplay: s.replay.shared !== undefined,
      canPlayAgain: s.replay.shared?.canPlayAgain === true,
    }),
    hypotheticalView.onActiveOrAmLeaderChanged,
  ),
  subAfterInit(
    (s) => s.replay.hypothetical?.states.length ?? SKIP,
    hypotheticalView.onStatesLengthChanged,
  ),
  subAfterInit(
    (s) => hypotheticalView.shouldShowHypoBackButton(s),
    hypotheticalView.shouldShowHypoBackButtonChanged,
  ),
  subAfterInit(
    (s) => canPassTurnInHypothetical(s),
    hypotheticalView.shouldEnableHypoPassTurnButtonChanged,
  ),
  subAfterInit(
    (s) => s.replay.hypothetical?.showDrawnCards ?? SKIP,
    hypotheticalView.onDrawnCardsInHypotheticalChanged,
  ),

  // Replay entered or exited. Note that this needs to go after `onActiveOrAmLeaderChanged` so that
  // the clue area is shown at game start.
  subAfterInit(
    (s) => s.replay.segment !== undefined,
    replayView.onActiveChanged,
  ),

  // Replay sliders and buttons.
  subAfterInit(
    (s) => ({
      active: s.replay.segment !== undefined,
      replaySegment: s.replay.segment,
      ongoingGameSegment: s.ongoingGame.turn.segment,
    }),
    replayView.onSegmentChanged,
  ),
  subAfterInit(
    (s) => ({
      active: s.replay.segment !== undefined,
      sharedSegment: s.replay.shared?.segment,
      useSharedSegments: s.replay.shared?.useSharedSegments,
      amLeader: s.replay.shared?.amLeader,
    }),
    replayView.onSharedSegmentChanged,
  ),
  subAfterInit(
    (s) =>
      s.replay.shared !== undefined
      && s.replay.shared.hypothetical !== undefined,
    replayView.onSharedHypotheticalChanged,
  ),

  // Replay button
  subAfterInit(
    (s) => s.replay.hypothetical === undefined && !globals.state.finished,
    replayView.onShouldShowReplayButtonChanged,
  ),

  // "Enter Hypothetical" button
  subAfterInit(
    (s) => ({ finished: s.finished, shared: s.replay.shared !== undefined }),
    replayView.enterHypoButtonLocationChanged,
  ),

  // Card and stack base morphing.
  subAfterInit(
    (s) => ({
      hypotheticalActive: s.replay.hypothetical !== undefined,
      morphedIdentities: s.replay.hypothetical?.morphedIdentities,
    }),
    cardsView.onMorphedIdentitiesChanged,
  ),

  // Remove notes morph from play stacks after game finishes.
  subAfterInit(
    (s) => ({
      finished: s.finished,
    }),
    cardLayoutView.updatePlayStackVisuals,
  ),
];

const otherObservers = [
  // Premoves (e.g. queued actions)
  subAfterInit(
    (s) => premoveView.shouldShowCancelButton(s),
    premoveView.shouldShowCancelButtonChanged,
  ),
  subAfterInit((s) => s.premove, premoveView.onChanged),

  // Card dragging
  subAfterInit(
    (s) => draggableView.draggablePlayerIndex(s),
    draggableView.onDraggablePlayerIndexChanged,
  ),

  // Pause
  subAfterInit((s) => s.pause, pauseView.onChanged),

  // Spectators
  subAfterInit(
    (s) => ({
      spectators: s.spectators,
      finished: s.finished,
    }),
    spectatorsView.onSpectatorsChanged,
  ),
];

// These observers need to run after all other observers.
const lateObservers = [
  // Reset animations back to the default.
  subAfterInit((s) => s, animateFastView.onObserversFinished),

  // Initialization finished. (This will get called when the visible state becomes valid and after
  // all other view updates.)
  sub((s) => s.visibleState !== undefined, initView.onInitializationChanged),
];
