// We will receive WebSocket messages / commands from the server that tell us to do things
// The client also sends these messages to itself in order to emulate actions coming from the server
// for e.g. in-game replays

import { createStore } from 'redux';
import { initArray } from '../../misc';
import * as sentry from '../../sentry';
import { getVariant } from '../data/gameData';
import initialState from '../reducers/initialStates/initialState';
import stateReducer from '../reducers/stateReducer';
import * as variantRules from '../rules/variant';
import { GameAction, ActionIncludingHypothetical } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import Options from '../types/Options';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import SpectatorNote from '../types/SpectatorNote';
import action from './action';
import * as arrows from './arrows';
import { checkLegal } from './clues';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import pause from './pause';
import StateObserver from './reactive/StateObserver';
import * as replay from './replay';
import * as timer from './timer';
import * as tooltips from './tooltips';
import * as turn from './turn';
import uiInit from './uiInit';

// Define a command handler map
type CommandCallback = (data: any) => void;
const commands = new Map<string, CommandCallback>();
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
commands.set('clock', (data: timer.ClockData) => {
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
    if (nameFrame !== undefined) {
      nameFrame.setConnected(data.list[i]);
    }
  }
  globals.layers.UI.batchDraw();
});

interface DatabaseIDData {
  tableID: number;
  databaseID: number;
}
commands.set('databaseID', (data: DatabaseIDData) => {
  globals.databaseID = data.databaseID;
  globals.elements.gameIDLabel!.text(`ID: ${globals.databaseID}`);
  globals.elements.gameIDLabel!.show();

  // Also move the card count label on the deck downwards
  if (globals.deckSize === 0) {
    globals.elements.deck!.nudgeCountDownwards();
  }

  globals.layers.arrow.batchDraw();
});

interface CardIdentitiesData {
  tableID: number;
  cardIdentities: CardIdentity[];
}
commands.set('cardIdentities', (data: CardIdentitiesData) => {
  globals.store!.dispatch({ type: 'cardIdentities', cardIdentities: data.cardIdentities });
});

commands.set('gameOver', () => {
  // If any tooltips are open, close them
  tooltips.resetActiveHover();

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
  // (before the "gameOver" command is received)
  // (this must be after the "replay.enter()" function)
  globals.gameOver = false;

  // If the user is in an in-game replay when the game ends, we need to jerk them away from it
  // and go to the end of the game. This is because we need to process all of the queued "action"
  // messages (otherwise, the code will try to "reveal" cards that might be undefined)

  // The final turn displays how long everyone took,
  // so we want to go to the turn before that, which we recorded earlier
  replay.goto(globals.finalReplayTurn, true);
  console.log('Going to the finalReplayTurn:', globals.finalReplayTurn);

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
  if (variantRules.isThrowItInAHole(globals.variant)) {
    globals.elements.maxScoreNumberLabel!.show();
  }

  globals.layers.UI.batchDraw();
});

commands.set('hypoAction', (data: string) => {
  const actionMessage = JSON.parse(data) as ActionIncludingHypothetical;

  // Pass it along to the reducers
  globals.store!.dispatch({ type: 'hypoAction', action: actionMessage });

  // We need to save this game state change for the purposes of the in-game hypothetical
  globals.hypoActions.push(actionMessage);

  hypothetical.setHypoFirstDrawnIndex(actionMessage);
  hypothetical.checkToggleRevealedButton(actionMessage);
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
  globals.store!.dispatch({ type: 'hypoBack' });
});

commands.set('hypoEnd', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.end();
  }
  globals.store!.dispatch({ type: 'hypoEnd' });
});

interface HypoRevealedData {
  hypoRevealed: boolean;
}
commands.set('hypoRevealed', (data: HypoRevealedData) => {
  globals.hypoRevealed = data.hypoRevealed;

  const text = globals.hypoRevealed ? 'Hide' : 'Show';
  globals.elements.toggleRevealedButton!.setText({ line1: text });
  globals.layers.UI.batchDraw();

  // Redraw the cards drawn after the hypothetical started
  if (globals.hypoFirstDrawnIndex) {
    const deckSize = globals.store?.getState().ongoingGame.deckSize!;
    for (let i = globals.hypoFirstDrawnIndex; i < deckSize; i++) {
      globals.deck[i].replayRedraw();
    }
  }

  // Check if the ability to give a clue changed
  checkLegal();

  globals.layers.card.batchDraw();

  // Send to reducers
  globals.store!.dispatch({ type: 'hypoRevealed', showDrawnCards: data.hypoRevealed });
});

commands.set('hypoStart', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.start();
  }
  globals.store!.dispatch({ type: 'hypoStart' });
});

interface InitData {
  // Game settings
  tableID: number;
  playerNames: string[];
  seat: number;
  spectating: boolean;
  replay: boolean;
  sharedReplay: boolean;
  databaseID: number;
  seed: string;
  seeded: boolean;
  datetimeStarted: Date;
  datetimeFinished: Date;
  options: Options;

  // Character settings
  characterAssignments: number[];
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
  globals.playerNames = data.playerNames;
  globals.playerUs = data.seat; // 0 if a spectator or a replay of a game that we were not in
  globals.spectating = data.spectating;
  globals.replay = data.replay;
  globals.sharedReplay = data.sharedReplay;
  globals.databaseID = data.databaseID; // 0 if this is an ongoing game
  globals.seed = data.seed;
  globals.seeded = data.seeded; // If playing a table started with the "!seed" prefix
  globals.datetimeStarted = data.datetimeStarted;
  globals.datetimeFinished = data.datetimeFinished;
  globals.options = data.options;

  // Set the variant
  globals.variant = getVariant(globals.options.variantName);

  // Character settings
  let characterAssignments: Array<number | null> = data.characterAssignments.slice();
  if (characterAssignments.length === 0) {
    characterAssignments = initArray(globals.options.numPlayers, null);
  }
  globals.characterAssignments = characterAssignments;
  globals.characterMetadata = data.characterMetadata;

  // Recreate the state store (using the Redux library)
  const metadata: GameMetadata = {
    options: data.options,
    playerNames: data.playerNames,
    ourPlayerIndex: data.seat,
    spectating: data.spectating || data.replay,
    characterAssignments,
    characterMetadata: data.characterMetadata,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // Make the current visible state available from the JavaScript console (for debugging purposes)
  globals.store.subscribe(() => {
    window.state = globals.store!.getState().visibleState;
  });

  // Hypothetical settings
  globals.hypothetical = data.hypothetical;
  globals.hypoActions = [];
  for (let i = 0; i < data.hypoActions.length; i++) {
    globals.hypoActions[i] = JSON.parse(data.hypoActions[i]) as ActionIncludingHypothetical;
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

    // HACK: also let the state know this is a replay
    globals.store!.dispatch({ type: 'startReplay', segment: 0 });
  }

  // Now that we know the number of players and the variant, we can start to load & draw the UI
  uiInit();
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
  const indexOfLastDrawnCard = globals.store!.getState().visibleState!.deck.length - 1;
  for (let i = 0; i <= indexOfLastDrawnCard; i++) {
    const card = globals.deck[i];
    card.checkSpecialNote();
  }

  // Check for special notes on the stack bases
  for (const stackBase of globals.stackBases) {
    stackBase.checkSpecialNote();
  }
});

// Used when the game state changes
interface GameActionData {
  tableID: number;
  action: GameAction;
}
commands.set('gameAction', (data: GameActionData) => {
  // Update the game state
  globals.store!.dispatch(data.action);

  processNewAction(data.action);
});

const processNewAction = (actionMessage: GameAction) => {
  // TEMP: We need to save this game state change for the purposes of the in-game replay
  globals.replayLog.push(actionMessage);

  if (actionMessage.type === 'turn') {
    // Keep track of whether it is our turn or not
    // TODO: Legacy code, remove this
    globals.ourTurn = actionMessage.currentPlayerIndex === globals.playerUs && !globals.spectating;
  } else if (actionMessage.type === 'clue' && variantRules.isAlternatingClues(globals.variant)) {
    if (actionMessage.clue.type === ClueType.Color) {
      for (const button of globals.elements.colorClueButtons) {
        button.hide();
      }
      for (const button of globals.elements.rankClueButtons) {
        button.show();
      }
    } else if (actionMessage.clue.type === ClueType.Rank) {
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

  // If the game is over, do not immediately draw the subsequent turns that contain the game times
  if (
    !globals.gameOver
    && actionMessage.type === 'turn'
    && actionMessage.currentPlayerIndex === -1
  ) {
    globals.gameOver = true;
    globals.finalReplayPos = globals.replayLog.length;
    globals.finalReplayTurn = actionMessage.num;
  }
};

interface GameActionListData {
  tableID: number;
  list: GameAction[];
}
commands.set('gameActionList', (data: GameActionListData) => {
  // Send the list to the reducers
  globals.store!.dispatch({ type: 'gameActionList', actions: data.list });

  // Play through all of the turns
  for (const actionMessage of data.list) {
    processNewAction(actionMessage);
  }

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

  // Subscribe to state changes
  // TODO: this is not a great place to do this
  if (globals.stateObserver) {
    globals.stateObserver.registerObservers(globals.store!);
  } else {
    globals.stateObserver = new StateObserver(globals.store!);
  }
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
  order: ReplayArrowOrder;
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

  if (data.order >= 0) {
    // This is an arrow for a card
    // Ensure that the card exists as a sanity-check
    // (the server does not validate the order that the leader sends)
    let card = globals.deck[data.order];
    if (card === undefined) {
      card = globals.stackBases[data.order - globals.deck.length];
    }
    if (card === undefined) {
      return;
    }

    arrows.toggle(card);
  } else {
    // This is an arrow for some other UI element
    let element;
    if (data.order === ReplayArrowOrder.Deck) {
      element = globals.elements.deck;
    } else if (data.order === ReplayArrowOrder.Turn) {
      element = globals.elements.turnNumberLabel;
    } else if (data.order === ReplayArrowOrder.Score) {
      element = globals.elements.scoreNumberLabel;
    } else if (data.order === ReplayArrowOrder.MaxScore) {
      element = globals.elements.maxScoreNumberLabel;
    } else if (data.order === ReplayArrowOrder.Clues) {
      element = globals.elements.cluesNumberLabel;
    } else if (data.order === ReplayArrowOrder.Pace) {
      element = globals.elements.paceNumberLabel;
    } else if (data.order === ReplayArrowOrder.Efficiency) {
      element = globals.elements.efficiencyNumberLabel;
    } else if (data.order === ReplayArrowOrder.MinEfficiency) {
      element = globals.elements.efficiencyNumberLabelMinNeeded;
    } else {
      console.warn('Received a "replayIndicator" for an unknown element.');
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
    globals.elements.pauseSharedTurnsButton!.setLeft();
    globals.elements.useSharedTurnsButton!.setLeft();
  } else {
    globals.elements.pauseSharedTurnsButton!.setCenter();
    globals.elements.useSharedTurnsButton!.setCenter();
  }
  globals.elements.enterHypoButton!.visible(globals.amSharedReplayLeader);
  globals.elements.enterHypoButton!.setEnabled(globals.currentPlayerIndex !== null);

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
      // Going into the past by 2 or more turns should always be fast
      || oldTurn - globals.sharedReplayTurn > 2
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
    // It is normally impossible to receive a "replayTurn" message while in a hypothetical
    // Thus, this must be the initial "replayTurn" message that occurs when the client is first
    // loading
    // We need to "catch up" to everyone else and play all of the existing hypothetical actions
    // that have taken place

    // TEMP: Pass the actions along to the reducers
    globals.store!.dispatch({ type: 'hypoStart' });
    globals.hypoActions.forEach((a) => globals.store!.dispatch({ type: 'hypoAction', action: a }));

    hypothetical.playThroughPastActions();
  }
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

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    state: GameState | null;
  }
}
