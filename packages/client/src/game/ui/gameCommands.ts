// We will receive WebSocket messages / commands from the server that tell us to do things. The
// client also sends these messages to itself in order to emulate actions coming from the server for
// e.g. in-game replays.

import type { ServerCommandData } from "@hanabi-live/data";
import { ReplayBoardElement } from "@hanabi-live/data";
import type { CardOrder, GameMetadata, NumPlayers } from "@hanabi-live/game";
import {
  getCardsPerHand,
  getEndGameLength,
  getMinEfficiency,
  getVariant,
  isHardVariant,
  NO_VALUE,
} from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { iRange, newArray } from "complete-common";
import { createStore } from "redux";
import { sendSelfPMFromServer } from "../../chat";
import { PATH } from "../../constants";
import * as modals from "../../modals";
import { ServerHandlers } from "../../serverHandlers";
import { setBrowserAddressBarPath } from "../../utils";
import {
  toCardIdentity,
  toGameAction,
  toPlayerTuple,
  toSoundType,
} from "../../wire";
import { initialState } from "../reducers/initialStates/initialState";
import { stateReducer } from "../reducers/stateReducer";
import { SoundType } from "../types/SoundType";
import type { State } from "../types/State";
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
export const gameCommands = new ServerHandlers();

// ----------------
// Command handlers
// ----------------

// Received when the server wants to force the client to go back to the lobby
gameCommands.set("boot", () => {
  modals.closeIdleWarning();
  timer.stop();
  globals.game!.hide();
});

// Updates the clocks to show how much time people are taking or how much time people have left.
gameCommands.set("clock", (data) => {
  timer.update(data);
});

gameCommands.set("connected", (data) => {
  for (const [i, connected] of data.connected.entries()) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame !== undefined) {
      nameFrame.setConnected(connected);
    }
  }

  globals.layers.UI.batchDraw();
});

gameCommands.set("cardIdentities", (data) => {
  globals.store!.dispatch({
    type: "cardIdentities",
    cardIdentities: data.identities.map(toCardIdentity),
  });
});

gameCommands.set("finishOngoingGame", (data) => {
  modals.closeIdleWarning();

  // Zero out the user-created efficiency modifier, if any. In a shared replay, this must be synced
  // with the shared replay leader.
  globals.store!.dispatch({
    type: "setEffMod",
    mod: 0,
  });

  // Set the browser address bar. 0 marks a game that is not in the database.
  setBrowserAddressBarPath(`${PATH.SHARED_REPLAY}/${data.databaseID ?? 0}`);

  // Begin the process of converting an ongoing game to a shared replay.
  globals.store!.dispatch({
    type: "finishOngoingGame",
    databaseID: data.databaseID,
    sharedReplayLeader: data.sharedReplayLeader,
    datetimeFinished: new Date().toISOString(),
  });
  if (
    globals.state.replay.actions.some(
      (action) => action.type === "clue" && action.clue.type === NO_VALUE,
    )
  ) {
    // Completed replays may reveal clues; replace the restricted history before exporting it.
    globals.lobby.conn!.send("getGameState", {
      tableID: globals.lobby.tableID,
    });
  }
});

gameCommands.set("hypothetical", (data) => {
  // We are joining an ongoing shared replay that is currently playing through a hypothetical line.
  // We need to "catch up" to everyone else and play all of the existing hypothetical actions that
  // have taken place.

  globals.store!.dispatch({
    type: "hypoStart",
    showDrawnCards: data.showDrawnCards,
    actions: data.actions,
  });
});

gameCommands.set("hypoAction", (action) => {
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
  hypothetical.finishHypothetical();
});

gameCommands.set("hypoShowDrawnCards", (data) => {
  globals.store!.dispatch({
    type: "hypoShowDrawnCards",
    showDrawnCards: data.showDrawnCards,
  });
});

gameCommands.set("hypoStart", () => {
  hypothetical.startHypothetical();
});

gameCommands.set("init", (metadata) => {
  setURL(metadata);
  initStateStore(metadata);

  // Now that we know the number of players and the variant, we can start to load & draw the UI.
  uiInit();
});

// Received when spectating a game.
gameCommands.set("note", (data) => {
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
gameCommands.set("noteList", (data) => {
  globals.store!.dispatch({
    type: "noteList",
    notes: data.notes,
  });

  setNoteIndicatorAndCheckForSpecialNote();
});

// Received when reconnecting to an existing game as a player. (It only gets the notes of one
// specific player).
gameCommands.set("noteListPlayer", (data) => {
  // Store our notes
  globals.store!.dispatch({
    type: "noteListPlayer",
    texts: data.notes,
  });

  setNoteIndicatorAndCheckForSpecialNote();
});

// Used when the game state changes.
gameCommands.set("gameAction", (data) => {
  // A turn restarts the server's idle timer.
  modals.closeIdleWarning();

  // Update the game state.
  globals.store!.dispatch(toGameAction(data.action));
});

gameCommands.set("gameActionList", (data) => {
  // Users can load a specific turn in a replay by using a URL hash
  // (e.g. "/replay/123#5"). Record the hash before we load the UI (which will overwrite the hash
  // with "#1", corresponding to the first turn).
  let specificTurnString: string | undefined;
  if (globalThis.location.hash !== "") {
    specificTurnString = globalThis.location.hash.replace("#", ""); // Strip the leading "#".
  }

  // The server has sent us the list of the game actions that have occurred in the game thus far (in
  // response to the "getGameState" command). Send this list to the reducers.
  globals.store!.dispatch({
    type: "gameActionList",
    actions: data.actions.map(toGameAction),
  });

  // We might need to go to a specific turn if we loaded a URL of e.g.:
  // http://localhost/replay/123#5
  if (specificTurnString !== undefined) {
    replay.goTo(specificTurnString);
  }
});

gameCommands.set("idleWarning", (data) => {
  modals.showIdleWarning(
    data.remainingMs,
    globals.state.playing
      ? () => {
          globals.lobby.conn!.send("idleReset", {
            tableID: globals.lobby.tableID,
          });
        }
      : null,
  );
});

// Received when a player keeps an idle game going.
gameCommands.set("idleReset", () => {
  modals.closeIdleWarning();
});

gameCommands.set("pause", (data) => {
  const soundType = data.active ? SoundType.GamePaused : SoundType.GameUnpaused;
  globals.game!.sounds.play(soundType);

  globals.store!.dispatch({
    type: "pause",
    active: data.active,
    // The server omits the pauser once nobody is pausing, and the pauser is only shown while
    // paused.
    playerIndex:
      data.active && data.playerIndex !== undefined
        ? data.playerIndex
        : globals.state.pause.playerIndex,
  });
});

gameCommands.set("replayEfficiencyMod", (data) => {
  if (
    globals.state.replay.shared === null
    // Shared replay leaders already set the efficiency after sending the "replayAction" message.
    || globals.state.replay.shared.amLeader
  ) {
    return;
  }

  stats.setEfficiencyMod(data.efficiencyModifier);
});

gameCommands.set("voteChange", (data) => {
  if (data.vote) {
    setSkullEnabled();
  } else {
    setSkullNormal();
  }
});

// This is used in shared replays to highlight a specific card (or UI element).
gameCommands.set("replayIndicator", (data) => {
  if (
    globals.state.replay.shared === null
    // Shared replay leaders already drew the arrow after sending the "replayAction" message.
    || globals.state.replay.shared.amLeader
    // If we are not currently using the shared segments, the arrow that the shared replay leader is
    // highlighting will not be applicable.
    || !globals.state.replay.shared.useSharedSegments
  ) {
    return;
  }

  arrows.hideAll();
  if (data.target !== ReplayBoardElement.Nothing) {
    arrows.toggle(data.target);
  }
});

// This is used in shared replays to specify who the leader is.
gameCommands.set("replayLeader", (data) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.store!.dispatch({
    type: "replayLeader",
    username: data.username,
  });
});

// This is used in shared replays to specify which players will not play again.
gameCommands.set("restartDeclined", (data) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.store!.dispatch({
    type: "restartDeclined",
    usernames: data.usernames,
  });
});

// This is used in shared replays to specify who the leader is.
gameCommands.set("suggestion", (data) => {
  if (globals.state.replay.shared === null) {
    return;
  }

  suggestTurn(data.username, `table${data.tableID}`, data.segment);
});

// This is used in shared replays to change the segment (e.g. turn)
gameCommands.set("replaySegment", (data) => {
  // If we are the replay leader, we will already have the shared segment set to be equal to what
  // the server is broadcasting.
  if (
    globals.state.replay.shared === null
    || globals.state.replay.shared.amLeader
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
gameCommands.set("replaySound", (data) => {
  globals.game!.sounds.play(toSoundType(data.sound));
});

// This is used to update the names of the people currently spectating the game.
gameCommands.set("spectators", (data) => {
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

function canFollowSuggestion(): boolean {
  return (
    globals.state.finished
    && globals.state.replay.shared !== null
    && globals.state.replay.shared.amLeader
    && globals.state.replay.hypothetical === null
  );
}

function suggestTurn(who: string, room: string, segment: number) {
  // We minus one to account for the fact that turns are presented to the user starting from 1.
  const internalSegment = segment - 1;
  if (canFollowSuggestion()) {
    const leaderSuggested = who === globals.metadata.ourUsername;
    if (
      leaderSuggested
      || internalSegment === globals.state.replay.shared!.segment
    ) {
      replay.goToSegment(internalSegment);
    } else {
      modals.askForConfirmation(
        "Turn Suggestion",
        `${who} suggests that we go to turn ${segment}. Agree?`,
        `Go to Turn ${segment}`,
        () => {
          // The replay may have changed while the modal was open.
          if (canFollowSuggestion()) {
            replay.goToSegment(internalSegment);
          }
        },
      );
    }
    if (leaderSuggested) {
      sendSelfPMFromServer(
        "You are the shared replay leader, so you can simply click on the turn number instead of using the <code>/suggest</code> command.",
        room,
      );
    }
  }
}

type InitData = ServerCommandData["init"];

function setURL(data: InitData) {
  let path: string;
  if (data.sharedReplay) {
    path = `${PATH.SHARED_REPLAY}/${data.databaseID ?? 0}`;
  } else if (data.replay) {
    path = `${PATH.REPLAY}/${data.databaseID ?? 0}`;
  } else {
    path = `${PATH.GAME}/${data.tableID}${
      data.shadowing ? `/shadow/${data.ourPlayerIndex}` : ""
    }`;
  }
  const hash = /^#\d+$/u.test(globalThis.location.hash)
    ? globalThis.location.hash
    : "";
  setBrowserAddressBarPath(
    path,
    hash,
    globalThis.location.pathname === PATH.LOBBY ? "push" : "replace",
  );
}

function initStateStore(data: InitData) {
  // Set the variant (as a helper reference).
  globals.variant = getVariant(data.options.variantName);

  // The list is empty unless detrimental characters are on.
  let characterAssignments = data.characters.map(
    (character) => character.characterID ?? null,
  ) as Tuple<number | null, NumPlayers> | [];

  if (characterAssignments.length === 0) {
    characterAssignments = newArray(data.options.numPlayers, null) as Tuple<
      number | null,
      NumPlayers
    >;
  }

  // Create the state store (using the Redux library).
  const endGameLength = getEndGameLength(data.options, characterAssignments);
  const cardsPerHand = getCardsPerHand(data.options);
  const minEfficiency = getMinEfficiency(
    data.options.numPlayers,
    endGameLength,
    globals.variant,
    cardsPerHand,
  );
  const hardVariant = isHardVariant(globals.variant, minEfficiency);
  const metadata: GameMetadata = {
    ourUsername: globals.lobby.username,
    options: data.options,
    playerNames: toPlayerTuple(data.playerNames, "player names"),
    ourPlayerIndex: data.ourPlayerIndex,
    characterAssignments,
    characterMetadata: toPlayerTuple(
      data.characters.length === 0
        ? newArray(data.options.numPlayers, NO_VALUE)
        : data.characters.map((character) => character.metadata),
      "character metadata entries",
    ),

    minEfficiency,
    hardVariant,

    hasCustomSeed: data.hasCustomSeed,
    seed: data.seed,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The various UI views subscribe to the state store.
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current state available from the JavaScript console (for debugging purposes).
  globals.store.subscribe(() => {
    // eslint-disable-next-line unicorn/prefer-global-this
    window.state = globals.state;
  });

  globals.store.dispatch({
    type: "init",
    spectating: data.spectating,
    shadowing: data.shadowing,
    datetimeStarted: data.datetimeStarted,
    datetimeFinished: data.datetimeFinished,
    datetimeSharedReplayStarted: data.datetimeSharedReplayStarted,
    replay: data.replay,
    sharedReplay: data.sharedReplay,
    databaseID: data.databaseID,
    sharedReplaySegment: data.sharedReplaySegment,
    sharedReplayLeader: data.sharedReplayLeader,
    spoilerFree: data.spoilerFree,
    restartDeclined: data.restartDeclined,
    paused: data.paused,
    // The server omits the pauser when nobody is pausing, and the pauser is only shown while
    // paused.
    pausePlayerIndex:
      data.paused && data.pausePlayerIndex !== undefined
        ? data.pausePlayerIndex
        : 0,
    pauseQueued: data.pauseQueued,
    sharedReplayEfficiencyModifier: data.sharedReplayEfficiencyModifier,
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
