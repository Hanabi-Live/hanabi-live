// Imports
const globals = require('./globals');

exports.show = (element, name) => {
    // Don't do anything if we are no longer in the game
    if (globals.lobby.currentScreen !== 'game') {
        return;
    }

    // Don't do anything if the user has moved the mouse away in the meantime
    if (globals.activeHover !== element) {
        return;
    }

    const tooltip = $(`#tooltip-${name}`);
    const pos = element.getAbsolutePosition();
    const tooltipX = element.getWidth() / 2 + pos.x;
    tooltip.css('left', tooltipX);
    tooltip.css('top', pos.y);
    tooltip.tooltipster('open');
};
