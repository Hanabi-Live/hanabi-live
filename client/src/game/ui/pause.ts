// Miscellaneous helper functions that apply to the entire UI generally

import globals from './globals';
import { drawLayer } from './konvaHelpers';

export default function pause() {
  if (!globals.metadata.options.timed || globals.metadata.replay) {
    return;
  }

  if (globals.paused) {
    // If we queued a pause, unqueue it
    globals.pauseQueued = false;
    const wasVisible = globals.elements.timer1Circle!.visible();
    if (wasVisible !== globals.pauseQueued) {
      globals.elements.timer1Circle!.visible(globals.pauseQueued);
      globals.layers.UI.batchDraw();
    }

    globals.elements.stageFade!.opacity(0.8);
    globals.elements.stageFade!.show();
    drawLayer(globals.elements.stageFade!);

    globals.elements.timer1!.hide();
    globals.elements.timer2!.hide();
    drawLayer(globals.elements.timer1!);

    globals.elements.pauseArea!.show();
    globals.elements.pauseText!.text(`by: ${globals.pausePlayer}`);
    if (globals.metadata.spectating) {
      globals.elements.pauseButton!.setEnabled(false);
      globals.elements.pauseButton!.opacity(0.2);
    } else {
      globals.elements.pauseButton!.setEnabled(true);
      globals.elements.pauseButton!.opacity(1);
    }
    drawLayer(globals.elements.pauseArea!);
  } else {
    globals.elements.stageFade!.opacity(0.3);
    globals.elements.stageFade!.hide();
    drawLayer(globals.elements.stageFade!);

    globals.elements.timer1!.visible(!globals.metadata.spectating);
    globals.elements.timer2!.show();
    drawLayer(globals.elements.timer1!);

    globals.elements.pauseArea!.hide();
    drawLayer(globals.elements.pauseArea!);
  }
}
