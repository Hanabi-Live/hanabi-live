import { defaultSettings } from "@hanabi-live/data";
import type { LogEntry } from "@hanabi-live/game";
import Konva from "konva";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { settingsChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";

const globals = vi.hoisted(() => {
  const replay: { segment: number | undefined } = { segment: 0 };
  return { animateFast: false, state: { replay } };
});
vi.mock("./UiGlobals.ts", () => ({ globals }));
vi.mock("./controls/FitText.ts", async () => {
  const { default: KonvaModule } = await import("konva");
  return {
    // Konva.Text needs a canvas, which the test environment does not have.
    FitText: class extends KonvaModule.Group {
      fitText = vi.fn();
    },
  };
});
// Keep each slide at its start position.
vi.spyOn(Konva.Tween.prototype, "play").mockReturnThis();
const { ActionLog } = await import("./ActionLog.ts");

const MAX_LINES = 3;
const LINE_HEIGHT = 10;

function makeLog(length: number): readonly LogEntry[] {
  return Array.from({ length }, (_, i) => ({ turn: i + 1, text: `line ${i}` }));
}

function makeActionLog() {
  const actionLog = new ActionLog(
    { x: 0, y: 0, width: 100, height: MAX_LINES * LINE_HEIGHT },
    MAX_LINES,
  );
  const lines = actionLog.children[0] as Konva.Group;
  return { actionLog, lines };
}

describe("ActionLog", () => {
  beforeEach(() => {
    globals.state.replay.segment = 0;
    store.dispatch(settingsChanged(defaultSettings));
  });

  test("slides when a new line arrives", () => {
    const { actionLog, lines } = makeActionLog();
    actionLog.update(makeLog(5));
    actionLog.update(makeLog(6));
    expect(lines.y()).toBe(LINE_HEIGHT);
  });

  test("does not slide during an ongoing game", () => {
    globals.state.replay.segment = undefined;
    const { actionLog, lines } = makeActionLog();
    actionLog.update(makeLog(5));
    actionLog.update(makeLog(6));
    expect(lines.y()).toBe(0);
  });

  test("does not slide with reduced motion", () => {
    store.dispatch(
      settingsChanged({ ...defaultSettings, reducedMotion: true }),
    );
    const { actionLog, lines } = makeActionLog();
    actionLog.update(makeLog(5));
    actionLog.update(makeLog(6));
    expect(lines.y()).toBe(0);
  });

  test("slides the removed last line out of sight", () => {
    const { actionLog, lines } = makeActionLog();
    actionLog.update(makeLog(6));
    actionLog.update(makeLog(5));
    expect(lines.y()).toBe(-LINE_HEIGHT);

    const hiddenLineBelow = lines.children[MAX_LINES + 1] as unknown as {
      fitText: ReturnType<typeof vi.fn>;
    };
    expect(hiddenLineBelow.fitText).toHaveBeenLastCalledWith("line 5");
  });
});
