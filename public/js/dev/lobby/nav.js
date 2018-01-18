/*
    The navigation bar at the top of the lobby
*/

const globals = require('../globals');
const misc = require('../misc');
const cookie = require('../cookie');
const nav = require('./nav');
const createGame = require('./createGame');
const history = require('./history');

$(document).ready(() => {
    // Initialize all of the navigation tooltips using Tooltipster
    initTooltips();

    // The "Create Game" button
    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', createGame.ready);

    // The "Queue for Next Game" button
    // TODO

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', (event) => {
        $('#lobby-games').hide();
        $('#lobby-history').show();
        show('history');
        history.draw();
    });

    // The "Resources" button
    // (initialized in the "initTooltips()" function)

    // The "Settings" button
    // (initialized in the "initTooltips()" function)

    // The "Sign Out" button
    $('#nav-buttons-games-sign-out').on('click', (event) => {
        cookie.delete('hanabiuser');
        cookie.delete('hanabipass');
        window.location.reload();
    });

    // The "Start Game" button
    $('#nav-buttons-game-start').on('click', (event) => {
        globals.conn.send('gameStart');
    });

    // The "Return to Lobby" button
    // (when in an unstarted game)
    $('#nav-buttons-game-unattend').on('click', (event) => {
        $('#lobby-game').hide();
        $('#lobby-games').show();
        nav.show('games');

        globals.conn.send('gameUnattend');
    });

    // The "Leave Game" button
    $('#nav-buttons-game-leave').on('click', (event) => {
        globals.conn.send('gameLeave');
    });

    // The "Return to Lobby" button
    // (when in a history view)
    $('.nav-return-table').on('click', (event) => {
        $('#lobby-history-details').hide();
        $('#lobby-history').hide();
        $('#lobby-games').show();
        nav.show('games');
    });

    // "Watch Replay by ID" and "Share Replay by ID" buttons
    $('.nav-buttons-history-by-id').on('click', (event) => {
        const replayID = window.prompt('What is the ID of the game you want?');
        if (replayID === null) {
            // The user clicked the "cancel" button, so do nothing else
            return;
        }

        globals.conn.send(event.currentTarget.getAttribute('data-replayType'), {
            gameID: parseInt(replayID, 10),
        });
    });
});

const initTooltips = () => {
    const tooltips = [
        'create-game',
        'resources',
        'settings',
    ];

    const tooltipsterOptions = {
        theme: 'tooltipster-shadow',
        trigger: 'click',
        interactive: true,
        delay: 0,
        functionBefore: () => {
            $('#lobby').fadeTo(globals.fadeTime, 0.4);
        },
    };

    const tooltipsterClose = () => {
        // We want to fade in the background as soon as we start the tooltip closing animation,
        // so we have to hook to the "close" event
        // Furthermore, we don't want to fade in the background if we click from one tooltip to the other,
        // so we have to check to see how many tooltips are open
        // If one tooltip is open, then it is the one currently closing
        // If two tooltips are open, then we are clicking from one to the next
        let tooltipsOpen = 0;
        for (const tooltip of tooltips) {
            if ($(`#nav-buttons-games-${tooltip}`).tooltipster('status').open) {
                tooltipsOpen += 1;
            }
        }
        if (tooltipsOpen <= 1) {
            $('#lobby').fadeTo(globals.fadeTime, 1);
        }
    };

    // Map the escape key to close all tooltips
    $(document).keydown((event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            misc.closeAllTooltips();
        }
    });

    // The "close" event will not fire if we initialize this on the tooltip class for some reason,
    // so we initialize all 3 individually
    for (const tooltip of this.tooltips) {
        $(`#nav-buttons-games-${tooltip}`).tooltipster(tooltipsterOptions).tooltipster('instance').on('close', tooltipsterClose);
    }
};

const show = (target) => {
    const navTypes = [
        'games',
        'game',
        'history',
        'return',
    ];
    for (const navType of navTypes) {
        $(`#nav-buttons-${navType}`).hide();
    }

    if (target !== 'nothing') {
        $(`#nav-buttons-${target}`).show();
    }
};
