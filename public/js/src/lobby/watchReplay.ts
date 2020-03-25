/*
    The "Watch Specific Replay" nav button
*/

// Imports
import globals from '../globals';
import * as misc from '../misc';

export const init = () => {
    // Make the text box appear and disappear depending on which source is selected
    $('#replay-source-id').change(replaySourceChange);
    $('#replay-source-json').change(replaySourceChange);

    $('#replay-tooltip').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#replay-submit').click();
        }
    });

    $('#replay-submit').on('click', submit);
};

const replaySourceChange = () => {
    if ($('#replay-source-id').prop('checked')) {
        $('#replay-json-row').hide();
        $('#replay-id-row').show();
        setTimeout(() => {
            $('#replay-id').select(); // Automatically highlight the ID field
            // (this has to be in a timeout in order to work properly)
        }, 0);
    } else if ($('#replay-source-json').prop('checked')) {
        $('#replay-id-row').hide();
        $('#replay-json-row').show();
        setTimeout(() => {
            $('#replay-json').select(); // Automatically highlight the JSON field
            // (this has to be in a timeout in order to work properly)
        }, 0);
    } else {
        throw new Error('Invalid value for "replay-source".');
    }

    // Redraw the tooltip so that the new elements will fit better
    $('#nav-buttons-games-replay').tooltipster('reposition');
};

const submit = () => {
    // Source
    const sourceID = $('input[type=radio][name=replay-source]:checked')[0].id;
    let source;
    if (sourceID === 'replay-source-id') {
        source = 'id';
    } else if (sourceID === 'replay-source-json') {
        source = 'json';
    } else {
        throw new Error('Invalid value for "replay-source".');
    }
    localStorage.setItem('watchReplaySource', source);

    // Error
    $('#replay-error-row').hide();
    $('#replay-error-row-spacing').hide();
    const error = (text: string) => {
        $('#replay-error-row').show();
        $('#replay-error-row-spacing').show();
        $('#replay-error-row-text').text(text);

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-replay').tooltipster('reposition');
    };

    // ID
    const gameIDString = $('#replay-id').val();
    if (typeof gameIDString !== 'string') {
        throw new Error('The value of the "replay-id" element is not a string.');
    }
    let gameID;
    if (source === 'id') {
        gameID = parseInt(gameIDString, 10);
        if (Number.isNaN(gameID)) {
            error('Error: The database ID must be a number.');
            return;
        }
        if (gameID < 1) {
            error('Error: The database ID must be a positive number.');
            return;
        }
        localStorage.setItem('watchReplayID', gameIDString);
    }

    // JSON
    const gameJSONString = $('#replay-json').val();
    if (typeof gameJSONString !== 'string') {
        throw new Error('The value of the "replay-json" element is not a string.');
    }
    let gameJSON;
    if (source === 'json') {
        try {
            gameJSON = JSON.parse(gameJSONString);
        } catch (err) {
            error('Error: That is not a valid JSON object.');
            return;
        }
        if (typeof gameJSON !== 'object') {
            error('Error: That is not a valid JSON object.');
            return;
        }
        localStorage.setItem('watchReplayJSON', gameJSONString);
    }

    // Visibility
    const visibilityID = $('input[type=radio][name=replay-visibility]:checked')[0].id;
    let visibility;
    if (visibilityID === 'replay-visibility-solo') {
        visibility = 'solo';
    } else if (visibilityID === 'replay-visibility-shared') {
        visibility = 'shared';
    } else {
        throw new Error('Invalid value for "replay-visibility".');
    }
    localStorage.setItem('watchReplayVisibility', visibility);

    if (source === 'id') {
        globals.conn.send('replayCreate', {
            source,
            gameID,
            visibility,
        });
    } else if (source === 'json') {
        globals.conn.send('replayCreate', {
            source,
            gameJSON,
            visibility,
        });
    }

    misc.closeAllTooltips();
};

// This function is executed every time the "Watch Specific Replay" button is clicked
// (after the tooltip is added to the DOM)
export const ready = () => {
    // Set the "Source" radio button
    const source = localStorage.getItem('watchReplaySource');
    let sourceBox;
    if (source === 'id') {
        sourceBox = '#replay-source-id';
    } else if (source === 'json') {
        sourceBox = '#replay-source-json';
    } else {
        // Default to ID
        sourceBox = '#replay-source-id';
    }
    $(sourceBox).prop('checked', true);
    $(sourceBox).change();

    // Set the "ID" field
    let gameID = localStorage.getItem('watchReplayID');
    if (typeof gameID !== 'string') {
        gameID = '';
    }
    $('#replay-id').val(gameID);

    // Set the "JSON" field
    let json = localStorage.getItem('watchReplayJSON');
    if (typeof json !== 'string') {
        json = '';
    }
    $('#replay-json').val(json);

    // Hide the error row
    $('#replay-error-row').hide();
    $('#replay-error-row-spacing').hide();

    // Set the "Visibility" radio button
    const visibility = localStorage.getItem('watchReplayVisibility');
    let visibilityBox;
    if (visibility === 'solo') {
        visibilityBox = '#replay-visibility-solo';
    } else if (visibility === 'shared') {
        visibilityBox = '#replay-visibility-shared';
    } else {
        // Default to solo
        visibilityBox = '#replay-visibility-solo';
    }
    $(visibilityBox).prop('checked', true);
    $(visibilityBox).change();

    // Redraw the tooltip so that the new elements will fit better
    $('#nav-buttons-games-replay').tooltipster('reposition');

    // Focus the "ID" or "JSON" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the tooltip)
    setTimeout(() => {
        if ($('#replay-id-row').is(':visible')) {
            $('#replay-id').focus();
        } else if ($('#replay-json-row').is(':visible')) {
            $('#replay-json').focus();
        }
    }, 1);
};
