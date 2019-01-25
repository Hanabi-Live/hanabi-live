/*
    In-game tooltips (for notes, etc.)
*/

$(document).ready(() => {
    // Notes
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
    for (let i = 0; i < 5; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        const newThemes = tooltipThemes.slice();
        newThemes.push('align-center');
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

        $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
        $(`#tooltip-character-assignment-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
    }
    $('#tooltip-spectators').tooltipster(tooltipOptions);
    $('#tooltip-leader').tooltipster(tooltipOptions);
    for (let i = 0; i < 60; i++) { // Matches card.order
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }
});
