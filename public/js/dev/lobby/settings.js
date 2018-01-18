/*
    The "Settings" nav button
*/

const globals = require('../globals');
const notifications = require('../notifications');

// Element 0 is the HTML ID
// Element 1 is the cookie key
const settingsList = [
    [
        // Show desktop notifications when it reaches your turn
        'settings-tooltip-send-turn-notification',
        'sendTurnNotify',
    ],
    [
        // Play sounds when a move is made
        'settings-tooltip-send-turn-sound',
        'sendTurnSound',
    ],
    [
        // Play ticking sounds when timers are below 5 seconds
        'settings-tooltip-send-timer-sound',
        'sendTimerSound',
    ],
    [
        // Receive notifications when your name is mentioned in chat
        'settings-tooltip-send-chat-notification',
        'sendChatNotify',
    ],
    [
        // Play a sound when your name is mentioned in chat
        'settings-tooltip-send-chat-sound',
        'sendChatSound',
    ],
    [
        // Enable colorblind mode
        'settings-tooltip-show-colorblind-ui',
        'showColorblindUI',
    ],
    [
        // Hide the turn timers that tick up in untimed games
        'settings-tooltip-hide-timer-in-untimed',
        'hideTimerInUntimed',
    ],
];

// Load the settings from stored cookies when the page is finished loading
$(document).ready(() => {
    for (let i = 0; i < settingsList.length; i++) {
        const htmlID = settingsList[i][0];
        const cookieKey = settingsList[i][1];

        // Get this setting from local storage
        let cookieValue = localStorage.getItem(cookieKey);

        if (typeof cookieValue === 'undefined' || typeof cookieValue !== 'string') {
            // If the cookie doesn't exist (or it is corrupt), write a default value
            cookieValue = this[cookieKey];
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

        $(`#${htmlID}`).change(function changeSettingsList() {
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

            if (globals.settings.sendTurnNotify || globals.settings.sendChatNotify) {
                notifications.test();
            }
        });
    }
});
