/*
    The initial login page
*/

// Imports
const globals = require('../globals');
const lobby = require('./main');
const websocket = require('../websocket');

$(document).ready(() => {
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

    automaticLogin();
});

const submit = (event) => {
    // By default, the form will reload the page, so stop this from happening
    event.preventDefault();

    const username = $('#login-username').val();
    const passwordPlaintext = $('#login-password').val();

    if (!username) {
        formError('You must provide a username.');
        return;
    }
    if (!passwordPlaintext) {
        formError('You must provide a password.');
        return;
    }

    // We salt the password with a prefix of "Hanabi password "
    // and then hash it with SHA256 before sending it to the server
    const password = hex_sha256(`Hanabi password ${passwordPlaintext}`);

    localStorage.setItem('hanabiuser', username);
    localStorage.setItem('hanabipass', password);

    globals.username = username;
    globals.password = password;

    send();
};

const formError = (msg) => {
    // For some reason this has to be invoked asycnronously in order to work properly
    setTimeout(() => {
        $('#login-ajax').hide();
        $('#login-button').removeClass('disabled');
        $('#login-alert').html(msg);
        $('#login-alert').fadeIn(globals.fadeTime);
    }, 0);
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
        websocket.set();
    });
    request.fail((jqXHR) => {
        formError(`Login failed: ${getAjaxError(jqXHR)}`);
    });
};

const getAjaxError = (jqXHR) => {
    if (jqXHR.readyState === 0) {
        return 'A network error occured. The server might be down!';
    }
    if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }
    return jqXHR.responseText;
};

const automaticLogin = () => {
    // Don't automatically login if they are on Firefox and have not confirmed the warning dialog
    // (cookies are strings, so we cannot check for equality)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
        return;
    }

    // Automatically sign in to the WebSocket server if we have cached credentials
    globals.username = localStorage.getItem('hanabiuser');
    globals.password = localStorage.getItem('hanabipass');
    if (globals.username) {
        $('#login-username').val(globals.username);
        $('#login-password').focus();
    }

    if (!globals.username || !globals.password) {
        return;
    }
    console.log('Automatically logging in from cookie credentials.');
    send();
};

exports.hide = (firstTimeUser) => {
    // Hide the login screen
    $('#login').hide();

    if (firstTimeUser) {
        $('#tutorial').fadeIn(globals.fadeTime);
        return;
    }
    $('#tutorial').hide();

    /*
        Disable scroll bars
        Even with height and width 100%,
        the scroll bar can pop up when going back from a game to the lobby
        It also can show up in-game if a tooltip animates off of the edge of the screen
        So we can set "overflow" to explicitly prevent this from occuring
        We don't want to set this in "hanabi.css" because
        there should be scrolling enabled on the login screen
        We need to scroll to the top of the screen before disabling the scroll bars
        or else the lobby can become misaligned when logging in from a scroll-down state
    */
    window.scrollTo(0, 0);
    $('body').css('overflow', 'hidden');

    // Show the lobby
    globals.currentScreen = 'lobby';
    $('#lobby').show();
    $('#lobby-history').hide();
    // We can't hide this element by default in "index.html" or else the "No game history" text
    // will not be centered
    lobby.nav.show('games');
    lobby.users.draw();
    lobby.tables.draw();
    $('#lobby-chat-input').focus();
};
