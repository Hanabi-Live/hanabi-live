/*
    Lobby keyboard shortcuts
*/

// Imports
const globals = require('../globals');

$(document).keydown((event) => {
    // Lobby hotkeys only use alt, do don't do anything if other modifiers are pressed
    if (event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
    }

    // We also account for MacOS special characters that are inserted when
    // you hold down the option key
    if (event.altKey && (event.key === 'c' || event.key === 'ç')) { // Alt + c
        // Click the "Create Game" button
        if (globals.currentScreen === 'lobby') {
            $('#nav-buttons-games-create-game').click();
        }
    } else if (event.altKey && (event.key === 'h' || event.key === '˙')) { // Alt + h
        // Click the "Show History" button
        if (globals.currentScreen === 'lobby') {
            $('#nav-buttons-games-history').click();
        }
    } else if (event.altKey && (event.key === 'a' || event.key === 'å')) { // Alt + a
        // Click on the "Watch Specific Replay" button
        // (we can't use "Alt + w" because that conflicts with LastPass)
        if (globals.currentScreen === 'lobby') {
            $('#nav-buttons-games-replay').click();
        }
    } else if (event.altKey && (event.key === 'o' || event.key === 'ø')) { // Alt + o
        // Click the "Sign Out" button
        if (globals.currentScreen === 'lobby') {
            $('#nav-buttons-games-sign-out').click();
        }
    } else if (event.altKey && (event.key === 's' || event.key === 'ß')) { // Alt + s
        // Click on the "Start Game" button
        if (globals.currentScreen === 'pregame') {
            $('#nav-buttons-game-start').click();
        }
    } else if (event.altKey && (event.key === 'l' || event.key === '¬')) { // Alt + l
        // Click on the "Leave Game" button
        if (globals.currentScreen === 'pregame') {
            $('#nav-buttons-pregame-leave').click();
        }
    } else if (
        (event.altKey && (event.key === 'r' || event.key === '®')) // Alt + r
        || event.key === 'Escape'
    ) {
        // Click on the "Return to Lobby" button
        // (either at the "game" screen or the "history" screen or the "scores" screen)
        if (globals.currentScreen === 'pregame') {
            $('#nav-buttons-pregame-unattend').click();
        } else if (globals.currentScreen === 'history') {
            $('#nav-buttons-history-return').click();
        } else if (globals.currentScreen === 'historyDetails') {
            $('#nav-buttons-history-details-return').click();
        }
    }
});
