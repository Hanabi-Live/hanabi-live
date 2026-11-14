// The observers of the game's state that do work for both game screens: they tell the server when
// the game has loaded, play sounds, send our premove on our turn, and keep a shared replay on the
// leader's turn. The classic screen's observers ("ui/reactive/StateObserver.ts") only draw it.

import type { PlayerIndex } from "@hanabi-live/game";
import { globals } from "../Globals.ts";
import * as gameSession from "./gameSession.ts";
import { gameStateSource } from "./gameStateSource.ts";
import { onOurTurn } from "./ourTurn.ts";
import type { SoundData } from "./soundEffects.ts";
import { onNewSoundEffect } from "./soundEffects.ts";
import type { State } from "./types/State.ts";
import { isOurTurn } from "./ui/isOurTurn.ts";
import type { Listener, Subscription } from "./ui/reactive/observeStore.ts";
import { observeStore, SKIP } from "./ui/reactive/observeStore.ts";
import * as replay from "./ui/replay.ts";

let unsubscribe: (() => void) | undefined;

/**
 * Starts observing a new game's state. Call it before the classic screen's observers start, so that
 * they draw the turn that a shared replay moves to.
 */
export function registerGameObservers(): void {
  releaseGameObservers();
  unsubscribe = observeStore(gameStateSource, subscriptions);
}

export function releaseGameObservers(): void {
  unsubscribe?.();
  unsubscribe = undefined;
}

/** Observes a part of the state once the game has a visible state. */
function subAfterInit<T>(
  select: (state: State) => T,
  onChange: (state: State, ...args: Parameters<Listener<T>>) => void,
): Subscription<State, T> {
  return {
    select: (state) =>
      state.visibleState === undefined ? SKIP : select(state),
    onChange: (value, previousValue, initializing) => {
      const state = gameStateSource.getState();
      if (state !== undefined) {
        onChange(state, value, previousValue, initializing);
      }
    },
  };
}

interface OngoingTurn {
  readonly segment: number | undefined;
  readonly currentPlayerIndex: PlayerIndex | undefined;
}

/**
 * When it becomes our turn, we get a notification and our premove is sent. Not while the game
 * loads, or when we catch up on several moves at once, such as after a reconnection.
 */
function onOngoingTurnChanged(
  state: State,
  data: OngoingTurn,
  previousData: OngoingTurn | undefined,
) {
  if (previousData === undefined || gameSession.isLoading()) {
    return;
  }

  const jumped =
    data.segment !== undefined
    && previousData.segment !== undefined
    && Math.abs(data.segment - previousData.segment) >= 2;
  if (!jumped && isOurTurn()) {
    onOurTurn(state);
  }
}

/** Once the game's first state is shown, the server starts our clock if it is our turn. */
function onShownChanged(shown: boolean) {
  if (!shown || !gameSession.isLoading()) {
    return;
  }

  gameSession.finishLoading();
  globals.connection.send("gameLoaded", {
    tableId: globals.joinedTableId,
  });
}

interface SharedSegmentData {
  readonly active: boolean;
  readonly sharedSegment: number | undefined;
  readonly useSharedSegments: boolean | undefined;
  readonly amLeader: boolean | undefined;
}

/**
 * In a shared replay that uses the shared turns, the leader tells the spectators each turn that
 * they go to, and the spectators go to it.
 */
function onSharedSegmentChanged(
  _state: State,
  data: SharedSegmentData,
  previousData: SharedSegmentData | undefined,
) {
  if (
    !data.active
    || data.sharedSegment === undefined
    || data.useSharedSegments !== true
  ) {
    return;
  }

  if (data.amLeader === true && previousData !== undefined) {
    globals.connection.send("replayAction", {
      tableId: globals.joinedTableId,
      action: {
        type: "turn",
        turn: data.sharedSegment,
      },
    });
    return;
  }

  // Go to the leader's turn. (Force it, in case a hypothetical just started and the leader drags us
  // to its first turn.)
  replay.goToSegment(data.sharedSegment, false, true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subscriptions: Array<Subscription<State, any>> = [
  subAfterInit(
    (s): SoundData => ({
      gameState: s.ongoingGame,
      actions: s.replay.actions,
    }),
    onNewSoundEffect,
  ),

  subAfterInit(
    (s): SharedSegmentData => ({
      active: s.replay.segment !== undefined,
      sharedSegment: s.replay.shared?.segment,
      useSharedSegments: s.replay.shared?.useSharedSegments,
      amLeader: s.replay.shared?.amLeader,
    }),
    onSharedSegmentChanged,
  ),

  subAfterInit(
    (s): OngoingTurn => ({
      segment: s.ongoingGame.turn.segment,
      currentPlayerIndex: s.ongoingGame.turn.currentPlayerIndex,
    }),
    onOngoingTurnChanged,
  ),

  {
    select: (s: State) => s.visibleState !== undefined,
    onChange: onShownChanged,
  },
];
