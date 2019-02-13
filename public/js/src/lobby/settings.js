/*
    The "Settings" nav button
*/

// Imports
const globals = require('../globals');
const notifications = require('../notifications');

// Element 0 is the HTML ID
// Element 1 is the cookie key
const settingsList = [
    [
        // Show desktop notifications when it reaches your turn
        'send-turn-notification',
        'sendTurnNotify',
    ],
    [
        // Play sounds when a move is made
        'send-turn-sound',
        'sendTurnSound',
    ],
    [
        // Play ticking sounds when timers are below 5 seconds
        'send-timer-sound',
        'sendTimerSound',
    ],
    [
        // Enable Board Game Arena mode (hands grouped together)
        'show-bga-ui',
        'showBGAUI',
    ],
    [
        // Enable colorblind mode
        'show-colorblind-ui',
        'showColorblindUI',
    ],
    [
        // Show turn timers in untimed games
        'show-timer-in-untimed',
        'showTimerInUntimed',
    ],
    [
        // Reverse hand direction (new cards go on the right)
        'reverse-hands',
        'reverseHands',
    ],
    [
        // Enable pre-playing cards
        'speedrun-preplay',
        'speedrunPreplay',
    ],
    [
        // Enable speedrun mode
        'speedrun-mode',
        'speedrunMode',
    ],
];

$(document).ready(() => {
    for (let i = 0; i < settingsList.length; i++) {
        const htmlID = settingsList[i][0];
        const cookieKey = settingsList[i][1];

        // Get this setting from local storage
        let cookieValue = localStorage.getItem(cookieKey);

        if (typeof cookieValue === 'undefined' || typeof cookieValue !== 'string') {
            // If the cookie doesn't exist (or it is corrupt), write a default value
            cookieValue = globals.settings[cookieKey];
            localStorage.setItem(cookieKey, cookieValue);
            console.log(`Wrote a brand new "${cookieKey}" cookie of: ${cookieValue}`);
        } else {
            // Convert it from a string to a boolean
            // (all values in cookies are strings)
            cookieValue = (cookieValue === 'true');

            // Write the value of the cookie to our local variable
            globals.settings[cookieKey] = cookieValue;
        }
        $(`#${htmlID}`).attr('checked', cookieValue);

        $(`#${htmlID}`).change(changeSetting);
    }
});

function changeSetting() {
    // Find the local variable name that is associated with this HTML ID
    for (let j = 0; j < settingsList.length; j++) {
        const thisHtmlID = settingsList[j][0];
        const thisCookieKey = settingsList[j][1];
        if (thisHtmlID === $(this).attr('id')) {
            const checked = $(this).is(':checked');

            // Write the new value to our local variable
            globals.settings[thisCookieKey] = checked;

            // Also store the new value in localstorage
            localStorage.setItem(thisCookieKey, checked);

            console.log(`Wrote a "${thisCookieKey}" cookie of: ${checked}`);
            break;
        }
    }

    if (globals.settings.sendTurnNotify) {
        notifications.test();
    }
}
