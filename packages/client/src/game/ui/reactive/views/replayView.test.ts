import { beforeEach, describe, expect, mock, test } from "bun:test";

await mock.module("konva", () => ({ default: {} }));
await mock.module("../../../../tooltips", () => ({}));
await mock.module("../../../../utils", () => ({ escapeHtml: mock() }));
await mock.module("../../konvaTooltips", () => ({}));
await mock.module("../../timer", () => ({}));
await mock.module("../../zen", () => ({ toggleZen: mock() }));
await mock.module("../../ourHand", () => ({
  checkSetDraggableAll: mock(),
}));
await mock.module("../../replay", () => ({
  adjustShuttles: mock(),
}));
await mock.module("./cluesView", () => ({
  refreshArrows: mock(),
}));
await mock.module("../../UIGlobals", () => ({
  globals: {
    elements: {
      replayArea: {
        visible: mock(),
      },
      premoveCancelButton: {
        show: mock(),
      },
    },
    state: {
      premove: null,
    },
    layers: {
      UI: {
        batchDraw: mock(),
      },
    },
  },
}));
const { globals } = await import("../../UIGlobals");
const ourHand = await import("../../ourHand");
const replay = await import("../../replay");
const cluesView = await import("./cluesView");
const { onActiveChanged } = await import("./replayView");

describe("replay activation", () => {
  beforeEach(() => {
    mock.clearAllMocks();
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
    expect(ourHand.checkSetDraggableAll).toHaveBeenCalledTimes(1);
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
    expect(ourHand.checkSetDraggableAll).toHaveBeenCalledTimes(1);
  });
});
