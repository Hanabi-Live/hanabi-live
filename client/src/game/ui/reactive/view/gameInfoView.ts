import { LABEL_COLOR } from '../../../../constants';
import globals from '../../globals';

export function onTurnChanged(turn: number) {
  // On both the client and the server, the first turn of the game is represented as turn 0
  // However, turn 0 is represented to the end-user as turn 1, so we must add one
  globals.elements.turnNumberLabel!.text(`${turn + 1}`);
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

export function onScoreOrMaxScoreChanged(scores: {
  score: number;
  maxScore: number;
}) {
  const scoreLabel = globals.elements.scoreNumberLabel!;
  scoreLabel.text(scores.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel!;
  maxScoreLabel.text(` / ${scores.maxScore}`);
  maxScoreLabel.width(maxScoreLabel.measureSize(maxScoreLabel.text()).width);
  const x = scoreLabel.x() + scoreLabel.measureSize(scoreLabel.text()).width as number;
  maxScoreLabel.x(x);
}
