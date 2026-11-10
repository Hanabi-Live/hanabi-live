import type { LogEntry } from "@hanabi-live/game";
import { assertDefined, eRange } from "complete-common";
import Konva from "konva";
import { globals } from "./UIGlobals";
import { FitText } from "./controls/FitText";

/** The time in seconds that the lines take to slide by one line. */
const SLIDE_DURATION = 0.2;

/**
 * The small action log that shows the most recent log lines. When the visible lines move by one
 * line (such as after a new action or one replay step), the text slides up or down. The parent must
 * clip this group to the visible area.
 *
 * The group holds one hidden line above and one hidden line below the visible lines. A slide draws
 * the new lines, offsets them by one line so that they look like the old lines, and then moves them
 * back to their place.
 */
export class ActionLog extends Konva.Group {
  private readonly maxLines: number;
  private readonly lineHeight: number;
  private readonly lines: Konva.Group;

  /** The texts of all lines, including the hidden lines above and below. */
  private texts: string[] = [];

  /** The log index of the first visible line. */
  private firstIndex = 0;

  private tween: Konva.Tween | null = null;

  constructor(config: Konva.TextConfig, maxLines: number) {
    super({
      x: config.x,
      y: config.y,
      listening: false,
    });

    assertDefined(
      config.height,
      'The "height" property is not defined on a new ActionLog.',
    );

    this.maxLines = maxLines;
    this.lineHeight = config.height / maxLines;
    this.lines = new Konva.Group({ listening: false });
    this.add(this.lines);

    for (const i of eRange(maxLines + 2)) {
      this.lines.add(
        new FitText({
          ...config,
          x: 0,
          y: (i - 1) * this.lineHeight,
          height: this.lineHeight,
          listening: false,
        }),
      );
      this.texts.push("");
    }
  }

  update(log: readonly LogEntry[]): void {
    const firstIndex = Math.max(0, log.length - this.maxLines);
    const texts = [...eRange(this.maxLines + 2)].map(
      (i) => log[firstIndex - 1 + i]?.text ?? "",
    );

    const shift = firstIndex - this.firstIndex;
    const slides =
      Math.abs(shift) === 1
      && !globals.animateFast
      && this.texts.every((text, i) => {
        // Every visible line that stays on the screen must keep its text. Do not check the hidden
        // lines: the hidden line below is empty before a new log line arrives.
        const newRow = i - shift;
        return (
          !this.isVisibleRow(i)
          || !this.isVisibleRow(newRow)
          || texts[newRow] === text
        );
      });

    for (const [i, text] of texts.entries()) {
      if (text !== this.texts[i]) {
        (this.lines.children[i] as FitText).fitText(text);
      }
    }
    this.texts = texts;
    this.firstIndex = firstIndex;

    this.tween?.destroy();
    this.tween = null;

    if (!slides) {
      this.lines.y(0);
      return;
    }

    // Continue from the current offset if the previous slide has not finished. There is only one
    // hidden line on each side, so the offset cannot be more than one line.
    const startY = Math.max(
      -this.lineHeight,
      Math.min(this.lineHeight, this.lines.y() + shift * this.lineHeight),
    );
    this.lines.y(startY);
    this.tween = new Konva.Tween({
      node: this.lines,
      duration: SLIDE_DURATION,
      y: 0,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseOut,
      onFinish: () => {
        this.tween?.destroy();
        this.tween = null;
      },
    }).play();
  }

  /** Row 0 and row `maxLines + 1` are the hidden lines. */
  private isVisibleRow(row: number): boolean {
    return row >= 1 && row <= this.maxLines;
  }
}
