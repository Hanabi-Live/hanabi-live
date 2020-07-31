import globals from './globals';

export default function isOurTurn() {
  return (
    globals.state.playing
    && globals.state.ongoingGame.turn.currentPlayerIndex === globals.state.metadata.ourPlayerIndex
  );
}
