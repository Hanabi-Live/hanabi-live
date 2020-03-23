/*
    Miscellaneous helper functions that apply to the entire UI generally
*/

// Imports
import globals from './globals';

export default () => {
    if (!globals.timed || globals.replay) {
        return;
    }

    if (globals.paused) {
        // If we queued a pause, unqueue it
        globals.pauseQueued = false;
        const wasVisible = globals.elements.timer1Circle!.visible();
        if (wasVisible !== globals.pauseQueued) {
            globals.elements.timer1Circle!.visible(globals.pauseQueued);
            globals.layers.get('UI')!.batchDraw();
        }

        globals.elements.stageFade!.opacity(0.8);
        globals.elements.stageFade!.show();
        globals.elements.stageFade!.getLayer().batchDraw();

        globals.elements.timer1!.hide();
        globals.elements.timer2!.hide();
        globals.elements.timer1!.getLayer().batchDraw();

        globals.elements.pauseArea!.show();
        globals.elements.pauseText!.text(`by: ${globals.pausePlayer}`);
        if (globals.spectating) {
            globals.elements.pauseButton!.setEnabled(false);
            globals.elements.pauseButton!.opacity(0.2);
        } else {
            globals.elements.pauseButton!.setEnabled(true);
            globals.elements.pauseButton!.opacity(1);
        }
        globals.elements.pauseArea!.getLayer().batchDraw();
    } else {
        globals.elements.stageFade!.opacity(0.3);
        globals.elements.stageFade!.hide();
        globals.elements.stageFade!.getLayer().batchDraw();

        globals.elements.timer1!.visible(!globals.spectating);
        globals.elements.timer2!.show();
        globals.elements.timer1!.getLayer().batchDraw();

        globals.elements.pauseArea!.hide();
        globals.elements.pauseArea!.getLayer().batchDraw();
    }
};
