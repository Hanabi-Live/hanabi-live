import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("konva", () => ({ default: {} }));
vi.mock("../../../../tooltips", () => ({}));
vi.mock("../../../../utils", () => ({ escapeHtml: vi.fn() }));
vi.mock("../../konvaTooltips", () => ({}));
vi.mock("../../timer", () => ({}));
vi.mock("../../zen", () => ({ toggleZen: vi.fn() }));
vi.mock("../../replay", () => ({
  adjustShuttles: vi.fn(),
}));
vi.mock("./cluesView", () => ({
  refreshArrows: vi.fn(),
}));
vi.mock("../../UIGlobals", () => ({
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
const { globals } = await import("../../UIGlobals");
const replay = await import("../../replay");
const cluesView = await import("./cluesView");
const { onActiveChanged } = await import("./replayView");

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
