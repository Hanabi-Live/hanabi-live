// Imports
import * as createGame from './createGame';
import { FADE_TIME } from '../constants';
import globals from '../globals';
import * as history from './history';
import * as misc from '../misc';
import * as modals from '../modals';
import * as nav from './nav';
import * as pregame from './pregame';
import * as watchReplay from './watchReplay';

export default () => {
    // Initialize all of the navigation tooltips using Tooltipster
    initTooltips();

    // The "Create Game" button
    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', createGame.ready);
    // (the logic for this tooltip is handled in the "createGame.ts" file)

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', () => {
        history.show();
    });

    // The "Watch Specific Replay" button
    $('#nav-buttons-games-replay').tooltipster('option', 'functionReady', watchReplay.ready);
    // (the logic for this tooltip is handled in the "watchReplay.ts" file)

    // The "Help" button
    // (this is just a simple link)

    // The "Resources" button
    // (initialized in the "initTooltips()" function)

    // The "Settings" button
    // (initialized in the "initTooltips()" function)

    // The "Sign Out" button
    $('#nav-buttons-games-sign-out').on('click', () => {
        nav.signOut();
    });

    // The "Start Game" button
    $('#nav-buttons-pregame-start').on('click', () => {
        if (!$('#nav-buttons-pregame-start').hasClass('disabled')) {
            globals.conn.send('tableStart');
        }
    });

    // The "Return to Lobby" button (from the "Pregame" screen)
    $('#nav-buttons-pregame-unattend').on('click', () => {
        pregame.hide();
        globals.conn.send('tableUnattend');
        globals.tableID = -1;
    });

    // The "Leave Game" button
    $('#nav-buttons-pregame-leave').on('click', () => {
        globals.conn.send('tableLeave');
    });

    // The "Return to Lobby" button (from the "History" screen)
    $('#nav-buttons-history-return').on('click', () => {
        history.hide();
    });

    // The "Return to History" button (from the "History Details" screen)
    $('#nav-buttons-history-other-scores-return').on('click', () => {
        history.hideOtherScores();
    });
};

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
            $('#lobby').fadeTo(FADE_TIME, 0.4);
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
            $('#lobby').fadeTo(FADE_TIME, 1);
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
