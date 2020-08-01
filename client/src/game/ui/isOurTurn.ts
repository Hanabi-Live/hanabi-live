import globals from './globals';

// isOurTurn is used to determine if it is our turn in the present
// (e.g. it can be our turn in the present while we are looking through past actions in an in-game
// replay)
export default function isOurTurn() {
  // First, handle the special case of a hypothetical
  if (globals.state.replay.hypothetical !== null) {
    // It is always the replay leader's turn in a hypothetical
    return globals.state.replay.shared !== null && globals.state.replay.shared.amLeader;
  }

  // Handle the case of an ongoing game
  return (
    globals.state.playing
    && globals.state.ongoingGame.turn.currentPlayerIndex === globals.state.metadata.ourPlayerIndex
  );
}
