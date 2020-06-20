import { LABEL_COLOR } from '../../../../constants';
import globals from '../../globals';

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

export function onScoreOrMaxScoreChanged(scores: { score: number, maxScore: number }) {
  const scoreLabel = globals.elements.scoreNumberLabel!;
  scoreLabel.text(scores.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel!;
  maxScoreLabel.text(` / ${scores.maxScore}`);
  maxScoreLabel.width(maxScoreLabel.measureSize(maxScoreLabel.text()).width);
  const x = scoreLabel.x() + scoreLabel.measureSize(scoreLabel.text()).width as number;
  maxScoreLabel.x(x);
}
