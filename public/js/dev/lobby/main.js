/*
    Functions for handling the main lobby page
    (current games, chat, and the user list)
*/

const constants = require('../constants');
const globals = require('../globals');
const misc = require('../misc');
const notifications = require('../notifications');
require('./login');
const nav = require('./nav');

$(document).ready(() => {
    // Handle chatting
    const input = $('#lobby-chat-input');
    input.on('keypress', (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        if (!input.val()) {
            return;
        }

        globals.conn.send('chat', {
            msg,
            room: 'lobby',
        });

        // Clear the chat box
        const msg = input.val();
        input.val('');
    });
    $('#lobby-chat-form').submit((event) => {
        // By default, the form will reload the page, so stop this from happening
        event.preventDefault();
    });
});

exports.show = () => {
    $('#lobby').show();
    nav.show('games');
    $('#lobby-chat-input').focus();

    // FOR TESTING, TODO REMOVE
    globals.conn.send('replayCreate', {
        gameID: 2902,
    });
};

exports.hide = () => {
    $('#page-wrapper').hide();

    // The Alpha custom nav for tiny resolutions
    $('#navPanel').hide();
    $('#navButton').hide();
};

// "reset" is a reserved word in JavaScript
exports.resetLobby = () => {
    globals.userList = {};
    globals.tableList = {};
    globals.historyList = {};
    globals.historyDetailList = [];
    drawUsers();
    drawTables();
};

// Draw the "Users" box in the bottom-right-hand corner
const drawUsers = () => {
    $('#lobby-users-num').text(Object.keys(globals.userList).length);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const user of Object.values(globals.userList)) {
        const row = $('<tr>');

        let { name } = user;
        if (name === globals.username) {
            name = `<strong>${name}</strong>`;
        }
        $('<td>').html(name).appendTo(row);

        const { status } = user;
        $('<td>').html(status).appendTo(row);

        row.appendTo(tbody);
    }
};
exports.drawUsers = drawUsers;

// Draw the "Current Games" box in the top half
const drawTables = () => {
    const tbody = $('#lobby-games-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    if (Object.keys(globals.tableList).length === 0) {
        $('#lobby-games-no').show();
        $('#lobby-games').addClass('align-center-v');
        $('#lobby-games-table-container').hide();
        return;
    }
    $('#lobby-games-no').hide();
    $('#lobby-games').removeClass('align-center-v');
    $('#lobby-games-table-container').show();

    // Add all of the games
    for (const game of Object.values(globals.tableList)) {
        const row = $('<tr>');

        // Column 1 - Name
        $('<td>').html(game.name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(game.numPlayers).appendTo(row);

        // Column 3 - Variant
        const name = constants.VARIANT_INTEGER_MAPPING[game.variant].nameShort;
        $('<td>').html(name).appendTo(row);

        // Column 4 - Timed
        let timed = 'No';
        if (game.timed) {
            timed = `${timerFormatter(game.baseTime)} + ${timerFormatter(game.timePerTurn)}`;
        }
        $('<td>').html(timed).appendTo(row);

        // Column 5 - Status
        let status;
        if (game.running && !game.joined) {
            if (game.sharedReplay) {
                status = 'Shared Replay';
            } else {
                status = `Running (${game.progress}%)`;
            }
        } else if (game.running) {
            if (game.ourTurn) {
                status = '<strong>Your Turn</strong>';
            } else {
                status = 'Waiting';
            }
        } else {
            status = 'Not Started';
        }
        $('<td>').html(status).appendTo(row);

        // Column 6 - Action
        const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
        if (!game.joined && game.running) {
            button.html('<i class="fas fa-eye lobby-button-icon"></i>&nbsp; Spectate');
            button.attr('id', `spectate-${game.id}`);
            button.on('click', (event) => {
                event.preventDefault();
                globals.gameID = game.id;
                globals.conn.send('gameSpectate', {
                    gameID: game.id,
                });

                drawTables();
            });
        } else if (!game.joined) {
            button.html('<i class="fas fa-sign-in-alt lobby-button-icon"></i>&nbsp; Join');
            button.attr('id', `join-${game.id}`);
            if (game.numPlayers >= 5) {
                button.addClass('disabled');
            }
            button.on('click', (event) => {
                event.preventDefault();
                globals.gameID = game.id;
                globals.conn.send('gameJoin', {
                    gameID: game.id,
                });

                drawTables();
            });
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>&nbsp; Resume');
            button.attr('id', `resume-${game.id}`);

            button.on('click', (event) => {
                event.preventDefault();
                globals.gameID = game.id;
                globals.conn.send('gameReattend', {
                    gameID: game.id,
                });

                drawTables();
            });
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Abandon
        let button2 = 'n/a';
        if (game.joined && (game.owned || game.running)) {
            button2 = $('<button>').attr('type', 'button').addClass('button fit margin0');
            button2.html('<i class="fas fa-times lobby-button-icon"></i>&nbsp; Abandon');
            button2.attr('id', `abandon-${game.id}`);
            button2.on('click', (event) => {
                event.preventDefault();

                if (game.running) {
                    if (!window.confirm('Really abandon game? This will cancel the game for all players.')) {
                        return;
                    }
                }

                globals.gameID = null;
                globals.conn.send('gameAbandon', {
                    gameID: game.id,
                });
            });
        }
        $('<td>').html(button2).appendTo(row);

        // Column 8 - Players
        $('<td>').html(game.players).appendTo(row);

        row.appendTo(tbody);
    }
};
exports.drawTables = drawTables;

exports.addChat = (data) => {
    const chat = $('#lobby-chat-text');

    // Convert any Discord emotes
    data.msg = fillEmotes(data.msg);

    // Get the hours and minutes from the time
    const datetime = dateTimeFormatter2.format(new Date(data.datetime));

    let line = `[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<b>${data.who}</b>&gt;&nbsp; `;
        line += `${$('<a>').text(data.msg).html()}`;
    } else {
        line += `<b>${$('<a>').text(data.msg).html()}</b>`;
    }
    line += '<br />';

    chat.finish();
    chat.append(line);
    chat.animate({
        scrollTop: chat[0].scrollHeight,
    }, globals.fadeTime);

    if (data.previous) {
        return;
    }

    const r = new RegExp(globals.username, 'i');
    if (data.who && r.test(data.msg)) {
        if (globals.settings.sendChatNotify) {
            notifications.send(`${data.who} mentioned you in chat`, 'chat');
        }

        if (globals.settings.sendChatSound) {
            misc.playSound('chat');
        }
    }
};

const fillEmotes = (message) => {
    const emoteMapping = {
        '<:BibleThump:254683882601840641>': 'BibleThump',
        '<:PogChamp:254683883033853954>': 'PogChamp',
    };

    // Search through the text for each emote
    for (const emote of Object.keys(emoteMapping)) {
        if (message.indexOf(emote) === -1) {
            continue;
        }

        const emoteTag = `<img src="public/img/emotes/${emoteMapping[emote]}.png" title="${emoteMapping[emote]}" />`;
        message = message.replace(emote, emoteTag);
    }

    return message;
};

exports.showJoined = () => {
    // Update the "Start Game" button
    $('#nav-buttons-game-start').addClass('disabled');

    // Update the information on the left-hand side of the screen
    $('#lobby-game-name').text(globals.game.name);
    const name = constants.VARIANT_INTEGER_MAPPING[globals.init.variant].nameShort;
    $('#lobby-game-variant').text(name);
    let timed = 'No';
    if (globals.game.timed) {
        timed = `Yes (${timerFormatter(globals.game.baseTime)} + ${timerFormatter(globals.game.timePerTurn)})`;
    }
    $('#lobby-game-timed').text(timed);

    // Draw the 5 players
    for (let i = 0; i < 5; i++) {
        const div = $(`#lobby-game-player-${(i + 1)}`);

        const player = globals.game.players[i];
        if (!player) {
            div.html('');
            div.hide();
            continue;
        }

        div.show();

        // Calculate some stats
        const averageScoreVariant = Math.round(player.stats.averageScoreVariant * 100) / 100;
        // Round it to 2 decimal places
        let strikeoutRateVariant = player.stats.strikeoutRateVariant * 100;
        // Turn it into a percent
        strikeoutRateVariant = Math.round(strikeoutRateVariant * 100) / 100;
        // Round it to 2 decimal places

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
            html += '<p class="lobby-game-player-away"><strong>AWAY</strong></p>';
        }

        div.html(html);
    }
};

const timerFormatter = (milliseconds) => {
    if (!milliseconds) {
        milliseconds = 0;
    }
    const time = new Date();
    time.setHours(0, 0, 0, milliseconds);
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${secondsFormatted}`;
};

const dateTimeFormatter2 = new Intl.DateTimeFormat(
    undefined,
    {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    },
);
