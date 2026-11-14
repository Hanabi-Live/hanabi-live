// The keyboard shortcuts of the redesigned game screen, as on the classic screen.

import type { Clue, PlayerIndex, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

/**
 * The keys that choose a color clue, in the order of the variant's colors, as on the classic
 * screen. They sit next to the number keys, which choose a rank.
 */
const COLOR_CLUE_KEYS = ["q", "w", "e", "r", "t", "y"] as const;

/** Whether a key press goes into a text box, such as the chat, rather than to the game. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement
    && (target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement)
  );
}

interface SpacebarEmpathy {
  /** Whether every hand shows as its player sees it. */
  readonly globalEmpathy: boolean;
  /** Whether that view also applies the viewer's notes. */
  readonly globalEmpathyNotes: boolean;
}

/**
 * Holding the spacebar shows every hand as its player sees it, as on the classic screen. Ctrl +
 * Space also applies the viewer's notes.
 */
export function useSpacebarEmpathy(): SpacebarEmpathy {
  const [globalEmpathy, setGlobalEmpathy] = useState(false);
  const [globalEmpathyNotes, setGlobalEmpathyNotes] = useState(false);
  useEffect(() => {
    let spaceHeld = false;

    function onKeyDown(event: KeyboardEvent) {
      // Pressing or releasing Ctrl while the spacebar is held changes the view at once. Otherwise,
      // it changes only when the spacebar repeats, and Ctrl stops that repeat.
      if (event.key === "Control") {
        if (spaceHeld) {
          setGlobalEmpathyNotes(true);
        }
        return;
      }
      if (event.key !== " " || isTyping(event.target)) {
        return;
      }
      // Otherwise, the spacebar would also press the button that has the focus.
      event.preventDefault();
      spaceHeld = true;
      setGlobalEmpathy(true);
      setGlobalEmpathyNotes(event.ctrlKey);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") {
        setGlobalEmpathyNotes(false);
        return;
      }
      if (event.key !== " ") {
        return;
      }
      if (!isTyping(event.target)) {
        event.preventDefault();
      }
      spaceHeld = false;
      setGlobalEmpathy(false);
    }

    // A window that loses the focus never gets the key's release.
    function onBlur() {
      spaceHeld = false;
      setGlobalEmpathy(false);
    }

    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    globalThis.addEventListener("blur", onBlur);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
    };
  }, []);

  return { globalEmpathy, globalEmpathyNotes };
}

export interface ClueHotkeys {
  /** Whether the player may give a clue now. */
  readonly canClue: boolean;
  readonly variant: Variant;
  /** The players who can get a clue, in the order that Tab goes through them. */
  readonly clueTargets: ReadonlyArray<{ readonly playerIndex: PlayerIndex }>;
  readonly clueTarget: PlayerIndex | undefined;
  readonly onChooseTarget: (playerIndex: PlayerIndex) => void;
  readonly onChooseClue: (clue: Clue) => void;
  readonly onGive: () => void;
}

/**
 * The clue hotkeys of the classic screen: Tab or ";" picks the next player, "1" to "5" pick a rank,
 * "q" to "y" pick a color, and Ctrl + Enter gives the clue. The listener stays the same, so it
 * reads the latest screen from `hotkeys`, which each render of the screen replaces. They do nothing
 * while it is empty.
 */
export function useClueHotkeys(
  hotkeys: RefObject<ClueHotkeys | undefined>,
): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (hotkeys.current !== undefined) {
        onClueKey(event, hotkeys.current);
      }
    }
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [hotkeys]);
}

function onClueKey(event: KeyboardEvent, hotkeys: ClueHotkeys) {
  const { canClue, variant, clueTargets, clueTarget } = hotkeys;
  if (!canClue || isTyping(event.target)) {
    return;
  }

  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    hotkeys.onGive();
    return;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (event.key === "Tab" || event.key === ";") {
    event.preventDefault();
    const index = clueTargets.findIndex(
      (player) => player.playerIndex === clueTarget,
    );
    const next = clueTargets[(index + 1) % clueTargets.length];
    if (next !== undefined) {
      hotkeys.onChooseTarget(next.playerIndex);
    }
    return;
  }

  const rank = variant.clueRanks[Number(event.key) - 1];
  if (rank !== undefined && /^\d$/u.test(event.key)) {
    hotkeys.onChooseClue(newRankClue(rank));
    return;
  }
  const color =
    variant.clueColors[
      COLOR_CLUE_KEYS.indexOf(
        event.key.toLowerCase() as (typeof COLOR_CLUE_KEYS)[number],
      )
    ];
  if (color !== undefined) {
    hotkeys.onChooseClue(newColorClue(color));
  }
}
