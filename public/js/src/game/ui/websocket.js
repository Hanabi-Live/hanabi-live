/*
    We will receive WebSocket messages / commands from the server that tell us to do things
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const convert = require('./convert');
const notes = require('./notes');
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
    if (globals.queuedAction !== null) {
        // Get rid of the pre-move button, since it is now our turn
        globals.elements.premoveCancelButton.setVisible(false);
        globals.layers.UI.batchDraw();

        // Prevent pre-cluing if the team is now at 0 clues
        if (globals.queuedAction.data.type === constants.ACT.CLUE && globals.clues === 0) {
            return;
        }

        // Prevent discarding if the team is now at 8 clues
        if (globals.queuedAction.data.type === constants.ACT.DISCARD && globals.clues === 8) {
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

    // Initialize solo replays to the first turn (otherwise, nothing will be drawn)
    if (globals.replay && !globals.sharedReplay) {
        replay.goto(0, true);
    }

    globals.layers.card.batchDraw();
    globals.layers.UI.batchDraw();
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
    for (let i = 0; i < data.list.length; i++) {
        globals.elements.nameFrames[i].setConnected(data.list[i]);
    }

    globals.layers.UI.batchDraw();
};

// The game just finished
commands.gameOver = () => {
    // If any player time tooltips are open, close them
    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.nameFrames[i].off('mousemove');
    }

    // If the timers are showing, hide them
    if (globals.elements.timer1) {
        globals.elements.timer1.hide();
        globals.elements.timer2.hide();
    }
    timer.stop();
    globals.layers.timer.batchDraw();

    // Transform this game into a shared replay
    globals.replay = true;
    globals.sharedReplay = true;
    globals.sharedReplayTurn = globals.replayTurn;

    // Open the replay UI if we were not in an in-game replay when the game ended
    if (!globals.inReplay) {
        replay.enter();
    }

    /*
        If we are in an in-game replay when the game ends, we need to jerk them away from what they
        are doing and go to the end of the game. This is because we need to process all of the
        queued "notify" messages. (Otherwise, the code will try to "reveal" cards that are
        undefined.)
    */

    // The final turn displays how long everyone took, so we want to go to the turn before that
    replay.goto(globals.replayMax - 1);

    // Hide the "Exit Replay" button in the center of the screen, since it is no longer necessary
    globals.elements.replayExitButton.hide();

    // Hide some buttons in the bottom-left-hand corner
    globals.elements.replayButton.hide();
    if (!globals.speedrun) {
        globals.elements.chatButton.show();
    } else {
        globals.elements.restartButton.show();
    }
    if (globals.elements.killButton !== null) {
        globals.elements.killButton.hide();
    }

    globals.layers.UI.batchDraw();
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
    globals.speedrun = data.speedrun;
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
        // We need to update the replay slider, based on the new amount of turns
        globals.replayMax = data.num;
        if (globals.inReplay) {
            replay.adjustShuttles();
            globals.layers.UI.batchDraw();
        }

        // On the second turn and beyond, ensure that the "In-Game Replay" button is enabled
        if (!globals.replay && globals.replayMax > 0) {
            globals.elements.replayButton.setEnabled(true);
        }
    }

    // Now that it is recorded, change the actual active game state
    // (unless we are in an in-game replay)
    if (!globals.inReplay) {
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
            "",
            "",
            "<strong>Zamiel:</strong> b3<br /><strong>Sankala:</strong> f<br />",
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
    // Store who the shared replay leader is
    globals.sharedReplayLeader = data.name;

    // Update the UI and play an animation to indicate there is a new replay leader
    globals.elements.sharedReplayLeaderLabel.show();
    const weAreLeader = globals.sharedReplayLeader === globals.lobby.username;
    globals.elements.sharedReplayLeaderCircle.setVisible(weAreLeader);
    globals.elements.toggleSharedTurnButton.show();
    globals.elements.sharedReplayLeaderLabelPulse.play();
    globals.layers.UI.batchDraw();

    // Update the tooltip
    let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
    if (!globals.spectators.includes(globals.sharedReplayLeader)) {
        // Check to see if the leader is away
        content += ' (away)';
    }
    $('#tooltip-leader').tooltipster('instance').content(content);
};

// This is used in shared replays to make hypothetical game states
commands.replayMorph = (data) => {
    commands.reveal({
        order: data.order,
        rank: data.rank,
        suit: data.suit,
    });
};

// This is used in shared replays to make fun sounds
commands.replaySound = (data) => {
    globals.game.sounds.play(data.sound);
};

// This is used in shared replays to change the turn
commands.replayTurn = (data) => {
    if (
        // If we are the replay leader, then we don't have to do anything
        globals.sharedReplayLeader === globals.lobby.username
        // Make an exception for when we are first loading the game
        && globals.sharedReplayTurn !== -1
    ) {
        return;
    }

    const oldTurn = globals.sharedReplayTurn;
    globals.sharedReplayTurn = data.turn;
    replay.adjustShuttles();
    if (globals.useSharedTurns) {
        replay.goto(globals.sharedReplayTurn, globals.sharedReplayLoading);

        if (!globals.sharedReplayLoading) {
            // Play an animation to indicate the direction that the leader has taken us in
            if (oldTurn > globals.sharedReplayTurn && oldTurn !== -1) {
                console.log('Playing backward tween (debug).');
                globals.elements.sharedReplayBackwardTween.play();
            } else if (oldTurn < globals.sharedReplayTurn && oldTurn !== -1) {
                console.log('Playing forward tween (debug).');
                globals.elements.sharedReplayForwardTween.play();
            }
            globals.layers.UI.batchDraw();
        }

        if (globals.sharedReplayLoading) {
            globals.sharedReplayLoading = false;
        }
    } else {
        // Even though we are not using the shared turns,
        // we need to update the slider to show where the replay leader changed the turn to
        globals.layers.UI.batchDraw();
    }
};

/*
    Has the following data:
    {
        type: 'reveal',
        which: {
            order: 5,
            rank: 2,
            suit: 1,
        },
    }
*/
commands.reveal = (data) => {
    // Local variables
    const suit = convert.msgSuitToSuit(data.suit, globals.variant);
    const card = globals.deck[data.order];

    const learnedCard = globals.learnedCards[data.order];
    learnedCard.suit = suit;
    learnedCard.rank = data.rank;
    learnedCard.possibleSuits = [suit];
    learnedCard.possibleRanks = [data.rank];
    learnedCard.revealed = true;

    card.showOnlyLearned = false;
    card.trueSuit = suit;
    card.trueRank = data.rank;
    card.setBareImage();

    card.suitPips.hide();
    card.rankPips.hide();

    if (!globals.animateFast) {
        globals.layers.card.batchDraw();
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
