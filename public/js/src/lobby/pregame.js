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
    $('#nav-buttons-pregame-start').addClass('disabled');
    // The server will send us a "tableReady" message momentarily if
    // we need to enable the "Start Game" button
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
        let text = 'Timed (';
        text += misc.timerFormatter(globals.game.baseTime);
        text += ' + ';
        text += misc.timerFormatter(globals.game.timePerTurn);
        text += ')';
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

    // Draw the player boxes
    const numPlayers = globals.game.players.length;
    for (let i = 0; i <= 5; i++) {
        const div = $(`#lobby-pregame-player-${(i + 1)}`);

        const player = globals.game.players[i];
        if (!player) {
            div.html('');
            div.hide();
            continue;
        }

        div.show();

        let html = `
            <p class="margin0 padding0p5">
                <strong>${player.name}</strong>
            </p>
        `;

        // There is not enough room to draw the full box for 6 players
        if (numPlayers === 6) {
            div.removeClass('col-2');
            div.addClass('lobby-pregame-col');
        } else {
            div.addClass('col-2');
            div.removeClass('lobby-pregame-col');
        }

        // Calculate some stats
        const averageScore = Math.round(player.stats.averageScore * 100) / 100;
        // (round it to 2 decimal places)
        let strikeoutRate = player.stats.strikeoutRate * 100;
        // (turn it into a percent)
        strikeoutRate = Math.round(strikeoutRate * 100) / 100;
        // (round it to 2 decimal places)
        const maxScore = 5 * constants.VARIANTS[globals.game.variant].suits.length;

        html += `
            <div class="row">
                <div class="col-10">
                    Total games:
                </div>
                <div class="col-2 align-right padding0">
                    ${player.stats.numPlayedAll}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    ...of this variant:
                </div>
                <div class="col-2 align-right padding0">
                    ${player.stats.numPlayed}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    Average score:
                </div>
                <div class="col-2 align-right padding0">
                    ${averageScore}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    Strikeout rate:
                </div>
                <div class="col-2 align-right padding0">
                    ${strikeoutRate}%
                </div>
            </div>
        `;
        if (numPlayers > 1) {
            html += `
                <div class="row">
                    <div class="col-10">
                        ${numPlayers}-player best score:
                    </div>
                    <div class="col-2 align-right padding0">
                        ${player.stats.bestScores[numPlayers - 2].score}
                    </div>
                </div>
            `;
        }
        html += `
            <div class="row">
                <div class="col-10">
                    ${numPlayers === 1 ? 'B' : 'Other b'}est scores:
                </div>
                <div class="col-2 align-right padding0">
                    <i id="lobby-pregame-player-${i + 1}-scores-icon" class="fas fa-chart-area green" data-tooltip-content="#lobby-pregame-player-${i + 1}-tooltip"></i>
                </div>
            </div>
            <div class="hidden">
                <div id="lobby-pregame-player-${i + 1}-tooltip" class="lobby-pregame-tooltip">
        `;
        for (let j = 2; j <= 6; j++) {
            html += '<div class="row">';
            html += `<div class="col-6">${j}-player:</div>`;
            const bestScoreObject = player.stats.bestScores[j - 2];
            const bestScore = bestScoreObject.score;
            const bestScoreMod = bestScoreObject.modifier;
            html += '<div class="col-6">';
            if (bestScore === maxScore) {
                html += '<strong>';
            }
            html += ` ${bestScore} / ${maxScore}`;
            if (bestScore === maxScore) {
                html += '</strong> &nbsp; ';
                if (bestScoreMod === 0) {
                    html += '<i class="fas fa-check score-modifier green"></i>';
                } else {
                    html += '<i class="fas fa-times score-modifier red"></i>';
                }
            }
            html += '</div></div>';
        }
        html += `
                </div>
            </div>
        `;
        if (!player.present) {
            html += '<p class="lobby-pregame-player-away"><strong>AWAY</strong></p>';
        }

        div.html(html);

        // Initialize the tooltip
        $(`#lobby-pregame-player-${i + 1}-scores-icon`).tooltipster({
            animation: 'grow',
            contentAsHTML: true,
            delay: 0,
            theme: [
                'tooltipster-shadow',
                'tooltipster-shadow-big',
            ],
        });
    }
};
