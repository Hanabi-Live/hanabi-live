// We will receive WebSocket messages / commands from the server that tell us to do things
// The client also sends these messages to itself in order to emulate actions coming from the server
// for e.g. in-game replays

import { createStore } from "redux";
import { initArray, parseIntSafe, trimReplaySuffixFromURL } from "../../misc";
import * as sentry from "../../sentry";
import { getVariant } from "../data/gameData";
import initialState from "../reducers/initialStates/initialState";
import stateReducer from "../reducers/stateReducer";
import { handRules, statsRules, turnRules } from "../rules";
import { ActionIncludingHypothetical, GameAction } from "../types/actions";
import CardIdentity from "../types/CardIdentity";
import GameMetadata from "../types/GameMetadata";
import InitData from "../types/InitData";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import Spectator from "../types/Spectator";
import SpectatorNote from "../types/SpectatorNote";
import State from "../types/State";
import * as arrows from "./arrows";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import * as hypothetical from "./hypothetical";
import * as notes from "./notes";
import StateObserver from "./reactive/StateObserver";
import * as replay from "./replay";
import * as stats from "./stats";
import * as timer from "./timer";
import uiInit from "./uiInit";

// Define a command handler map
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
const commands = new Map<string, CommandCallback>();
export default commands;

// ----------------
// Command handlers
// ----------------

// Received when the server wants to force the client to go back to the lobby
commands.set("boot", () => {
  timer.stop();
  globals.game!.hide();
});

// Updates the clocks to show how much time people are taking
// or how much time people have left
commands.set("clock", (data: timer.ClockData) => {
  timer.update(data);
});

interface ConnectedData {
  list: boolean[];
}
commands.set("connected", (data: ConnectedData) => {
  for (let i = 0; i < data.list.length; i++) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame !== undefined) {
      nameFrame.setConnected(data.list[i]);
    }
  }
  globals.layers.UI.batchDraw();
});

interface CardIdentitiesData {
  tableID: number;
  cardIdentities: CardIdentity[];
}
commands.set("cardIdentities", (data: CardIdentitiesData) => {
  globals.store!.dispatch({
    type: "cardIdentities",
    cardIdentities: data.cardIdentities,
  });
});

interface FinishOngoingGameData {
  databaseID: number;
  sharedReplayLeader: string;
}
commands.set("finishOngoingGame", (data: FinishOngoingGameData) => {
  globals.store!.dispatch({
    type: "finishOngoingGame",
    databaseID: data.databaseID,
    sharedReplayLeader: data.sharedReplayLeader,
    datetimeFinished: new Date().toString(),
  });
});

interface HypotheticalData {
  drawnCardsShown: boolean;
  actions: string[];
}
commands.set("hypothetical", (data: HypotheticalData) => {
  // We are joining an ongoing shared replay that is currently playing through a hypothetical line
  // We need to "catch up" to everyone else and play all of the existing hypothetical actions that
  // have taken place

  // First, parse all of the actions
  const actions: ActionIncludingHypothetical[] = [];
  for (let i = 0; i < data.actions.length; i++) {
    const action = JSON.parse(data.actions[i]) as ActionIncludingHypothetical;
    actions.push(action);
  }

  globals.store!.dispatch({
    type: "hypoStart",
    drawnCardsShown: data.drawnCardsShown,
    actions,
  });
});

commands.set("hypoAction", (data: string) => {
  const action = JSON.parse(data) as ActionIncludingHypothetical;
  globals.store!.dispatch({
    type: "hypoAction",
    action,
  });
  hypothetical.checkToggleRevealedButton(action);
});

commands.set("hypoBack", () => {
  globals.store!.dispatch({
    type: "hypoBack",
  });
});

commands.set("hypoEnd", () => {
  hypothetical.end();
});

interface HypoDrawnCardsShownData {
  drawnCardsShown: boolean;
}
commands.set("hypoDrawnCardsShown", (data: HypoDrawnCardsShownData) => {
  globals.store!.dispatch({
    type: "hypoDrawnCardsShown",
    drawnCardsShown: data.drawnCardsShown,
  });
});

commands.set("hypoStart", () => {
  hypothetical.start();
});

commands.set("init", (metadata: InitData) => {
  // Data contains the game settings for the game we are entering;
  // attach this to the Sentry context to make debugging easier
  sentry.setGameContext(metadata);

  initStateStore(metadata);

  // Now that we know the number of players and the variant, we can start to load & draw the UI
  uiInit();
});

// Received when spectating a game
interface NoteData {
  order: number;
  notes: SpectatorNote[];
}
commands.set("note", (data: NoteData) => {
  // If we are an active player and we got this message, something has gone wrong
  if (globals.state.playing) {
    return;
  }

  // Store the combined notes for this card
  globals.allNotes.set(data.order, data.notes);

  // Set the note indicator
  const card = getCardOrStackBase(data.order);
  card.setNoteIndicator();
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
  name: string;
  notes: string[];
}
commands.set("noteList", (data: NoteListData) => {
  // Reset any existing notes
  // (we could be getting a fresh copy of all notes after an ongoing game has ended)
  for (let i = 0; i < globals.allNotes.size; i++) {
    globals.allNotes.set(i, []);
  }

  // Data comes from the server as an array of player & spectator notes
  // We want to convert this to an array of objects for each card
  for (const noteList of data.notes) {
    // If we are a spectator, copy our notes from the combined list
    if (
      !globals.state.playing &&
      !globals.state.finished &&
      noteList.name === globals.metadata.ourUsername
    ) {
      globals.ourNotes.clear();
      noteList.notes.forEach((note, i) => globals.ourNotes.set(i, note));
    }

    for (let i = 0; i < noteList.notes.length; i++) {
      const note = noteList.notes[i];
      globals.allNotes.get(i)!.push({
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
commands.set("noteListPlayer", (data: NoteListPlayerData) => {
  // Store our notes
  globals.ourNotes.clear();
  data.notes.forEach((note, i) => globals.ourNotes.set(i, note));

  // Show the note indicator for currently-visible cards
  notes.setAllCardIndicators();

  // Check for special notes
  const indexOfLastDrawnCard = globals.state.visibleState!.deck.length - 1;
  for (let i = 0; i <= indexOfLastDrawnCard; i++) {
    const card = getCardOrStackBase(i);
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
commands.set("gameAction", (data: GameActionData) => {
  // Update the game state
  globals.store!.dispatch(data.action);
});

interface GameActionListData {
  tableID: number;
  list: GameAction[];
}
commands.set("gameActionList", (data: GameActionListData) => {
  // The server has sent us the list of the game actions that have occurred in the game thus far
  // (in response to the "getGameInfo2" command)
  // Send this list to the reducers
  globals.store!.dispatch({
    type: "gameActionList",
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
commands.set("pause", (data: PauseData) => {
  globals.store!.dispatch({
    type: "pause",
    active: data.active,
    playerIndex: data.playerIndex,
  });
});

interface ReplayEfficiencyModData {
  tableID: number;
  mod: number;
}
commands.set("replayEfficiencyMod", (data: ReplayEfficiencyModData) => {
  if (
    globals.state.replay.shared === null ||
    // Shared replay leaders already set the efficiency after sending the "replayAction" message
    globals.state.replay.shared.amLeader
  ) {
    return;
  }

  stats.setEfficiencyMod(data.mod);
});

// This is used in shared replays to highlight a specific card (or UI element)
interface ReplayIndicatorData {
  order: ReplayArrowOrder;
}
commands.set("replayIndicator", (data: ReplayIndicatorData) => {
  if (
    globals.state.replay.shared === null ||
    // Shared replay leaders already drew the arrow after sending the "replayAction" message
    globals.state.replay.shared.amLeader ||
    // If we are not currently using the shared segments,
    // the arrow that the shared replay leader is highlighting will not be applicable
    !globals.state.replay.shared.useSharedSegments
  ) {
    return;
  }

  if (data.order >= 0) {
    // This is an arrow for a card
    const card = getCardOrStackBase(data.order);
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
      element = globals.elements.efficiencyMinNeededLabel;
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
}
commands.set("replayLeader", (data: ReplayLeaderData) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.store!.dispatch({
    type: "replayLeader",
    name: data.name,
  });
});

// This is used in shared replays to change the segment (e.g. turn)
interface ReplaySegmentData {
  segment: number;
}
commands.set("replaySegment", (data: ReplaySegmentData) => {
  // If we are the replay leader,
  // we will already have the shared segment set to be equal to what the server is broadcasting
  if (
    globals.state.replay.shared === null ||
    globals.state.replay.shared.amLeader
  ) {
    return;
  }

  if (typeof data.segment !== "number" || data.segment < 0) {
    throw new Error(
      'Received an invalid segment from the "replaySegment" command.',
    );
  }
  globals.store!.dispatch({
    type: "replaySharedSegment",
    segment: data.segment,
  });
});

// This is used in shared replays to make fun sounds
interface ReplaySoundData {
  sound: string;
}
commands.set("replaySound", (data: ReplaySoundData) => {
  globals.game!.sounds.play(data.sound);
});

// This is used to update the names of the people currently spectating the game
export interface SpectatorsData {
  tableID: number;
  spectators: Spectator[];
}
commands.set("spectators", (data: SpectatorsData) => {
  // The shadowing index will be -1 if they are not shadowing a player
  // Convert this to null
  for (let i = 0; i < data.spectators.length; i++) {
    if (data.spectators[i].shadowingPlayerIndex === -1) {
      data.spectators[i].shadowingPlayerIndex = null;
    }
  }

  globals.store!.dispatch({
    type: "spectators",
    spectators: data.spectators,
  });
});

// -----------
// Subroutines
// -----------

function initStateStore(data: InitData) {
  // Set the variant (as a helper reference)
  globals.variant = getVariant(data.options.variantName);

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
  const minEfficiency = statsRules.minEfficiency(
    data.options.numPlayers,
    turnRules.endGameLength(data.options, data.characterAssignments),
    globals.variant,
    handRules.cardsPerHand(globals.options),
  );
  const metadata: GameMetadata = {
    ourUsername: globals.lobby.username,
    options: data.options,
    playerNames: data.playerNames,
    ourPlayerIndex: data.ourPlayerIndex,
    characterAssignments: data.characterAssignments,
    characterMetadata: data.characterMetadata,

    minEfficiency,
    // The Hyphen-ated group makes a distinction between a "Hard Variant" and an "Easy Variant"
    // https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#hard-variants--easy-variants
    hardVariant: minEfficiency >= 1.25,

    hasCustomSeed: data.hasCustomSeed,
    seed: data.seed,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The various UI views subscribe to the state store
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current state available from the JavaScript console (for debugging purposes)
  globals.store.subscribe(() => {
    window.state = globals.state;
  });

  globals.store.dispatch({
    type: "init",
    spectating: data.spectating,
    datetimeStarted: data.datetimeStarted,
    datetimeFinished: data.datetimeFinished,
    replay: data.replay,
    sharedReplay: data.sharedReplay,
    databaseID: data.databaseID,
    sharedReplaySegment: data.sharedReplaySegment,
    sharedReplayLeader: data.sharedReplayLeader,
    paused: data.paused,
    pausePlayerIndex: data.pausePlayerIndex,
  });

  // For now, the efficiency modifier is stored as a global variable instead of being in the state
  globals.efficiencyModifier = data.sharedReplayEffMod;

  // If we happen to be joining an ongoing hypothetical, we cannot dispatch a "hypoEnter" here
  // We must wait until the game is initialized first,
  // because the "hypoEnter" handler requires there to be a valid state
}

// Validate that the database ID in the URL matches the one in the game that just loaded
// (e.g. "/replay/150" for database game 150)
function validateReplayURL() {
  const match1 = /\/replay\/(\d+).*/.exec(window.location.pathname);
  const match2 = /\/shared-replay\/(\d+).*/.exec(window.location.pathname);
  let databaseID;
  if (
    match1 &&
    globals.state.finished &&
    globals.state.replay.shared === null
  ) {
    databaseID = parseIntSafe(match1[1]);
  } else if (
    match2 &&
    globals.state.finished &&
    globals.state.replay.shared !== null
  ) {
    databaseID = parseIntSafe(match2[1]);
  }
  if (databaseID === globals.state.replay.databaseID) {
    return true;
  }

  trimReplaySuffixFromURL();
  return false;
}

// Check to see if we are loading a specific replay to a specific turn
// (as specified in the URL; e.g. "/replay/150/10" for game 150 turn 10)
function checkLoadSpecificReplayTurn() {
  // If we get here, we should be in a replay that matches the database ID
  let segment;
  const match1 = /\/replay\/\d+\/(\d+)/.exec(window.location.pathname);
  const match2 = /\/shared-replay\/\d+\/(\d+)/.exec(window.location.pathname);
  // We minus one from the segment since turns are represented to the user as starting from 1
  // (instead of from 0)
  if (match1) {
    segment = parseIntSafe(match1[1]) - 1;
  } else if (match2) {
    segment = parseIntSafe(match2[1]) - 1;
  } else {
    return;
  }
  replay.goToSegment(segment, true);
}

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    state: State;
  }
}
