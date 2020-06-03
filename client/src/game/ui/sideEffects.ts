/* eslint-disable import/prefer-default-export */
import { MAX_CLUE_NUM, LABEL_COLOR } from '../../constants';
import globals from './globals';
import State from './State';

// Updates the UI to match a given state
export const updateToState = (state: State) => {
  changeClues(state.clueTokens);
  // TODO: more updates
};

// Side effects related to clue count changing
export const changeClues = (clues: number) => {
  globals.clues = clues;
  globals.elements.cluesNumberLabel!.text(clues.toString());

  if (!globals.lobby.settings.realLifeMode) {
    if (clues === 0) {
      globals.elements.cluesNumberLabel!.fill('red');
    } else if (clues === 1) {
      globals.elements.cluesNumberLabel!.fill('yellow');
    } else {
      globals.elements.cluesNumberLabel!.fill(LABEL_COLOR);
    }
    globals.elements.noClueBorder!.visible(globals.clues === 0);

    if (clues === MAX_CLUE_NUM) {
      // Show the red border around the discard pile
      // (to reinforce that the current player cannot discard)
      globals.elements.noDiscardBorder!.show();
    } else {
      globals.elements.noDiscardBorder!.hide();
    }
  }
};
