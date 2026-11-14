// Draws on the classic screen what the server's game messages change outside of the game's state.
// The game's message handlers ("../gameCommands.ts") call these for both screens, so each one does
// nothing while the classic screen is not shown.

import type { ServerEventData } from "@hanabi-live/data";
import type { CardOrder } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { globals as lobbyGlobals } from "../../Globals.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { updateTerminationVotes } from "./drawUi.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import * as notes from "./notes.ts";

type LeaderArrowTarget = Extract<
  ServerEventData["replayAction"]["action"],
  { type: "arrow" }
>["target"];

/** Whether each player is connected, from the last "connections" message. */
let connections: readonly boolean[] = [];

function isClassicScreenShown(): boolean {
  return lobbyGlobals.ui !== undefined;
}

/** Records which players are connected, and shows it on the classic screen. */
export function setConnections(connectedList: readonly boolean[]): void {
  connections = connectedList;
  drawConnections();
}

/** Shows on the classic screen's player names which players are connected. */
export function drawConnections(): void {
  if (!isClassicScreenShown()) {
    return;
  }

  for (const [i, connected] of connections.entries()) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame !== undefined) {
      nameFrame.setConnected(connected);
    }
  }

  globals.layers.UI.batchDraw();
}

/** Shows the arrow that the shared replay's leader points with, or hides it. */
export function drawLeaderArrow(target: LeaderArrowTarget): void {
  if (!isClassicScreenShown()) {
    return;
  }

  arrows.hideAll();
  if (target !== undefined) {
    arrows.toggle(target.type === "card" ? target.order : target.element);
  }
}

/** Shows that a card has a note, after someone else changed it. */
export function drawNoteIndicator(order: CardOrder): void {
  if (!isClassicScreenShown()) {
    return;
  }

  getCardOrStackBase(order)?.setNoteIndicator(true);
}

/** Shows the note indicators and the special notes of every card, after the notes arrive. */
export function drawAllNotes(): void {
  if (!isClassicScreenShown()) {
    return;
  }

  notes.setAllCardIndicators();

  const indexOfLastDrawnCard = globals.state.visibleState!.deck.length - 1;
  for (const order of iRange(indexOfLastDrawnCard)) {
    const card = getCardOrStackBase(order as CardOrder);
    if (card) {
      card.checkSpecialNote();
      card.setRaiseAndShadowOffset();
    }
  }

  for (const stackBase of globals.stackBases) {
    stackBase.checkSpecialNote();
  }
}

/** Shows whether we voted to end the game. */
export function drawTerminationVotes(): void {
  if (!isClassicScreenShown()) {
    return;
  }

  updateTerminationVotes();
}

/** Forgets the previous game's connections. */
export function resetConnections(): void {
  connections = [];
}
