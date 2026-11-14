import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../../tooltips.ts", () => ({ setContent: vi.fn() }));
vi.mock("./konvaHelpers.ts", () => ({ drawLayer: vi.fn() }));
vi.mock("../../sounds.ts", () => ({ play: vi.fn() }));
vi.mock("../../store.ts", () => ({
  store: {
    getState: () => ({
      game: {
        current: {
          pause: {
            pausingPlayerIndex: undefined,
          },
          metadata: {
            options: {
              timeControl: undefined,
            },
          },
        },
      },
      session: {
        settings: {
          soundTimer: false,
          speedrunFeatures: false,
          showTimerInUntimed: false,
        },
        errorOccurred: false,
      },
    }),
  },
}));
vi.mock("./UiGlobals.ts", () => ({
  globals: {
    state: {
      finished: false,
      playing: true,
    },
    elements: {
      timer1: undefined,
      timer2: undefined,
      deck: undefined,
    },
    layers: {
      timer: {
        batchDraw: vi.fn(),
      },
    },
    options: {
      speedrun: false,
      timeControl: undefined,
    },
    metadata: {
      ourPlayerIndex: 1,
    },
  },
}));
const { globals } = await import("./UiGlobals.ts");
const tooltips = await import("../../tooltips.ts");
const clock = await import("../clock.ts");
const timer = await import("./timer.ts");

let stopDrawing: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stopDrawing = timer.init();
});
afterEach(() => {
  stopDrawing();
  clock.reset();
  vi.useRealTimers();
});

test("finishing a game hides the timers", () => {
  const timer1 = { hide: vi.fn() };
  const timer2 = { hide: vi.fn() };
  Object.assign(globals, {
    state: {
      finished: true,
      playing: false,
    },
    elements: {
      timer1,
      timer2,
    },
  });
  try {
    clock.finish();
    expect(timer1.hide).toHaveBeenCalled();
    expect(timer2.hide).toHaveBeenCalled();
  } finally {
    Object.assign(globals, {
      state: {
        finished: false,
        playing: true,
      },
      elements: {
        timer1: undefined,
        timer2: undefined,
        deck: undefined,
      },
    });
  }
});

test("untimed games without timers still update the player time tooltips", () => {
  clock.update({
    playerTimesMs: [5000, 0],
    currentPlayerIndex: 0,
    turnElapsedMs: 0,
  });
  expect(tooltips.setContent).toHaveBeenCalledWith(
    "player-0",
    "Time taken:<br /><strong>0:05</strong>",
  );

  vi.advanceTimersByTime(1000);
  expect(tooltips.setContent).toHaveBeenLastCalledWith(
    "player-0",
    "Time taken:<br /><strong>0:06</strong>",
  );
});
