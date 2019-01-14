/*
    Lobby keyboard shortcuts
*/

// Imports
const globals = require('../globals');

$(document).keydown((event) => {
    if (globals.currentScreen !== 'lobby') {
        return;
    }

    if (event.altKey && event.key === 'c') { // Alt + c
        // Click the "Create Game" button
        $('#nav-buttons-games-create-game').click();
    } else if (event.altKey && event.key === 'h') { // Alt + h
        // Click the "Show History" button
        $('#nav-buttons-games-history').click();
    } else if (event.altKey && event.key === 't') { // Alt + t
        // Click the "Settings" button
        $('#nav-buttons-games-settings').click();
    } else if (event.altKey && event.key === 'o') { // Alt + o
        // Click the "Sign Out" button
        $('#nav-buttons-games-sign-out').click();
    } else if (event.altKey && event.key === 's') { // Alt + s
        // Click on the "Start Game" button
        $('#nav-buttons-game-start').click();
    } else if (event.altKey && event.key === 'l') { // Alt + l
        // Click on the "Leave Game" button
        $('#nav-buttons-game-leave').click();
    } else if (event.altKey && event.key === 'r') { // Alt + r
        // Click on the "Return to Lobby" button
        // (either at the "game" screen or the "history" screen or the "scores" screen)
        if ($('#nav-buttons-game-unattend').is(':visible')) {
            $('#nav-buttons-game-unattend').click();
        } else if ($('#nav-buttons-history-return').is(':visible')) {
            $('#nav-buttons-history-return').click();
        } else if ($('#nav-buttons-history-details-return').is(':visible')) {
            $('#nav-buttons-history-details-return').click();
        }
    } else if (event.altKey && event.key === 'w') { // Alt + w
        // Click on the "Watch Replay by ID" button
        $('a.nav-buttons-history-by-id[data-replayType="replayCreate"]').click();
    } else if (event.altKey && event.key === 'e') { // Alt + e
        // Click on the "Share Replay by ID" button
        $('a.nav-buttons-history-by-id[data-replayType="sharedReplayCreate"]').click();
    }
});
