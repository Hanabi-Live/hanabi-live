// We will receive WebSocket messages / commands from the server that tell us to do things. The
// client also sends these messages to itself in order to emulate actions coming from the server for
// e.g. in-game replays.

import type { CardOrder, NumPlayers, PlayerIndex } from "@hanabi/data";
import { getVariant } from "@hanabi/data";
import type { Tuple } from "@hanabi/utils";
import { iRange, newArray } from "@hanabi/utils";
import { createStore } from "redux";
import { sendSelfPMFromServer } from "../../chat";
import { setBrowserAddressBarPath } from "../../utils";
import { initialState } from "../reducers/initialStates/initialState";
import { stateReducer } from "../reducers/stateReducer";
import * as hGroupRules from "../rules/hGroup";
import * as handRules from "../rules/hand";
import * as statsRules from "../rules/stats";
import * as turnRules from "../rules/turn";
import type { CardIdentity } from "../types/CardIdentity";
import type { GameMetadata } from "../types/GameMetadata";
import type { InitData } from "../types/InitData";
import { ReplayArrowOrder } from "../types/ReplayArrowOrder";
import type { Spectator } from "../types/Spectator";
import type { SpectatorNote } from "../types/SpectatorNote";
import type { State } from "../types/State";
import type { ActionIncludingHypothetical, GameAction } from "../types/actions";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { setSkullEnabled, setSkullNormal } from "./drawUI";
import { getCardOrStackBase } from "./getCardOrStackBase";
import * as hypothetical from "./hypothetical";
import * as notes from "./notes";
import { StateObserver } from "./reactive/StateObserver";
import * as replay from "./replay";
import * as stats from "./stats";
import * as timer from "./timer";
import { uiInit } from "./uiInit";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
export const gameCommands = new Map<string, CommandCallback>();

// ----------------
// Command handlers
// ----------------

// Received when the server wants to force the client to go back to the lobby
gameCommands.set("boot", () => {
  timer.stop();
  globals.game!.hide();
});

// Updates the clocks to show how much time people are taking or how much time people have left.
gameCommands.set("clock", (data: timer.ClockData) => {
  timer.update(data);
});

interface ConnectedData {
  list: boolean[];
}
gameCommands.set("connected", (data: ConnectedData) => {
  for (const [i, connected] of data.list.entries()) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame !== undefined) {
      nameFrame.setConnected(connected);
    }
  }

  globals.layers.UI.batchDraw();
});

interface CardIdentitiesData {
  tableID: number;
  cardIdentities: CardIdentity[];
}
gameCommands.set("cardIdentities", (data: CardIdentitiesData) => {
  globals.store!.dispatch({
    type: "cardIdentities",
    cardIdentities: data.cardIdentities,
  });
});

interface FinishOngoingGameData {
  databaseID: number;
  sharedReplayLeader: string;
}
gameCommands.set("finishOngoingGame", (data: FinishOngoingGameData) => {
  // Zero out the user-created efficiency modifier, if any. In a shared replay, this must be synced
  // with the shared replay leader.
  globals.store!.dispatch({
    type: "setEffMod",
    mod: 0,
  });

  // Set the browser address bar.
  setBrowserAddressBarPath(`/shared-replay/${data.databaseID}`);

  // Begin the process of converting an ongoing game to a shared replay.
  globals.store!.dispatch({
    type: "finishOngoingGame",
    databaseID: data.databaseID,
    sharedReplayLeader: data.sharedReplayLeader,
    datetimeFinished: new Date().toString(),
  });
});

interface HypotheticalData {
  showDrawnCards: boolean;
  actions: string[];
}
gameCommands.set("hypothetical", (data: HypotheticalData) => {
  // We are joining an ongoing shared replay that is currently playing through a hypothetical line.
  // We need to "catch up" to everyone else and play all of the existing hypothetical actions that
  // have taken place.

  // First, parse all of the actions.
  const actions: ActionIncludingHypothetical[] = [];
  for (const action of data.actions) {
    const actionIncludingHypothetical = JSON.parse(
      action,
    ) as ActionIncludingHypothetical;
    actions.push(actionIncludingHypothetical);
  }

  globals.store!.dispatch({
    type: "hypoStart",
    showDrawnCards: data.showDrawnCards,
    actions,
  });
});

gameCommands.set("hypoAction", (data: string) => {
  const action = JSON.parse(data) as ActionIncludingHypothetical;
  globals.store!.dispatch({
    type: "hypoAction",
    action,
  });
  hypothetical.checkToggleRevealedButton(action);
});

gameCommands.set("hypoBack", () => {
  globals.store!.dispatch({
    type: "hypoBack",
  });
});

gameCommands.set("hypoEnd", () => {
  hypothetical.end();
});

interface HypoShowDrawnCardsData {
  showDrawnCards: boolean;
}
gameCommands.set("hypoShowDrawnCards", (data: HypoShowDrawnCardsData) => {
  globals.store!.dispatch({
    type: "hypoShowDrawnCards",
    showDrawnCards: data.showDrawnCards,
  });
});

gameCommands.set("hypoStart", () => {
  hypothetical.start();
});

gameCommands.set("init", (metadata: InitData) => {
  setURL(metadata);
  initStateStore(metadata);

  // Now that we know the number of players and the variant, we can start to load & draw the UI.
  uiInit();
});

// Received when spectating a game.
interface NoteData {
  order: CardOrder;
  notes: SpectatorNote[];
}
gameCommands.set("note", (data: NoteData) => {
  // If we are an active player and we got this message, something has gone wrong.
  if (globals.state.playing) {
    return;
  }

  globals.store!.dispatch({
    type: "receiveNote",
    order: data.order,
    notes: data.notes,
  });

  // Set the note indicator.
  const card = getCardOrStackBase(data.order);
  if (card) {
    card.setNoteIndicator();
  }
});

/**
 * Received when:
 * - joining a replay
 * - joining a shared replay
 * - joining an existing game as a spectator
 *
 * (It gives the notes of all the players & spectators.)
 */
interface NoteListData {
  notes: NoteList[];
}
interface NoteList {
  name: string;
  notes: string[];
  isSpectator: boolean;
}
gameCommands.set("noteList", (data: NoteListData) => {
  const names = [] as string[];
  const noteTextLists = [] as string[][];
  const isSpectators = [] as boolean[];
  for (const noteList of data.notes) {
    names.push(noteList.name);
    noteTextLists.push(noteList.notes);
    isSpectators.push(noteList.isSpectator);
  }
  globals.store!.dispatch({
    type: "noteList",
    names,
    isSpectators,
    noteTextLists,
  });

  setNoteIndicatorAndCheckForSpecialNote();
});

// Received when reconnecting to an existing game as a player. (It only gets the notes of one
// specific player).
interface NoteListPlayerData {
  notes: string[];
}
gameCommands.set("noteListPlayer", (data: NoteListPlayerData) => {
  // Store our notes
  globals.store!.dispatch({
    type: "noteListPlayer",
    texts: data.notes,
  });

  setNoteIndicatorAndCheckForSpecialNote();
});

// Used when the game state changes.
interface GameActionData {
  tableID: number;
  action: GameAction;
}
gameCommands.set("gameAction", (data: GameActionData) => {
  // Update the game state.
  globals.store!.dispatch(data.action);
});

interface GameActionListData {
  tableID: number;
  list: GameAction[];
}
gameCommands.set("gameActionList", (data: GameActionListData) => {
  // Users can load a specific turn in a replay by using a URL hash
  // (e.g. "/replay/123#5"). Record the hash before we load the UI (which will overwrite the hash
  // with "#1", corresponding to the first turn).
  let specificTurnString: string | undefined;
  if (window.location.hash !== "") {
    specificTurnString = window.location.hash.replace("#", ""); // Strip the trailing "#".
  }

  // The server has sent us the list of the game actions that have occurred in the game thus far (in
  // response to the "getGameInfo2" command). Send this list to the reducers.
  globals.store!.dispatch({
    type: "gameActionList",
    actions: data.list,
  });

  // We might need to go to a specific turn if we loaded a URL of e.g.:
  // http://localhost/replay/123#5
  if (specificTurnString !== undefined) {
    replay.goTo(specificTurnString);
  }
});

interface PauseData {
  active: boolean;
  playerIndex: PlayerIndex;
}
gameCommands.set("pause", (data: PauseData) => {
  globals.game!.sounds.play(data.active ? "game_paused" : "game_unpaused");
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
gameCommands.set("replayEfficiencyMod", (data: ReplayEfficiencyModData) => {
  if (
    globals.state.replay.shared === null ||
    // Shared replay leaders already set the efficiency after sending the "replayAction" message.
    globals.state.replay.shared.amLeader
  ) {
    return;
  }

  stats.setEfficiencyMod(data.mod);
});

interface VoteData {
  vote: boolean;
}
gameCommands.set("voteChange", (data: VoteData) => {
  if (data.vote) {
    setSkullEnabled();
  } else {
    setSkullNormal();
  }
});

// This is used in shared replays to highlight a specific card (or UI element).
interface ReplayIndicatorData {
  order: ReplayArrowOrder;
}
gameCommands.set("replayIndicator", (data: ReplayIndicatorData) => {
  if (
    globals.state.replay.shared === null ||
    // Shared replay leaders already drew the arrow after sending the "replayAction" message.
    globals.state.replay.shared.amLeader ||
    // If we are not currently using the shared segments, the arrow that the shared replay leader is
    // highlighting will not be applicable.
    !globals.state.replay.shared.useSharedSegments
  ) {
    return;
  }

  arrows.hideAll();
  if (data.order !== ReplayArrowOrder.Nothing) {
    arrows.toggle(data.order);
  }
});

// This is used in shared replays to specify who the leader is.
interface ReplayLeaderData {
  name: string;
}
gameCommands.set("replayLeader", (data: ReplayLeaderData) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.store!.dispatch({
    type: "replayLeader",
    name: data.name,
  });
});

// This is used in shared replays to specify who the leader is.
interface SuggestData {
  userName: string;
  segment: number;
  tableID: string;
}
gameCommands.set("suggestion", (data: SuggestData) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  suggestTurn(data.userName, data.tableID, data.segment);
});

// This is used in shared replays to change the segment (e.g. turn)
interface ReplaySegmentData {
  segment: number;
}
gameCommands.set("replaySegment", (data: ReplaySegmentData) => {
  // If we are the replay leader, we will already have the shared segment set to be equal to what
  // the server is broadcasting.
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

// This is used in shared replays to make fun sounds.
interface ReplaySoundData {
  sound: string;
}
gameCommands.set("replaySound", (data: ReplaySoundData) => {
  globals.game!.sounds.play(data.sound);
});

// This is used to update the names of the people currently spectating the game.
interface SpectatorsData {
  tableID: number;
  spectators: Spectator[];
}
gameCommands.set("spectators", (data: SpectatorsData) => {
  globals.store!.dispatch({
    type: "spectators",
    spectators: data.spectators,
  });
});

// -----------
// Subroutines
// -----------

function setNoteIndicatorAndCheckForSpecialNote() {
  // Show the note indicator for currently-visible cards.
  notes.setAllCardIndicators();

  // Check for special notes.
  const indexOfLastDrawnCard = globals.state.visibleState!.deck.length - 1;
  for (const order of iRange(indexOfLastDrawnCard)) {
    const card = getCardOrStackBase(order as CardOrder);
    if (card) {
      card.checkSpecialNote();
      card.setRaiseAndShadowOffset();
    }
  }

  // Check for special notes on the stack bases.
  for (const stackBase of globals.stackBases) {
    stackBase.checkSpecialNote();
  }
}

function suggestTurn(who: string, room: string, segment: number) {
  // We minus one to account for the fact that turns are presented to the user starting from 1.
  const internalSegment = segment - 1;
  if (
    globals.state.finished &&
    globals.state.replay.shared !== null &&
    globals.state.replay.shared.amLeader &&
    globals.state.replay.hypothetical === null
  ) {
    const leaderSuggested = who === globals.metadata.ourUsername;
    if (
      leaderSuggested ||
      internalSegment === globals.state.replay.shared.segment ||
      // eslint-disable-next-line no-alert
      window.confirm(`${who} suggests that we go to turn ${segment}. Agree?`)
    ) {
      replay.goToSegment(internalSegment);
    }
    if (leaderSuggested) {
      sendSelfPMFromServer(
        "You are the shared replay leader, so you can simply click on the turn number instead of using the <code>/suggest</code> command.",
        room,
      );
    }
  }
}

function setURL(data: InitData) {
  let path: string;
  if (data.sharedReplay) {
    path = `/shared-replay/${data.databaseID}`;
  } else if (data.replay) {
    path = `/replay/${data.databaseID}`;
  } else {
    path = `/game/${data.tableID}${
      data.shadowing ? `/shadow/${data.ourPlayerIndex}` : ""
    }`;
  }
  setBrowserAddressBarPath(path, window.location.hash);
}

function initStateStore(data: InitData) {
  // Set the variant (as a helper reference).
  globals.variant = getVariant(data.options.variantName);

  // Handle the special case of when players can be given assignments of "-1" during debugging
  // (which corresponds to a null character).
  let characterAssignments = data.characterAssignments.map(
    (characterAssignment) =>
      characterAssignment === -1 ? null : characterAssignment,
  ) as Tuple<number | null, NumPlayers> | [];

  if (characterAssignments.length === 0) {
    characterAssignments = newArray(data.options.numPlayers, null) as Tuple<
      number | null,
      NumPlayers
    >;
  }

  // Create the state store (using the Redux library).
  const minEfficiency = statsRules.minEfficiency(
    data.options.numPlayers,
    turnRules.endGameLength(data.options, characterAssignments),
    globals.variant,
    handRules.cardsPerHand(data.options),
  );
  const metadata: GameMetadata = {
    ourUsername: globals.lobby.username,
    options: data.options,
    playerNames: data.playerNames,
    ourPlayerIndex: data.ourPlayerIndex,
    characterAssignments,
    characterMetadata: data.characterMetadata,

    minEfficiency,
    hardVariant: hGroupRules.hardVariant(globals.variant, minEfficiency),

    hasCustomSeed: data.hasCustomSeed,
    seed: data.seed,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The various UI views subscribe to the state store.
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current state available from the JavaScript console (for debugging purposes).
  globals.store.subscribe(() => {
    window.state = globals.state;
  });

  globals.store.dispatch({
    type: "init",
    spectating: data.spectating,
    shadowing: data.shadowing,
    datetimeStarted: data.datetimeStarted.toString(),
    datetimeFinished: data.datetimeFinished.toString(),
    replay: data.replay,
    sharedReplay: data.sharedReplay,
    databaseID: data.databaseID,
    sharedReplaySegment: data.sharedReplaySegment,
    sharedReplayLeader: data.sharedReplayLeader,
    paused: data.paused,
    pausePlayerIndex: data.pausePlayerIndex,
    efficiencyModifier: data.sharedReplayEffMod,
  });

  // If we happen to be joining an ongoing hypothetical, we cannot dispatch a "hypoEnter" here. We
  // must wait until the game is initialized first, because the "hypoEnter" handler requires there
  // to be a valid state.
}

// Allow TypeScript to modify the browser's "window" object:
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    state: State;
  }
}
