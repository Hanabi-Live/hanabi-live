/*
    We will receive WebSocket messages / commands from the server that tell us to do things
*/

// Imports
import * as action from './action';
import * as arrows from './arrows';
import {
    ACTION,
    CLUE_TYPE,
    MAX_CLUE_NUM,
    REPLAY_ARROW_ORDER,
    VARIANTS,
} from '../../constants';
import fadeCheck from './fadeCheck';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import * as notifications from '../../notifications';
import notify from './notify';
import * as replay from './replay';
import state from './state';
import strikeRecord from './strikeRecord';
import * as stats from './stats';
import * as timer from './timer';
import * as ui from './ui';

// Define a command handler map
const commands = {};
export default commands;

commands.action = (data) => {
    globals.lastAction = data;
    action.handle(data);

    if (globals.animateFast) {
        return;
    }

    if (globals.lobby.settings.sendTurnNotify) {
        notifications.send('It is your turn.', 'turn');
    }

    // Handle pre-playing / pre-discarding / pre-cluing
    if (globals.queuedAction !== null) {
        // Get rid of the pre-move button, since it is now our turn
        globals.elements.premoveCancelButton.hide();
        globals.layers.UI.batchDraw();

        if (globals.queuedAction.data.type === ACTION.CLUE) {
            // Prevent pre-cluing if the team is now at 0 clues
            if (globals.clues === 0) {
                return;
            }

            // Prevent pre-cluing if the card is no longer in the hand
            const card = globals.deck[globals.preCluedCard];
            if (
                globals.queuedAction.data.type === ACTION.CLUE
                && (card.isPlayed || card.isDiscarded)
            ) {
                return;
            }
        }

        // Prevent discarding if the team is at the maximum amount of clues
        if (
            globals.queuedAction.data.type === ACTION.DISCARD
            && globals.clues === MAX_CLUE_NUM
        ) {
            return;
        }

        // We don't want to send the queued action right away, or else it introduces bugs
        setTimeout(() => {
            globals.lobby.conn.send(globals.queuedAction.type, globals.queuedAction.data);
            globals.queuedAction = null;
            globals.preCluedCard = null;
            action.stop();
        }, 100);
    }
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
    // If any tooltips are open, close them
    if (globals.activeHover !== null) {
        globals.activeHover.off('mousemove');
        globals.activeHover = null;
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

    // Turn off the flag that tracks when the game is over
    // (before the "gameOver" command is receieved)
    // (this must be after the "replay.enter()" function)
    globals.gameOver = false;

    /*
        If we are in an in-game replay when the game ends, we need to jerk them away from what they
        are doing and go to the end of the game. This is because we need to process all of the
        queued "notify" messages. (Otherwise, the code will try to "reveal" cards that are
        undefined.)
    */

    // The final turn displays how long everyone took,
    // so we want to go to the turn before that, which we recorded earlier
    replay.goto(globals.finalReplayTurn, true);

    // Hide the "Exit Replay" button in the center of the screen, since it is no longer necessary
    globals.elements.replayExitButton.hide();

    // Hide/show some buttons in the bottom-left-hand corner
    globals.elements.replayButton.hide();
    globals.elements.killButton.hide();
    globals.elements.lobbyButtonSmall.hide();
    globals.elements.lobbyButtonBig.show();

    // Turn off the "Throw It in a Hole" UI
    if (globals.variant.name.startsWith('Throw It in a Hole')) {
        globals.elements.scoreNumberLabel.setText(globals.score.toString());
        globals.elements.maxScoreNumberLabel.show();
    }

    globals.layers.UI.batchDraw();
};

commands.hypoAction = (data) => {
    const notifyMessage = JSON.parse(data);

    // We need to save this game state change for the purposes of the in-game hypothetical
    globals.hypoActions.push(notifyMessage);

    notify(notifyMessage);
};

commands.hypoEnd = () => {
    if (!globals.amSharedReplayLeader) {
        hypothetical.end();
    }
};

commands.hypoStart = () => {
    if (!globals.amSharedReplayLeader) {
        hypothetical.start();
    }
};

commands.databaseID = (data) => {
    globals.databaseID = data.id;
    globals.elements.gameIDLabel.setText(`ID: ${globals.databaseID}`);
    globals.elements.gameIDLabel.show();

    // Also move the card count label on the deck downwards
    if (globals.deckSize === 0) {
        globals.elements.deck.nudgeCountDownwards();
    }

    globals.layers.UI2.batchDraw();
};

commands.init = (data) => {
    // Game settings
    globals.lobby.tableID = data.tableID; // Equal to the table ID on the server
    globals.playerNames = data.names;
    globals.variant = VARIANTS.get(data.variant);
    globals.playerUs = data.seat; // 0 if a spectator or a replay of a game that we were not in
    globals.spectating = data.spectating;
    globals.replay = data.replay;
    globals.sharedReplay = data.sharedReplay;
    globals.databaseID = data.databaseID; // 0 if this is an ongoing game

    // Optional settings
    globals.timed = data.timed;
    globals.baseTime = data.baseTime;
    globals.timePerTurn = data.timePerTurn;
    globals.speedrun = data.speedrun;
    globals.deckPlays = data.deckPlays;
    globals.emptyClues = data.emptyClues;
    globals.characterAssignments = data.characterAssignments;
    globals.characterMetadata = data.characterMetadata;

    // Hypothetical settings
    globals.hypothetical = data.hypothetical;
    globals.hypoActions = data.hypoActions;
    for (let i = 0; i < globals.hypoActions.length; i++) {
        globals.hypoActions[i] = JSON.parse(globals.hypoActions[i]);
    }

    // Other features
    globals.paused = data.paused;
    globals.pausePlayer = data.pausePlayer;
    globals.pauseQueued = data.pauseQueued;

    // Open the replay UI if we are in a replay
    globals.inReplay = globals.replay;
    if (globals.replay) {
        globals.replayTurn = -1;
    }

    // Begin to load all of the card images
    globals.ImageLoader.start();
    // (more initialization logic is found in the "finishedLoadingImages()" function)
};

/*
    Received by the client when spectating a game
    Has the following data:
    {
        order: 16,
        notes: [
            {
                name: 'Zamiel',
                note: 'b1',
            },
            {
                name: 'Sankala',
                note: 'r1',
            },
        ]
    }
*/
commands.note = (data) => {
    // If we are not spectating and we got this message, something has gone wrong
    if (!globals.spectating) {
        return;
    }

    // Store the combined notes for this card
    globals.allNotes[data.order] = data.notes;

    // Set the note indicator
    notes.setCardIndicator(data.order);
};

/*
    Received by the client when:
    - joining a replay
    - joining a shared replay
    - joining an existing game as a spectator
    (it gives the notes of all the players & spectators)

    Has the following data:
    {
        notes: [
            {
                id: 1,
                name: 'Zamiel',
                notes: ['', '', 'b1', ...],
            },
            {
                id: 2,
                name: 'Sankala',
                notes: ['', 'r1', '', ...],
            },
        ],
    }
*/
commands.noteList = (data) => {
    // Reset any existing notes
    // (we could be getting a fresh copy of all notes after an ongoing game has ended)
    for (let i = 0; i < globals.allNotes.length; i++) {
        globals.allNotes[i] = [];
    }

    // Data comes from the server as an array of player & spectator notes
    // We want to convert this to an array of objects for each card
    for (const noteList of data.notes) {
        // If we are a spectator, copy our notes from the combined list
        if (!globals.replay && globals.spectating && noteList.name === globals.lobby.username) {
            globals.ourNotes = noteList.notes;
        }

        for (let i = 0; i < noteList.notes.length; i++) {
            const note = noteList.notes[i];
            globals.allNotes[i].push({
                name: noteList.name,
                note,
            });
        }
    }

    // Show the note indicator for currently-visible cards
    notes.setAllCardIndicators();
};

/*
    Received by the client when reconnecting to an existing game as a player
    (it only gives the notes of the specific player)

    Has the following data:
    {
        notes: ["", "", "b1", ...],
    }
*/
commands.noteListPlayer = (data) => {
    // Store our notes
    globals.ourNotes = data.notes;

    // Show the note indicator for currently-visible cards
    notes.setAllCardIndicators();

    // Check for special notes
    for (let i = 0; i < globals.indexOfLastDrawnCard; i++) {
        const card = globals.deck[i];
        notes.checkSpecialNote(card);
    }

    // Check for special notes on the stack bases
    for (const stackBase of globals.stackBases) {
        notes.checkSpecialNote(stackBase);
    }
};

// Used when the game state changes
commands.notify = (data) => {
    // Update the state table
    if (Object.prototype.hasOwnProperty.call(state, data.type)) {
        state[data.type](data);
    }

    // We need to save this game state change for the purposes of the in-game replay
    globals.replayLog.push(data);

    if (data.type === 'turn') {
        // Keep track of whether it is our turn or not
        globals.ourTurn = data.who === globals.playerUs;

        // We need to update the replay slider, based on the new amount of turns
        globals.replayMax = data.num;
        if (globals.inReplay) {
            replay.adjustShuttles(false);
            globals.elements.replayForwardButton.setEnabled(true);
            globals.elements.replayForwardFullButton.setEnabled(true);
            globals.layers.UI.batchDraw();
        }

        // On the second turn and beyond, ensure that the "In-Game Replay" button is enabled
        if (!globals.replay && globals.replayMax > 0) {
            globals.elements.replayButton.setEnabled(true);
        }
    } else if (data.type === 'clue' && globals.variant.name.startsWith('Alternating Clues')) {
        if (data.clue.type === CLUE_TYPE.RANK) {
            for (const button of globals.elements.suitClueButtons) {
                button.show();
            }
            for (const button of globals.elements.rankClueButtons) {
                button.hide();
            }
        } else if (data.clue.type === CLUE_TYPE.COLOR) {
            for (const button of globals.elements.suitClueButtons) {
                button.hide();
            }
            for (const button of globals.elements.rankClueButtons) {
                button.show();
            }
        }
    }

    // Now that it is recorded, change the actual drawn game state
    if (
        !globals.inReplay // Unless we are in an in-game replay
        && !globals.gameOver // Unless it is the miscellaneous data sent at the end of a game
    ) {
        notify(data);
    }

    // If the game is over,
    // don't immediately draw the subsequent turns that contain the game times
    if (!globals.gameOver && data.type === 'turn' && data.who === -1) {
        globals.gameOver = true;
        globals.finalReplayPos = globals.replayLog.length;
        globals.finalReplayTurn = data.num;
    }
};

commands.notifyList = (dataList) => {
    // Initialize the state table
    globals.state.deckSize = stats.getTotalCardsInTheDeck(globals.variant);
    globals.state.maxScore = globals.variant.maxScore;
    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.state.hands.push([]);
    }
    for (let i = 0; i < globals.variant.suits.length; i++) {
        globals.state.playStacks.push([]);
        globals.state.discardStacks.push([]);
    }

    // Play through all of the turns
    for (const data of dataList) {
        commands.notify(data);

        // Some specific messages contain global state information that we need to record
        // (since we might be in a replay that is starting on the first turn,
        // the respective notify functions will not be reached until
        // we actually progress to that turn of the replay)
        if (data.type === 'strike') {
            // Record the turns that the strikes happen
            // (or else clicking on the strike squares won't work on a freshly initialized replay)
            strikeRecord(data);
        }
    }

    // The game is now initialized
    globals.animateFast = false;

    // Initialize solo replays to the first turn (otherwise, nothing will be drawn)
    if (globals.replay && !globals.sharedReplay) {
        replay.goto(0, true);
    }

    // Check to see if we are loading a replay to a specific turn
    // (specified in the URL; e.g. "/replay/150/10" for game 150 turn 10)
    const match = window.location.pathname.match(/\/replay\/\d+\/(\d+)/);
    if (match) {
        const turn = parseInt(match[1], 10) - 1;
        replay.goto(turn, true);
    }

    fadeCheck();
    globals.layers.card.batchDraw();
    globals.layers.UI.batchDraw();
    globals.loading = false;
};

commands.pause = (data) => {
    globals.paused = data.paused;
    globals.pausePlayer = data.pausePlayer;

    // Pause or unpause the UI accordingly
    ui.setPause();
};

// This is used in shared replays to highlight a specific card (or UI element)
commands.replayIndicator = (data) => {
    if (globals.loading) {
        // We have not loaded everything yet, so don't bother with shared replay features
        return;
    }

    if (globals.amSharedReplayLeader) {
        // We don't have to draw any indicator arrows;
        // we already drew it after sending the "replayAction" message
        return;
    }

    if (!globals.useSharedTurns) {
        // We are not currently using the shared turns,
        // so the arrow won't apply to what we are looking at
        return;
    }

    if (data.order >= 0) { // A card
        // Ensure that the card exists as a sanity-check
        // (the server does not validate the order that the leader sends)
        let card = globals.deck[data.order];
        if (!card) {
            card = globals.stackBases[data.order - globals.deck.legnth];
        }
        if (!card) {
            return;
        }

        arrows.toggle(card);
    } else { // Some other UI element
        let element;
        if (data.order === REPLAY_ARROW_ORDER.DECK) {
            element = globals.elements.deck;
        } else if (data.order === REPLAY_ARROW_ORDER.CLUES) {
            element = globals.elements.cluesNumberLabel;
        } else if (data.order === REPLAY_ARROW_ORDER.PACE) {
            element = globals.elements.paceNumberLabel;
        } else if (data.order === REPLAY_ARROW_ORDER.EFFICIENCY) {
            element = globals.elements.efficiencyNumberLabel;
        } else if (data.order === REPLAY_ARROW_ORDER.MIN_EFFICIENCY) {
            element = globals.elements.efficiencyNumberLabelMinNeeded;
        } else {
            return;
        }

        arrows.toggle(element);
    }
};

// This is used in shared replays to specify who the leader is
commands.replayLeader = (data) => {
    // Store who the shared replay leader is
    globals.sharedReplayLeader = data.name;
    globals.amSharedReplayLeader = globals.sharedReplayLeader === globals.lobby.username;

    // Update the UI and play an animation to indicate there is a new replay leader
    globals.elements.sharedReplayLeaderLabel.show();
    // (the crown might be invisible if we just finished an ongoing game)
    globals.elements.sharedReplayLeaderCircle.setVisible(globals.amSharedReplayLeader);
    if (data.playAnimation) {
        // We only want the animation to play when the leader changes
        // The server will set "playAnimation" to false when a player is first loading into a game
        // (or when a game ends)
        globals.elements.sharedReplayLeaderLabelPulse.play();
    }

    // Arrange the center buttons in a certain way depending on
    // whether we are the shared replay leader
    globals.elements.toggleSharedTurnButton.show();
    // (the button might be invisible if we just finished an ongoing game)
    if (globals.amSharedReplayLeader) {
        globals.elements.toggleSharedTurnButton.setLeft();
    } else {
        globals.elements.toggleSharedTurnButton.setCenter();
    }
    globals.elements.enterHypoButton.setVisible(globals.amSharedReplayLeader);

    // Enable/disable the restart button
    globals.elements.restartButton.setVisible(globals.amSharedReplayLeader);

    // Hide the replay area if we are in a hypothetical
    if (globals.hypothetical) {
        globals.elements.replayArea.setVisible(false);
        if (globals.amSharedReplayLeader) {
            globals.elements.restartButton.setVisible(false);
            globals.elements.endHypotheticalButton.setVisible(true);
        } else {
            globals.elements.hypoCircle.setVisible(true);
        }
    }

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
    if (globals.loading) {
        // We have not loaded everything yet, so don't bother with shared replay features
        return;
    }

    commands.reveal({
        order: data.order,
        suit: data.suit,
        rank: data.rank,
    });
};

// This is used in shared replays to make fun sounds
commands.replaySound = (data) => {
    if (globals.loading) {
        // We have not loaded everything yet, so don't bother with shared replay features
        return;
    }

    globals.game.sounds.play(data.sound);
};

// This is used in shared replays to change the turn
commands.replayTurn = (data) => {
    if (globals.loading) {
        // We have not loaded everything yet, so don't bother with shared replay features
        return;
    }

    if (
        // If we are the replay leader, then we don't have to do anything
        globals.amSharedReplayLeader
        // Make an exception for when we are first loading the game
        && globals.sharedReplayTurn !== -1
    ) {
        return;
    }

    const oldTurn = globals.sharedReplayTurn;
    globals.sharedReplayTurn = data.turn;
    replay.adjustShuttles(false);
    if (globals.useSharedTurns) {
        const animateFast = globals.sharedReplayLoading
            || Math.abs(globals.sharedReplayTurn - oldTurn) > 2;
        replay.goto(globals.sharedReplayTurn, animateFast);

        if (!globals.sharedReplayLoading) {
            // Play an animation to indicate the direction that the leader has taken us in
            if (oldTurn > globals.sharedReplayTurn && oldTurn !== -1) {
                globals.elements.sharedReplayBackwardTween.play();
            } else if (oldTurn < globals.sharedReplayTurn && oldTurn !== -1) {
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

    // Also replay hypothetical actions
    if (globals.hypothetical && globals.useSharedTurns) {
        for (const actionMessage of globals.hypoActions) {
            notify(actionMessage);
        }
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
    let card = globals.deck[data.order];
    if (!card) {
        card = globals.stackBases[data.order - globals.deck.length];
    }

    card.reveal(data.suit, data.rank);
    globals.layers.card.batchDraw();
};

// This is used to update the names of the people currently spectating the game
commands.spectators = (data) => {
    if (!globals.elements.spectatorsLabel) {
        // Sometimes we can get here without the spectators label being initiated yet
        return;
    }

    // Remember the current list of spectators
    globals.spectators = data.names;

    const visible = data.names.length > 0;
    globals.elements.spectatorsLabel.setVisible(visible);
    globals.elements.spectatorsNumLabel.setVisible(visible);
    if (visible) {
        globals.elements.spectatorsNumLabel.setText(data.names.length);

        // Build the string that shows all the names
        const nameEntries = data.names.map((name) => `<li>${name}</li>`).join('');
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
