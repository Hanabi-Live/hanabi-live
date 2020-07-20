// We will receive WebSocket messages / commands from the server that tell us to do things
// The client also sends these messages to itself in order to emulate actions coming from the server
// for e.g. in-game replays

import { createStore } from 'redux';
import { initArray } from '../../misc';
import * as sentry from '../../sentry';
import { getVariant } from '../data/gameData';
import initialState from '../reducers/initialStates/initialState';
import stateReducer from '../reducers/stateReducer';
import { GameAction, ActionIncludingHypothetical } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import SpectatorNote from '../types/SpectatorNote';
import State from '../types/State';
import * as arrows from './arrows';
import { checkLegal } from './clues';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import pause from './pause';
import StateObserver from './reactive/StateObserver';
import * as replay from './replay';
import * as timer from './timer';
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
  timer.update(data);
});

interface ConnectedData {
  list: boolean[];
}
commands.set('connected', (data: ConnectedData) => {
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
  const deckSize = globals.store!.getState().visibleState!.deckSize;
  if (deckSize === 0) {
    globals.elements.deck!.nudgeCountDownwards();
  }

  globals.layers.arrow.batchDraw();
});

interface CardIdentitiesData {
  tableID: number;
  cardIdentities: CardIdentity[];
}
commands.set('cardIdentities', (data: CardIdentitiesData) => {
  globals.store!.dispatch({
    type: 'cardIdentities',
    cardIdentities: data.cardIdentities,
  });
});

commands.set('gameOver', () => {
  // Local variables
  const state = globals.store!.getState();
  const wasInReplay = state.replay.active;

  globals.store!.dispatch({
    type: 'finishOngoingGame',
  });

  // By default, we will enter the replay on the final segment,
  // which is the segment that all the times display
  // We do not want the text of the times to drown out the reason that the game ended
  // So enter the replay on the turn prior so that the player can see why the game ended
  const segmentBeforeTimes = state.ongoingGame.turn.segment! - 1;

  // If we were not already in an in-game replay, open the replay UI
  if (!wasInReplay) {
    replay.enter(segmentBeforeTimes);
  }

  // Update the shared segment
  globals.store!.dispatch({
    type: 'replaySharedSegment',
    segment: segmentBeforeTimes,
  });

  // By default, we want to use shared turns if we were not in an in-game replay
  if (!wasInReplay) {
    globals.store!.dispatch({
      type: 'replayUseSharedSegments',
      useSharedSegments: true,
    });
  }
});

commands.set('hypoAction', (data: string) => {
  const actionMessage = JSON.parse(data) as ActionIncludingHypothetical;

  // Pass it along to the reducers
  globals.store!.dispatch({
    type: 'hypoAction',
    action: actionMessage,
  });

  // We need to save this game state change for the purposes of the in-game hypothetical
  globals.hypoActions.push(actionMessage);

  hypothetical.setHypoFirstDrawnIndex(actionMessage);
  hypothetical.checkToggleRevealedButton(actionMessage);

  if (actionMessage.type === 'turn') {
    hypothetical.beginTurn();
  }
});

commands.set('hypoBack', () => {
  globals.store!.dispatch({
    type: 'hypoBack',
  });
});

commands.set('hypoEnd', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.end();
  }
  globals.store!.dispatch({
    type: 'hypoEnd',
  });
});

interface HypoRevealedData {
  hypoRevealed: boolean;
}
commands.set('hypoRevealed', (data: HypoRevealedData) => {
  globals.hypoRevealed = data.hypoRevealed;

  const text = globals.hypoRevealed ? 'Hide' : 'Show';
  globals.elements.toggleRevealedButton!.setText({ line1: text });
  globals.layers.UI.batchDraw();

  // Check if the ability to give a clue changed
  checkLegal();

  globals.layers.card.batchDraw();

  // Send to reducers
  globals.store!.dispatch({
    type: 'hypoRevealed',
    showDrawnCards: data.hypoRevealed,
  });
});

commands.set('hypoStart', () => {
  if (!globals.amSharedReplayLeader) {
    hypothetical.start();
  }
  globals.store!.dispatch({
    type: 'hypoStart',
  });
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

  copyInitDataToGlobals(data);
  initStateStore(data);

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
});

interface GameActionListData {
  tableID: number;
  list: GameAction[];
}
commands.set('gameActionList', (data: GameActionListData) => {
  // The server has sent us the list of the game actions that have occurred in the game thus far
  // (in response to the "getGameInfo2" command)
  // Send this list to the reducers
  globals.store!.dispatch({
    type: 'gameActionList',
    actions: data.list,
  });
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
  if (globals.amSharedReplayLeader) {
    // We don't have to draw any indicator arrows;
    // we already drew it after sending the "replayAction" message
    return;
  }

  if (!globals.store!.getState().replay.useSharedSegments) {
    // We are not currently using the shared segments,
    // so the arrow that the shared replay leader is highlighting will not be applicable
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
  // Local variables
  const state = globals.store!.getState();

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
  globals.elements.pauseSharedTurnsButton!.visible(state.replay.useSharedSegments);
  globals.elements.useSharedTurnsButton!.visible(!state.replay.useSharedSegments);
  if (globals.amSharedReplayLeader) {
    globals.elements.pauseSharedTurnsButton!.setLeft();
    globals.elements.useSharedTurnsButton!.setLeft();
  } else {
    globals.elements.pauseSharedTurnsButton!.setCenter();
    globals.elements.useSharedTurnsButton!.setCenter();
  }
  globals.elements.enterHypoButton!.visible(globals.amSharedReplayLeader);
  const currentPlayerIndex = globals.store!.getState().visibleState!.turn.currentPlayerIndex;
  globals.elements.enterHypoButton!.setEnabled(currentPlayerIndex !== null);

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

// This is used in shared replays to change the segment (e.g. turn)
interface ReplaySegmentData {
  segment: number;
}
commands.set('replaySegment', (data: ReplaySegmentData) => {
  if (typeof data.segment !== 'number' || data.segment < 0) {
    throw new Error('Received an invalid segment from the "replaySegment" command.');
  }

  // If we are the replay leader,
  // we will already have the shared segment set to be equal to what the server is broadcasting
  // (unless we had to refresh mid-replay and need to go back to the turn that we left off)
  if (!globals.amSharedReplayLeader || globals.sharedReplayFirstLoading) {
    globals.sharedReplayFirstLoading = false;
    globals.store!.dispatch({
      type: 'replaySharedSegment',
      segment: data.segment,
    });
  }

  // It is normally impossible to receive a "replaySegment" message while in a hypothetical
  // Thus, this must be the initial "replayTurn" message that occurs when the client is first
  // loading
  // We need to "catch up" to everyone else and play all of the existing hypothetical actions
  // that have taken place
  // TODO: Put this somewhere else?
  if (globals.hypothetical) {
    globals.store!.dispatch({
      type: 'hypoStart',
    });
    globals.hypoActions.forEach((action) => {
      // TODO we want this to animate fast but I have no idea how to do that
      globals.store!.dispatch({
        type: 'hypoAction',
        action,
      });
    });
  }
});

// This is used in shared replays to make fun sounds
interface ReplaySoundData {
  sound: string;
}
commands.set('replaySound', (data: ReplaySoundData) => {
  globals.game!.sounds.play(data.sound);
});

// This is used to update the names of the people currently spectating the game
interface SpectatorsData {
  names: string[];
}
commands.set('spectators', (data: SpectatorsData) => {
  // Remember the current list of spectators
  globals.spectators = data.names;

  const visible = data.names.length > 0;
  globals.elements.spectatorsLabel!.visible(visible);
  globals.elements.spectatorsNumLabel!.visible(visible);
  if (visible) {
    globals.elements.spectatorsNumLabel!.text(data.names.length.toString());

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

const copyInitDataToGlobals = (data: InitData) => {
  // TODO: this is messy; make a globals.init object and just copy it directly

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
  for (let i = 0; i < characterAssignments.length; i++) {
    if (characterAssignments[i]! < 0) {
      // Handle the special case of when players can be given assignments of "-1" during debugging
      // (which corresponds to a null character)
      characterAssignments[i] = null;
    }
  }
  if (characterAssignments.length === 0) {
    characterAssignments = initArray(globals.options.numPlayers, null);
  }
  globals.characterAssignments = characterAssignments;
  globals.characterMetadata = data.characterMetadata;

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
};

const initStateStore = (data: InitData) => {
  // Create the state store (using the Redux library)
  const metadata: GameMetadata = {
    options: data.options,
    playerNames: data.playerNames,
    ourPlayerIndex: data.seat,
    spectating: data.spectating || data.replay,
    finished: data.replay,
    // We need to use the "nullified" version, so we access the globals
    characterAssignments: globals.characterAssignments,
    characterMetadata: data.characterMetadata,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The various UI views subscribe to the state store
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current visible state available from the JavaScript console (for debugging purposes)
  globals.store.subscribe(() => {
    window.state = globals.store!.getState();
  });

  if (data.replay) {
    // Set "state.replay.active" to true
    replay.enter();

    // By default, we use shared segments when first loading a shared replay
    if (data.sharedReplay) {
      globals.store.dispatch({
        type: 'replayUseSharedSegments',
        useSharedSegments: true,
      });
    }
  }
};

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    state: State;
  }
}
