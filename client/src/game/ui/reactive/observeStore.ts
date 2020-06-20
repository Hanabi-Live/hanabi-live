import { Store, Action } from 'redux';

export type Selector<T, U> = (s: T) => U;
export type Listener<U> = (prop: U) => void;

// Observes a property of type T on a Store<S, A> and calls a listener
// funvtion when it changes
export default function observeStore<S, A extends Action<any>, T>(
  store: Store<S, A>,
  listeners: Array<{ select: Selector<S, T>, onChange: Listener<T> }>,
) {
  let currentState: S;

  function handleChange() {
    const nextState = store.getState();

    // If the path changed, call the function
    listeners
      .filter((l) => currentState === undefined || l.select(nextState) !== l.select(currentState))
      .forEach((l) => l.onChange(l.select(nextState)));

    currentState = nextState;
  }

  const unsubscribe = store.subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
