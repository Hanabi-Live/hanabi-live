import { Unsubscribe, Store } from 'redux';
import { Action } from '../../types/actions';
import State from '../../types/State';
import observeStore, { Selector, Listener, Subscription } from './observeStore';
import * as cardLayoutView from './view/cardLayoutView';
import * as cardsView from './view/cardsView';
import * as gameInfoView from './view/gameInfoView';
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

    // Game info
    sub((s) => s.visibleState.turn, gameInfoView.onTurnChanged);
    sub((s) => s.visibleState.currentPlayerIndex, gameInfoView.onCurrentPlayerIndexChanged);
    sub((s) => ({
      score: s.visibleState.score,
      maxScore: s.visibleState.maxScore,
    }), gameInfoView.onScoreOrMaxScoreChanged);
    sub((s) => s.visibleState.clueTokens, gameInfoView.onClueTokensChanged);

    // Stats
    sub((s) => s.visibleState.stats.efficiency, statsView.onEfficiencyChanged);
    sub((s) => ({
      pace: s.visibleState.stats.pace,
      paceRisk: s.visibleState.stats.paceRisk,
    }), statsView.onPaceOrPaceRiskChanged);

    // Card layout
    sub((s) => s.visibleState.playStacksDirections, cardLayoutView.onStackDirectionsChanged);
    sub((s) => s.visibleState.hands, cardLayoutView.onHandsChanged);
    sub((s) => s.visibleState.discardStacks, cardLayoutView.onDiscardStacksChanged);
    sub((s) => s.visibleState.playStacks, cardLayoutView.onPlayStacksChanged);

    // Cards
    // Each card will subscribe to changes to its own data
    sub((s) => s.visibleState.deck.length, cardsView.onDeckChanged);

    this.unsubscribe = observeStore(store, subscriptions);
  }

  unregisterObservers() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
