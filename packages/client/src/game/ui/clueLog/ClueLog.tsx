// The list of clues in the top-right-hand corner of the game UI.

import type { CardOrder, StateClue, Variant } from "@hanabi-live/game";
import { getCharacterNameForPlayer, getClueName } from "@hanabi-live/game";
import { useState } from "react";
import { useAppSelector } from "../../../store.ts";
import {
  CLUE_LOG,
  FONT_FAMILY,
  PANEL_CORNER_RADIUS,
  PANEL_OPACITY,
} from "../constants.ts";
import { fitFontSize } from "../fitFontSize.ts";
import * as replay from "../replay.ts";

/** How far the entries are inset from each edge of the panel, in fractions of the stage. */
const TEXT_INSET = 0.01;

/** The height of each entry, as a fraction of the stage height. */
const ENTRY_HEIGHT = 0.017;

/** The gap below each entry, as a fraction of the stage height. */
const ENTRY_GAP = 0.001;

const BACKGROUND_OPACITY = 0.1;

/** The opacity of an entry under the mouse or related to the card under the mouse. */
const HIGHLIGHT_OPACITY = 0.4;

/** Light red, for an entry whose clue did not touch the card under the mouse. */
const NEGATIVE_HIGHLIGHT_RGB = "255 119 119";

/** The size of the text in every column, as a fraction of the entry's height. */
const FONT_SIZE = 0.9;

/**
 * The columns of an entry, as fractions of its width. The giver, the target, and the clue name sit
 * in a row, with `GAP` before each one.
 */
const COLUMN = {
  GAP: 0.05,
  PLAYER_NAME_W: 0.3,
  CLUE_NAME_W: 0.2,
  /**
   * The center of the cross that marks a clue that did not touch the card under the mouse. It
   * overlaps the end of the clue name, near the right edge of the entry.
   */
  NEGATIVE_MARKER_CENTER_X: 0.98,
} as const;

const GIVER_X = COLUMN.GAP;
const TARGET_X = GIVER_X + COLUMN.PLAYER_NAME_W + COLUMN.GAP;
const CLUE_NAME_X = TARGET_X + COLUMN.PLAYER_NAME_W + COLUMN.GAP;

const NO_CLUES = [] as const satisfies readonly StateClue[];

/** How an entry relates to the card under the mouse. */
type Match = "none" | "positive" | "negative";

export interface ClueLogProps {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  /** The card under the mouse, whose clues are highlighted. */
  readonly hoveredCardOrder: CardOrder | undefined;
}

export function ClueLog({
  stageWidth,
  stageHeight,
  variant,
  colorblindMode,
  hoveredCardOrder,
}: ClueLogProps): React.JSX.Element {
  const clues = useAppSelector(
    (state) => state.game.current?.visibleState?.clues ?? NO_CLUES,
  );
  const metadata = useAppSelector((state) => state.game.current?.metadata);
  const playerNames = metadata?.playerNames ?? [];
  const characterAssignments = metadata?.characterAssignments ?? [];

  const entryWidth = (CLUE_LOG.w - TEXT_INSET * 2) * stageWidth;
  const entryHeight = ENTRY_HEIGHT * stageHeight;
  const entryGap = ENTRY_GAP * stageHeight;
  const listHeight = (CLUE_LOG.h - TEXT_INSET * 2) * stageHeight;

  // In a 2-player game, there can be more clues than fit in the log. If so, show the latest ones.
  const maxEntries = Math.floor(
    (listHeight + entryGap) / (entryHeight + entryGap),
  );
  const firstIndex = Math.max(0, clues.length - maxEntries);

  return (
    <div
      className="tw:absolute tw:select-none"
      style={{
        left: CLUE_LOG.x * stageWidth,
        top: CLUE_LOG.y * stageHeight,
        width: CLUE_LOG.w * stageWidth,
        height: CLUE_LOG.h * stageHeight,
        borderRadius: PANEL_CORNER_RADIUS * stageWidth,
        backgroundColor: `rgb(0 0 0 / ${PANEL_OPACITY})`,
      }}
    >
      <div
        className="tw:absolute tw:flex tw:flex-col"
        style={{
          left: TEXT_INSET * stageWidth,
          top: TEXT_INSET * stageHeight,
          gap: entryGap,
        }}
      >
        {clues.slice(firstIndex).map((clue, i) => (
          <ClueEntry
            clue={clue}
            giverName={playerNames[clue.giver] ?? ""}
            height={entryHeight}
            // The index in the whole game, so an entry keeps its hover state while older entries
            // scroll out of the log.
            key={firstIndex + i}
            match={getMatch(clue, hoveredCardOrder)}
            name={getClueName(
              clue,
              variant,
              getCharacterNameForPlayer(clue.giver, characterAssignments),
            )}
            showNegativeMarker={colorblindMode}
            targetName={playerNames[clue.target] ?? ""}
            width={entryWidth}
          />
        ))}
      </div>
    </div>
  );
}

function getMatch(clue: StateClue, cardOrder: CardOrder | undefined): Match {
  if (cardOrder === undefined) {
    return "none";
  }
  if (clue.list.includes(cardOrder)) {
    return "positive";
  }
  if (clue.negativeList.includes(cardOrder)) {
    return "negative";
  }
  return "none";
}

function ClueEntry({
  clue,
  giverName,
  targetName,
  name,
  match,
  showNegativeMarker,
  width,
  height,
}: {
  readonly clue: StateClue;
  readonly giverName: string;
  readonly targetName: string;
  readonly name: string;
  readonly match: Match;
  readonly showNegativeMarker: boolean;
  readonly width: number;
  readonly height: number;
}) {
  const [hovered, setHovered] = useState(false);

  const fontSize = FONT_SIZE * height;
  const playerNameWidth = COLUMN.PLAYER_NAME_W * width;
  const clueNameWidth = COLUMN.CLUE_NAME_W * width;
  const opacity =
    hovered || match !== "none" ? HIGHLIGHT_OPACITY : BACKGROUND_OPACITY;
  const rgb = match === "negative" ? NEGATIVE_HIGHLIGHT_RGB : "255 255 255";

  return (
    <div
      className="tw:relative tw:shrink-0 tw:text-white"
      onClick={() => {
        // Go to the turn in the replay where this clue was given.
        replay.goToSegment(clue.segment + 1, true);
      }}
      // Touch screens show no hover highlight.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setHovered(true);
        }
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      style={{
        width,
        height,
        backgroundColor: `rgb(${rgb} / ${opacity})`,
        fontFamily: FONT_FAMILY,
        lineHeight: `${height}px`,
      }}
    >
      <Column
        fitText
        fontSize={fontSize}
        text={giverName}
        width={playerNameWidth}
        x={GIVER_X * width}
      />
      <Column
        fitText
        fontSize={fontSize}
        text={targetName}
        width={playerNameWidth}
        x={TARGET_X * width}
      />
      <Column
        center
        fontSize={fontSize}
        text={name}
        width={clueNameWidth}
        x={CLUE_NAME_X * width}
      />
      {match === "negative" && showNegativeMarker && (
        <Column
          center
          fontSize={fontSize}
          // eslint-disable-next-line complete/require-ascii
          text="✘"
          width={clueNameWidth}
          x={COLUMN.NEGATIVE_MARKER_CENTER_X * width - clueNameWidth / 2}
        />
      )}
    </div>
  );
}

/** One column of text in an entry. Text that does not fit can shrink to fit. */
function Column({
  text,
  fontSize,
  x,
  width,
  center = false,
  fitText = false,
}: {
  readonly text: string;
  readonly fontSize: number;
  readonly x: number;
  readonly width: number;
  readonly center?: boolean;
  readonly fitText?: boolean;
}) {
  return (
    <span
      className="tw:absolute tw:top-0 tw:whitespace-nowrap"
      style={{
        left: x,
        width,
        textAlign: center ? "center" : undefined,
        fontSize: fitText
          ? fitFontSize(text, FONT_FAMILY, fontSize, width)
          : fontSize,
      }}
    >
      {text}
    </span>
  );
}
