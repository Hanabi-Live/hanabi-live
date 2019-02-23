/*
    Functions for timed games
    (and the timer that ticks up in untimed games)
*/

// Imports
const globals = require('./globals');
const graphics = require('./graphics');

// Variables
let timerID;
let playerTimes;
let activeIndex;
let lastTimerUpdateTimeMS;

exports.init = () => {
    timerID = null;
    playerTimes = null;
    activeIndex = null;
    lastTimerUpdateTimeMS = null;
};

// Has the following data:
/*
    {
        // A list of the times for each player
        times: [
            100,
            200,
        ],
        // The index of the active player
        active: 0,
    }
*/
exports.update = (data) => {
    stop();

    // We don't need to update the timers if they are not showing
    if (
        globals.elements.timer1 === null
        || globals.elements.timer2 === null
    ) {
        return;
    }

    // Record the data
    playerTimes = data.times;
    activeIndex = data.active;

    // Mark the time that we updated the local player times
    lastTimerUpdateTimeMS = new Date().getTime();

    // Update onscreen time displays
    if (!globals.spectating) {
        // The visibilty of this timer does not change during a game
        let time = playerTimes[globals.playerUs];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }
        globals.elements.timer1.setText(millisecondsToTimeDisplay(time));
    }

    const ourTurn = activeIndex === globals.playerUs && !globals.spectating;
    if (!ourTurn) {
        // Update the UI with the value of the timer for the active player
        let time = playerTimes[activeIndex];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }
        globals.elements.timer2.setText(millisecondsToTimeDisplay(time));
    }

    const shoudShowTimer2 = !ourTurn && activeIndex !== -1;
    globals.elements.timer2.setVisible(shoudShowTimer2);
    globals.layers.timer.batchDraw();

    // Update the timer tooltips for each player
    for (let i = 0; i < playerTimes.length; i++) {
        setTickingDownTimeTooltip(i);
    }

    // The server will send an active value of -1 when the game is over
    if (activeIndex === -1) {
        return;
    }

    // Start the local timer for the active player
    const activeTimerUIText = (ourTurn ? globals.elements.timer1 : globals.elements.timer2);
    timerID = window.setInterval(() => {
        setTickingDownTime(activeTimerUIText);
        setTickingDownTimeTooltip(activeIndex);
    }, 1000);
};

const stop = () => {
    if (timerID !== null) {
        window.clearInterval(timerID);
        timerID = null;
    }
};
exports.stop = stop;

function setTickingDownTime(text) {
    // Compute elapsed time since last timer update
    const now = new Date().getTime();
    const timeElapsed = now - lastTimerUpdateTimeMS;
    lastTimerUpdateTimeMS = now;
    if (timeElapsed < 0) {
        return;
    }

    // Update the time in local array to approximate server times
    playerTimes[activeIndex] -= timeElapsed;
    if (globals.timed && playerTimes[activeIndex] < 0) {
        // Don't let the timer go into negative values, or else it will mess up the display
        // (but in non-timed games, we want this to happen)
        playerTimes[activeIndex] = 0;
    }

    let millisecondsLeft = playerTimes[activeIndex];
    if (!globals.timed) {
        // Invert it to show how much time each player is taking
        millisecondsLeft *= -1;
    }
    const displayString = millisecondsToTimeDisplay(millisecondsLeft);

    // Update display
    text.setText(displayString);
    text.getLayer().batchDraw();

    // Play a sound to indicate that the current player is almost out of time
    // Do not play it more frequently than about once per second
    if (
        globals.timed
        && globals.lobby.settings.sendTimerSound
        && millisecondsLeft > 0 // Between 0 and 10 seconds
        && millisecondsLeft <= 10000
        && timeElapsed > 900
        && timeElapsed < 1100
        && !globals.lobby.errorOccured
    ) {
        globals.game.sounds.play('tone');
    }
}

function setTickingDownTimeTooltip(i) {
    let time = playerTimes[i];
    if (!globals.timed) {
        // Invert it to show how much time each player is taking
        time *= -1;
    }

    let content = 'Time ';
    if (globals.timed) {
        content += 'remaining';
    } else {
        content += 'taken';
    }
    content += ':<br /><strong>';
    content += millisecondsToTimeDisplay(time);
    content += '</strong>';
    $(`#tooltip-player-${i}`).tooltipster('instance').content(content);
}

/*
    The UI timer object
*/

const TimerDisplay = function TimerDisplay(config) {
    graphics.Group.call(this, config);

    const rectangle = new graphics.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: 'black',
        cornerRadius: config.cornerRadius,
        opacity: 0.2,
        listening: false,
    });
    this.add(rectangle);

    const label = new graphics.Text({
        x: 0,
        y: 6 * config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.labelFontSize || config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: config.label,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(label);

    const text = new graphics.Text({
        x: 0,
        y: config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: '??:??',
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(text);

    this.setText = s => text.setText(s);
};
graphics.Util.extend(TimerDisplay, graphics.Group);
exports.TimerDisplay = TimerDisplay;

/*
    Misc. functions
*/

const millisecondsToTimeDisplay = (milliseconds) => {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
};
const pad2 = (num) => {
    if (num < 10) {
        return `0${num}`;
    }
    return `${num}`;
};
