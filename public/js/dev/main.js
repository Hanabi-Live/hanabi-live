/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports and easily split up the client code into multiple files
const globals = require('./globals');
require('./modals');
require('./keyboard');
const cookie = require('./cookie');
require('./lobby/main');
const login = require('./lobby/login');
require('./game/main');

$(document).ready(() => {
    preloadSounds();
    automaticallyLogin();
});

const preloadSounds = () => {
    // Preload some sounds by playing them at 0 volume
    if (!globals.settings.sendTurnSound) {
        return;
    }

    const soundFiles = [
        'blind1',
        'blind2',
        'blind3',
        'blind4',
        'fail',
        'tone',
        'turn_other',
        'turn_us',
    ];
    for (const file of soundFiles) {
        const audio = new Audio(`public/sounds/${file}.mp3`);
        audio.volume = 0;
        audio.play();
    }
};

const automaticallyLogin = () => {
    // Automatically sign in to the WebSocket server if we have cached credentials
    globals.username = cookie.get('hanabiuser');
    globals.password = cookie.get('hanabipass');
    if (globals.username) {
        $('#login-username').val(globals.username);
        $('#login-password').focus();
    }

    if (!globals.username || !globals.password) {
        return;
    }
    console.log('Automatically logging in from cookie credentials.');
    login.send();
};
