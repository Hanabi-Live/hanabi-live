import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("konva", () => ({ default: {} }));
vi.mock("../../../../tooltips.ts", () => ({}));
vi.mock("../../../../utils.ts", () => ({ escapeHtml: vi.fn() }));
vi.mock("../../konvaTooltips.ts", () => ({}));
vi.mock("../../timer.ts", () => ({}));
vi.mock("../../zen.ts", () => ({ toggleZen: vi.fn() }));
vi.mock("../../replay.ts", () => ({
  adjustShuttles: vi.fn(),
}));
vi.mock("./cluesView.ts", () => ({
  refreshArrows: vi.fn(),
}));
vi.mock("../../../../Globals.ts", () => ({ globals: {} }));
vi.mock("../../UiGlobals.ts", () => ({
  globals: {
    elements: {
      replayArea: {
        visible: vi.fn(),
      },
      premoveCancelButton: {
        show: vi.fn(),
      },
    },
    state: {
      premove: undefined,
    },
    layers: {
      UI: {
        batchDraw: vi.fn(),
      },
    },
  },
}));
const { globals } = await import("../../UiGlobals.ts");
const replay = await import("../../replay.ts");
const cluesView = await import("./cluesView.ts");
const { onActiveChanged } = await import("./replayView.ts");

describe("replay activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("keeps replay controls hidden in a hypothetical when observers reinitialize", () => {
    // The hypothetical visibility observer runs before the replay activation observer.
    globals.elements.replayArea?.visible(false);

    onActiveChanged(true);

    expect(globals.elements.replayArea?.visible).toHaveBeenCalledTimes(1);
    expect(globals.elements.replayArea?.visible).toHaveBeenLastCalledWith(
      false,
    );
    expect(replay.adjustShuttles).toHaveBeenCalledWith(true);
    expect(cluesView.refreshArrows).toHaveBeenCalledWith(true);
  });

  test("preserves visible replay controls outside a hypothetical", () => {
    globals.elements.replayArea?.visible(true);

    onActiveChanged(true);

    expect(globals.elements.replayArea?.visible).toHaveBeenCalledTimes(1);
    expect(globals.elements.replayArea?.visible).toHaveBeenLastCalledWith(true);
    expect(replay.adjustShuttles).toHaveBeenCalledWith(true);
  });

  test("does not override shared replay visibility when replay is inactive", () => {
    globals.elements.replayArea?.visible(true);

    onActiveChanged(false);

    expect(globals.elements.replayArea?.visible).toHaveBeenCalledTimes(1);
    expect(globals.elements.replayArea?.visible).toHaveBeenLastCalledWith(true);
    expect(replay.adjustShuttles).not.toHaveBeenCalled();
    expect(cluesView.refreshArrows).toHaveBeenCalledWith(false);
  });
});
