/*
    In-game sounds
*/

// Imports
const globals = require('../globals');

$(document).ready(() => {
    preload();
});

exports.play = (file) => {
    const path = `/public/sounds/${file}.mp3`;
    const audio = new Audio(path);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Audio playback was successful; do nothing
        }).catch(() => {
            // Audio playback failed
            // This is most likely due to the user not having interacted with the page yet
            // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
        });
    }
};

const preload = () => {
    if (!globals.settings.sendTurnSound) {
        return;
    }

    const soundFiles = [
        'blind1',
        'blind2',
        'blind3',
        'blind4',
        'fail1',
        'fail2',
        'finished_fail',
        'finished_success',
        'sad',
        'tone',
        'turn_other',
        'turn_us',
        // Do not preload shared replay sound effects, as they are used more rarely
    ];
    for (const file of soundFiles) {
        const audio = new Audio(`/public/sounds/${file}.mp3`);
        audio.load();
    }
};
