import { useEffect, useLayoutEffect, useRef } from "react";
import { CLOSE_DURATION_IN_MILLISECONDS } from "../../Tooltip.ts";
import { fadeOutCopy } from "./motion.ts";
import { KEY_CLASS } from "./surfaces.ts";

/** How long the queued card takes to settle into its place when the player queues it. */
const SETTLE_MILLISECONDS = 220;

/**
 * The move that the player queued while it was another player's turn, over the place where it goes:
 * the queued card over the play stacks or the discard pile, or a clue over the hands. It stays
 * there until the player's turn, as on the classic screen, with a button that cancels it. The ring
 * in the color of clues and the slight tilt tell it apart from the cards on the table. Once the
 * move is sent, the button goes, and the card moves from here when the move arrives.
 */
export function QueuedMove({
  text,
  cancelLabel,
  sent,
  reducedMotion,
  onCancel,
  children,
}: {
  /** What the move does, such as "Plays on your turn". */
  readonly text: string;
  readonly cancelLabel: string;
  readonly sent: boolean;
  readonly reducedMotion: boolean;
  readonly onCancel: () => void;
  /** The queued card, if the move has one. */
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // When the player cancels the move, a copy of it fades out (see `fadeOutCopy`). A move that is
  // sent goes at once, since its card moves from here to where it lands.
  const canceledRef = useRef(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    return () => {
      if (box !== null && canceledRef.current) {
        fadeOutCopy(box, [{ opacity: 1 }, { opacity: 0 }], {
          duration: CLOSE_DURATION_IN_MILLISECONDS,
          easing: "ease-in",
        });
      }
    };
  }, []);

  // The card settles in from a little above, as if the player had just set it down.
  useEffect(() => {
    const card = cardRef.current;
    if (card === null || reducedMotion) {
      return undefined;
    }
    const animation = card.animate(
      [
        {
          transform: "translateY(-10px) rotate(-6deg) scale(1.08)",
          opacity: 0,
        },
        {
          transform: "rotate(-3deg)",
          opacity: 1,
        },
      ],
      {
        duration: SETTLE_MILLISECONDS,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  return (
    <div
      aria-label={text}
      className="tw:absolute tw:top-2 tw:left-1/2 tw:z-30 tw:flex tw:-translate-x-1/2 tw:flex-col tw:items-center tw:gap-2 tw:rounded-game-panel tw:bg-game-panel tw:p-2.5 tw:shadow-[0_8px_24px_rgb(0_0_0/45%)] tw:ring-2 tw:ring-clue"
      data-queued-move
      ref={boxRef}
      role="status"
    >
      {children !== undefined && (
        <div className="tw:rotate-[-3deg]" ref={cardRef}>
          {children}
        </div>
      )}
      <span className="tw:text-[13px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text">
        {text}
      </span>
      {!sent && (
        <button
          aria-label={cancelLabel}
          className={`tw:min-h-8 tw:w-full tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-white/8 tw:px-3 tw:text-[14px] tw:font-semibold tw:text-game-text tw:hover:bg-white/15 ${KEY_CLASS}`}
          onClick={() => {
            canceledRef.current = !reducedMotion;
            onCancel();
          }}
          type="button"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
