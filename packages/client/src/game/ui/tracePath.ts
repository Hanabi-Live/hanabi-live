/** The number of coordinates that each SVG path command takes. */
const COMMAND_COORDINATES = {
  M: 2,
  L: 2,
  Q: 4,
  C: 6,
  Z: 0,
} as const;

type Command = keyof typeof COMMAND_COORDINATES;

function isCommand(token: string): token is Command {
  return Object.hasOwn(COMMAND_COORDINATES, token);
}

/**
 * Adds SVG path data to the context's current path. It reads only absolute commands that each
 * repeat their letter: `M`, `L`, `Q`, `C`, and `Z`.
 *
 * The points are added to the current path instead of to a `Path2D`, so the caller can fill and
 * stroke them, as with any other path.
 */
export function tracePath(ctx: CanvasRenderingContext2D, path: string): void {
  const tokens = path.split(/[\s,]+/u).filter((token) => token !== "");
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i]!;
    if (!isCommand(command)) {
      throw new Error(`Unknown path command: ${command}`);
    }
    const coordinates = tokens
      .slice(i + 1, i + 1 + COMMAND_COORDINATES[command])
      .map(Number);
    i += 1 + COMMAND_COORDINATES[command];

    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = coordinates;
    switch (command) {
      case "M": {
        ctx.moveTo(a, b);
        break;
      }

      case "L": {
        ctx.lineTo(a, b);
        break;
      }

      case "Q": {
        ctx.quadraticCurveTo(a, b, c, d);
        break;
      }

      case "C": {
        ctx.bezierCurveTo(a, b, c, d, e, f);
        break;
      }

      case "Z": {
        ctx.closePath();
        break;
      }
    }
  }
}
