import { LABEL_COLOR, STRIKE_FADE } from '../../../../constants';
import { variantRules } from '../../../rules';
import { MAX_STRIKES, MAX_CLUE_NUM } from '../../../types/constants';
import { StateStrike } from '../../../types/GameState';
import globals from '../../globals';
import { animate } from '../../konvaHelpers';

export const onTurnChanged = (data: {
  turn: number;
  endTurn: number | null;
}) => {
  // Update the "Turn" label
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

  globals.layers.UI.batchDraw();
};

export const onCurrentPlayerIndexChanged = (currentPlayerIndex: number | null) => {
  // Bold the name frame of the current player to signify that it is their turn
  for (let i = 0; i < globals.elements.nameFrames.length; i++) {
    globals.elements.nameFrames[i].setActive(currentPlayerIndex === i);
  }

  // Additionally, show a black rectangle over a player's hand to signify that it is their turn
  if (currentPlayerIndex !== null) {
    for (const rect of globals.elements.playerHandTurnRects) {
      rect.hide();
    }
    globals.elements.playerHandTurnRects[currentPlayerIndex].show();
  }

  // For replay leaders, we want to disable entering a hypothetical if we are currently on a turn
  // where the game has already ended
  if (globals.metadata.sharedReplay && globals.amSharedReplayLeader) {
    globals.elements.enterHypoButton!.setEnabled(currentPlayerIndex !== null);
  }

  globals.layers.UI.batchDraw();
};

export const onScoreOrMaxScoreChanged = (data: {
  score: number;
  maxScore: number;
}) => {
  const scoreLabel = globals.elements.scoreNumberLabel!;
  scoreLabel.text(data.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel!;
  maxScoreLabel.text(` / ${data.maxScore}`);
  maxScoreLabel.width(maxScoreLabel.measureSize(maxScoreLabel.text()).width);
  const x = scoreLabel.x() + scoreLabel.measureSize(scoreLabel.text()).width as number;
  maxScoreLabel.x(x);

  globals.layers.UI.batchDraw();
};

export const onNumAttemptedCardsPlayedChanged = (numAttemptedCardsPlayed: number) => {
  if (!variantRules.isThrowItInAHole(globals.variant) || globals.metadata.replay) {
    return;
  }

  globals.elements.playsNumberLabel!.text(numAttemptedCardsPlayed.toString());
  globals.layers.UI.batchDraw();
};

export const onClueTokensChanged = (clueTokens: number) => {
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

  globals.layers.UI.batchDraw();
};

export const onClueTokensOrDoubleDiscardChanged = (data: {
  clueTokens: number;
  doubleDiscard: boolean;
}) => {
  if (globals.lobby.settings.realLifeMode) {
    return;
  }

  if (data.clueTokens === MAX_CLUE_NUM) {
    // Show the red border around the discard pile
    // (to reinforce that the current player cannot discard)
    globals.elements.noDiscardBorder!.show();
    globals.elements.noDoubleDiscardBorder!.hide();
  } else if (data.doubleDiscard && globals.lobby.settings.hyphenatedConventions) {
    // Show a yellow border around the discard pile
    // (to reinforce that this is a "Double Discard" situation)
    globals.elements.noDiscardBorder!.hide();
    globals.elements.noDoubleDiscardBorder!.show();
  } else {
    globals.elements.noDiscardBorder!.hide();
    globals.elements.noDoubleDiscardBorder!.hide();
  }

  globals.layers.UI.batchDraw();
};

export const onStrikesChanged = (
  strikes: readonly StateStrike[],
  previousStrikes: readonly StateStrike[] | undefined,
) => {
  // Strikes are hidden from the end-user in "Throw It in a Hole" variants
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.metadata.replay) {
    return;
  }

  // If there is no previous state, we are viewing the visible state for the first time
  // If a strike happened in the future, we want to show a faded X on the UI
  // The user will be able to click on the X in order to jump directly to the turn where the
  // strike happened
  if (previousStrikes === undefined) {
    for (let i = 0; i < globals.store!.getState().ongoingGame.strikes.length; i++) {
      const strikeX = globals.elements.strikeXs[i];
      if (strikeX === undefined) {
        continue;
      }
      strikeX.opacity(STRIKE_FADE);
    }

    return;
  }

  for (let i = 0; i < MAX_STRIKES; i++) {
    // Check to see if this strike has changed
    if (typeof strikes[i] === typeof previousStrikes[i]) {
      continue;
    }

    const strikeX = globals.elements.strikeXs[i];
    if (strikeX === undefined) {
      continue;
    }
    const strikeSquare = globals.elements.strikeSquares[i];
    if (strikeSquare === undefined) {
      continue;
    }

    if (strikes[i] === undefined) {
      // We are going backwards in a replay and this strike should now be faded
      if (strikeX.tween !== null) {
        strikeX.tween.destroy();
        strikeX.tween = null;
      }
      strikeX.opacity(STRIKE_FADE);
      continue;
    }

    // Animate the strike square fading in
    animate(strikeX, {
      duration: 1,
      opacity: 1,
    }, true);
  }

  globals.layers.UI.batchDraw();
};
