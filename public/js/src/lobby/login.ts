/*
    The initial login page
*/

// Imports
import shajs from 'sha.js';
import globals from '../globals';
import * as loginMisc from './loginMisc';
import websocketInit from '../websocketInit';

export const init = () => {
    $('#login-button').click(() => {
        $('#login-form').submit();
    });
    $('#login-form').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#login-form').submit();
        }
    });
    $('#login-form').submit(submit);

    // Make the tooltip for the Discord icon at the bottom of the screen
    let discordContent = 'Discord is a voice and text chat application that you can run in a ';
    discordContent += 'browser.<br />If the server is down, you can probably find out why in the ';
    discordContent += 'Hanabi server / chat room.';
    $('#title-discord').tooltipster({
        theme: 'tooltipster-shadow',
        delay: 0,
        content: discordContent,
        contentAsHTML: true,
    });

    // Check to see if we have accepted the Firefox warning
    // (cookies are strings, so we cannot check for equality)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
        $('#sign-in').hide();
        $('#firefox-warning').show();
    }
    $('#firefox-warning-button').click(() => {
        localStorage.setItem('acceptedFirefoxWarning', 'true');
        $('#firefox-warning').hide();
        $('#sign-in').show();
    });
};

const submit = (event: any) => {
    // By default, the form will reload the page, so stop this from happening
    event.preventDefault();

    let username = $('#login-username').val();
    if (!username) {
        loginMisc.formError('You must provide a username.');
        return;
    }
    if (typeof username !== 'string') {
        username = username.toString();
    }

    const passwordPlaintext = $('#login-password').val();
    if (!passwordPlaintext) {
        loginMisc.formError('You must provide a password.');
        return;
    }

    // We salt the password with a prefix of "Hanabi password "
    // and then hash it with SHA256 before sending it to the server
    const stringToHash = `Hanabi password ${passwordPlaintext}`;
    const password = shajs('sha256').update(stringToHash).digest('hex');

    localStorage.setItem('hanabiuser', username);
    localStorage.setItem('hanabipass', password);

    globals.username = username;
    globals.password = password;

    send();
};

const send = () => {
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

    request.done(() => {
        // We successfully got a cookie; attempt to establish a WebSocket connection
        websocketInit();
    });
    request.fail((jqXHR) => {
        loginMisc.formError(`Login failed: ${getAjaxError(jqXHR)}`);
    });
};

const getAjaxError = (jqXHR: any) => {
    if (jqXHR.readyState === 0) {
        return 'A network error occured. The server might be down!';
    }
    if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }
    return jqXHR.responseText;
};

export const automaticLogin = () => {
    // Don't automatically login if they are on Firefox and have not confirmed the warning dialog
    // (cookies are strings, so we cannot check for equality)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
        return;
    }

    // Automatically sign in to the WebSocket server if we have cached credentials
    const username = localStorage.getItem('hanabiuser');
    if (username === null || username === '') {
        return;
    }
    globals.username = username;

    $('#login-username').val(globals.username);
    $('#login-password').focus();

    const password = localStorage.getItem('hanabipass');
    if (password === null || password === '') {
        return;
    }
    globals.password = password;

    console.log('Automatically logging in from cookie credentials.');
    send();
};
