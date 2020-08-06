import { variantRules } from '../../../rules';
import { MAX_CLUE_NUM, MAX_STRIKES } from '../../../types/constants';
import { StateStrike } from '../../../types/GameState';
import { LABEL_COLOR, OFF_BLACK, STRIKE_FADE } from '../../constants';
import globals from '../../globals';
import { animate } from '../../konvaHelpers';
import * as turn from '../../turn';

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

  if (currentPlayerIndex === null) {
    // The game has ended
    // Ensure that the clue UI is not showing
    turn.hideClueUIAndDisableDragging();
  } else if (globals.lobby.settings.keldonMode) {
    // In addition to bolding the player's name,
    // change the color of their black line to signify that it is their turn
    for (const rect of globals.elements.playerHandBlackLines) {
      rect.fill(OFF_BLACK);
    }
    const currentPlayerRect = globals.elements.playerHandBlackLines[currentPlayerIndex];
    if (currentPlayerRect !== undefined) {
      currentPlayerRect.fill('yellow');
    }
  } else {
    // In addition to bolding the player's name,
    // show a black rectangle around the player's hand to signify that it is their turn
    for (const rect of globals.elements.playerHandTurnRects) {
      rect.hide();
    }
    const currentPlayerRect = globals.elements.playerHandTurnRects[currentPlayerIndex];
    if (currentPlayerRect !== undefined) {
      currentPlayerRect.show();
    }
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
  if (!variantRules.isThrowItInAHole(globals.variant) || globals.state.finished) {
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

export const onOngoingOrVisibleStrikesChanged = (data: {
  ongoingStrikes: readonly StateStrike[];
  visibleStrikes: readonly StateStrike[];
}) => {
  // Strikes are hidden from the end-user in "Throw It in a Hole" variants
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.state.finished) {
    return;
  }

  for (let i = 0; i < MAX_STRIKES; i++) {
    const strikeX = globals.elements.strikeXs[i];
    if (strikeX === undefined) {
      continue;
    }
    const strikeSquare = globals.elements.strikeSquares[i];
    if (strikeSquare === undefined) {
      continue;
    }

    const duration = 1; // The duration for the strike animation
    if (data.visibleStrikes[i] !== undefined) {
      // There is a strike on the visible state
      // Animate the strike X fading in
      animate(strikeX, {
        duration,
        opacity: 1,
      }, true);
    } else {
      // Either this strike has never happened, or we are moving backwards in a replay
      // If this strike never happened, it should be invisible
      // If this strike happened in the future, then it should be slightly faded
      if (strikeX.tween !== null) {
        strikeX.tween.destroy();
        strikeX.tween = null;
      }
      const opacity = data.ongoingStrikes[i] === undefined ? 0 : STRIKE_FADE;
      animate(strikeX, {
        duration,
        opacity,
      }, true);
    }
  }

  globals.layers.UI.batchDraw();
};
