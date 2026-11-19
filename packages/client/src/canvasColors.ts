// The classic game screen is drawn on a Konva canvas, so CSS does not color it. The palette colors
// are defined as CSS custom properties in "public/css/tokens.css" and read from the computed style,
// so that the canvas and the CSS share a single source of truth.

interface CanvasColors {
  /** The turn numbers in the full action log. */
  readonly actionLogNumber: string;
  /** The large current-player text (such as "It is Bob's turn"). */
  readonly currentPlayerText: string;
  /** The shared replay shuttle. */
  readonly replayShuttle: string;
  /** The pause / restart overlay rectangles. */
  readonly surfaceArea: string;
  /** The outline of the loading screen labels. */
  readonly loadingLabelStroke: string;
}

/** Reads a CSS custom property from the document root. */
function getCssVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Gets the canvas colors. */
export function getCanvasColors(): CanvasColors {
  return {
    actionLogNumber: getCssVariable("--canvas-action-log-number"),
    currentPlayerText: getCssVariable("--canvas-current-player-text"),
    replayShuttle: getCssVariable("--canvas-replay-shuttle"),
    surfaceArea: getCssVariable("--canvas-surface-area"),
    loadingLabelStroke: getCssVariable("--canvas-loading-label-stroke"),
  };
}
