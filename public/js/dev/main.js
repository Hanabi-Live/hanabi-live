// Pixi4 (a graphics library)
// const pixi = require('pixi.js');

// Golem (a WebSocket client)
// const golem = require('../lib/golem2');

const globals = require('./globals');
require('./modals');
require('./keyboard');
const cookie = require('./cookie');
require('./lobby/main');

$(document).ready(() => {
    preloadSounds();
    automaticallyLogin();
});

const preloadSounds = () => {
    // Preload some sounds by playing them at 0 volume
    if (!this.sendTurnSound) {
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

    if (!this.username || !this.password) {
        return;
    }
    console.log('Automatically logging in from cookie credentials.');
    this.sendLogin();
};
