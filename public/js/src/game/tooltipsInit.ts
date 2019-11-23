/*
    In-game tooltips (for notes, etc.)
*/

// Constants
const maxPlayers = 6;
const maxCardsInADeck = 60;

export default () => {
    const tooltipThemes = [
        'tooltipster-shadow',
        'tooltipster-shadow-big',
    ];
    const tooltipOptions: JQueryTooltipster.ITooltipsterOptions = {
        animation: 'grow',
        contentAsHTML: true,
        delay: 0,
        interactive: true, // So that users can update their notes
        theme: tooltipThemes,
        trigger: 'custom',
        updateAnimation: null,
    };

    // Initialize some basic tooltips
    const tooltips = [
        'chat',
        'deck',
        'discard',
        'efficiency',
        'kill',
        'leader',
        'lobby-big',
        'lobby-small',
        'time-taken',
        'pace',
        'replay',
        'restart',
        'spectators',
        'strikes',
    ];
    for (const tooltip of tooltips) {
        $('#game-tooltips').append(`<div id="tooltip-${tooltip}"></div>`);
        $(`#tooltip-${tooltip}`).tooltipster(tooltipOptions);
    }

    // The "time-taken" tooltip should have centered text
    const newThemes = tooltipThemes.slice();
    newThemes.push('align-center');
    $('#tooltip-time-taken').tooltipster('instance').option('theme', newThemes);

    // Dynamically create the player tooltips
    for (let i = 0; i < maxPlayers; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

        $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
        $(`#tooltip-character-assignment-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
    }

    // Dynamically create the card note tooltips
    for (let i = 0; i < maxCardsInADeck + 6; i++) {
        // The number in the id matches the order of the card in the deck
        // We add 6 because we also need note tooltips for the stack bases
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }
};
