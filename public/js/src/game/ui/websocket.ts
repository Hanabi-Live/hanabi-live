// We will receive WebSocket messages / commands from the server that tell us to do things

// Imports
import { CLUE_TYPE, REPLAY_ARROW_ORDER, VARIANTS } from '../../constants';
import * as sentry from '../../sentry';
import action from './action';
import * as arrows from './arrows';
import cardStatusCheck from './cardStatusCheck';
import ClockData from './ClockData';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
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
commands.set('yourTurn', () => {
  turn.begin();
});

// Received when the server wants to force the client to go back to the lobby
commands.set('boot', () => {
  timer.stop();
  globals.game!.hide();
});

// Updates the clocks to show how much time people are taking
// or how much time people have left
commands.set('clock', (data: ClockData) => {
  if (globals.loading) {
    // We have not loaded everything yet
    return;
  }
  timer.update(data);
});

interface ConnectedData {
  list: boolean[];
}
commands.set('connected', (data: ConnectedData) => {
  if (globals.loading) {
    // We have not loaded everything yet
    return;
  }

  for (let i = 0; i < data.list.length; i++) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame) {
      nameFrame.setConnected(data.list[i]);
    }
  }
  globals.layers.UI.batchDraw();
});

interface DatabaseIDData {
  id: number;
}
commands.set('databaseID', (data: DatabaseIDData) => {
  globals.databaseID = data.id;
  globals.elements.gameIDLabel!.text(`ID: ${globals.databaseID}`);
  globals.elements.gameIDLabel!.show();

  // Also move the card count label on the deck downwards
  if (globals.deckSize === 0) {
    globals.elements.deck!.nudgeCountDownwards();
  }

  globals.layers.arrow.batchDraw();
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
  globals.layers.timer.batchDraw();

  // Transform this game into a shared replay
  globals.replay = true;
  globals.sharedReplay = true;
  globals.sharedReplayTurn = globals.replayTurn + 1;
  // (we add one to account for the text that the server sends at the end of a game)

  // Open the replay UI if we were not in an in-game replay when the game ended
  if (!globals.inReplay) {
    replay.enter();
  }

  // Turn off the flag that tracks when the game is over
  // (before the "gameOver" command is receieved)
  // (this must be after the "replay.enter()" function)
  globals.gameOver = false;

  // If the user is in an in-game replay when the game ends, we need to jerk them away from it
  // and go to the end of the game. This is because we need to process all of the queued "action"
  // messages (otherwise, the code will try to "reveal" cards that might be undefined)

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

  // Re-draw the deck tooltip
  // (it will show more information when you are in a replay)
  globals.datetimeFinished = new Date();
  globals.elements.deck!.initTooltip();

  // Turn off the "Throw It in a Hole" UI
  if (globals.variant.name.startsWith('Throw It in a Hole')) {
    globals.elements.scoreNumberLabel!.text(globals.score.toString());
    globals.elements.maxScoreNumberLabel!.show();
  }

  globals.layers.UI.batchDraw();
});

commands.set('hypoAction', (data: string) => {
  const actionMessage = JSON.parse(data);

  // We need to save this game state change for the purposes of the in-game hypothetical
  globals.hypoActions.push(actionMessage);

  action(actionMessage);

  if (actionMessage.type === 'turn') {
    hypothetical.beginTurn();
  }
});

commands.set('hypoBack', () => {
  hypothetical.backOneTurn();
  if (!globals.amSharedReplayLeader) {
    globals.elements.sharedReplayBackwardTween!.play();
  }
});

commands.set('hypoEnd', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.end();
  }
});

interface HypoRevealedData {
  hypoRevealed: boolean;
}
commands.set('hypoRevealed', (data: HypoRevealedData) => {
  globals.hypoRevealed = data.hypoRevealed;

  const text = globals.hypoRevealed ? 'Hidden' : 'Revealed';
  globals.elements.toggleRevealedButton!.setMiddleText(text);
  globals.layers.UI.batchDraw();
});

commands.set('hypoStart', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.start();
  }
});

interface InitData {
  // Game settings
  tableID: number;
  names: string[];
  variant: string;
  seat: number;
  spectating: boolean;
  replay: boolean;
  sharedReplay: boolean;
  databaseID: number;
  seed: string;
  seeded: boolean;
  datetimeStarted: Date;
  datetimeFinished: Date;

  // Optional settings
  timed: boolean;
  timeBase: number;
  timePerTurn: number;
  speedrun: boolean;
  cardCycle: boolean;
  deckPlays: boolean;
  emptyClues: boolean;
  characterAssignments: string[];
  characterMetadata: number[];

  // Hypothetical settings
  hypothetical: boolean;
  hypoActions: string[];
  hypoRevealed: boolean;

  // Other features
  paused: boolean;
  pausePlayer: string;
  pauseQueued: boolean;
}
commands.set('init', (data: InitData) => {
  // Data contains the game settings for the game we are entering;
  // attach this to the Sentry context to make debugging easier
  sentry.setGameContext(data);

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
  globals.seed = data.seed;
  globals.seeded = data.seeded; // If playing a table started with the "!seed" prefix
  globals.datetimeStarted = data.datetimeStarted;
  globals.datetimeFinished = data.datetimeFinished;

  // Optional settings
  globals.timed = data.timed;
  globals.timeBase = data.timeBase;
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
  globals.hypoRevealed = data.hypoRevealed;

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
  order: number;
  notes: SpectatorNote[];
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

// Received when:
// - joining a replay
// - joining a shared replay
// - joining an existing game as a spectator
// (it gives the notes of all the players & spectators)
interface NoteListData {
  notes: NoteList[];
}
interface NoteList {
  id: number;
  name: string;
  notes: string[];
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

// Received when reconnecting to an existing game as a player
// (it only gets the notes of one specific player)
interface NoteListPlayerData {
  notes: string[];
}
commands.set('noteListPlayer', (data: NoteListPlayerData) => {
  // Store our notes
  globals.ourNotes = data.notes;

  // Show the note indicator for currently-visible cards
  notes.setAllCardIndicators();

  // Check for special notes
  for (let i = 0; i <= globals.indexOfLastDrawnCard; i++) {
    const card = globals.deck[i];
    notes.checkSpecialNote(card);
  }

  // Check for special notes on the stack bases
  for (const stackBase of globals.stackBases) {
    notes.checkSpecialNote(stackBase);
  }
});

// Used when the game state changes
interface GameActionData {
  tableID: number,
  action: any,
}
commands.set('gameAction', (data: GameActionData) => {
  processNewAction(data.action);
});

const processNewAction = (actionMessage: any) => {
  // Update the state table
  const stateChangeFunction = stateChange.get(actionMessage.type);
  if (typeof stateChangeFunction !== 'undefined') {
    stateChangeFunction(actionMessage);
  }

  // We need to save this game state change for the purposes of the in-game replay
  globals.replayLog.push(actionMessage);

  if (actionMessage.type === 'turn') {
    // Keep track of whether it is our turn or not
    globals.ourTurn = actionMessage.who === globals.playerUs && !globals.spectating;

    // We need to update the replay slider, based on the new amount of turns
    globals.replayMax = actionMessage.num;
    if (globals.inReplay) {
      replay.adjustShuttles(false);
      globals.elements.replayForwardButton!.setEnabled(true);
      globals.elements.replayForwardFullButton!.setEnabled(true);
      globals.layers.UI.batchDraw();
    }

    // On the second turn and beyond, ensure that the "In-Game Replay" button is enabled
    if (!globals.replay && globals.replayMax > 0) {
      globals.elements.replayButton!.setEnabled(true);
    }
  } else if (actionMessage.type === 'clue' && globals.variant.name.startsWith('Alternating Clues')) {
    if (actionMessage.clue.type === CLUE_TYPE.COLOR) {
      for (const button of globals.elements.colorClueButtons) {
        button.hide();
      }
      for (const button of globals.elements.rankClueButtons) {
        button.show();
      }
    } else if (actionMessage.clue.type === CLUE_TYPE.RANK) {
      for (const button of globals.elements.colorClueButtons) {
        button.show();
      }
      for (const button of globals.elements.rankClueButtons) {
        button.hide();
      }
    }
  }

  // Now that it is recorded, change the actual drawn game state
  if (
    !globals.inReplay // Unless we are in an in-game replay
    && !globals.gameOver // Unless it is the miscellaneous data sent at the end of a game
  ) {
    action(actionMessage);
  }

  // If the game is over,
  // don't immediately draw the subsequent turns that contain the game times
  if (!globals.gameOver && actionMessage.type === 'turn' && actionMessage.who === -1) {
    globals.gameOver = true;
    globals.finalReplayPos = globals.replayLog.length;
    globals.finalReplayTurn = actionMessage.num;
  }
};

interface GameActionListData {
  tableID: number,
  list: any[],
}
commands.set('gameActionList', (data: GameActionListData) => {
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
  for (const actionMessage of data.list) {
    processNewAction(actionMessage);

    // Some specific messages contain global state information that we need to record
    // (since we might be in a replay that is starting on the first turn,
    // the respective action functions will not be reached until
    // we actually progress to that turn of the replay)
    if (actionMessage.type === 'strike') {
      // Record the turns that the strikes happen
      // (or else clicking on the strike squares won't work on a freshly initialized replay)
      strikeRecord(actionMessage);
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

  cardStatusCheck();
  globals.layers.card.batchDraw();
  globals.layers.UI.batchDraw();
  globals.loading = false;
});

interface PauseData {
  paused: boolean;
  pausePlayer: string;
}
commands.set('pause', (data: PauseData) => {
  globals.paused = data.paused;
  globals.pausePlayer = data.pausePlayer;

  // Pause or unpause the UI accordingly
  pause();
});

// This is used in shared replays to highlight a specific card (or UI element)
interface ReplayIndicatorData {
  order: number;
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
  name: string;
  playAnimation: boolean;
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
  globals.elements.enterHypoButton!.setEnabled(globals.currentPlayerIndex !== -1);

  // Enable/disable the restart button
  globals.elements.restartButton!.visible(globals.amSharedReplayLeader);

  // Hide the replay area if we are in a hypothetical
  if (globals.hypothetical) {
    hypothetical.show();
  }

  globals.layers.UI.batchDraw();

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
  sound: string;
}
commands.set('replaySound', (data: ReplaySoundData) => {
  if (globals.loading) {
    // We have not loaded everything yet, so don't bother with shared replay features
    return;
  }

  globals.game!.sounds.play(data.sound);
});

// This is used in shared replays to change the turn
interface ReplayTurnData {
  turn: number;
}
commands.set('replayTurn', (data: ReplayTurnData) => {
  if (globals.loading) {
    // We have not loaded everything yet, so do not bother with shared replay features
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
    // We need "force" to be true here in case we are refreshing the page in the middle of a
    // hypothetical
    replay.goto(globals.sharedReplayTurn, animateFast, true);

    if (globals.sharedReplayLoading) {
      globals.sharedReplayLoading = false;
    } else {
      // Play an animation to indicate the direction that the leader has taken us in
      if (oldTurn > globals.sharedReplayTurn && oldTurn !== -1) {
        globals.elements.sharedReplayBackwardTween!.play();
      } else if (oldTurn < globals.sharedReplayTurn && oldTurn !== -1) {
        globals.elements.sharedReplayForwardTween!.play();
      }
      globals.layers.UI.batchDraw();
    }
  } else {
    // Even though we are not using the shared turns,
    // we need to update the slider to show where the replay leader changed the turn to
    globals.layers.UI.batchDraw();
  }

  if (globals.hypothetical) {
    // It is normally impossible to receive a "relpayTurn" message while in a hypothetical
    // Thus, this must be the initial "replayTurn" message that occurs when the client is first
    // loading
    // We need to "catch up" to everyone else and play all of the existing hypothetical actions
    // that have taken place
    hypothetical.playThroughPastActions();
  }
});

interface RevealData {
  suit: number;
  rank: number;
  order: number;
}
commands.set('reveal', (data: RevealData) => {
  let card = globals.deck[data.order];
  if (!card) {
    card = globals.stackBases[data.order - globals.deck.length];
  }
  if (!card) {
    throw new Error('Failed to get the card in the "reveal" command.');
  }

  card.reveal(data.suit, data.rank);
  globals.layers.card.batchDraw();
});

// This is used to update the names of the people currently spectating the game
interface SpectatorsData {
  names: string[];
}
commands.set('spectators', (data: SpectatorsData) => {
  if (
    globals.loading
    || !globals.elements.spectatorsLabel
    || !globals.elements.spectatorsNumLabel
  ) {
    // We have not loaded everything yet
    return;
  }

  // Remember the current list of spectators
  globals.spectators = data.names;

  const visible = data.names.length > 0;
  globals.elements.spectatorsLabel.visible(visible);
  globals.elements.spectatorsNumLabel.visible(visible);
  if (visible) {
    globals.elements.spectatorsNumLabel.text(data.names.length.toString());

    // Build the string that shows all the names
    let nameEntries = '';
    for (const name of data.names) {
      if (name === globals.lobby.username) {
        nameEntries += `<li><span class="name-me">${name}</span></li>`;
      } else if (globals.lobby.friends.includes(name)) {
        nameEntries += `<li><span class="friend">${name}</span></li>`;
      } else {
        nameEntries += `<li>${name}</li>`;
      }
    }
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
});

interface SoundData {
  file: string;
}
commands.set('sound', (data: SoundData) => {
  if (globals.lobby.settings.soundMove) {
    globals.game!.sounds.play(data.file);
  }
});
