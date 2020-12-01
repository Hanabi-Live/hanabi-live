import { Store, Unsubscribe } from "redux";
import { Action } from "../../types/actions";
import GameState from "../../types/GameState";
import State from "../../types/State";
import globals from "../globals";
import observeStore, { Listener, Selector, Subscription } from "./observeStore";
import * as animateFastView from "./view/animateFastView";
import * as cardLayoutView from "./view/cardLayoutView";
import * as cardsView from "./view/cardsView";
import * as cluesView from "./view/cluesView";
import * as currentPlayerAreaView from "./view/currentPlayerAreaView";
import * as deckView from "./view/deckView";
import * as gameInfoView from "./view/gameInfoView";
import * as hypotheticalView from "./view/hypotheticalView";
import * as initView from "./view/initView";
import * as logView from "./view/logView";
import * as pauseView from "./view/pauseView";
import * as premoveView from "./view/premoveView";
import * as replayView from "./view/replayView";
import * as soundView from "./view/soundView";
import * as spectatorsView from "./view/spectatorsView";
import * as statsView from "./view/statsView";
import * as turnView from "./view/turn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Subscriptions = Array<Subscription<State, any>>;

export default class StateObserver {
  private unsubscribe: Unsubscribe | null = null;

  constructor(store: Store<State, Action>) {
    this.registerObservers(store);
  }

  // Observe the store, calling different functions when a particular path changes
  registerObservers(store: Store<State, Action>): void {
    // Clean up any existing subscribers
    this.unregisterObservers();

    const subscriptions: Subscriptions = earlyObservers
      .concat(visibleStateObservers)
      .concat(ongoingGameObservers)
      .concat(replayObservers)
      .concat(otherObservers)
      .concat(lateObservers);

    this.unsubscribe = observeStore(store, subscriptions);
  }

  unregisterObservers(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// ----------------------
// Subscription functions
// ----------------------

// A shorthand function used to subscribe an observer to the state store
function sub<T>(s: Selector<State, T>, l: Listener<T>) {
  return {
    select: s,
    onChange: l,
  };
}

// A shorthand function used to subscribe an observer to the visible state
function subVS<T>(s: Selector<GameState, T>, l: Listener<T>) {
  // We do not want anything to fire if the visible state is null
  // (e.g. when the UI is still initializing)
  const selector = (state: State) =>
    state.visibleState === null ? undefined : s(state.visibleState);
  return sub(selector, l);
}

// A shorthand function used to subscribe an observer to the state,
// but only when the visible state has already been initialized
function subAfterInit<T>(s: Selector<State, T>, l: Listener<T>) {
  const selector = (state: State) =>
    state.visibleState === null ? undefined : s(state);
  return {
    select: selector,
    onChange: l,
  };
}

// ------------------------------
// List of observer subscriptions
// ------------------------------

// These observers need to run before other observers
const earlyObservers: Subscriptions = [
  // This has to come first because it sets up animateFast correctly
  subAfterInit((s) => s, animateFastView.onObserversStarted),

  // This has to come first because it tells the UI that we are changing to a shared replay
  subAfterInit((s) => s.finished, replayView.onFinishedChanged),
];

const visibleStateObservers: Subscriptions = [
  // Game info
  subVS(
    (s) => ({
      turn: s.turn.turnNum,
      endTurn: s.turn.endTurnNum,
    }),
    gameInfoView.onTurnChanged,
  ),
  subVS(
    (s) => s.turn.currentPlayerIndex,
    gameInfoView.onCurrentPlayerIndexChanged,
  ),
  subVS(
    (s) => ({
      score: s.score,
      maxScore: s.stats.maxScore,
    }),
    gameInfoView.onScoreOrMaxScoreChanged,
  ),
  subVS(
    (s) => s.numAttemptedCardsPlayed,
    gameInfoView.onNumAttemptedCardsPlayedChanged,
  ),
  subVS((s) => s.clueTokens, gameInfoView.onClueTokensChanged),
  subVS(
    (s) => ({
      clueTokens: s.clueTokens,
      doubleDiscard: s.stats.doubleDiscard,
    }),
    gameInfoView.onClueTokensOrDoubleDiscardChanged,
  ),

  // Stats
  subVS(
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
      cluesStillUsable: s.visibleState!.stats.cluesStillUsable,
      finalRoundEffectivelyStarted: s.visibleState!.stats.finalRoundEffectivelyStarted,
    }),
    statsView.onEfficiencyChanged,
  ),
  sub(
    (s) => {
      if (s.visibleState !== null) {
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
      return undefined;
    },

    statsView.onMaxTurnsChanged,
  ),

  // Logs
  subVS((s) => s.log, logView.onLogChanged),

  // Cards
  // Each card will subscribe to changes to its own data
  // Must come before card layout, since cards are constructed here
  subVS((s) => s.deck.length, cardsView.onCardsPossiblyAdded),

  // Card layout - the order of the following subscriptions matters
  // Hands have to come first to perform the adds/removes for the purposes of displaying animations
  subVS((s) => s.hands, cardLayoutView.onHandsChanged),
  subVS((s) => s.discardStacks, cardLayoutView.onDiscardStacksChanged),
  subVS((s) => s.hole, cardLayoutView.onHoleChanged),
  // Play stacks come last so we can show the bases if they get empty
  subVS((s) => s.playStacks, cardLayoutView.onPlayStacksChanged),
  subVS(
    (s) => s.playStackDirections,
    cardLayoutView.onPlayStackDirectionsChanged,
  ),

  // Unsubscribe and reset removed cards
  // Must come after card layout so animations to deck are correctly triggered
  subVS((s) => s.deck.length, cardsView.onCardsPossiblyRemoved),

  // Clue log
  subVS((s) => s.clues, cluesView.onCluesChanged),

  // Clue arrows
  subVS(
    (s) => ({ lastClue: s.clues[s.clues.length - 1], segment: s.turn.segment }),
    cluesView.onLastClueOrSegmentChanged,
  ),

  // Deck
  subVS((s) => s.cardsRemainingInTheDeck, deckView.onCardsRemainingChanged),
];

const ongoingGameObservers: Subscriptions = [
  // Segment + current player index
  subAfterInit(
    (s) => ({
      segment: s.ongoingGame.turn.segment,
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
    }),
    turnView.onOngoingTurnChanged,
  ),

  // The "Current Player" area should only be shown under certain conditions
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

  // Sound effects
  subAfterInit(
    (s) => ({
      soundType: s.ongoingGame.stats.soundTypeForLastAction,
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
      turn: s.ongoingGame.turn.turnNum,
      lastAction: s.ongoingGame.stats.lastAction,
    }),
    soundView.onNewSoundEffect,
  ),
];

const replayObservers: Subscriptions = [
  // Database ID
  subAfterInit((s) => s.replay.databaseID, replayView.onDatabaseIDChanged),

  // Shared replay
  subAfterInit((s) => s.replay.shared !== null, replayView.onSharedReplayEnter),
  subAfterInit(
    (s) => s.replay.shared?.leader,
    replayView.onSharedLeaderChanged,
  ),
  subAfterInit(
    (s) => s.replay.shared?.amLeader,
    replayView.onSharedAmLeaderChanged,
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
    (s) => hypotheticalView.shouldEnableEnterHypoButton(s),
    hypotheticalView.shouldEnableEnterHypoButtonChanged,
  ),
  subAfterInit(
    (s) => ({
      hypotheticalActive: s.replay.hypothetical !== null,
      replayActive: s.replay.shared !== null || s.replay.active,
    }),
    hypotheticalView.onActiveChanged,
  ),
  subAfterInit(
    (s) => ({
      active: s.replay.hypothetical !== null,
      amLeader: s.replay.shared === null || s.replay.shared.amLeader,
      sharedReplay: s.replay.shared !== null,
    }),
    hypotheticalView.onActiveOrAmLeaderChanged,
  ),
  subAfterInit(
    (s) => s.replay.hypothetical?.states.length,
    hypotheticalView.onStatesLengthChanged,
  ),
  subAfterInit(
    (s) => hypotheticalView.shouldShowHypoBackButton(s),
    hypotheticalView.shouldShowHypoBackButtonChanged,
  ),
  subAfterInit(
    (s) => s.replay.hypothetical?.showDrawnCards,
    hypotheticalView.onDrawnCardsInHypotheticalChanged,
  ),

  // Replay entered or exited
  // Note that this needs to go after onActiveOrAmLeaderChanged so that the clue area is shown at
  // game start
  subAfterInit((s) => s.replay.active, replayView.onActiveChanged),

  // Replay sliders and buttons
  subAfterInit(
    (s) => ({
      active: s.replay.active,
      replaySegment: s.replay.segment,
      ongoingGameSegment: s.ongoingGame.turn.segment,
    }),
    replayView.onSegmentChanged,
  ),
  subAfterInit(
    (s) => ({
      active: s.replay.active,
      sharedSegment: s.replay.shared?.segment,
      useSharedSegments: s.replay.shared?.useSharedSegments,
    }),
    replayView.onSharedSegmentChanged,
  ),

  // Replay button
  subAfterInit(
    (s) => !s.replay.hypothetical && !globals.state.finished,
    replayView.onShouldShowReplayButtonChanged,
  ),

  // Card and stack base morphing
  subAfterInit(
    (s) => ({
      hypotheticalActive: s.replay.hypothetical !== null,
      morphedIdentities: s.replay.hypothetical?.morphedIdentities,
    }),
    cardsView.onMorphedIdentitiesChanged,
  ),
];

const otherObservers = [
  // Premoves (e.g. queued actions)
  subAfterInit((s) => s.premove, premoveView.onChanged),

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

// These observers need to run after all other observers
const lateObservers = [
  // Reset animations back to the default
  subAfterInit((s) => s, animateFastView.onObserversFinished),

  // Initialization finished
  // (this will get called when the visible state becomes valid and after all other view updates)
  sub((s) => !!s.visibleState, initView.onInitializationChanged),
];
