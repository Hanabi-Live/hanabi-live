// Imports
const globals = require('./globals');

exports.initDelayed = (element, name, content) => {
    element.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            show(this, name);
        }, globals.tooltipDelay);
    });
    element.on('mouseout', () => {
        globals.activeHover = null;
        $(`#tooltip-${name}`).tooltipster('close');
    });
    const fullContent = `<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;${content}</span>`;
    $(`#tooltip-${name}`).tooltipster('instance').content(fullContent);
};

const show = (element, name) => {
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
exports.show = show;
