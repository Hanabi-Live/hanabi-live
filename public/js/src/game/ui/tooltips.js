// Imports
const globals = require('./globals');

exports.show = (element, name) => {
    // Don't do anything if the user has moved the mouse away in the meantime
    if (globals.activeHover !== element) {
        return;
    }

    const tooltip = $(`#tooltip-${name}`);
    const tooltipX = element.getWidth() / 2 + element.attrs.x;
    tooltip.css('left', tooltipX);
    tooltip.css('top', element.attrs.y);
    tooltip.tooltipster('open');
};
