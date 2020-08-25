// Various tooltips are used throughout the lobby and the game using the Tooltipster library

// Constants
const maxPlayers = 6;
const maxCardsInADeck = 60;
const tooltipThemes = [
  'tooltipster-shadow',
  'tooltipster-shadow-big',
];

export const options: JQueryTooltipster.ITooltipsterOptions = {
  animation: 'grow',
  contentAsHTML: true,
  delay: 0,
  theme: tooltipThemes,
};

// Initialize in-game tooltips (for notes, etc.)
export const initGame = () => {
  const gameOptions: JQueryTooltipster.ITooltipsterOptions = {
    ...options,
    interactive: true, // So that users can update their notes
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
    'lobby',
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
    $(`#tooltip-${tooltip}`).tooltipster(gameOptions);
  }

  // The "time-taken" tooltip should have centered text
  const newThemes = tooltipThemes.slice();
  newThemes.push('align-center');
  $('#tooltip-time-taken').tooltipster('instance').option('theme', newThemes);

  // Dynamically create the player tooltips
  for (let i = 0; i < maxPlayers; i++) {
    $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
    $(`#tooltip-player-${i}`).tooltipster(gameOptions);
    $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

    $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
    $(`#tooltip-character-assignment-${i}`).tooltipster(gameOptions);
    $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
  }

  // Dynamically create the card note tooltips
  for (let i = 0; i < maxCardsInADeck + 6; i++) {
    // The number in the id matches the order of the card in the deck
    // We add 6 because we also need note tooltips for the stack bases
    $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
    $(`#tooltip-card-${i}`).tooltipster(gameOptions);
  }
};
