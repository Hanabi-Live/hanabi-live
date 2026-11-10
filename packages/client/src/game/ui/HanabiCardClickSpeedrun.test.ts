import { getVariant } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SoundType } from "../types/SoundType";
import type { HanabiCard } from "./HanabiCard";

const play = vi.fn();
const end = vi.fn();
const pulse = vi.fn();

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("../../sounds", () => ({ play }));
vi.mock("./turn", () => ({ end }));
vi.mock("./clickNotes", () => ({ clickRightCheckAddNote: vi.fn() }));
const { mouseDownSpeedrun } = await import("./HanabiCardClickSpeedrun");
const { globals } = await import("./UIGlobals");

const teammateCard = {
  state: { location: 1, order: 5, suitIndex: 0, rank: 3 },
  layout: { parent: { children: [] }, index: 0 },
  tweening: false,
} as unknown as HanabiCard;

function click(button: 0 | 2) {
  mouseDownSpeedrun(teammateCard, {
    button,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  } as MouseEvent);
}

describe("speedrun clue clicks", () => {
  beforeEach(() => {
    play.mockClear();
    end.mockClear();
    pulse.mockClear();
    Object.assign(globals, {
      metadata: { ourPlayerIndex: 0 },
      variant: getVariant("No Variant"),
      state: { ongoingGame: { clueTokens: 0 } },
      elements: {
        clueTypeButtonGroup: undefined,
        cluesNumberLabelPulse: { play: pulse },
      },
    });
  });

  test.each([
    ["color", 0],
    ["rank", 2],
  ] as const)("a %s clue at 0 clue tokens buzzes", (_name, button) => {
    click(button);

    expect(play).toHaveBeenCalledWith(SoundType.Error);
    expect(pulse).toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  test.each([
    ["color", 0],
    ["rank", 2],
  ] as const)("a %s clue with a clue token is sent", (_name, button) => {
    Object.assign(globals, { state: { ongoingGame: { clueTokens: 1 } } });

    click(button);

    expect(play).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
