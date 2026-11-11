import Konva from "konva";
import type { ShapeConfig } from "konva/lib/Shape";
import { drawWithKonva3Shadow } from "./konva3Shadow.ts";

interface OutlinedArrowConfig extends ShapeConfig {
  /** The tail and then the tip of the arrow: `[x1, y1, x2, y2]`. */
  points: readonly [number, number, number, number];
  pointerLength: number;
  pointerWidth: number;

  /** The width of the arrow's shaft. The arrowhead also grows by half of it on every side. */
  bodyWidth: number;

  /** The width of the black outline around the arrow. */
  outlineWidth: number;
}

/**
 * Make an arrow with a black outline, drawn as one closed path. Its fill shows the color of the
 * arrow, so it can also be a gradient.
 *
 * It looks the same as a `Konva.Arrow` with a stroke width of `bodyWidth`, drawn on top of a black
 * `Konva.Arrow` that is wider by twice `outlineWidth`.
 */
export function outlinedArrow(config: OutlinedArrowConfig): Konva.Shape {
  const {
    points,
    pointerLength,
    pointerWidth,
    bodyWidth,
    outlineWidth,
    ...shapeConfig
  } = config;
  const outline = getOutline(
    points,
    pointerLength,
    pointerWidth,
    bodyWidth,
    outlineWidth,
  );
  const xs = outline.filter((_, i) => i % 2 === 0);
  const ys = outline.filter((_, i) => i % 2 === 1);
  const selfRect = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };

  return new Konva.Shape({
    ...shapeConfig,
    stroke: "black",
    strokeWidth: outlineWidth,
    sceneFunc: (context, shape) => {
      drawWithKonva3Shadow(shape, context, () => {
        context.beginPath();
        context.moveTo(outline[0]!, outline[1]!);
        for (let i = 2; i < outline.length; i += 2) {
          context.lineTo(outline[i]!, outline[i + 1]!);
        }
        context.closePath();
        context.fillStrokeShape(shape);
      });
    },
    selfRectFunc: () => selfRect,
  });
}

/**
 * Get the corners of the path along the middle of the outline, as a flat list of coordinates. The
 * stroke along this path is the outline, and the area inside the stroke is the arrow's color.
 */
function getOutline(
  points: readonly [number, number, number, number],
  pointerLength: number,
  pointerWidth: number,
  bodyWidth: number,
  outlineWidth: number,
): readonly number[] {
  const [x1, y1, x2, y2] = points;
  const length = Math.hypot(x2 - x1, y2 - y1);

  // The unit vectors along the arrow and across it.
  const alongX = (x2 - x1) / length;
  const alongY = (y2 - y1) / length;
  const acrossX = -alongY;
  const acrossY = alongX;

  // Every side of the path is this far outside of the area with the arrow's color.
  const grow = bodyWidth / 2 + outlineWidth / 2;

  // The arrowhead is a triangle that grows by the same distance on every side, with its corners
  // kept sharp.
  const halfPointerWidth = pointerWidth / 2;
  const sideLength = Math.hypot(pointerLength, halfPointerWidth);
  const tip = length + (grow * sideLength) / halfPointerWidth;
  const base = length - pointerLength - grow;
  const halfBaseWidth =
    (grow * sideLength + (pointerLength + grow) * halfPointerWidth)
    / pointerLength;

  const corners: Array<readonly [along: number, across: number]> = [
    [-outlineWidth / 2, -grow],
    [base, -grow],
    [base, -halfBaseWidth],
    [tip, 0],
    [base, halfBaseWidth],
    [base, grow],
    [-outlineWidth / 2, grow],
  ];

  return corners.flatMap(([along, across]) => [
    x1 + along * alongX + across * acrossX,
    y1 + along * alongY + across * acrossY,
  ]);
}
