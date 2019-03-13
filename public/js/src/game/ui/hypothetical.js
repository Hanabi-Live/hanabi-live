/*
    In shared replays, players can enter a hypotheticals where can perform arbitrary actions
    in order to see what will happen
*/

// Imports
const globals = require('./globals');

exports.toggle = () => {
    globals.hypothetical = !globals.hypothetical;
    setAllCardsDraggable();
    if (!globals.hypothetical) {
        globals.hypoLog = [];
    }
};

const setAllCardsDraggable = () => {
    for (const hand of globals.elements.playerHands) {
        for (const layoutChild of hand.children) {
            layoutChild.checkSetDraggable();
        }
    }
};
