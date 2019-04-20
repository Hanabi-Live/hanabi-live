/*
    The "Watch Specific Replay" nav button
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');

$(document).ready(() => {
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
});

const replaySourceChange = () => {
    if ($('#replay-source-id').prop('checked')) {
        $('#replay-id-row').show();
        $('#replay-json-row').hide();
    } else if ($('#replay-source-json').prop('checked')) {
        $('#replay-id-row').hide();
        $('#replay-json-row').show();
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
    const error = (text) => {
        $('#replay-error-row').show();
        $('#replay-error-row-spacing').show();
        $('#replay-error-row-text').text(text);

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-replay').tooltipster('reposition');
    };

    // ID
    let gameID = $('#replay-id').val();
    if (source === 'id') {
        try {
            gameID = JSON.parse(gameID);
        } catch (err) {
            error('Error: The database ID must be a positive number.');
            return;
        }
        if (typeof gameID !== 'number' || gameID < 0) {
            error('Error: The database ID must be a positive number.');
            return;
        }
        localStorage.setItem('watchReplayID', gameID);
    }

    // JSON
    const gameJSONString = $('#replay-json').val();
    let gameJSON;
    if (source === 'json') {
        try {
            gameJSON = JSON.parse(gameJSONString);
        } catch (err) {
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
exports.ready = () => {
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
    const gameID = localStorage.getItem('watchReplayID');
    $('#replay-id').val(gameID);

    // Set the "JSON" field
    const json = localStorage.getItem('watchReplayJSON');
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
