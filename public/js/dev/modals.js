/*
    Modals (boxes that hover overtop the UI)
*/

const globals = require('./globals');
const misc = require('./misc');
const nav = require('./lobby/nav');

$(document).ready(() => {
    $('#error-modal-button').click(() => {
        window.location.reload();
    });
});

// Show the error modal
exports.errorShow = (msg) => {
    // Do nothing if we are already showing the error modal
    if (globals.errorOccured) {
        return;
    }
    globals.errorOccured = true;

    misc.closeAllTooltips();

    nav.show('nothing');

    function fadeInModal() {
        $('#error-modal').fadeIn(globals.fadeTime);
    }

    $('#error-modal-description').html(msg);
    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(globals.fadeTime, 0.1, fadeInModal);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(globals.fadeTime, 0.1, fadeInModal);
    }
};
