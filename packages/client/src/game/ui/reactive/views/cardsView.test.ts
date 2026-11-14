import type { CardIdentity } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";

const setBareImage = vi.fn();

vi.mock("../../HanabiCard.ts", () => ({ HanabiCard: vi.fn() }));
vi.mock("../../hypotheticalHands.ts", () => ({
  changeStartingHandVisibility: vi.fn(),
}));
vi.mock("../../getCardOrStackBase.ts", () => ({
  getCardOrStackBase: () => ({ setBareImage }),
}));
vi.mock("../../UiGlobals.ts", () => ({
  globals: {
    layers: {
      card: {
        batchDraw: vi.fn(),
      },
    },
  },
}));
const { onMorphedIdentitiesChanged } = await import("./cardsView.ts");

describe("onMorphedIdentitiesChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("draws the cards that a joined hypothetical already morphed", () => {
    const morphedIdentities: CardIdentity[] = [];
    morphedIdentities[9] = {
      suitIndex: 4,
      rank: undefined,
    };

    onMorphedIdentitiesChanged(
      {
        hypotheticalActive: true,
        morphedIdentities,
      },
      {
        hypotheticalActive: false,
        morphedIdentities: undefined,
      },
    );

    expect(setBareImage).toHaveBeenCalledOnce();
  });
});
