/*
    The navigation bar at the top of the lobby
*/

// Imports
const globals = require('../globals');
const lobby = require('./main');
const misc = require('../misc');
const modals = require('../modals');
const watchReplay = require('./watchReplay');

$(document).ready(() => {
    // Initialize all of the navigation tooltips using Tooltipster
    initTooltips();

    // The "Create Game" button
    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', lobby.createGame.ready);
    // (the logic for this tooltip is handled in the "createGame.js" file)

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', () => {
        lobby.history.show();
    });

    // The "Watch Specific Replay" button
    $('#nav-buttons-games-replay').tooltipster('option', 'functionReady', watchReplay.ready);
    // (the logic for this tooltip is handled in the "watchReplay.js" file)

    // The "Help" button
    // (this is just a simple link)

    // The "Resources" button
    // (initialized in the "initTooltips()" function)

    // The "Settings" button
    // (initialized in the "initTooltips()" function)

    // The "Sign Out" button
    $('#nav-buttons-games-sign-out').on('click', () => {
        signOut();
    });

    // The "Start Game" button
    $('#nav-buttons-pregame-start').on('click', () => {
        if ($('#nav-buttons-pregame-start').hasClass('disabled')) {
            return;
        }
        globals.conn.send('gameStart');
    });

    // The "Return to Lobby" button (from the "Pregame" screen)
    $('#nav-buttons-pregame-unattend').on('click', () => {
        lobby.pregame.hide();
        globals.conn.send('gameUnattend');
    });

    // The "Leave Game" button
    $('#nav-buttons-pregame-leave').on('click', () => {
        globals.conn.send('gameLeave');
    });

    // The "Return to Lobby" button (from the "History" screen)
    $('#nav-buttons-history-return').on('click', () => {
        lobby.history.hide();
    });

    // The "Return to History" button (from the "History Details" screen)
    $('#nav-buttons-history-details-return').on('click', () => {
        lobby.history.hideDetails();
    });
});

const initTooltips = () => {
    const tooltips = [
        'create-game',
        'replay',
        'resources',
        'settings',
    ];

    const tooltipsterOptions = {
        theme: 'tooltipster-shadow',
        trigger: 'click',
        interactive: true,
        delay: 0,
        /*
            The "create-game" tooltip is too large for very small resolutions and will wrap off the
            screen. We can use a Tooltipster plugin to automatically create a scroll bar for it.
            https://github.com/louisameline/tooltipster-scrollableTip
        */
        plugins: [
            'sideTip', // Make it have the ability to be positioned on a specific side
            'scrollableTip', // Make it scrollable
        ],
        functionBefore: () => {
            $('#lobby').fadeTo(globals.fadeTime, 0.4);
        },
    };

    const tooltipsterClose = () => {
        /*
            We want to fade in the background as soon as we start the tooltip closing animation,
            so we have to hook to the "close" event. Furthermore, we don't want to fade in the
            background if we click from one tooltip to the other, so we have to check to see how
            many tooltips are open. If one tooltip is open, then it is the one currently closing.
            If two tooltips are open, then we are clicking from one to the next.
        */
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

    // Map the escape key to close all tooltips / modals
    $(document).keydown((event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            misc.closeAllTooltips();
            modals.closeAll();
        }
    });

    // The "close" event will not fire if we initialize this on the tooltip class for some reason,
    // so we initialize all 3 individually
    for (const tooltip of tooltips) {
        $(`#nav-buttons-games-${tooltip}`)
            .tooltipster(tooltipsterOptions)
            .tooltipster('instance')
            .on('close', tooltipsterClose);
    }
};

exports.show = (target) => {
    const navTypes = [
        'games',
        'pregame',
        'history',
        'history-details',
    ];
    for (const navType of navTypes) {
        $(`#nav-buttons-${navType}`).hide();
    }
    if (target !== 'nothing') {
        $(`#nav-buttons-${target}`).show();
    }
};

const signOut = () => {
    localStorage.removeItem('hanabiuser');
    localStorage.removeItem('hanabipass');
    window.location.reload();
};
exports.signOut = signOut;
