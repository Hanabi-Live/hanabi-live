/** The number of coordinates that each SVG path command takes. */
const COMMAND_COORDINATES = {
  M: 2,
  L: 2,
  C: 6,
  Z: 0,
} as const;

type Command = keyof typeof COMMAND_COORDINATES;

interface Segment {
  readonly command: Command;
  readonly coordinates: readonly number[];
}

/** The parsed form of each path, so that drawing a card does not parse its path again. */
const parsedPaths = new Map<string, readonly Segment[]>();

function isCommand(token: string): token is Command {
  return Object.hasOwn(COMMAND_COORDINATES, token);
}

/**
 * Splits path data at whitespace and commas. It does not use a regular expression, because Firefox
 * can throw "too much recursion" when it runs one during a deep canvas draw.
 */
function tokenize(path: string): readonly string[] {
  const tokens: string[] = [];
  let token = "";
  for (const character of path) {
    if (character === "," || character.trim() === "") {
      if (token !== "") {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (token !== "") {
    tokens.push(token);
  }
  return tokens;
}

function parsePath(path: string): readonly Segment[] {
  const tokens = tokenize(path);
  const segments: Segment[] = [];
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
    segments.push({
      command,
      coordinates,
    });
  }
  return segments;
}

/**
 * Adds SVG path data to the context's current path. It reads only absolute commands that each
 * repeat their letter: `M`, `L`, `C`, and `Z`.
 *
 * The points are added to the current path instead of to a `Path2D`, so the caller can fill and
 * stroke them, as with any other path.
 */
export function tracePath(ctx: CanvasRenderingContext2D, path: string): void {
  let segments = parsedPaths.get(path);
  if (segments === undefined) {
    segments = parsePath(path);
    parsedPaths.set(path, segments);
  }

  for (const { command, coordinates } of segments) {
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
