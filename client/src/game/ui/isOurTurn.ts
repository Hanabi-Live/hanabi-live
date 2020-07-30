import globals from './globals';

export default function isOurTurn() {
  const state = globals.store!.getState();
  return (
    state.ongoingGame.turn.currentPlayerIndex === state.metadata.ourPlayerIndex
    && state.metadata.playing
  );
}
