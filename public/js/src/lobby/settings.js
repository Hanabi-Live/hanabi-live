/*
    The "Settings" nav button
*/

// Imports
const globals = require('../globals');
const notifications = require('../notifications');

exports.init = () => {
    $('#settings-volume-slider').change(function settingsVolumeSliderChange() {
        const volume = $(this).val();
        $('#settings-volume-slider-value').html(`${volume}%`);
        globals.conn.send('setting', {
            name: 'volume',
            value: volume.toString(), // The server expects all settings as strings
        });
    });

    $('#settings-volume-test').click(() => {
        const audio = new Audio('/public/sounds/turn_us.mp3');
        audio.volume = $('#settings-volume-slider').val() / 100;
        audio.play();
    });
};

exports.setSettingsTooltip = () => {
    // The server has delivered to us a list of all of our settings
    // Check the checkboxes for the settings that we have enabled (and adjust the volume slider)
    for (const setting of Object.keys(globals.settings)) {
        const value = globals.settings[setting];
        if (setting.startsWith('createTable')) {
            // Settings for the "Create Game" nav button are handled when the user clicks on it
            continue;
        } else if (setting === 'volume') {
            $('#settings-volume-slider').val(value);
            $('#settings-volume-slider-value').html(`${value}%`);
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

    if (setting === 'sendTurnNotify' && checked) {
        notifications.test();
    }
}
