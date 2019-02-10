/*
    In-game tooltips (for notes, etc.)
*/

// Constants
const maxPlayers = 6;
const maxCardsInADeck = 60;

$(document).ready(() => {
    const tooltipThemes = [
        'tooltipster-shadow',
        'tooltipster-shadow-big',
    ];
    const tooltipOptions = {
        animation: 'grow',
        contentAsHTML: true,
        delay: 0,
        interactive: true, // So that users can update their notes
        theme: tooltipThemes,
        trigger: 'custom',
        updateAnimation: null,
    };

    // Some tooltips are defined in "main.tmpl"
    $('#tooltip-deck').tooltipster(tooltipOptions);
    $('#tooltip-spectators').tooltipster(tooltipOptions);
    $('#tooltip-leader').tooltipster(tooltipOptions);

    // Dynamically create the player tooltips
    for (let i = 0; i < maxPlayers; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        const newThemes = tooltipThemes.slice();
        newThemes.push('align-center');
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

        $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
        $(`#tooltip-character-assignment-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
    }

    // Dynamically create the card note tooltips
    for (let i = 0; i < maxCardsInADeck; i++) { // Matches card.order
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }
});
