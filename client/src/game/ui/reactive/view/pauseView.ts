/* eslint-disable import/prefer-default-export */

import PauseState from '../../../types/PauseState';
import globals from '../../globals';
import isOurTurn from '../../isOurTurn';

export const onChanged = (pause: PauseState) => {
  const stageFadeOpacity = pause.active ? 0.8 : 0.3;
  globals.elements.stageFade!.opacity(stageFadeOpacity);
  globals.elements.stageFade!.visible(pause.active);

  globals.elements.pauseArea!.visible(pause.active);

  // The timer elements may not be initialized under certain conditions (e.g. an untimed game)
  globals.elements.timer1?.visible(!pause.active && globals.state.playing);
  globals.elements.timer2?.visible(!pause.active && !isOurTurn());
  globals.elements.timer1Circle?.visible(pause.queued);
  console.log(globals.state.finished, 'ZZZZZZZZZZZZZZZZZZZZZZZZZ');

  if (pause.active) {
    globals.elements.pauseText!.text(`by: ${globals.state.metadata.playerNames[pause.playerIndex]}`);

    if (globals.state.playing) {
      globals.elements.pauseButton!.setEnabled(true);
      globals.elements.pauseButton!.opacity(1);
    } else {
      globals.elements.pauseButton!.setEnabled(false);
      globals.elements.pauseButton!.opacity(0.2);
    }
  }

  globals.layers.UI.batchDraw();
  globals.layers.UI2.batchDraw();
  globals.layers.timer.batchDraw();
};
