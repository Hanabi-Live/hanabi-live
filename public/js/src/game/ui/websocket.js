/*
    We will receive WebSocket messages / commands from the server that tell us to do things
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const notes = require('./notes');
const notify = require('./notify');
const replay = require('./replay');
const timer = require('./timer');

// Define a command handler map
const commands = {};

commands.action = (data) => {
    globals.lastAction = data;
    globals.lobby.ui.handleAction.call(this, data);

    if (globals.animateFast) {
        return;
    }

    if (globals.lobby.settings.sendTurnNotify) {
        globals.lobby.sendNotify('It\'s your turn', 'turn');
    }

    // Handle pre-playing / pre-discarding / pre-cluing
    if (globals.queuedAction === null) {
        // Prevent pre-cluing if the team is now at 0 clues
        if (globals.queuedAction.type === constants.ACT.CLUE && globals.clues === 0) {
            return;
        }

        // We don't want to send the queued action right away, or else it introduces bugs
        setTimeout(() => {
            globals.lobby.conn.send(globals.queuedAction.type, globals.queuedAction.data);
            globals.lobby.ui.stopAction();
            globals.queuedAction = null;
        }, 250);
    }
};

// This is sent to the client upon game initialization (in the "commandReady.go" file)
commands.advanced = () => {
    globals.animateFast = false;

    if (globals.inReplay) {
        replay.goto(0);
    }

    globals.layers.card.draw();
    globals.layers.UI.draw(); // We need to re-draw the UI or else the action text will not appear
};

// This is sent by the server to force the client to go back to the lobby
commands.boot = () => {
    timer.stop();
    globals.game.hide();
};

// Update the clocks to show how much time people are taking
// or how much time people have left
commands.clock = (data) => {
    timer.update(data);
};

commands.connected = (data) => {
    if (!globals.ready) {
        return;
    }

    for (let i = 0; i < data.list.length; i++) {
        globals.elements.nameFrames[i].setConnected(data.list[i]);
    }

    globals.layers.UI.draw();
};

commands.init = (data) => {
    // Game settings
    globals.playerNames = data.names;
    globals.variant = constants.VARIANTS[data.variant];
    globals.playerUs = data.seat;
    globals.spectating = data.spectating;
    globals.replay = data.replay;
    globals.sharedReplay = data.sharedReplay;

    // Optional settings
    globals.timed = data.timed;
    globals.baseTime = data.baseTime;
    globals.timePerTurn = data.timePerTurn;
    globals.deckPlays = data.deckPlays;
    globals.emptyClues = data.emptyClues;
    globals.characterAssignments = data.characterAssignments;
    globals.characterMetadata = data.characterMetadata;

    globals.inReplay = globals.replay;
    if (globals.replay) {
        globals.replayTurn = -1;
    }

    // Begin to load all of the card images
    globals.ImageLoader.start();
};

// Used when the game state changes
commands.notify = (data) => {
    // We need to save this game state change for the purposes of the in-game replay
    globals.replayLog.push(data);
    if (data.type === 'turn') {
        globals.replayMax = data.num;
    }
    if (data.type === 'gameOver') {
        globals.replayMax += 1;
    }
    if (!globals.replay && globals.replayMax > 0) {
        globals.elements.replayButton.show();
    }
    if (globals.inReplay) {
        replay.adjustShuttles();
        globals.layers.UI.draw();
    }

    // Now that it is recorded, change the actual active game state
    // (unless we are in an in-game replay)
    if (!globals.inReplay || data.type === 'reveal') {
        globals.lobby.ui.handleNotify(data);
    }
};

/*
    Recieved by the client when spectating a game
    Has the following data:
    {
        order: 16,
        note: '<strong>Zamiel:</strong> note1<br /><strong>Duneaught:</strong> note2<br />',
    }
*/
commands.note = (data) => {
    // Set the note
    // (which is the combined notes from all of the players, formatted by the server)
    notes.set(data.order, data.notes, false);

    // Draw (or hide) the note indicator
    const card = globals.deck[data.order];
    if (!card) {
        return;
    }

    // Show or hide the note indicator
    if (data.notes.length > 0) {
        card.noteGiven.show();
        if (!card.noteGiven.rotated) {
            card.noteGiven.rotate(15);
            card.noteGiven.rotated = true;
        }
    } else {
        card.noteGiven.hide();
    }

    globals.layers.card.batchDraw();
};

/*
    Recieved by the client when:
    - joining a replay (will get all notes)
    - joining a shared replay (will get all notes)
    - joining an existing game as a spectator (will get all notes)
    - reconnecting an existing game as a player (will only get your own notes)

    Has the following data:
    {
        notes: [
            null,
            null,
            null,
            zamiel: 'g1\nsankala: g1/g2',
        ],
    }
*/
commands.notes = (data) => {
    for (let order = 0; order < data.notes.length; order++) {
        const note = data.notes[order];

        // Set the note
        notes.set(order, note, false);

        // The following code is mosly copied from the "command.note()" function
        // Draw (or hide) the note indicator
        const card = globals.deck[order];
        if (!card) {
            continue;
        }
        if (note !== null && note !== '') {
            card.note = note;
        }
        if (note !== null && note !== '') {
            card.noteGiven.show();
            if (globals.spectating && !card.noteGiven.rotated) {
                card.noteGiven.rotate(15);
                card.noteGiven.rotated = true;
            }
        }
    }

    globals.layers.card.batchDraw();
};

commands.notifyList = (dataList) => {
    for (const data of dataList) {
        commands.notify(data);
    }
};

// This is used in shared replays to highlight a specific card
commands.replayIndicator = (data) => {
    if (globals.sharedReplayLeader === globals.lobby.username) {
        // We don't have to draw any indicator arrows;
        // we already did it manually immediately after sending the "replayAction" message
        return;
    }

    // Ensure that the card exists as a sanity-check
    const card = globals.deck[data.order];
    if (!card) {
        return;
    }

    card.toggleSharedReplayIndicator();
};

// This is used in shared replays to specify who the leader is
commands.replayLeader = (data) => {
    // We might be entering this function after a game just ended
    globals.sharedReplay = true;
    globals.elements.replayExitButton.hide();

    // Update the stored replay leader
    globals.sharedReplayLeader = data.name;

    // Update the UI
    globals.elements.sharedReplayLeaderLabel.show();
    let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
    if (!globals.spectators.includes(globals.sharedReplayLeader)) {
        // Check to see if the leader is away
        content += ' (away)';
    }
    $('#tooltip-leader').tooltipster('instance').content(content);

    globals.elements.sharedReplayLeaderLabelPulse.play();

    globals.elements.toggleSharedTurnButton.show();
    globals.layers.UI.draw();
};

// This is used in shared replays to make hypothetical game states
commands.replayMorph = (data) => {
    notify.reveal({
        which: {
            order: data.order,
            rank: data.rank,
            suit: data.suit,
        },
    });
};

// This is used in shared replays to make fun sounds
commands.replaySound = (data) => {
    if (globals.sharedReplayLeader === globals.lobby.username) {
        // We don't have to play anything;
        // we already did it manually after sending the "replayAction" message
        return;
    }

    globals.game.sounds.play(data.sound);
};

// This is used in shared replays to change the turn
commands.replayTurn = (data) => {
    globals.sharedReplayTurn = data.turn;
    replay.adjustShuttles();
    if (globals.useSharedTurns) {
        replay.goto(globals.sharedReplayTurn);
    } else {
        globals.elements.replayShuttleShared.getLayer().batchDraw();
    }
};

// This is used to update the names of the people currently spectating the game
commands.spectators = (data) => {
    if (!globals.elements.spectatorsLabel) {
        // Sometimes we can get here without the spectators label being initiated yet
        return;
    }

    // Remember the current list of spectators
    globals.spectators = data.names;

    const shouldShowLabel = data.names.length > 0;
    globals.elements.spectatorsLabel.setVisible(shouldShowLabel);
    globals.elements.spectatorsNumLabel.setVisible(shouldShowLabel);
    if (shouldShowLabel) {
        globals.elements.spectatorsNumLabel.setText(data.names.length);

        // Build the string that shows all the names
        const nameEntries = data.names.map(name => `<li>${name}</li>`).join('');
        let content = '<strong>';
        if (globals.replay) {
            content += 'Shared Replay Viewers';
        } else {
            content += 'Spectators';
        }
        content += `:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
        $('#tooltip-spectators').tooltipster('instance').content(content);
    } else {
        $('#tooltip-spectators').tooltipster('close');
    }

    // We might also need to update the content of replay leader icon
    if (globals.sharedReplay) {
        let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
        if (!globals.spectators.includes(globals.sharedReplayLeader)) {
            // Check to see if the leader is away
            content += ' (away)';
        }
        $('#tooltip-leader').tooltipster('instance').content(content);
    }

    globals.layers.UI.batchDraw();
};

module.exports = commands;
