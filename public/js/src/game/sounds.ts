/*
    In-game sounds
*/

// Imports
import globals from '../globals';

export const init = () => {
    // Preload some sounds
    if (!globals.settings.get('soundMove') || globals.settings.get('volume') === 0) {
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

export const play = (file: string) => {
    const path = `/public/sounds/${file}.mp3`;
    const audio = new Audio(path);
    // HTML5 audio volume is a range between 0.0 to 1.0,
    // but volume is stored in the settings as an integer from 0 to 100
    let volume = globals.settings.get('volume');
    if (typeof volume !== 'number') {
        volume = 50;
    }
    audio.volume = volume / 100;
    audio.play();
    // If audio playback fails,
    // it is most likely due to the user not having interacted with the page yet
    // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
};
