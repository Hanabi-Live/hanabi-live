/*
    The navigation bar at the top of the lobby
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');
const modals = require('../modals');
const lobby = require('./main');

$(document).ready(() => {
    // Initialize all of the navigation tooltips using Tooltipster
    initTooltips();

    // The "Create Game" button
    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', lobby.createGame.ready);

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', (event) => {
        event.preventDefault();
        lobby.history.show();
    });

    // The "Help" button
    // (this is just a simple link)

    // The "Resources" button
    // (initialized in the "initTooltips()" function)

    // The "Settings" button
    // (initialized in the "initTooltips()" function)

    // The "Sign Out" button
    $('#nav-buttons-games-sign-out').on('click', (event) => {
        event.preventDefault();
        localStorage.removeItem('hanabiuser');
        localStorage.removeItem('hanabipass');
        window.location.reload();
    });

    // The "Start Game" button
    $('#nav-buttons-pregame-start').on('click', (event) => {
        event.preventDefault();
        if ($('#nav-buttons-pregame-start').hasClass('disabled')) {
            return;
        }
        globals.conn.send('gameStart');
    });

    // The "Return to Lobby" button (from the "Pregame" screen)
    $('#nav-buttons-pregame-unattend').on('click', (event) => {
        event.preventDefault();
        lobby.pregame.hide();
        globals.conn.send('gameUnattend');
    });

    // The "Leave Game" button
    $('#nav-buttons-pregame-leave').on('click', (event) => {
        event.preventDefault();
        globals.conn.send('gameLeave');
    });

    // "Watch Replay by ID" and "Share Replay by ID" buttons
    $('.nav-buttons-history-by-id').on('click', (event) => {
        event.preventDefault();
        const subtype = event.currentTarget.getAttribute('data-display');
        let lastID = localStorage.getItem('lastID');
        if (typeof lastID !== 'string') {
            lastID = '';
        }
        const replayID = window.prompt(`What is the ID of the game you want to ${subtype}?`, lastID);
        if (replayID === null) {
            // The user clicked the "cancel" button, so do nothing else
            return;
        }

        globals.conn.send(event.currentTarget.getAttribute('data-replayType'), {
            gameID: parseInt(replayID, 10),
        });

        // Save the ID locally in case they want to view the same replay again later on
        localStorage.setItem('lastID', replayID);
    });

    // The "Return to Lobby" button (from the "History" screen)
    $('#nav-buttons-history-return').on('click', (event) => {
        event.preventDefault();
        lobby.history.hide();
    });

    // The "Return to History" button (from the "History Details" screen)
    $('#nav-buttons-history-details-return').on('click', (event) => {
        event.preventDefault();
        lobby.history.hideDetails();
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
        /*
            The "create-game" tooltip is too large for very small resolutions and will wrap off the
            screen. We can use a Tooltipster plugin to automatically create a scroll bar for it.
            https://github.com/louisameline/tooltipster-scrollableTip
        */
        plugins: ['sideTip', 'scrollableTip'],
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
