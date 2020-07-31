// We will receive WebSocket messages / commands from the server that tell us to do things
// The client also sends these messages to itself in order to emulate actions coming from the server
// for e.g. in-game replays

import { createStore } from 'redux';
import { initArray, trimReplaySuffixFromURL } from '../../misc';
import * as sentry from '../../sentry';
import { getVariant } from '../data/gameData';
import initialState from '../reducers/initialStates/initialState';
import stateReducer from '../reducers/stateReducer';
import { GameAction, ActionIncludingHypothetical } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import GameMetadata from '../types/GameMetadata';
import LegacyGameMetadata from '../types/LegacyGameMetadata';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import SpectatorNote from '../types/SpectatorNote';
import State from '../types/State';
import * as arrows from './arrows';
import { checkLegal } from './clues';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import StateObserver from './reactive/StateObserver';
import * as replay from './replay';
import * as timer from './timer';
import * as turn from './turn';
import uiInit from './uiInit';

// Define a command handler map
type CommandCallback = (data: any) => void;
const commands = new Map<string, CommandCallback>();
export default commands;

// ----------------
// Command handlers
// ----------------

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
  globals.metadata.databaseID = data.databaseID;
  globals.elements.gameIDLabel!.text(`ID: ${globals.metadata.databaseID}`);
  globals.elements.gameIDLabel!.show();

  // Also move the card count label on the deck downwards
  const deckSize = globals.state.visibleState!.deckSize;
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
  globals.store!.dispatch({
    type: 'finishOngoingGame',
  });
});

commands.set('hypoAction', (data: string) => {
  const action = JSON.parse(data) as ActionIncludingHypothetical;
  globals.store!.dispatch({
    type: 'hypoAction',
    action,
  });
  hypothetical.checkToggleRevealedButton(action);
});

commands.set('hypoBack', () => {
  globals.store!.dispatch({
    type: 'hypoBack',
  });
});

commands.set('hypoEnd', () => {
  hypothetical.end();
});

interface HypoRevealedData {
  hypoRevealed: boolean;
}
commands.set('hypoRevealed', (data: HypoRevealedData) => {
  globals.metadata.hypoRevealed = data.hypoRevealed;

  const text = globals.metadata.hypoRevealed ? 'Hide' : 'Show';
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
  hypothetical.start();
});

commands.set('init', (metadata: LegacyGameMetadata) => {
  // Data contains the game settings for the game we are entering;
  // attach this to the Sentry context to make debugging easier
  sentry.setGameContext(metadata);

  copyMetadataToGlobals(metadata);
  initStateStore(metadata);

  // Now that we know the number of players and the variant, we can start to load & draw the UI
  uiInit();
});

// Received when spectating a game
interface NoteData {
  order: number;
  notes: SpectatorNote[];
}
commands.set('note', (data: NoteData) => {
  // If we are an active player and we got this message, something has gone wrong
  if (globals.state.playing) {
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
    if (
      !globals.state.playing
      && !globals.state.finished
      && noteList.name === globals.lobby.username
    ) {
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
  const indexOfLastDrawnCard = globals.state.visibleState!.deck.length - 1;
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

  if (validateReplayURL()) {
    checkLoadSpecificReplayTurn();
  }
});

interface PauseData {
  active: boolean;
  playerIndex: number;
}
commands.set('pause', (data: PauseData) => {
  globals.store!.dispatch({
    type: 'pause',
    active: data.active,
    playerIndex: data.playerIndex,
  });
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

  if (!globals.state.replay.useSharedSegments) {
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
  globals.elements.pauseSharedTurnsButton!.visible(globals.state.replay.useSharedSegments);
  globals.elements.useSharedTurnsButton!.visible(!globals.state.replay.useSharedSegments);
  if (globals.amSharedReplayLeader) {
    globals.elements.pauseSharedTurnsButton!.setLeft();
    globals.elements.useSharedTurnsButton!.setLeft();
  } else {
    globals.elements.pauseSharedTurnsButton!.setCenter();
    globals.elements.useSharedTurnsButton!.setCenter();
  }
  globals.elements.enterHypoButton!.visible(globals.amSharedReplayLeader);
  const currentPlayerIndex = globals.state.visibleState!.turn.currentPlayerIndex;
  globals.elements.enterHypoButton!.setEnabled(currentPlayerIndex !== null);

  // Enable/disable the restart button
  globals.elements.restartButton!.visible(globals.amSharedReplayLeader);

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

  // We use the global metadata to see if we should be in a hypothetical
  // We can't use the state because the state hypothetical is currently set to null
  // This is because we never dispatched a "hypoEnter" when we dispatched a "replayEnter"
  // The "hypoEnter" handler needs a valid state to exist for it to function correctly
  if (globals.metadata.hypothetical) {
    // It is normally impossible to receive a "replaySegment" message while in a hypothetical
    // Thus, this must be the initial "replayTurn" message that occurs when the client is first
    // loading
    // We need to "catch up" to everyone else and play all of the existing hypothetical actions
    // that have taken place
    globals.store!.dispatch({
      type: 'hypoStart',
      drawnCardsShown: globals.metadata.hypoRevealed,
    });

    for (let i = 0; i < globals.metadata.hypoActions.length; i++) {
      const action = JSON.parse(globals.metadata.hypoActions[i]) as ActionIncludingHypothetical;
      // TODO: this should animate fast but I have no idea how to do that
      globals.store!.dispatch({
        type: 'hypoAction',
        action,
      });
      hypothetical.checkToggleRevealedButton(action);
    }
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
  shadowingPlayers: number[];
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
    for (let i = 0; i < data.names.length; i++) {
      const spectatorName = data.names[i];
      const shadowing = data.shadowingPlayers[i];

      let nameEntry = '<li>';
      if (spectatorName === globals.lobby.username) {
        nameEntry += `<span class="name-me">${spectatorName}</span>`;
      } else if (globals.lobby.friends.includes(spectatorName)) {
        nameEntry += `<span class="friend">${spectatorName}</span>`;
      } else {
        nameEntry += spectatorName;
      }
      if (shadowing !== -1) {
        const shadowedPlayerName = globals.metadata.playerNames[shadowing];
        if (shadowedPlayerName === undefined) {
          throw new Error(`Unable to find the player name at index ${shadowing}.`);
        }
        if (shadowedPlayerName !== spectatorName) {
          nameEntry += ` (🕵️ <em>${shadowedPlayerName}</em>)`;
        }
      }
      nameEntry += '</li>';
      nameEntries += nameEntry;
    }
    let content = '<strong>';
    if (globals.state.finished) {
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
  if (globals.state.replay.shared) {
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

// -----------
// Subroutines
// -----------

const copyMetadataToGlobals = (metadata: LegacyGameMetadata) => {
  // Copy it
  globals.metadata = metadata;

  // Set the variant
  globals.variant = getVariant(metadata.options.variantName);
};

const initStateStore = (data: LegacyGameMetadata) => {
  // Handle the special case of when players can be given assignments of "-1" during debugging
  // (which corresponds to a null character)
  for (let i = 0; i < data.characterAssignments.length; i++) {
    if (data.characterAssignments[i] === -1) {
      data.characterAssignments[i] = null;
    }
  }
  if (data.characterAssignments.length === 0) {
    data.characterAssignments = initArray(data.options.numPlayers, null);
  }

  // Create the state store (using the Redux library)
  const metadata: GameMetadata = {
    options: data.options,
    playerNames: data.playerNames,
    ourPlayerIndex: data.ourPlayerIndex,
    characterAssignments: data.characterAssignments,
    characterMetadata: data.characterMetadata,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The various UI views subscribe to the state store
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current state available from the JavaScript console (for debugging purposes)
  globals.store.subscribe(() => {
    window.state = globals.state;
  });

  if (data.replay) {
    globals.store.dispatch({
      type: 'replayEnterDedicated',
      shared: data.sharedReplay,
    });

    // If we happen to be joining an ongoing hypothetical, we cannot dispatch a "hypoEnter" here
    // We must wait until the game is initialized first,
    // because the "hypoEnter" handler requires there to be a valid state
  }

  if (data.paused) {
    globals.store.dispatch({
      type: 'pause',
      active: true,
      playerIndex: data.pausePlayerIndex,
    });
  }
};

// Validate that the database ID in the URL matches the one in the game that just loaded
// (e.g. "/replay/150" for database game 150)
const validateReplayURL = () => {
  const match1 = window.location.pathname.match(/\/replay\/(\d+).*/);
  const match2 = window.location.pathname.match(/\/shared-replay\/(\d+).*/);
  let databaseID;
  if (match1 && globals.state.finished && !globals.state.replay.shared) {
    databaseID = parseInt(match1[1], 10);
  } else if (match2 && globals.state.finished && globals.state.replay.shared) {
    databaseID = parseInt(match2[1], 10);
  }
  if (databaseID === globals.metadata.databaseID) {
    return true;
  }

  trimReplaySuffixFromURL();
  return false;
};

// Check to see if we are loading a specific replay to a specific turn
// (as specified in the URL; e.g. "/replay/150/10" for game 150 turn 10)
const checkLoadSpecificReplayTurn = () => {
  // If we get here, we should be in a replay that matches the database ID
  let segment;
  const match1 = window.location.pathname.match(/\/replay\/\d+\/(\d+)/);
  const match2 = window.location.pathname.match(/\/shared-replay\/\d+\/(\d+)/);
  // We minus one from the segment since turns are represented to the user as starting from 1
  // (instead of from 0)
  if (match1) {
    segment = parseInt(match1[1], 10) - 1;
  } else if (match2) {
    segment = parseInt(match2[1], 10) - 1;
  } else {
    return;
  }
  replay.goToSegment(segment, true);
};

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    state: State;
  }
}
