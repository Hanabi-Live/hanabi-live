// The move that the player queued while it was another player's turn (a "premove"). It is sent on
// their turn (see "ourTurn.ts").

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { store } from "../../store.ts";
import { gameUpdated } from "../gameSlice.ts";
import type { ClientAction } from "../types/ClientAction.ts";
import type { State } from "../types/State.ts";

/**
 * How long a queued card keeps its place after its move is sent, while the move is on its way. The
 * card then moves from there, not from the hand. If the move does not arrive, such as when the
 * server refuses it, the card goes back to the hand.
 */
const SENT_MOVE_WAIT_MILLISECONDS = 3000;

interface QueuedMove {
  /** The queued move, which shows until it arrives. */
  readonly move: ClientAction | undefined;

  /** Whether the move is on its way, so that it can no longer be canceled. */
  readonly sent: boolean;

  readonly cancel: () => void;
}

/** The queued move, and how to cancel it. */
export function useQueuedMove(state: State | undefined): QueuedMove {
  const premove = state?.premove;
  const turnNum = state?.ongoingGame.turn.turnNum;
  // The move that was sent, and the turn that it was sent on. It arrives on the next turn.
  const [sent, setSent] = useState<{
    readonly move: ClientAction;
    readonly turnNum: number | undefined;
  }>();
  const previousRef = useRef(premove);
  const canceledRef = useRef(false);

  // On our turn, the queued move is cleared and then sent. Before the screen paints, the card takes
  // its place again until the move arrives.
  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = premove;
    if (previous === premove) {
      return;
    }
    if (premove !== undefined) {
      setSent(undefined);
    } else if (previous !== undefined && !canceledRef.current) {
      setSent({
        move: previous,
        turnNum,
      });
    }
    canceledRef.current = false;
  }, [premove, turnNum]);

  useEffect(() => {
    if (sent === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setSent(undefined);
    }, SENT_MOVE_WAIT_MILLISECONDS);
    return () => {
      clearTimeout(timeout);
    };
  }, [sent]);

  const sentMove = sent?.turnNum === turnNum ? sent?.move : undefined;
  return {
    move: premove ?? sentMove,
    sent: premove === undefined && sentMove !== undefined,
    cancel: () => {
      canceledRef.current = true;
      store.dispatch(
        gameUpdated({
          type: "premove",
          premove: undefined,
        }),
      );
    },
  };
}
