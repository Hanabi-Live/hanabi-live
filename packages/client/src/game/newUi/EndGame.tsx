import type { ServerEventData } from "@hanabi-live/data";
import { useRef, useState } from "react";
import { store } from "../../store.ts";
import { endNow, setVote, votersText } from "../ui/terminationVotes.ts";
import {
  FADE_LAYER_PARENT_CLASS,
  FadeInLabel,
  FadeLayer,
} from "./FadeLayer.tsx";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { Menu, MENU_BUTTON_CLASS, MenuCaret } from "./Menu.tsx";
import {
  BOTTOM_BAR_BUTTON_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_COLOR_CLASS,
} from "./surfaces.ts";

/** Our own vote to end the game. The server does not tell us how the others voted. */
type Votes = Omit<ServerEventData["votes"], "tableId">;

const ITEM_CLASS = `tw:flex tw:flex-col tw:items-start tw:gap-0.5 ${MENU_ITEM_CLASS}`;

const ITEM_DETAIL_CLASS = "tw:text-[12px] tw:leading-[16px] tw:font-normal";

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

  useCloseOnOutsideClick(open, containerRef, setOpen);

  const voted = votes?.voted === true;
  const { reducedMotion } = store.getState().session.settings;

  return (
    <div className="tw:relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${BOTTOM_BAR_BUTTON_CLASS} ${MENU_BUTTON_CLASS} tw:bg-transparent ${FADE_LAYER_PARENT_CLASS}`}
        onClick={() => {
          setOpen(!open);
        }}
        type="button"
      >
        {/* The button's color is two layers that fade into each other (see `FadeLayer`). */}
        <FadeLayer
          className="tw:bg-button-translucent tw:group-hover/layer:bg-button-translucent-hover"
          reducedMotion={reducedMotion}
          shown={!voted}
        />
        <FadeLayer
          className="tw:bg-critical/20 tw:ring-2 tw:ring-critical tw:group-hover/layer:bg-critical/30"
          reducedMotion={reducedMotion}
          shown={voted}
        />
        <i aria-hidden="true" className="fas fa-skull" />
        <FadeInLabel
          label={voted ? "Voted to end" : "End game"}
          reducedMotion={reducedMotion}
        />
        <MenuCaret open={open} />
      </button>
      {open && (
        <Menu align="right" className="tw:w-64">
          <div className="tw:flex tw:flex-col tw:gap-0.5 tw:px-1 tw:pt-1">
            <span className="tw:text-[15px] tw:font-bold tw:text-game-text">
              End the game?
            </span>
            <span className="tw:text-[12px] tw:text-game-muted">
              Only you see your vote.
            </span>
          </div>
          <button
            className={`${ITEM_CLASS} ${MENU_ITEM_COLOR_CLASS}`}
            onClick={() => {
              setOpen(false);
              setVote(!voted);
            }}
            role="menuitem"
            type="button"
          >
            <span className="tw:text-[14px] tw:font-bold">
              {voted ? "Take back my vote" : "Vote to end"}
            </span>
            {votes !== undefined && (
              <span className={`${ITEM_DETAIL_CLASS} tw:text-game-muted`}>
                Ends when {votersText(votes.numVotesNeeded, numPlayers)} vote
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
        </Menu>
      )}
    </div>
  );
}
