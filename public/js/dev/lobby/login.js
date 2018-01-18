/*
    The initial login page
*/

const shajs = require('sha.js');
const globals = require('../globals');
const misc = require('../misc');
const cookie = require('../cookie');
const websocket = require('../websocket');
const lobby = require('./main');

$(document).ready(() => {
    // Display the login screen automatically by default
    lobby.hide();
    misc.closeAllTooltips();
    $('#login').show();

    // Handle logging in
    $('#login-button').click(() => {
        $('#login-form').submit();
    });
    $('#login-form').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#login-form').submit();
        }
    });
    $('#login-form').submit((event) => {
        const user = $('#login-username').val();
        const pass = $('#login-password').val();

        if (!user) {
            formError('You must provide a username.');
            return;
        }

        if (!pass) {
            formError('You must provide a password.');
            return;
        }

        const hash = shajs('sha256').update(`Hanabi password ${pass}`).digest('hex');

        cookie.set('hanabiuser', user);
        cookie.set('hanabipass', hash);

        globals.username = user;
        globals.password = hash;

        sendLogin();
    });

    // Make the tooltip for the Discord icon at the bottom of the screen
    const discordContent = 'Discord is a voice and text chat application that you can run in a browser.<br />If the server is down, you can probably find out why in the Hanabi server / chat room.';
    $('#title-discord').tooltipster({
        theme: 'tooltipster-shadow',
        delay: 0,
        content: discordContent,
        contentAsHTML: true,
    });
});

const formError = (msg) => {
    // For some reason this has to be invoked asycnronously to work
    setTimeout(() => {
        $('#login-ajax').hide();
        $('#login-button').removeClass('disabled');
        $('#login-alert').html(msg);
        $('#login-alert').fadeIn(globals.fadeTime);
    }, 0);
};

const sendLogin = () => {
    $('#login-button').addClass('disabled');
    $('#login-explanation').hide();
    $('#login-ajax').show();

    // Send a login request to the server; if successful, we will get a cookie back
    let url = `${window.location.protocol}//${window.location.hostname}`;
    if (window.location.port !== '') {
        url += `:${window.location.port}`;
    }
    url += '/login';
    const postData = {
        username: globals.username,
        password: globals.password,
    };
    const request = $.ajax({
        url,
        type: 'POST',
        data: postData,
    });
    console.log(`Sent a login request to: ${url}`);

    request.done((data) => {
        // We successfully got a cookie; attempt to establish a WebSocket connection
        websocket.set();
    });
    request.fail((jqXHR) => {
        formError(`Login failed: ${getAjaxError(jqXHR)}`);
    });
};

const getAjaxError = (jqXHR) => {
    if (jqXHR.readyState === 0) {
        return 'A network error occured. The server might be down!';
    } else if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }

    return jqXHR.responseText;
};
