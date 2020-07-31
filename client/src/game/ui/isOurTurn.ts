import globals from './globals';

export default function isOurTurn() {
  return (
    globals.state.metadata.playing
    && globals.state.ongoingGame.turn.currentPlayerIndex === globals.state.metadata.ourPlayerIndex
  );
}
