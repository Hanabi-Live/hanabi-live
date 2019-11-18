/*
    A short tutorial is shown to brand-new users
*/

// Imports
import { FADE_TIME } from '../constants';
import * as loginMisc from './loginMisc';

export default () => {
    $('#tutorial-yes').on('click', () => {
        $('#tutorial-1').fadeOut(FADE_TIME, () => {
            $('#tutorial-2').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-no').on('click', () => {
        $('#tutorial').fadeOut(FADE_TIME, () => {
            loginMisc.hide(false);
        });
    });

    $('#tutorial-2-yes').on('click', () => {
        $('#tutorial-2').fadeOut(FADE_TIME, () => {
            $('#tutorial-2-1').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-2-no').on('click', () => {
        $('#tutorial-2').fadeOut(FADE_TIME, () => {
            $('#tutorial-2-2').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-2-1-ok').on('click', () => {
        $('#tutorial-2-1').fadeOut(FADE_TIME, () => {
            $('#tutorial-3').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-2-2-ok').on('click', () => {
        $('#tutorial-2-2').fadeOut(FADE_TIME, () => {
            $('#tutorial-3').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-3-yes').on('click', () => {
        $('#tutorial-3').fadeOut(FADE_TIME, () => {
            $('#tutorial-3-1').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-3-no').on('click', () => {
        $('#tutorial-3').fadeOut(FADE_TIME, () => {
            $('#tutorial-4').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-3-1-ok').on('click', () => {
        $('#tutorial-3-1').fadeOut(FADE_TIME, () => {
            $('#tutorial-5').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-4-casual').on('click', () => {
        $('#tutorial-4').fadeOut(FADE_TIME, () => {
            $('#tutorial-4-1').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-4-expert').on('click', () => {
        $('#tutorial-4').fadeOut(FADE_TIME, () => {
            $('#tutorial-4-2').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-4-1-lobby').on('click', () => {
        $('#tutorial-4-1').fadeOut(FADE_TIME, () => {
            loginMisc.hide(false);
        });
    });

    $('#tutorial-4-2-ok').on('click', () => {
        $('#tutorial-4-2').fadeOut(FADE_TIME, () => {
            $('#tutorial-4-3').fadeIn(FADE_TIME);
        });
    });
    $('#tutorial-4-2-lobby').on('click', () => {
        $('#tutorial-4-2').fadeOut(FADE_TIME, () => {
            loginMisc.hide(false);
        });
    });

    $('#tutorial-4-3-ok').on('click', () => {
        $('#tutorial-4-3').fadeOut(FADE_TIME, () => {
            $('#tutorial-4-4').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-4-4-ok').on('click', () => {
        $('#tutorial-4-4').fadeOut(FADE_TIME, () => {
            $('#tutorial-5').fadeIn(FADE_TIME);
        });
    });

    $('#tutorial-5-lobby').on('click', () => {
        $('#tutorial-5').fadeOut(FADE_TIME, () => {
            loginMisc.hide(false);
        });
    });
};
