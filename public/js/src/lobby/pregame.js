/*
   The lobby area that shows all of the players in the current unstarted game
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');
const lobby = require('./main');

exports.show = () => {
    $('#lobby-pregame').show();
    $('#lobby-games').hide();
    lobby.nav.show('pregame');
};

exports.hide = () => {
    $('#lobby-pregame').hide();
    $('#lobby-games').show();
    lobby.nav.show('games');
};

exports.draw = () => {
    // Update the "Start Game" button
    $('#nav-buttons-game-start').addClass('disabled');

    // Update the information on the left-hand side of the screen
    $('#lobby-pregame-name').text(globals.game.name);
    $('#lobby-pregame-variant').text(globals.game.variant);

    const optionsTitle = $('#lobby-pregame-options-title');
    optionsTitle.text('Options:');
    const options = $('#lobby-pregame-options');
    options.text('');
    if (globals.game.timed) {
        const text = `Timed (${misc.timerFormatter(globals.game.baseTime)} + ${misc.timerFormatter(globals.game.timePerTurn)})`;
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.deckPlays) {
        const text = 'Bottom-deck Blind Plays';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.emptyClues) {
        const text = 'Empty Clues';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.characterAssignments) {
        const text = 'Character Assignments';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.password) {
        const text = 'Password-protected';
        $('<li>').html(text).appendTo(options);
    }
    if (options.text() === '') {
        optionsTitle.text('');
    }

    // Draw the 5 players
    for (let i = 0; i < 5; i++) {
        const div = $(`#lobby-pregame-player-${(i + 1)}`);

        const player = globals.game.players[i];
        if (!player) {
            div.html('');
            div.hide();
            continue;
        }

        div.show();

        // Calculate some stats
        const averageScoreVariant = Math.round(player.stats.averageScoreVariant * 100) / 100;
        // (round it to 2 decimal places)
        let strikeoutRateVariant = player.stats.strikeoutRateVariant * 100;
        // (turn it into a percent)
        strikeoutRateVariant = Math.round(strikeoutRateVariant * 100) / 100;
        // (round it to 2 decimal places)

        let html = `
            <p class="margin0 padding0p5">
                <strong>${player.name}</strong>
            </p>
            <div class="row 100%">
                <div class="10u">
                    Total games:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.numPlayed}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...of this variant:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.numPlayedVariant}
                </div>
            </div>
            Best scores with:
            <div class="row 100%">
                <div class="10u">
                    ...3 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant3}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...4 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant4}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...5 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant5}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    Average score:
                </div>
                <div class="2u align-right padding0">
                    ${averageScoreVariant}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    Strikeout rate:
                </div>
                <div class="2u align-right padding0">
                    ${strikeoutRateVariant}%
                </div>
            </div>
        `;
        if (!player.present) {
            html += '<p class="lobby-pregame-player-away"><strong>AWAY</strong></p>';
        }

        div.html(html);
    }
};
