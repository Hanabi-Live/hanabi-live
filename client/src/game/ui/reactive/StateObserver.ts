import { Unsubscribe, Store } from 'redux';
import { Action } from '../../types/actions';
import State from '../../types/State';
import observeStore, { Selector, Listener } from './observeStore';
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

    const subscriptions: Array<{
      select: Selector<State, any>,
      onChange:Listener<any>,
    }> = [
      // Game info
      {
        select: (s) => s.visibleState.clueTokens,
        onChange: gameInfoView.onClueTokensChanged,
      },
      {
        select: (s) => ({
          score: s.visibleState.score,
          maxScore: s.visibleState.stats.maxScore,
        }),
        onChange: gameInfoView.onScoreOrMaxScoreChanged,
      },

      // Stats
      {
        select: (s) => s.visibleState.stats.efficiency,
        onChange: statsView.onEfficiencyChanged,
      },
      {
        select: (s) => s.visibleState.stats.pace,
        onChange: statsView.onPaceChanged,
      },
      {
        select: (s) => s.visibleState.stats.paceRisk,
        onChange: statsView.onPaceRiskChanged,
      },
    ];

    this.unsubscribe = observeStore(store, subscriptions);
  }

  unregisterObservers() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
