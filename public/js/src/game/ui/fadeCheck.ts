/*
    Functions having to do with the "fade" feature
    (e.g. cards that no longer need to be played are faded)
*/

// Imports
import globals from './globals';

// Resets the fade for every card in game
export default () => {
    if (globals.animateFast) {
        return;
    }

    for (let i = 0; i < globals.indexOfLastDrawnCard; i++) {
        const card = globals.deck[i];
        card.setFade();
    }
};
