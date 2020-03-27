/*
    We will receive WebSocket messages / commands from the server that tell us to do things
*/

// Imports
import * as arrows from './arrows';
import { CLUE_TYPE, REPLAY_ARROW_ORDER, VARIANTS } from '../../constants';
import fadeCheck from './fadeCheck';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import notify from './notify';
import pause from './pause';
import * as replay from './replay';
import SpectatorNote from './SpectatorNote';
import stateChange from './stateChange';
import * as stats from './stats';
import strikeRecord from './strikeRecord';
import * as timer from './timer';
import * as turn from './turn';

// Define a command handler map
const commands = new Map();
export default commands;

// Received when it is our turn
commands.set('action', () => {
    turn.begin();
});

// Received when the server wants to force the client to go back to the lobby
commands.set('boot', () => {
    timer.stop();
    globals.game.hide();
});

// Updates the clocks to show how much time people are taking
// or how much time people have left
interface ClockData {
    times: Array<number>,
    active: number,
    timeTaken: number,
}
commands.set('clock', (data: ClockData) => {
    timer.update(data);
});

interface ConnectedData {
    list: Array<boolean>,
}
commands.set('connected', (data: ConnectedData) => {
    for (let i = 0; i < data.list.length; i++) {
        globals.elements.nameFrames[i].setConnected(data.list[i]);
    }
    globals.layers.get('UI')!.batchDraw();
});

interface DatabaseIDData {
    id: number,
}
commands.set('databaseID', (data: DatabaseIDData) => {
    globals.databaseID = data.id;
    globals.elements.gameIDLabel!.text(`ID: ${globals.databaseID}`);
    globals.elements.gameIDLabel!.show();

    // Also move the card count label on the deck downwards
    if (globals.deckSize === 0) {
        globals.elements.deck!.nudgeCountDownwards();
    }

    globals.layers.get('UI2')!.batchDraw();
});

commands.set('gameOver', () => {
    // If any tooltips are open, close them
    if (globals.activeHover !== null) {
        globals.activeHover.off('mousemove');
        globals.activeHover = null;
    }

    // If the timers are showing, hide them
    if (globals.elements.timer1) {
        globals.elements.timer1.hide();
        globals.elements.timer2!.hide();
    }
    timer.stop();
    globals.layers.get('timer')!.batchDraw();

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
    globals.elements.replayExitButton!.hide();

    // Hide/show some buttons in the bottom-left-hand corner
    globals.elements.replayButton!.hide();
    globals.elements.killButton!.hide();
    globals.elements.lobbyButtonSmall!.hide();
    globals.elements.lobbyButtonBig!.show();

    // Turn off the "Throw It in a Hole" UI
    if (globals.variant.name.startsWith('Throw It in a Hole')) {
        globals.elements.scoreNumberLabel!.text(globals.score.toString());
        globals.elements.maxScoreNumberLabel!.show();
    }

    globals.layers.get('UI')!.batchDraw();
});

commands.set('hypoAction', (data: string) => {
    const notifyMessage = JSON.parse(data);

    // We need to save this game state change for the purposes of the in-game hypothetical
    globals.hypoActions.push(notifyMessage);

    notify(notifyMessage);

    if (notifyMessage.type === 'turn') {
        hypothetical.beginTurn();
    }
});

commands.set('hypoBack', () => {
    hypothetical.backOneTurn();
});

commands.set('hypoEnd', () => {
    if (!globals.amSharedReplayLeader) {
        hypothetical.end();
    }
});

commands.set('hypoStart', () => {
    if (!globals.amSharedReplayLeader) {
        hypothetical.start();
    }
});

interface InitData {
    // Game settings
    tableID: number,
    names: Array<string>,
    variant: string,
    seat: number,
    spectating: boolean,
    replay: boolean,
    sharedReplay: boolean,
    databaseID: number,

    // Optional settings
    timed: boolean,
    baseTime: number,
    timePerTurn: number,
    speedrun: boolean,
    cardCycle: boolean,
    deckPlays: boolean,
    emptyClues: boolean,
    characterAssignments: Array<string>,
    characterMetadata: Array<number>,

    // Hypothetical settings
    hypothetical: boolean,
    hypoActions: Array<string>,

    // Other features
    paused: boolean,
    pausePlayer: string,
    pauseQueued: boolean,
}
commands.set('init', (data: InitData) => {
    // Game settings
    globals.lobby.tableID = data.tableID; // Equal to the table ID on the server
    globals.playerNames = data.names;
    const variant = VARIANTS.get(data.variant);
    if (typeof variant === 'undefined') {
        throw new Error(`The "init" command was sent with an invalid variant name of "${data.variant}".`);
    } else {
        globals.variant = variant;
    }
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
    globals.cardCycle = data.cardCycle;
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
    globals.ImageLoader!.start();
    // (more initialization logic is found in the "finishedLoadingImages()" function)
});

// Received when spectating a game
interface NoteData {
    order: number,
    notes: Array<SpectatorNote>,
}
commands.set('note', (data: NoteData) => {
    // If we are not spectating and we got this message, something has gone wrong
    if (!globals.spectating) {
        return;
    }

    // Store the combined notes for this card
    globals.allNotes[data.order] = data.notes;

    // Set the note indicator
    notes.setCardIndicator(data.order);
});

/*
    Received when:
    - joining a replay
    - joining a shared replay
    - joining an existing game as a spectator
    (it gives the notes of all the players & spectators)
*/
interface NoteListData {
    notes: Array<NoteList>,
}
interface NoteList {
    id: number,
    name: string,
    notes: Array<string>,
}
commands.set('noteList', (data: NoteListData) => {
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
});

/*
    Received when reconnecting to an existing game as a player
    (it only gets the notes of one specific player)
*/
interface NoteListPlayerData {
    notes: Array<string>,
}
commands.set('noteListPlayer', (data: NoteListPlayerData) => {
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
});

// Used when the game state changes
commands.set('notify', (data: any) => {
    // Update the state table
    const stateChangeFunction = stateChange.get(data.type);
    if (typeof stateChangeFunction !== 'undefined') {
        stateChangeFunction(data);
    }

    // We need to save this game state change for the purposes of the in-game replay
    globals.replayLog.push(data);

    if (data.type === 'turn') {
        // Keep track of whether it is our turn or not
        globals.ourTurn = data.who === globals.playerUs && !globals.spectating;

        // We need to update the replay slider, based on the new amount of turns
        globals.replayMax = data.num;
        if (globals.inReplay) {
            replay.adjustShuttles(false);
            globals.elements.replayForwardButton!.setEnabled(true);
            globals.elements.replayForwardFullButton!.setEnabled(true);
            globals.layers.get('UI')!.batchDraw();
        }

        // On the second turn and beyond, ensure that the "In-Game Replay" button is enabled
        if (!globals.replay && globals.replayMax > 0) {
            globals.elements.replayButton!.setEnabled(true);
        }
    } else if (data.type === 'clue' && globals.variant.name.startsWith('Alternating Clues')) {
        if (data.clue.type === CLUE_TYPE.RANK) {
            for (const button of globals.elements.colorClueButtons) {
                button.show();
            }
            for (const button of globals.elements.rankClueButtons) {
                button.hide();
            }
        } else if (data.clue.type === CLUE_TYPE.COLOR) {
            for (const button of globals.elements.colorClueButtons) {
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
});

commands.set('notifyList', (dataList: Array<any>) => {
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
        commands.get('notify')(data);

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
        const turnNum = parseInt(match[1], 10) - 1;
        replay.goto(turnNum, true);
    }

    fadeCheck();
    globals.layers.get('card')!.batchDraw();
    globals.layers.get('UI')!.batchDraw();
    globals.loading = false;
});

interface PauseData {
    paused: boolean,
    pausePlayer: string,
}
commands.set('pause', (data: PauseData) => {
    globals.paused = data.paused;
    globals.pausePlayer = data.pausePlayer;

    // Pause or unpause the UI accordingly
    pause();
});

// This is used in shared replays to highlight a specific card (or UI element)
interface ReplayIndicatorData {
    order: number,
}
commands.set('replayIndicator', (data: ReplayIndicatorData) => {
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
            card = globals.stackBases[data.order - globals.deck.length];
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
});

// This is used in shared replays to specify who the leader is
interface ReplayLeaderData {
    name: string,
    playAnimation: boolean,
}
commands.set('replayLeader', (data: ReplayLeaderData) => {
    // Store who the shared replay leader is
    globals.sharedReplayLeader = data.name;
    globals.amSharedReplayLeader = globals.sharedReplayLeader === globals.lobby.username;

    // Update the UI and play an animation to indicate there is a new replay leader
    globals.elements.sharedReplayLeaderLabel!.show();
    // (the crown might be invisible if we just finished an ongoing game)
    globals.elements.sharedReplayLeaderCircle!.visible(globals.amSharedReplayLeader);
    if (data.playAnimation) {
        // We only want the animation to play when the leader changes
        // The server will set "playAnimation" to false when a player is first loading into a game
        // (or when a game ends)
        globals.elements.sharedReplayLeaderLabelPulse!.play();
    }

    // Arrange the center buttons in a certain way depending on
    // whether we are the shared replay leader
    globals.elements.pauseSharedTurnsButton!.visible(globals.useSharedTurns);
    globals.elements.useSharedTurnsButton!.visible(!globals.useSharedTurns);
    if (globals.amSharedReplayLeader) {
        (globals.elements.pauseSharedTurnsButton as any).setLeft();
        (globals.elements.useSharedTurnsButton as any).setLeft();
    } else {
        (globals.elements.pauseSharedTurnsButton as any).setCenter();
        (globals.elements.useSharedTurnsButton as any).setCenter();
    }
    globals.elements.enterHypoButton!.visible(globals.amSharedReplayLeader);

    // Enable/disable the restart button
    globals.elements.restartButton!.visible(globals.amSharedReplayLeader);

    // Hide the replay area if we are in a hypothetical
    if (globals.hypothetical) {
        globals.elements.replayArea!.visible(false);
        if (globals.amSharedReplayLeader) {
            globals.elements.restartButton!.visible(false);
            globals.elements.endHypotheticalButton!.visible(true);
        } else {
            globals.elements.hypoCircle!.visible(true);
        }
    }

    globals.layers.get('UI')!.batchDraw();

    // Update the tooltip
    let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
    if (!globals.spectators.includes(globals.sharedReplayLeader)) {
        // Check to see if the leader is away
        content += ' (away)';
    }
    $('#tooltip-leader').tooltipster('instance').content(content);
});

// This is used in shared replays to make fun sounds
interface ReplaySoundData {
    sound: string,
}
commands.set('replaySound', (data: ReplaySoundData) => {
    if (globals.loading) {
        // We have not loaded everything yet, so don't bother with shared replay features
        return;
    }

    globals.game.sounds.play(data.sound);
});

// This is used in shared replays to change the turn
interface ReplayTurnData {
    turn: number,
}
commands.set('replayTurn', (data: ReplayTurnData) => {
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
        const animateFast = (
            // First loading into a shared replay should always be fast
            globals.sharedReplayLoading
            // Rewinding should always be fast
            || globals.sharedReplayTurn < oldTurn
            // Going into the future by 2 or more turns should always be fast
            || globals.sharedReplayTurn - oldTurn > 2
        );
        replay.goto(globals.sharedReplayTurn, animateFast);

        if (globals.sharedReplayLoading) {
            globals.sharedReplayLoading = false;
        } else {
            // Play an animation to indicate the direction that the leader has taken us in
            if (oldTurn > globals.sharedReplayTurn && oldTurn !== -1) {
                globals.elements.sharedReplayBackwardTween!.play();
            } else if (oldTurn < globals.sharedReplayTurn && oldTurn !== -1) {
                globals.elements.sharedReplayForwardTween!.play();
            }
            globals.layers.get('UI')!.batchDraw();
        }
    } else {
        // Even though we are not using the shared turns,
        // we need to update the slider to show where the replay leader changed the turn to
        globals.layers.get('UI')!.batchDraw();
    }
});

interface RevealData {
    suit: number,
    rank: number,
    order: number,
}
commands.set('reveal', (data: RevealData) => {
    let card = globals.deck[data.order];
    if (!card) {
        card = globals.stackBases[data.order - globals.deck.length];
    }

    card.reveal(data.suit, data.rank);
    globals.layers.get('card')!.batchDraw();
});

// This is used to update the names of the people currently spectating the game
interface SpectatorsData {
    names: Array<string>,
}
commands.set('spectators', (data: SpectatorsData) => {
    if (!globals.elements.spectatorsLabel) {
        // Sometimes we can get here without the spectators label being initiated yet
        return;
    }

    // Remember the current list of spectators
    globals.spectators = data.names;

    const visible = data.names.length > 0;
    globals.elements.spectatorsLabel.visible(visible);
    globals.elements.spectatorsNumLabel!.visible(visible);
    if (visible) {
        globals.elements.spectatorsNumLabel!.text(data.names.length.toString());

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

    globals.layers.get('UI')!.batchDraw();
});

interface SoundData {
    file: string,
}
commands.set('sound', (data: SoundData) => {
    if (!globals.lobby.settings.get('soundMove')) {
        return;
    }

    const path = `/public/sounds/${data.file}.mp3`;
    const audio = new Audio(path);
    // HTML5 audio volume is a range between 0.0 to 1.0,
    // but volume is stored in the settings as an integer from 0 to 100
    let volume = globals.lobby.settings.get('volume');
    if (typeof volume !== 'number') {
        volume = 50;
    }
    audio.volume = volume / 100;
    audio.play();
    // If audio playback fails,
    // it is most likely due to the user not having interacted with the page yet
    // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
});
