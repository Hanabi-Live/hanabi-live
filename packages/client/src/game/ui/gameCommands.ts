// We will receive WebSocket messages / commands from the server that tell us to do things. The
// client also sends these messages to itself in order to emulate actions coming from the server for
// e.g. in-game replays.

import type { ReplyData, ServerEventData } from "@hanabi-live/data";
import type {
  CardOrder,
  GameMetadata,
  NumPlayers,
  Options,
} from "@hanabi-live/game";
import {
  getCardsPerHand,
  getEndGameLength,
  getMinEfficiency,
  getVariantById,
  isHardVariant,
} from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { iRange, newArray } from "complete-common";
import { createStore } from "redux";
import type { Connection } from "../../Connection.ts";
import { sendSelfPmFromServer } from "../../chat.ts";
import { PATH } from "../../constants.ts";
import { Screen } from "../../lobby/types/Screen.ts";
import * as modals from "../../modals.ts";
import { ServerHandlers } from "../../serverHandlers.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import {
  toCardIdentity,
  toGameAction,
  toHypotheticalAction,
  toPlayerTuple,
  toSoundType,
} from "../../wire.ts";
import * as newUiState from "../newUi/newUiState.ts";
import { initialState } from "../reducers/initialStates/initialState.ts";
import { stateReducer } from "../reducers/stateReducer.ts";
import { playerNamesAt } from "../reducers/stateReducerHelpers.ts";
import { SoundType } from "../types/SoundType.ts";
import type { State } from "../types/State.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { updateTerminationVotes } from "./drawUi.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import * as hypothetical from "./hypothetical.ts";
import * as notes from "./notes.ts";
import { StateObserver } from "./reactive/StateObserver.ts";
import * as replay from "./replay.ts";
import * as stats from "./stats.ts";
import * as timer from "./timer.ts";
import { uiInit } from "./uiInit.ts";

// Define a command handler map.
export const gameCommands = new ServerHandlers();

type GameInit = ReplyData["gameInitLoad"];
type GameState = ServerEventData["gameState"];
type Votes = NonNullable<GameState["votes"]>;
type HypotheticalControl = Extract<
  ServerEventData["replayAction"]["action"],
  { type: "hypothetical" }
>["control"];

// ----------------
// Command handlers
// ----------------

// Received when the server wants to force the client to go back to the lobby
gameCommands.set("tableBooted", () => {
  modals.closeIdleWarning();
  timer.stop();
  globals.game!.hide();
});

// Updates the clocks to show how much time people are taking or how much time people have left.
gameCommands.set("clock", (data) => {
  timer.update(data);
});

gameCommands.set("connections", (data) => {
  setConnected(data.connections);
});

function setConnected(connectedList: readonly boolean[]) {
  for (const [i, connected] of connectedList.entries()) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame !== undefined) {
      nameFrame.setConnected(connected);
    }
  }

  globals.layers.UI.batchDraw();
}

function setCardIdentities(deck: ServerEventData["gameFinished"]["deck"]) {
  globals.store!.dispatch({
    type: "cardIdentities",
    cardIdentities: deck.map(toCardIdentity),
  });
}

gameCommands.set("gameFinished", (data) => {
  modals.closeIdleWarning();

  // The game is rebuilt as a replay below, which needs the cards that were hidden from us.
  setCardIdentities(data.deck);

  // A replay has no players to wait for.
  setConnected(globals.elements.nameFrames.map(() => true));

  // Zero out the user-created efficiency modifier, if any. In a shared replay, this must be synced
  // with the shared replay leader.
  globals.store!.dispatch({
    type: "setEfficiencyModifier",
    efficiencyModifier: 0,
  });

  // Set the browser address bar. A game that was not saved has no replay address.
  if (data.gameId !== undefined) {
    setBrowserAddressBarPath(`${PATH.SHARED_REPLAY}/${data.gameId}`);
  }

  // Begin the process of converting an ongoing game to a shared replay.
  globals.store!.dispatch({
    type: "gameFinished",
    gameId: data.gameId,
    sharedReplay: data.sharedReplay,
    datetimeFinished: data.finishedAt,
    leader: data.sharedReplay.owner.username,
  });
  if (
    globals.state.replay.actions.some(
      (action) => action.type === "clue" && action.clue.type === undefined,
    )
  ) {
    // Completed replays may reveal clues; replace the restricted history before exporting it.
    globals.lobby.conn!.send("gameStateLoad", {
      tableId: globals.lobby.joinedTableId,
    });
  }
});

// The shared replay leader's actions, which the server relays to everyone watching.
gameCommands.set("replayAction", ({ action: leaderAction }) => {
  switch (leaderAction.type) {
    case "turn": {
      // The leader already moved to the turn that the server is broadcasting.
      if (
        globals.state.replay.shared === undefined
        || globals.state.replay.shared.amLeader
      ) {
        return;
      }

      globals.store!.dispatch({
        type: "replaySharedSegment",
        segment: leaderAction.turn,
      });
      break;
    }

    case "arrow": {
      if (
        globals.state.replay.shared === undefined
        // The leader already drew the arrow.
        || globals.state.replay.shared.amLeader
        // If we are not currently using the shared segments, the arrow that the leader is
        // highlighting will not be applicable.
        || !globals.state.replay.shared.useSharedSegments
      ) {
        return;
      }

      arrows.hideAll();
      const { target } = leaderAction;
      if (target !== undefined) {
        arrows.toggle(target.type === "card" ? target.order : target.element);
      }
      break;
    }

    case "sound": {
      globals.game!.sounds.play(toSoundType(leaderAction.sound));
      break;
    }

    case "hypothetical": {
      onHypotheticalControl(leaderAction.control);
      break;
    }

    case "efficiency": {
      // The leader already set the efficiency modifier.
      if (
        globals.state.replay.shared === undefined
        || globals.state.replay.shared.amLeader
      ) {
        return;
      }

      stats.setEfficiencyModifier(leaderAction.modifier);
      break;
    }
  }
});

/** Applies the shared-replay leader's change to the hypothetical. */
function onHypotheticalControl(control: HypotheticalControl) {
  switch (control.type) {
    case "start": {
      hypothetical.startSharedHypothetical();
      break;
    }

    case "end": {
      hypothetical.finishHypothetical();
      break;
    }

    case "event": {
      const action = toHypotheticalAction(control.event);
      globals.store!.dispatch({
        type: "hypotheticalAction",
        shared: true,
        action,
      });
      hypothetical.checkToggleRevealedButton(action);
      break;
    }

    case "back": {
      globals.store!.dispatch({
        type: "hypotheticalBack",
        shared: true,
      });
      break;
    }

    case "showDrawnCards": {
      globals.store!.dispatch({
        type: "hypotheticalShowDrawnCards",
        shared: true,
        showDrawnCards: control.show,
      });
      break;
    }
  }
}

/** Whether a reply about a table still applies: the connection is current and shows its game. */
function showsTable(conn: Connection, tableId: number): boolean {
  const { lobby } = globals;
  return (
    lobby.conn === conn
    && lobby.currentScreen === Screen.Game
    && lobby.ui !== undefined
    && lobby.joinedTableId === tableId
  );
}

/**
 * Asks the server for what we need to draw the game, such as the players and the variant. When it
 * arrives, we draw the UI, and then ask for the game's state ("gameStateLoad").
 */
export function loadGameInit(conn: Connection, tableId: number): void {
  conn.send("gameInitLoad", { tableId }, (reply) => {
    if (!reply.ok || !showsTable(conn, tableId)) {
      return;
    }
    const metadata: GameInit = reply.data;
    setUrl(tableId, metadata);
    initStateStore(metadata);

    // Now that we know the number of players and the variant, we can start to load & draw the UI.
    uiInit();
  });
}

// Received when spectating a game.
gameCommands.set("note", (data) => {
  // If we are an active player and we got this message, something has gone wrong.
  if (globals.state.playing) {
    return;
  }

  // The server also sends us our own notes, which we have already read.
  const oldNotes = globals.state.notes.allNotes[data.order] ?? [];
  const othersChanged = data.notes.some(
    (note) =>
      note.username !== globals.metadata.ourUsername
      && note.text
        !== (oldNotes.find((oldNote) => oldNote.username === note.username)
          ?.text ?? ""),
  );

  globals.store!.dispatch({
    type: "receiveNote",
    order: data.order,
    notes: data.notes,
  });

  // Set the note indicator.
  const card = getCardOrStackBase(data.order);
  if (card) {
    card.setNoteIndicator(othersChanged);
  }
});

/**
 * Received when a game ends, with the notes that everyone wrote. A spectator or a replay viewer
 * gets the notes of all the players and spectators. A player in a game in progress gets only their
 * own notes.
 */
gameCommands.set("noteList", (data) => {
  setNotes(data.notes);
});

function setNotes(playerNotes: GameState["notes"]) {
  const state = globals.store!.getState();
  if (state.playing && !state.finished) {
    // A player gets only their own notes.
    globals.store!.dispatch({
      type: "noteListPlayer",
      texts: playerNotes[0]?.notes ?? [],
    });
  } else {
    globals.store!.dispatch({
      type: "noteList",
      notes: playerNotes,
    });
  }

  setNoteIndicatorAndCheckForSpecialNote();
}

// Used when the game state changes.
gameCommands.set("gameEvent", (data) => {
  // A turn restarts the server's idle timer.
  modals.closeIdleWarning();

  // Update the game state.
  globals.store!.dispatch(toGameAction(data.event));
});

/**
 * Received after "gameInitLoad", when the UI is drawn, and again after we reconnect. It holds
 * everything about the game that we may see.
 */
gameCommands.set("gameState", (data) => {
  setEvents(data.events);
  if (data.deck !== undefined) {
    setCardIdentities(data.deck);
  }
  setNotes(data.notes);
  if (data.votes !== undefined) {
    setVotes(data.votes);
  }
  if (data.connections !== undefined) {
    setConnected(data.connections);
  }
  if (data.clock !== undefined) {
    timer.update(data.clock);
  }
  if (data.pause !== undefined) {
    globals.store!.dispatch({ type: "pause", ...data.pause });
  }
  setSpectators(data.spectators);
  if (data.hypothetical !== undefined) {
    // We are joining a shared replay that plays through a hypothetical line. Play all of its
    // actions so far to catch up with everyone else.
    globals.store!.dispatch({
      type: "hypotheticalStart",
      shared: true,
      showDrawnCards: data.hypothetical.showDrawnCards,
      actions: data.hypothetical.events.map(toHypotheticalAction),
    });
  }
});

function setEvents(events: GameState["events"]) {
  // Users can load a specific turn in a replay by using a URL hash
  // (e.g. "/replay/123#5"). Record the hash before we load the UI (which will overwrite the hash
  // with "#1", corresponding to the first turn).
  let specificTurnString: string | undefined;
  if (globalThis.location.hash !== "") {
    specificTurnString = globalThis.location.hash.replace("#", ""); // Strip the leading "#".
  }

  // Send the game events so far to the reducers.
  globals.store!.dispatch({
    type: "gameActionList",
    actions: events.map(toGameAction),
  });

  // We might need to go to a specific turn if we loaded a URL of e.g.:
  // http://localhost/replay/123#5
  if (specificTurnString !== undefined) {
    replay.goTo(specificTurnString);
  }
}

gameCommands.set("idleWarning", (data) => {
  modals.showIdleWarning(
    data.remainingMs,
    globals.state.playing
      ? () => {
          globals.lobby.conn!.send("idleReset", {
            tableId: globals.lobby.joinedTableId,
          });
        }
      : undefined,
  );
});

// Received when a player keeps an idle game going.
gameCommands.set("idleReset", () => {
  modals.closeIdleWarning();
});

gameCommands.set("pause", (data) => {
  // The server also sends this when we queue or unqueue a pause, which plays no sound.
  const paused = data.pausingPlayerIndex !== undefined;
  if (paused !== (globals.state.pause.pausingPlayerIndex !== undefined)) {
    globals.game!.sounds.play(
      paused ? SoundType.GamePaused : SoundType.GameUnpaused,
    );
  }

  globals.store!.dispatch({
    type: "pause",
    pausingPlayerIndex: data.pausingPlayerIndex,
    queued: data.queued,
  });
});

gameCommands.set("votes", (data) => {
  setVotes(data);
});

function setVotes(votes: Votes) {
  globals.terminationVotes = votes;
  updateTerminationVotes();
  newUiState.notify();
}

// The table's owner leads its shared replay.
gameCommands.set("tableOwner", (data) => {
  if (globals.state.replay.shared === undefined) {
    return;
  }

  globals.store!.dispatch({
    type: "replayLeader",
    username: data.owner.username,
  });
});

// This is used in shared replays to specify which players will not play again.
gameCommands.set("tableRestartDecliners", (data) => {
  if (globals.state.replay.shared === undefined) {
    return;
  }

  globals.store!.dispatch({
    type: "restartDeclined",
    restartDeclined: playerNamesAt(
      globals.metadata.playerNames,
      data.restartDecliners,
    ),
  });
});

// A spectator of a shared replay suggests a turn to its leader.
gameCommands.set("tableSuggestion", (data) => {
  if (globals.state.replay.shared === undefined) {
    return;
  }

  suggestTurn(data.username, `table${data.tableId}`, data.turn);
});

// This is used to update the names of the people currently spectating the game.
gameCommands.set("spectators", (data) => {
  setSpectators(data.spectators);
});

function setSpectators(spectators: GameState["spectators"]) {
  globals.store!.dispatch({
    type: "spectators",
    spectators,
  });
}

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
    && globals.state.replay.shared !== undefined
    && globals.state.replay.shared.amLeader
    && globals.state.replay.hypothetical === undefined
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
      sendSelfPmFromServer(
        "You are the shared replay leader, so you can simply click on the turn number instead of using the <code>/suggest</code> command.",
        room,
      );
    }
  }
}

function setUrl(tableId: number, data: GameInit) {
  const { mode } = data;
  let path: string;
  if (mode.type === "soloReplay" || mode.type === "sharedReplay") {
    // A replay of a game that is not in the database, such as an imported game, has no address.
    if (mode.gameId === undefined) {
      return;
    }
    path = `${mode.type === "sharedReplay" ? PATH.SHARED_REPLAY : PATH.REPLAY}/${mode.gameId}`;
  } else {
    path = `${PATH.GAME}/${tableId}${
      mode.type === "shadowing" ? `/shadow/${mode.ourPlayerIndex}` : ""
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

/** The clue color index or rank that a character was assigned, if it has one. */
function assignedValue(
  character: GameInit["characters"][number],
): number | undefined {
  if (character.type === "color") {
    return character.color;
  }
  return character.type === "rank" ? character.rank : undefined;
}

function initStateStore(data: GameInit) {
  // Set the variant (as a helper reference).
  globals.variant = getVariantById(data.options.variantId);

  const playerNames = toPlayerTuple(data.playerNames, "player names");
  const options: Options = {
    ...data.options,
    numPlayers: playerNames.length,
  };

  // The list is empty unless detrimental characters are on.
  let characterAssignments = data.characters.map(
    (character) => character.characterId,
  ) as Tuple<number | undefined, NumPlayers> | [];

  if (characterAssignments.length === 0) {
    characterAssignments = newArray(options.numPlayers, undefined) as Tuple<
      number | undefined,
      NumPlayers
    >;
  }

  // Create the state store (using the Redux library).
  const endGameLength = getEndGameLength(options, characterAssignments);
  const cardsPerHand = getCardsPerHand(options);
  const minEfficiency = getMinEfficiency(
    options.numPlayers,
    endGameLength,
    globals.variant,
    cardsPerHand,
  );
  const hardVariant = isHardVariant(globals.variant, minEfficiency);
  const metadata: GameMetadata = {
    ourUsername: globals.lobby.username,
    options,
    playerNames,
    ourPlayerIndex:
      "ourPlayerIndex" in data.mode ? data.mode.ourPlayerIndex : undefined,
    characterAssignments,
    characterMetadata: toPlayerTuple(
      data.characters.length === 0
        ? newArray(options.numPlayers, undefined)
        : data.characters.map(assignedValue),
      "character metadata entries",
    ),

    minEfficiency,
    hardVariant,

    customDeal: data.customDeal,
    seed: data.seed,
  };
  globals.store = createStore(stateReducer, initialState(metadata));

  // The redesigned game screen, if showing, waits for the store before it draws anything.
  newUiState.notify();

  // The various UI views subscribe to the state store.
  globals.stateObserver = new StateObserver(globals.store);

  // Make the current state available from the JavaScript console (for debugging purposes).
  globals.store.subscribe(() => {
    // eslint-disable-next-line unicorn/prefer-global-this
    window.state = globals.state;
  });

  globals.store.dispatch({
    type: "init",
    mode: data.mode,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    leader:
      data.mode.type === "sharedReplay"
        ? data.mode.sharedReplay.owner.username
        : undefined,
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
