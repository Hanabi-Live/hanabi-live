/*
    The "Settings" nav button
*/

// Imports
import globals from '../globals';

export const init = () => {
    $('#settings-volume-slider').change(function settingsVolumeSliderChange() {
        const element = $(this);
        if (!element) {
            throw new Error('Failed to get the "settings-volume-slider" element.');
        }
        const volumeString = element.val();
        if (typeof volumeString !== 'string') {
            throw new Error('The value of the "settings-volume-slider" element is not a string.');
        }
        const volume = parseInt(volumeString, 10);
        globals.settings.set('volume', volume);
        $('#settings-volume-slider-value').html(`${volume}%`);
        globals.conn.send('setting', {
            name: 'volume',
            value: volumeString, // The server expects all settings as strings
        });
    });

    $('#settings-volume-test').click(() => {
        const audio = new Audio('/public/sounds/turn_us.mp3');
        const element = $('#settings-volume-slider');
        if (!element) {
            throw new Error('Failed to get the "settings-volume-slider" element.');
        }
        const volumeString = element.val();
        if (typeof volumeString !== 'string') {
            throw new Error('The value of the "settings-volume-slider" element is not a string.');
        }
        const volume = parseInt(volumeString, 10);
        audio.volume = volume / 100;
        audio.play();
    });
};

export const setSettingsTooltip = () => {
    // The server has delivered to us a list of all of our settings
    // Check the checkboxes for the settings that we have enabled (and adjust the volume slider)
    for (const [setting, value] of globals.settings) {
        if (setting.startsWith('createTable')) {
            // Settings for the "Create Game" nav button are handled when the user clicks on it
            continue;
        } else if (setting === 'volume') {
            if (typeof value !== 'number') {
                throw new Error('The volume setting is not stored as a number.');
            }
            $('#settings-volume-slider').val(value);
            $('#settings-volume-slider-value').html(`${value}%`);
        } else {
            const element = $(`#${setting}`);
            if (!element) {
                throw new Error(`Failed to get the "${setting}" element.`);
            }
            if (typeof value !== 'boolean') {
                throw new Error('The volume setting is not stored as a string.');
            }
            element.prop('checked', value);
            element.change(changeSetting);
        }
    }
};

function changeSetting(this: HTMLElement) {
    const element = $(this);
    if (!element) {
        throw new Error('Failed to get the element in the "changeSetting()" function.');
    }
    const settingName = element.attr('id');
    if (!settingName) {
        throw new Error('Failed to get the ID of the element in the "changeSetting()" function.');
    }
    const setting = globals.settings.get(settingName);
    if (typeof setting === 'undefined') {
        throw new Error(`The settings map does not have an entry for "${settingName}".`);
    }

    const checked = element.is(':checked');
    if (setting === checked) {
        return;
    }

    // Write the new value to our local variable
    globals.settings.set(settingName, checked);

    // And send the new value to the server
    globals.conn.send('setting', {
        name: settingName,
        value: checked.toString(), // The server expects all settings as strings
    });
}
