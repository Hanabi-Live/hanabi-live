import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { globals } from "../../UIGlobals";
import * as ourHand from "../../ourHand";
import * as replay from "../../replay";
import * as cluesView from "./cluesView";
import { onActiveChanged } from "./replayView";

jest.mock("konva", () => ({}));
jest.mock("../../../../tooltips", () => ({}));
jest.mock("../../../../utils", () => ({}));
jest.mock("../../konvaTooltips", () => ({}));
jest.mock("../../timer", () => ({}));
jest.mock("../../zen", () => ({}));
jest.mock("../../ourHand", () => ({
  checkSetDraggableAll: jest.fn(),
}));
jest.mock("../../replay", () => ({
  adjustShuttles: jest.fn(),
}));
jest.mock("./cluesView", () => ({
  refreshArrows: jest.fn(),
}));
jest.mock("../../UIGlobals", () => ({
  globals: {
    elements: {
      replayArea: {
        visible: jest.fn(),
      },
      premoveCancelButton: {
        show: jest.fn(),
      },
    },
    state: {
      premove: null,
    },
    layers: {
      UI: {
        batchDraw: jest.fn(),
      },
    },
  },
}));

describe("replay activation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
