import { LABEL_COLOR } from '../../../../constants';
import { variantRules } from '../../../rules';
import globals from '../../globals';

export function onTurnChanged(data: {
  turn: number;
  endTurn: number | null;
}) {
  // On both the client and the server, the first turn of the game is represented as turn 0
  // However, turn 0 is represented to the end-user as turn 1, so we must add one
  globals.elements.turnNumberLabel!.text(`${data.turn + 1}`);

  // If there are no cards left in the deck, update the "Turns left: #" label on the deck
  if (data.endTurn !== null) {
    let numTurnsLeft = data.endTurn - data.turn;

    // Also account for the fact that in non-replays,
    // an extra turn is sent to show the times separately from the final action
    if (numTurnsLeft < 0) {
      numTurnsLeft = 0;
    }

    globals.elements.deckTurnsRemainingLabel2!.text(`left: ${numTurnsLeft}`);
  }
}

export function onCurrentPlayerIndexChanged(currentPlayerIndex: number | null) {
  // Bold the name frame of the current player to indicate that it is their turn
  for (let i = 0; i < globals.elements.nameFrames.length; i++) {
    globals.elements.nameFrames[i].setActive(currentPlayerIndex === i);
  }

  // Show the black rectangle over a player's hand that signifies that it is their turn
  if (currentPlayerIndex !== null) {
    for (const rect of globals.elements.playerHandTurnRects) {
      rect.hide();
    }
    globals.elements.playerHandTurnRects[currentPlayerIndex].show();
  }

  // For replay leaders, we want to disable entering a hypothetical if we are currently on a turn
  // where the game has already ended
  if (globals.sharedReplay && globals.amSharedReplayLeader) {
    globals.elements.enterHypoButton!.setEnabled(currentPlayerIndex !== null);
  }
}

export function onScoreOrMaxScoreChanged(data: {
  score: number;
  maxScore: number;
}) {
  const scoreLabel = globals.elements.scoreNumberLabel!;
  scoreLabel.text(data.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel!;
  maxScoreLabel.text(` / ${data.maxScore}`);
  maxScoreLabel.width(maxScoreLabel.measureSize(maxScoreLabel.text()).width);
  const x = scoreLabel.x() + scoreLabel.measureSize(scoreLabel.text()).width as number;
  maxScoreLabel.x(x);
}

export function onNumAttemptedCardsPlayedChanged(numAttemptedCardsPlayed: number) {
  if (variantRules.isThrowItInAHole(globals.variant)) {
    globals.elements.playsNumberLabel!.text(numAttemptedCardsPlayed.toString());
  }
}

export function onClueTokensChanged(clueTokens: number) {
  globals.elements.cluesNumberLabel!.text(clueTokens.toString());

  if (!globals.lobby.settings.realLifeMode) {
    if (clueTokens === 0) {
      globals.elements.cluesNumberLabel!.fill('red');
    } else if (clueTokens === 1) {
      globals.elements.cluesNumberLabel!.fill('yellow');
    } else {
      globals.elements.cluesNumberLabel!.fill(LABEL_COLOR);
    }
    globals.elements.noClueBorder!.visible(clueTokens === 0);
  }
}
