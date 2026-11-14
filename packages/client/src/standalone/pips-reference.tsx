// A reference page that draws every pip of the suits, built as a standalone page.

import type { Suit, SuitFill, Variant } from "@hanabi-live/game";
import { Pip, SUITS_MAP } from "@hanabi-live/game";
import { assertNotNull, getEnumValues } from "complete-common";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { drawPip } from "../game/ui/drawPip.ts";

/** The width and height of each pip's canvas, in pixels. */
const PIP_CANVAS_SIZE = 200;

/** The fill of a pip whose suit does not define one. */
const DEFAULT_PIP_FILL = "#cccccc";

interface PipInfo {
  readonly pip: Pip;
  /** The name of the first suit with the pip, or the pip itself if no suit has it. */
  readonly name: string;
  readonly fill: SuitFill | undefined;
}

function getUniquePips(): readonly PipInfo[] {
  const uniquePips = new Map<string, PipInfo>();

  for (const suit of SUITS_MAP.values()) {
    if (
      suit.pip !== "none"
      && suit.pip !== "auto"
      && !uniquePips.has(suit.pip)
    ) {
      uniquePips.set(suit.pip, {
        pip: suit.pip,
        name: suit.name,
        fill:
          suit.fillColors === undefined
            ? { fill: suit.fill, fillColorblind: suit.fillColorblind }
            : { fillColors: suit.fillColors },
      });
    }
  }

  for (const pip of getEnumValues(Pip)) {
    if (!uniquePips.has(pip)) {
      uniquePips.set(pip, { pip, name: pip, fill: undefined });
      console.warn(`The "${pip}" pip is not assigned a suit.`);
    }
  }

  return [...uniquePips.values()];
}

function drawPipCanvas(canvas: HTMLCanvasElement, info: PipInfo) {
  const ctx = canvas.getContext("2d");
  assertNotNull(ctx, "Failed to get the canvas.");

  ctx.clearRect(0, 0, PIP_CANVAS_SIZE, PIP_CANVAS_SIZE);
  // Center the drawing.
  ctx.save();
  ctx.translate(PIP_CANVAS_SIZE / 2, PIP_CANVAS_SIZE / 2);

  const mockSuit: Partial<Suit> = {
    pip: info.pip,
    ...(info.fill ?? {
      fill: DEFAULT_PIP_FILL,
      fillColorblind: DEFAULT_PIP_FILL,
    }),
  };
  const mockVariant: Partial<Variant> = {
    suits: [mockSuit as Suit],
    pips: [info.pip],
  };

  try {
    drawPip(ctx, mockSuit as Suit, mockVariant as Variant);
  } catch (error) {
    console.error(`Error drawing pip ${info.pip}:`, error);
  }

  ctx.restore();
}

function PipsReference() {
  const pips = getUniquePips();

  return (
    <>
      {pips.map((info) => (
        <div className="pip-wrapper" key={info.pip}>
          <canvas
            className="pip-canvas"
            height={PIP_CANVAS_SIZE}
            ref={(canvas) => {
              if (canvas !== null) {
                drawPipCanvas(canvas, info);
              }
            }}
            width={PIP_CANVAS_SIZE}
          />
          <div className="pip-label">
            <div className="pip-name">{info.name}</div>
            <div className="pip-id">{info.pip}</div>
          </div>
        </div>
      ))}
      <div className="pip-count">Total unique pips: {pips.length}</div>
    </>
  );
}

const container = document.querySelector("#pips-container");
assertNotNull(container, "Container element not found.");
createRoot(container).render(
  <StrictMode>
    <PipsReference />
  </StrictMode>,
);
