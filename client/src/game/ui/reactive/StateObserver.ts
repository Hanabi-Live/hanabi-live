import { Unsubscribe, Store } from 'redux';
import { Action } from '../../types/actions';
import GameState from '../../types/GameState';
import State from '../../types/State';
import observeStore, { Selector, Listener, Subscription } from './observeStore';
import * as cardLayoutView from './view/cardLayoutView';
import * as cardsView from './view/cardsView';
import * as cluesView from './view/cluesView';
import * as currentPlayerAreaView from './view/currentPlayerAreaView';
import * as gameInfoView from './view/gameInfoView';
import * as initView from './view/initView';
import * as logView from './view/logView';
import * as premoveView from './view/premoveView';
import * as replayView from './view/replayView';
import * as statsView from './view/statsView';

export default class StateObserver {
  private unsubscribe: Unsubscribe | null = null;

  constructor(store: Store<State, Action>) {
    this.registerObservers(store);
  }

  // Observe the store, calling different functions when a particular path changes
  registerObservers(store: Store<State, Action>) {
    // Clean up any existing subscribers
    this.unregisterObservers();

    const subscriptions: Array<Subscription<State, any>> = [];

    // Shorthand function for a nicer syntax and type checking when registering subscriptions
    function sub<T>(s: Selector<State, T>, l: Listener<T>) {
      subscriptions.push({ select: s, onChange: l });
    }

    // Same as sub, but even shorter for selectors on visibleState (most common)
    function vs<T>(s: Selector<GameState, T>, l: Listener<T>) {
      sub((state) => s(state.visibleState!), l);
    }

    // Game info
    vs((s) => ({
      turn: s.turn.turnNum,
      endTurn: s.turn.endTurnNum,
    }), gameInfoView.onTurnChanged);
    vs((s) => s.turn.currentPlayerIndex, gameInfoView.onCurrentPlayerIndexChanged);
    vs((s) => ({
      score: s.score,
      maxScore: s.maxScore,
    }), gameInfoView.onScoreOrMaxScoreChanged);
    vs((s) => s.numAttemptedCardsPlayed, gameInfoView.onNumAttemptedCardsPlayedChanged);
    vs((s) => s.clueTokens, gameInfoView.onClueTokensChanged);

    // Stats
    vs((s) => s.stats.efficiency, statsView.onEfficiencyChanged);
    vs((s) => ({
      pace: s.stats.pace,
      paceRisk: s.stats.paceRisk,
    }), statsView.onPaceOrPaceRiskChanged);

    // Logs
    vs((s) => s.log, logView.onLogChanged);

    // Card layout - the order of the following subscriptions matters
    // Hands have to come first to perform the add-removes so we get nice animations
    vs((s) => s.hands, cardLayoutView.onHandsChanged);
    vs((s) => s.discardStacks, cardLayoutView.onDiscardStacksChanged);
    // Play stacks come last so we can show the bases if they get empty
    vs((s) => s.playStacks, cardLayoutView.onPlayStacksChanged);
    vs((s) => s.playStacksDirections, cardLayoutView.onStackDirectionsChanged);

    // Clues (arrows + log)
    vs((s) => ({
      clues: s.clues,
      turn: s.turn.turnNum,
    }), cluesView.onCluesChanged);

    // Cards
    // Each card will subscribe to changes to its own data
    vs((s) => s.deck.length, cardsView.onDeckChanged);

    // The "Current Player" area should only be shown under certain conditions
    sub((s) => ({
      visible: currentPlayerAreaView.isVisible(s),
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
    }), currentPlayerAreaView.onChanged);

    // Replay
    sub((s) => s.replay.active, replayView.onActiveChanged);

    // Premoves (e.g. queued actions)
    sub((s) => s.premove.action, premoveView.onChanged);

    // Initialization finished
    // (this will get called when the visible state becomes valid and after all other view updates)
    sub((s) => !!s.visibleState, initView.onInitializationChanged);

    this.unsubscribe = observeStore(store, subscriptions);
  }

  unregisterObservers() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
