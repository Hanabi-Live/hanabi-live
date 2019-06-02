/*
    A short tutorial is shown to brand-new users
*/

// Imports
const globals = require('../globals');
const login = require('./login');

$(document).ready(() => {
    $('#tutorial-yes').on('click', () => {
        $('#tutorial-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-no').on('click', () => {
        $('#tutorial').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-2-yes').on('click', () => {
        $('#tutorial-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-2-no').on('click', () => {
        $('#tutorial-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2-2').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-2-1-ok').on('click', () => {
        $('#tutorial-2-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-2-2-ok').on('click', () => {
        $('#tutorial-2-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-3-yes').on('click', () => {
        $('#tutorial-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-3-no').on('click', () => {
        $('#tutorial-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-3-1-ok').on('click', () => {
        $('#tutorial-3-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-5').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-casual').on('click', () => {
        $('#tutorial-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-4-expert').on('click', () => {
        $('#tutorial-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-2').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-1-lobby').on('click', () => {
        $('#tutorial-4-1').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-4-2-ok').on('click', () => {
        $('#tutorial-4-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-3').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-4-2-lobby').on('click', () => {
        $('#tutorial-4-2').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-4-3-ok').on('click', () => {
        $('#tutorial-4-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-4').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-4-ok').on('click', () => {
        $('#tutorial-4-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-5').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-5-lobby').on('click', () => {
        $('#tutorial-5').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });
});
