import { useEffect, useRef, useState } from "react";
import { endNow, toggleVote, votersText } from "../ui/terminationVotes.ts";
import { EASE_OUT_BACK, prefersReducedMotion } from "./playMotion.ts";

/** The votes to end the game, as the server sends them to us. */
interface Votes {
  readonly voted: boolean;
  readonly numVotes: number;
  readonly numVotesNeeded: number;
}

const BUTTON_CLASS =
  "tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:px-4 tw:text-[15px] tw:whitespace-nowrap tw:text-game-text tw:narrow-980:h-9 tw:narrow-980:px-3 tw:narrow-980:text-sm";

const ITEM_CLASS =
  "tw:flex tw:w-full tw:cursor-pointer tw:flex-col tw:items-start tw:gap-0.5 tw:rounded-lg tw:border-0 tw:px-3 tw:py-2.5 tw:text-left";

const ITEM_DETAIL_CLASS = "tw:text-[12px] tw:leading-[16px]";

/** How long a vote takes to pop in, in milliseconds. */
const POP_MILLISECONDS = 220;

/** Pops a vote's dot in when it fills, so that a new vote catches the eye. */
function popIn(element: HTMLElement | null) {
  if (element === null || prefersReducedMotion()) {
    return;
  }
  element.animate(
    [
      { transform: "scale(0.6)", opacity: 0 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: POP_MILLISECONDS, easing: EASE_OUT_BACK },
  );
}

/**
 * The button that ends the game early, for the players of an ongoing game. Its menu casts (or takes
 * back) a vote to end the game, or ends it for everyone right away. Ending it now is the red choice
 * inside the menu, so that one click by mistake cannot end the game.
 */
export function EndGameMenu({
  votes,
  numPlayers,
}: {
  readonly votes: Votes | undefined;
  readonly numPlayers: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // A click elsewhere, or the Escape key, closes the menu.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node
        && containerRef.current?.contains(event.target) !== true
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const voted = votes?.voted === true;
  const numVotes = votes?.numVotes ?? 0;
  const label =
    votes === undefined || numVotes === 0
      ? "End game"
      : `End game: ${numVotes} of ${votes.numVotesNeeded} votes to end${voted ? ", including yours" : ""}`;

  return (
    <div className="tw:relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={`${BUTTON_CLASS} ${
          numVotes > 0
            ? `tw:bg-critical/20 tw:hover:bg-critical/30 ${voted ? "tw:ring-2 tw:ring-critical" : "tw:ring-1 tw:ring-critical/70"}`
            : "tw:bg-game-raised tw:hover:bg-game-line"
        }`}
        onClick={() => {
          setOpen(!open);
        }}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-skull" />
        {voted ? "Voted to end" : "End game"}
        {votes !== undefined && numVotes > 0 && (
          <span aria-hidden="true" className="tw:flex tw:gap-1">
            {Array.from({ length: votes.numVotesNeeded }, (_, i) => {
              const filled = i < numVotes;
              return (
                <span
                  className={`tw:size-2.5 tw:rounded-full ${
                    filled
                      ? "tw:bg-critical tw:ring-1 tw:ring-white/80"
                      : "tw:ring-1 tw:ring-game-muted"
                  }`}
                  // A dot that fills is a new element, so that it pops in.
                  key={`${i}-${filled}`}
                  ref={filled ? popIn : undefined}
                />
              );
            })}
          </span>
        )}
        <i aria-hidden="true" className="fas fa-caret-up tw:text-[12px]" />
      </button>
      {open && (
        <div
          className="tw:absolute tw:right-0 tw:bottom-full tw:z-30 tw:mb-2 tw:flex tw:w-64 tw:flex-col tw:gap-1 tw:rounded-[14px] tw:bg-game-panel tw:p-1.5 tw:shadow-lg tw:ring-1 tw:ring-game-line"
          role="menu"
        >
          <div className="tw:flex tw:flex-col tw:gap-0.5 tw:px-3 tw:pt-1.5 tw:pb-1">
            <span className="tw:text-[15px] tw:font-bold tw:text-game-text">
              End the game?
            </span>
            {votes !== undefined && (
              <span className="tw:text-[12px] tw:text-game-muted">
                A vote ends it when{" "}
                {votersText(votes.numVotesNeeded, numPlayers)} vote.
              </span>
            )}
          </div>
          <button
            className={`${ITEM_CLASS} tw:bg-transparent tw:text-game-text tw:hover:bg-white/10`}
            onClick={() => {
              setOpen(false);
              toggleVote();
            }}
            role="menuitem"
            type="button"
          >
            <span className="tw:text-[14px] tw:font-bold">
              {voted ? "Take back my vote" : "Vote to end"}
            </span>
            {votes !== undefined && (
              <span className={`${ITEM_DETAIL_CLASS} tw:text-game-muted`}>
                {votes.numVotes === 0
                  ? "No votes yet"
                  : `${votes.numVotes} of ${votes.numVotesNeeded} votes so far`}
              </span>
            )}
          </button>
          <button
            className={`${ITEM_CLASS} tw:bg-critical tw:text-white tw:hover:brightness-110`}
            onClick={() => {
              setOpen(false);
              endNow();
            }}
            role="menuitem"
            type="button"
          >
            <span className="tw:text-[14px] tw:font-bold">End now</span>
            <span className={`${ITEM_DETAIL_CLASS} tw:text-white/85`}>
              Ends it for everyone right away
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
