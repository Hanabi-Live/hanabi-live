/*
    The "Settings" nav button
*/

// Imports
const globals = require('../globals');
const notifications = require('../notifications');

exports.init = () => {
    // The server has delivered to us a list of all of our settings
    // Check the checkboxes for the settings that we have enabled
    for (const setting of Object.keys(globals.settings)) {
        const value = globals.settings[setting];
        if (setting.startsWith('createTable')) {
            // Settings for the "Create Game" nav button are handled when the user clicks on it
            continue;
        } else {
            $(`#${setting}`).attr('checked', value);
            $(`#${setting}`).change(changeSetting);
        }
    }
};

function changeSetting() {
    const setting = $(this).attr('id');
    const checked = $(this).is(':checked');

    if (globals.settings[setting] === checked) {
        return;
    }

    // Write the new value to our local variable
    globals.settings[setting] = checked;

    // And send the new value to the server
    globals.conn.send('setting', {
        name: setting,
        value: checked.toString(), // The server expects all settings as strings
    });

    if (globals.settings.sendTurnNotify) {
        notifications.test();
    }
}
