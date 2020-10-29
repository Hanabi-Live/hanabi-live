import { clueTokensRules, variantRules } from "../../../rules";
import { MAX_STRIKES } from "../../../types/constants";
import { StateStrike } from "../../../types/GameState";
import { LABEL_COLOR, OFF_BLACK, STRIKE_FADE } from "../../constants";
import globals from "../../globals";
import { animate } from "../../konvaHelpers";
import * as turn from "../../turn";

export const onTurnChanged = (data: {
  turn: number;
  endTurn: number | null;
}): void => {
  // Update the "Turn" label
  // On both the client and the server, the first turn of the game is represented as turn 0
  // However, turn 0 is represented to the end-user as turn 1, so we must add one
  globals.elements.turnNumberLabel?.text(`${data.turn + 1}`);

  // If there are no cards left in the deck, update the "Turns left: #" label on the deck
  if (data.endTurn !== null) {
    let numTurnsLeft = data.endTurn - data.turn;

    // Also account for the fact that in non-replays,
    // an extra turn is sent to show the times separately from the final action
    if (numTurnsLeft < 0) {
      numTurnsLeft = 0;
    }

    globals.elements.deckTurnsRemainingLabel2?.text(`left: ${numTurnsLeft}`);
  }

  globals.layers.UI.batchDraw();
};

export const onCurrentPlayerIndexChanged = (
  currentPlayerIndex: number | null,
): void => {
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
    const currentPlayerRect =
      globals.elements.playerHandBlackLines[currentPlayerIndex];
    if (currentPlayerRect !== undefined) {
      currentPlayerRect.fill("yellow");
    }
  } else {
    // In addition to bolding the player's name,
    // show a black rectangle around the player's hand to signify that it is their turn
    for (const rect of globals.elements.playerHandTurnRects) {
      rect.hide();
    }
    const currentPlayerRect =
      globals.elements.playerHandTurnRects[currentPlayerIndex];
    if (currentPlayerRect !== undefined) {
      currentPlayerRect.show();
    }
  }

  globals.layers.UI.batchDraw();
};

export const onScoreOrMaxScoreChanged = (data: {
  score: number;
  maxScore: number;
}): void => {
  const scoreLabel = globals.elements.scoreNumberLabel;
  if (scoreLabel === null) {
    return;
  }
  scoreLabel.text(data.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel;
  if (maxScoreLabel === null) {
    return;
  }
  maxScoreLabel.text(` / ${data.maxScore}`);
  // The type of Konva.Text.width is "any" for some reason
  const maxScoreLabelWidth = maxScoreLabel.measureSize(maxScoreLabel.text())
    .width as number;
  if (typeof maxScoreLabelWidth !== "number") {
    throw new Error("The width of maxScoreLabel was not a number.");
  }
  maxScoreLabel.width(maxScoreLabelWidth);
  const scoreLabelWidth = scoreLabel.measureSize(scoreLabel.text())
    .width as number;
  if (typeof scoreLabelWidth !== "number") {
    throw new Error("The width of scoreLabel was not a number.");
  }
  const x = scoreLabel.x() + scoreLabelWidth;
  maxScoreLabel.x(x);

  globals.layers.UI.batchDraw();
};

export const onNumAttemptedCardsPlayedChanged = (
  numAttemptedCardsPlayed: number,
): void => {
  if (
    !variantRules.isThrowItInAHole(globals.variant) ||
    globals.state.finished
  ) {
    return;
  }

  globals.elements.playsNumberLabel?.text(numAttemptedCardsPlayed.toString());
  globals.layers.UI.batchDraw();
};

export const onClueTokensChanged = (clueTokens: number): void => {
  let cluesTokensText = clueTokens.toString();
  if (variantRules.isClueStarved(globals.variant)) {
    // In "Clue Starved" variants, clues are tracked internally at twice the value shown to the user
    cluesTokensText = (clueTokens / 2).toString();
  }
  globals.elements.cluesNumberLabel?.text(cluesTokensText);

  if (!globals.lobby.settings.realLifeMode) {
    const noCluesAvailable =
      clueTokens < clueTokensRules.getAdjusted(1, globals.variant);
    const oneClueAvailable =
      clueTokens === clueTokensRules.getAdjusted(1, globals.variant);
    const maxCluesAvailable = clueTokensRules.atMax(
      clueTokens,
      globals.variant,
    );

    let fill;
    if (noCluesAvailable) {
      fill = "red";
    } else if (oneClueAvailable) {
      fill = "yellow";
    } else if (maxCluesAvailable) {
      fill = "lime";
    } else {
      fill = LABEL_COLOR;
    }
    globals.elements.cluesNumberLabel?.fill(fill);

    if (noCluesAvailable) {
      globals.elements.scoreAreaBorder?.stroke("red");
      globals.elements.scoreAreaBorder?.show();
    } else if (maxCluesAvailable) {
      globals.elements.scoreAreaBorder?.stroke("lime");
      globals.elements.scoreAreaBorder?.show();
    } else {
      globals.elements.scoreAreaBorder?.hide();
    }
  }

  globals.layers.UI.batchDraw();
};

export const onClueTokensOrDoubleDiscardChanged = (data: {
  clueTokens: number;
  doubleDiscard: boolean;
}): void => {
  if (globals.lobby.settings.realLifeMode) {
    return;
  }

  if (clueTokensRules.atMax(data.clueTokens, globals.variant)) {
    // Show the red border around the discard pile
    // (to reinforce that the current player cannot discard)
    globals.elements.noDiscardBorder?.show();
    globals.elements.noDoubleDiscardBorder?.hide();
  } else if (
    data.doubleDiscard &&
    globals.lobby.settings.hyphenatedConventions
  ) {
    // Show a yellow border around the discard pile
    // (to reinforce that this is a "Double Discard" situation)
    globals.elements.noDiscardBorder?.hide();
    globals.elements.noDoubleDiscardBorder?.show();
  } else {
    globals.elements.noDiscardBorder?.hide();
    globals.elements.noDoubleDiscardBorder?.hide();
  }

  globals.layers.UI.batchDraw();
};

export const onOngoingOrVisibleStrikesChanged = (data: {
  ongoingStrikes: readonly StateStrike[];
  visibleStrikes: readonly StateStrike[];
}): void => {
  // Strikes are hidden from the players in "Throw It in a Hole" variants
  if (variantRules.isThrowItInAHole(globals.variant) && globals.state.playing) {
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

    const duration = 0.5; // The duration for the strike animation
    if (data.visibleStrikes[i] !== undefined) {
      // There is a strike on the visible state
      // Animate the strike X fading in
      animate(
        strikeX,
        {
          duration,
          opacity: 1,
        },
        true,
      );
    } else {
      // Either this strike has never happened, or we are moving backwards in a replay
      // If this strike never happened, it should be invisible
      // If this strike happened in the future, then it should be slightly faded
      if (strikeX.tween !== null) {
        strikeX.tween.destroy();
        strikeX.tween = null;
      }
      const opacity = data.ongoingStrikes[i] === undefined ? 0 : STRIKE_FADE;
      animate(
        strikeX,
        {
          duration,
          opacity,
        },
        true,
      );
    }
  }

  globals.layers.UI.batchDraw();
};
