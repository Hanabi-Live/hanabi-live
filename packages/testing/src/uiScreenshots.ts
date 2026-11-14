// Takes screenshots of the site's screens at several widths in both themes. It starts this
// checkout's server with a disposable database and seeds it through the client protocol, so that
// every run sees the same pages. Run it through "runTests.ts", which provides the database and
// builds the server and the client: `bun run ui-screenshots [options]`.

// Options:
// - `--state <name>`: Only this state. Repeat it for more than one.
// - `--width <pixels>`: Only this width. Repeat it for more than one.
// - `--theme <light|dark>`: Only this theme.
// - `--compare <git ref>`: Also report every computed style that differs from the stylesheets of
//   that ref, and take a screenshot with them wherever a difference shows.

// Each state sets up what it shows, so that it can run alone. The states that show the lobby run
// first, one at a time, since they show every account that is online and every table. The isolated
// states then run in several browser pages at once. Each page uses its own accounts.

/* eslint-disable no-await-in-loop -- A browser page visits its states one at a time. */

import type { playerActionRequestSchema, UserId } from "@hanabi-live/data";
import {
  DEFAULT_MAX_PLAYERS,
  MAX_CHAT_LENGTH,
  SERVER_EVENT_SCHEMAS,
  VERSION,
} from "@hanabi-live/data";
import type { CardOrder, ClueRank, PlayerIndex, Rank } from "@hanabi-live/game";
import {
  getNumCopiesOfCard,
  getTotalCardsInDeck,
  getVariant,
  isValidClueRank,
  MAX_CLUES,
  MAX_RANK,
  START_CARD_RANK,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { execFile } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import type { BrowserContext, Locator, Page } from "playwright";
import { chromium } from "playwright";
import type * as z from "zod";
import { evaluationDatabase } from "./database.ts";
import {
  buildRust,
  entersGame,
  installSchema,
  login,
  ourPlayerIndex,
  prepareRoot,
  ROOT,
  socketClient,
  startProcess,
  stopChild,
} from "./mainProcessSupport.ts";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

const OUTPUT_DIRECTORY = path.join(ROOT, "dist/ui-screenshots");

/**
 * A domain that is not local, so that the server renders the pages as it does in production. The
 * browser resolves it to the server's address.
 */
const DOMAIN = "ui-screenshots.example";

/** The name that production pages load the CSS bundle with. */
const BUNDLE_FILENAME = `main.${VERSION}.min.css`;

/** The path that serves the stylesheets of the ref given with `--compare`. */
const COMPARE_BUNDLE_PATH = "/public/css/compare.min.css";

/**
 * One size within each range of the width breakpoints in "public/css/tokens.css". Two of them are
 * shorter than the height breakpoint, so that both sides of it are seen.
 */
const SIZES = [
  { width: 1600, height: 900 },
  { width: 1200, height: 800 },
  { width: 800, height: 500 },
  { width: 600, height: 500 },
  { width: 375, height: 700 },
] as const;

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** States are set up at this size, so that every button is visible. */
const SETUP_SIZE = SIZES[0];

/** How many browser pages take the screenshots of the isolated states at once. */
const NUM_WORKERS = 4;

/**
 * The longest time to wait for a page's animations to end, so that one that never ends cannot stop
 * the run.
 */
const MAX_ANIMATION_WAIT_MILLISECONDS = 10_000;

/**
 * How long a step waits for an element, such as a button to click. Playwright's own limit is 30
 * seconds, so a step that waits for the wrong thing would hold up the run for that long.
 */
const STEP_TIMEOUT_MILLISECONDS = 10_000;

/** How often to check whether the fireworks, which a canvas draws, have ended. */
const FIREWORKS_CHECK_MILLISECONDS = 100;

/**
 * How long the classic game screen takes to draw a change. It draws on a canvas, so its animations
 * cannot be seen from the page.
 */
const CANVAS_SETTLE_MILLISECONDS = 400;

/**
 * How long the lobby ignores clicks on a row of its table list after the row appears or moves
 * (`MOVED_ROW_CLICK_DELAY_MS` in "TablesList.tsx"), with time to spare.
 */
const ROW_CLICK_DELAY_MILLISECONDS = 700;

/**
 * How long a click on a row of the lobby's table list can take to open the table, and how many
 * times to click before giving up.
 */
const ROW_CLICK_WAIT_MILLISECONDS = 3000;
const MAX_ROW_CLICKS = 5;

/** The tooltip that the site shows, once it is open. */
const TOOLTIP_SELECTOR = ".tooltip-bubble:popover-open";

/** Cards of the account's own hand, and the cards on the play stacks and in the discards. */
const OWN_FIRST_CARD_SELECTOR = '#game-new-ui [data-card-place="hand-0-0"]';
const OWN_SECOND_CARD_SELECTOR = '#game-new-ui [data-card-place="hand-0-1"]';
const STACK_CARD_SELECTOR = "#game-new-ui [data-play-stack]";
const DISCARD_CARD_SELECTOR = '#game-new-ui [data-card-place^="discard-"]';
const NEXT_HAND_FIRST_CARD_SELECTOR =
  '#game-new-ui [data-card-place="hand-1-0"]';

/** The notes that the account writes on the next player's first card and on a play stack. */
const NEXT_HAND_NOTE = "r1 maybe :D";
const STACK_NOTE = "played early";

/** Chooses the "1" clue in the New UI, or clears it when it is already chosen. */
async function clickRankOneClue(page: Page) {
  await page
    .locator('#game-new-ui [aria-label="Give a clue"]')
    .getByRole("button", { name: "1", exact: true })
    .click();
}

/**
 * Chooses the first clue in the New UI that touches no cards in Bob's hand. The game has two
 * players, so the panel has no player buttons, and its pressed buttons are clues.
 */
async function chooseClueThatTouchesNothing(page: Page) {
  const panel = page.locator('#game-new-ui [aria-label="Give a clue"]');
  for (const clue of await panel.locator("button[aria-pressed]").all()) {
    await clue.click();
    if (
      (await panel
        .getByRole("button", { name: /^No .* in that hand$/u })
        .count()) > 0
    ) {
      return;
    }

    await clue.click();
  }

  throw new Error("Every clue touches a card in Bob's hand.");
}

async function writeNote(page: Page, card: Locator, text: string) {
  await card.click({ button: "right" });
  await page.getByRole("textbox", { name: "Note" }).fill(text);
  await page.keyboard.press("Enter");
}

/** How many times to press Escape to go from the deepest screen back to the lobby. */
const MAX_ESCAPES = 3;

/** The seed of the first seeded game: two players, the variant with ID 0, and the first seed. */
const SEED = "p2v0s1";

/**
 * How many games the seed saves. Each has the next seed, from the first. The replay states show the
 * last one.
 */
const NUM_SEEDED_GAMES = 3;

/** The tag that the seeded games have, for the tagged games pages. */
const TAG = "layered finesse";

/** The accounts that watch the open table, and Bob's game. */
const SPECTATOR_NAMES = ["Carol", "Dave", "Erin", "Frank"] as const;

/** The account that owns the open table and plays Bob's game with the browser's account. */
const BOB = "Bob";

/**
 * The accounts that also play Bob's game when it has more than two players. One name is as long as
 * a username can be with the suffix of a cast, so that a crowded table shows how a long name fits.
 */
const OTHER_PLAYER_NAMES = ["Ivan_Wolfgang", "Heidi", "Grace"] as const;

/** The variant of the open table. */
const LONG_VARIANT_NAME = "Rainbow-Ones & Orange (6 Suits)";

/**
 * The seed of Bob's game, so that every state deals the same cards. Each player has a card that the
 * team can play, and the account has one that it cannot.
 */
const BOBS_GAME_SEED_SUFFIX = "1";

/** The H-Group level that the account at the open table chooses. */
const H_GROUP_LEVEL = 3;

/** The account that the browser logs in with. Others play the seeded games. */
const USERNAME = "Alice";

interface State {
  readonly name: string;
  readonly path: string;
  readonly loggedIn: boolean;
  /**
   * Whether the state shows only what its own accounts do, so that it can run at the same time as
   * other isolated states. The other states run first, one at a time, with the seeded accounts.
   */
  readonly isolated?: boolean;
  /**
   * Runs before the page loads, such as to set up a game that the page then shows. The page is
   * blank, so that the browser's account is not connected.
   */
  readonly setup?: (cast: Cast) => Promise<void>;
  /** Runs at the setup size, after the page loads. */
  readonly prepare?: (page: Page, cast: Cast) => Promise<void>;
  /** Runs after the screenshots, so that the next state starts from the lobby. */
  readonly cleanup?: (page: Page) => Promise<void>;
  /**
   * The element that the pointer rests on during the screenshots, such as one with a tooltip: a
   * selector, or a function that moves the pointer.
   */
  readonly hover?: string | ((page: Page, cast: Cast) => Promise<void>);
}

/**
 * Runs in the page. Waits until no animation runs that ends on its own, including the fireworks
 * that the New UI draws on a canvas over the page. Two frames first let a change of style start its
 * transitions.
 */
async function waitForAnimations({
  maxMilliseconds,
  fireworksCheckMilliseconds,
}: {
  readonly maxMilliseconds: number;
  readonly fireworksCheckMilliseconds: number;
}) {
  const deadline = performance.now() + maxMilliseconds;
  for (;;) {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running"
          && animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    const fireworks = document.querySelector("body > canvas") !== null;
    const remaining = deadline - performance.now();
    if ((running.length === 0 && !fireworks) || remaining <= 0) {
      return;
    }
    await Promise.race([
      fireworks
        ? new Promise((resolve) => {
            setTimeout(resolve, fireworksCheckMilliseconds);
          })
        : Promise.allSettled(
            running.map(async (animation) => await animation.finished),
          ),
      new Promise((resolve) => {
        setTimeout(resolve, remaining);
      }),
    ]);
  }
}

/**
 * Waits until the page is still: its animations have ended, and the classic game screen has drawn
 * itself again after a resize.
 */
async function settle(page: Page) {
  await page.evaluate(waitForAnimations, {
    maxMilliseconds: MAX_ANIMATION_WAIT_MILLISECONDS,
    fireworksCheckMilliseconds: FIREWORKS_CHECK_MILLISECONDS,
  });
  if (await page.locator(".konvajs-content").isVisible()) {
    await page.waitForFunction(isGameScreenResized);
    await page.waitForTimeout(CANVAS_SETTLE_MILLISECONDS);
  }
}

/** Rests the pointer on an element and waits for its tooltip. */
async function hoverForTooltip(page: Page, element: Locator) {
  await element.hover();
  await page.locator(TOOLTIP_SELECTOR).waitFor();
}

/** Hovers over an element, unless the screen is too small to show it, such as a chat in a tab. */
async function hoverIfVisible(page: Page, selector: string) {
  const element = page.locator(selector);
  if (await element.isVisible()) {
    await element.hover();
  }
}

/** A text of the given length in characters, such as a chat message. */
function longText(length: number) {
  return "The quick brown fox. ".repeat(length).slice(0, length);
}

/** Signs in to a test account that does not exist yet, which shows the tutorial. */
async function signInNewAccount(page: Page, username: string) {
  await page.goto(`${new URL(page.url()).origin}/?login=${username}`);
  await page.locator("#tutorial-yes").waitFor();
  await settle(page);
}

/**
 * Forgets the account that "signInNewAccount" signed in to, so that later states are signed out.
 */
async function signOutOfNewAccount(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
  });
}

/** Clicks a button that switches between the halves of the lobby on small screens. */
async function clickPanelButton(page: Page, panel: string) {
  await page.locator(`#lobby-toggle-show-${panel}`).dispatchEvent("click");
  await settle(page);
}

async function clickNav(page: Page, id: string) {
  await page.click(`#nav-buttons-lobby-${id}`);
  await settle(page);
}

/**
 * Opens the replay of a seeded game from the lobby. The client ignores a "/replay/<id>" path for an
 * account that is a few seconds old.
 */
async function openReplay(page: Page, replayId: number) {
  await clickNav(page, "replay");
  await page.fill("#replay-id", replayId.toString());
  await page.click("#replay-submit");
  await page.waitForSelector(".konvajs-content");
  await settle(page);
}

/**
 * Leaves a replay. The server keeps the account in it until it goes back to the lobby. In a
 * hypothetical, the first Escape only ends the hypothetical.
 */
async function leaveReplay(page: Page) {
  const lobby = page.locator("#lobby");
  for (let i = 0; i < MAX_ESCAPES && !(await lobby.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await settle(page);
  }
  await lobby.waitFor();
}

/**
 * Runs in the page. The center of an element of the classic game screen, which draws on a canvas,
 * in page coordinates. The path leads from "globals.elements" to the element, such as
 * `["playerHands", 0, "children", 0]` for the first card of the first hand.
 */
function getCanvasElementCenter(elementPath: ReadonlyArray<string | number>): {
  readonly x: number;
  readonly y: number;
} {
  interface CanvasElement {
    getClientRect: () => {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }
  let value: unknown = (
    globalThis as unknown as { globals: { elements: unknown } }
  ).globals.elements;
  for (const key of elementPath) {
    value = (value as Record<string | number, unknown> | undefined)?.[key];
  }
  if (value === undefined) {
    throw new Error(
      `The game screen has no element at: ${elementPath.join(".")}`,
    );
  }
  const rect = (value as CanvasElement).getClientRect();
  const canvas = document.querySelector(".konvajs-content");
  if (canvas === null) {
    throw new Error("The game screen is not drawn.");
  }
  const origin = canvas.getBoundingClientRect();
  return {
    x: origin.x + rect.x + rect.width / 2,
    y: origin.y + rect.y + rect.height / 2,
  };
}

/** Runs in the page. Whether the classic game screen has finished drawing itself for a new size. */
function isGameScreenResized(): boolean {
  return (
    (globalThis as unknown as { globals: { isResizing?: boolean } }).globals
      .isResizing !== true
  );
}

/**
 * Moves the pointer onto an element of the classic game screen. After the window resizes, the
 * screen draws new elements in place of the old ones, so this waits for them first.
 */
async function hoverCanvasElement(
  page: Page,
  elementPath: ReadonlyArray<string | number>,
) {
  await settle(page);
  const { x, y } = await page.evaluate(getCanvasElementCenter, elementPath);
  await page.mouse.move(x, y);
}

/** Clicks an element of the classic game screen. */
async function clickCanvasElement(
  page: Page,
  elementPath: ReadonlyArray<string | number>,
) {
  await hoverCanvasElement(page, elementPath);
  await page.mouse.down();
  await page.mouse.up();
  await settle(page);
}

/** How many moves a drag takes, so that the game screen sees the pointer travel. */
const DRAG_STEPS = 10;

/** Drags a card from a hand onto the play stacks, as a player would. */
async function playCard(page: Page, card: Locator) {
  const from = await card.boundingBox();
  const to = await page
    .locator("#game-new-ui [data-play-stacks]")
    .boundingBox();
  if (from === null || to === null) {
    throw new Error("The card or the play stacks are not on the screen.");
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: DRAG_STEPS,
  });
  await page.mouse.up();
}

function getStates(): readonly State[] {
  return [
    { name: "login", path: "/", loggedIn: false },
    { name: "scores", path: `/scores/${USERNAME}`, loggedIn: false },
    {
      name: "history",
      path: `/history/${USERNAME}`,
      loggedIn: false,
      // Sort one column, so that the sort arrows show both states.
      prepare: async (page) => {
        await page.locator("th[aria-sort]").first().click();
      },
    },
    {
      name: "missing-scores",
      path: `/missing-scores/${USERNAME}`,
      loggedIn: false,
    },
    {
      name: "shared-missing-scores",
      path: `/shared-missing-scores/2/${USERNAME}/Bob`,
      loggedIn: false,
      prepare: async (page) => {
        await page.click("#advanced-filters-toggle");
      },
    },
    { name: "seed", path: `/seed/${SEED}`, loggedIn: false },
    { name: "tags", path: `/tags/${USERNAME}`, loggedIn: false },
    { name: "password-reset", path: "/password-reset", loggedIn: false },
    {
      name: "login-alert",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await page.click("#login-button");
        await page.locator("#login-alert").waitFor();
        await settle(page);
      },
    },
    // A new account sees the tutorial. These states sign in after the check that skips it.
    {
      name: "tutorial",
      path: "/",
      loggedIn: false,
      // The new account shows in the lobby's list of the accounts that are online.
      isolated: true,
      prepare: async (page) => {
        await signInNewAccount(page, "TutorialFirst");
      },
      cleanup: signOutOfNewAccount,
    },
    { name: "lobby", path: "/", loggedIn: true },
    // The buttons that switch between the halves of the lobby only show on small screens, so they
    // are clicked without the pointer.
    {
      name: "lobby-panel-online",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickPanelButton(page, "online");
      },
    },
    {
      name: "lobby-panel-chat",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickPanelButton(page, "chat");
      },
    },
    {
      name: "user-menu",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.locator("#lobby-users-table-tbody a").first().click();
      },
    },
    {
      name: "emoji-picker",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.click("#lobby-chat-input + button");
      },
    },
    // A reply before anyone sent us a private message shows a warning.
    {
      name: "warning-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.fill("#lobby-chat-input", "/r hi");
        await page.press("#lobby-chat-input", "Enter");
        await page.locator("#warning-modal").waitFor();
        await settle(page);
      },
    },
    {
      name: "chat-length-over-limit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.fill("#lobby-chat-input", longText(MAX_CHAT_LENGTH + 20));
      },
      hover: async (page) => {
        await hoverIfVisible(page, "#lobby-chat-input ~ span");
      },
    },
    {
      name: "create-game",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
      },
    },
    {
      // The extra options, the search for a variant, a clock, a dimmed option, and two errors.
      name: "create-game-extra-options",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.click("#create-game-show-extra-options");
        await page.selectOption(
          "#create-game-variant-dropdown1",
          "Search custom variants...",
        );
        await page.fill("#create-game-variant-dropdown2", LONG_VARIANT_NAME);
        await page.click('label[for="createTableTimed"]');
        await page.fill("#createTableTimeBaseMinutes", "0");
        await page.click('label[for="createTableOneExtraCard"]');
        await page.fill("#create-game-seed", "a b!");
        await settle(page);
      },
      // The form remembers its options, which the other states need to be the defaults.
      cleanup: async (page) => {
        await page.fill("#createTableTimeBaseMinutes", "2");
        await page.click('label[for="createTableTimed"]');
        await page.click('label[for="createTableOneExtraCard"]');
        await page.fill("#create-game-variant-dropdown2", "No Variant");
        await settle(page);
      },
    },
    {
      name: "watch-replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "replay");
      },
    },
    {
      name: "resources",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "resources");
      },
    },
    {
      name: "settings",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "settings");
      },
    },
    {
      name: "lobby-history",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "history");
      },
    },
    {
      name: "lobby-other-scores",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        // The lobby opens the other scores of a seed when its address changes to their hash.
        await page.evaluate((otherScoresSeed) => {
          globalThis.history.replaceState(undefined, "", "/lobby");
          globalThis.location.hash = `#history-other-scores-${otherScoresSeed}`;
        }, SEED);
        await settle(page);
      },
    },
    {
      name: "replay",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: useClassicScreen,
      prepare: async (page, cast) => {
        await openReplay(page, cast.replayId);
      },
      cleanup: leaveReplay,
    },
    // The tooltip of the deck in the classic game screen, which lists the game's options.
    {
      name: "replay-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: useClassicScreen,
      prepare: async (page, cast) => {
        await openReplay(page, cast.replayId);
      },
      hover: async (page) => {
        await hoverCanvasElement(page, ["deck"]);
        await page.locator(".game-tooltips-ul").waitFor();
      },
      cleanup: leaveReplay,
    },
    // The modal that changes a card into another during a hypothetical.
    {
      name: "morph-modal",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: useClassicScreen,
      prepare: async (page, cast) => {
        await openReplay(page, cast.replayId);
        await hoverCanvasElement(page, ["enterHypoButton"]);
        await page.mouse.down();
        await page.mouse.up();
        await settle(page);
        // An Alt + right-click on a card morphs it.
        await hoverCanvasElement(page, ["playerHands", 0, "children", 0]);
        await page.keyboard.down("Alt");
        await page.mouse.down({ button: "right" });
        await page.mouse.up({ button: "right" });
        await page.keyboard.up("Alt");
        await page.locator("#morph-modal").waitFor();
      },
      cleanup: async (page) => {
        await page.click("#morph-modal-button-cancel");
        await settle(page);
        await leaveReplay(page);
      },
    },
    // A hypothetical in the replay, with "Edit cards" checked and the other checkboxes not.
    {
      name: "hypothetical",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: useClassicScreen,
      prepare: async (page, cast) => {
        await openReplay(page, cast.replayId);
        await clickCanvasElement(page, ["enterHypoButton"]);
        await clickCanvasElement(page, ["editCardsCheckbox"]);
      },
      cleanup: leaveReplay,
    },
    // The account joins the open table, and leaves it again at the end, so that the lobby stays the
    // same for the other states.
    {
      name: "pregame",
      path: "/",
      loggedIn: true,
      prepare: joinTable,
      cleanup: leaveTable,
    },
    {
      name: "pregame-chat",
      path: "/",
      loggedIn: true,
      // The button only shows on narrow or short screens, but the click sets the same classes at
      // every size.
      prepare: async (page) => {
        await joinTable(page);
        await page
          .locator("#lobby-toggle-show-game-chat")
          .dispatchEvent("click");
        await settle(page);
      },
      cleanup: leaveTable,
    },
    // Bob's game: Bob and the account play at a table that four accounts watch. If Bob goes first,
    // he clues the account's newest card.
    {
      name: "new-ui-game",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
    },
    // Bob's game with five players, so that the game screen shows a crowded table.
    {
      name: "new-ui-five-players",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
    },
    // After every player has discarded cards, so that the discard pile has rows of several suits.
    {
      name: "new-ui-discards",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardTurns(15);
      },
    },
    // The deck is empty, so that it shows the turns left in the final round.
    {
      name: "new-ui-empty-deck",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.emptyDeck();
      },
    },
    // After every player has discarded cards, a click on the second player's name lists their
    // actions.
    {
      name: "new-ui-player-log",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardTurns(15);
      },
      prepare: async (page) => {
        await page.locator("[data-name-chip]").nth(1).click();
        await page.getByRole("dialog").waitFor();
        await settle(page);
      },
    },
    // A clue is chosen, so that "Give clue" can be pressed.
    {
      name: "new-ui-clue-chosen",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: async (page) => {
        await clickRankOneClue(page);
      },
    },
    // A clue is chosen that touches no cards in Bob's hand, so that "Give clue" says why it cannot
    // be pressed.
    {
      name: "new-ui-clue-touches-nothing",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: chooseClueThatTouchesNothing,
    },
    // After the account plays a card that it does not know.
    {
      name: "new-ui-play",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.play("account", true);
      },
    },
    // After the account plays a card, Bob plays one, and the account misplays one.
    {
      name: "new-ui-misplay",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.playAndMisplay();
      },
    },
    // After the account plays a card and steps back over it in the in-game replay, where the drawn
    // card goes back to the deck.
    {
      name: "new-ui-replay",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.play("account", true);
      },
      prepare: async (page) => {
        await page.getByRole("button", { name: "Replay" }).click();
        await page.getByRole("button", { name: "Previous turn" }).click();
        await settle(page);
      },
    },
    // After Bob clues the account twice, with the account's discard between the clues. The mouse
    // button is held down on the card that the first clue touched and the second missed, so the
    // clue log shows only those two clues.
    {
      name: "new-ui-clue-log-press",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.clueTwice();
      },
      hover: async (page, cast) => {
        await page.mouse.up();
        await hoverIfVisible(
          page,
          `#game-new-ui [data-card-order="${cast.bobsGame().cluedCard()}"]`,
        );
        await page.mouse.down();
        await settle(page);
      },
    },
    {
      name: "new-ui-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      hover: async (page) => {
        await hoverForTooltip(
          page,
          page.locator('#game-new-ui [aria-label^="About efficiency"]'),
        );
      },
    },
    // The account types a note on the first card of the next player's hand.
    {
      name: "new-ui-note-editor",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: async (page) => {
        await page
          .locator(NEXT_HAND_FIRST_CARD_SELECTOR)
          .click({ button: "right" });
        await page.keyboard.type(NEXT_HAND_NOTE);
      },
    },
    // The account's notes: on the first card of its own hand, one that makes it show as its real
    // identity, which the clues always allow, so that its badge shows a pencil. Other notes are on
    // its second card, on the next player's first card, on a play stack, and on a discarded card.
    // The pointer is over the first card.
    {
      name: "new-ui-note-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.playAndMisplay();
      },
      prepare: async (page, cast) => {
        const first = page.locator(OWN_FIRST_CARD_SELECTOR);
        const order = Number(await first.getAttribute("data-card-order"));
        await writeNote(
          page,
          first,
          await cast.bobsGame().identityNote(order as CardOrder),
        );
        await writeNote(page, page.locator(OWN_SECOND_CARD_SELECTOR), "chop?");
        await writeNote(
          page,
          page.locator(NEXT_HAND_FIRST_CARD_SELECTOR),
          NEXT_HAND_NOTE,
        );
        await writeNote(
          page,
          page.locator(STACK_CARD_SELECTOR).first(),
          STACK_NOTE,
        );
        await writeNote(
          page,
          page.locator(DISCARD_CARD_SELECTOR).first(),
          "misplayed",
        );
      },
      hover: async (page) => {
        await hoverForTooltip(page, page.locator(OWN_FIRST_CARD_SELECTOR));
      },
    },
    // The menu of the "End game" button.
    {
      name: "new-ui-end-game-menu",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: async (page) => {
        await page
          .getByRole("button", { name: "End game", exact: true })
          .click();
      },
    },
    // After the account switches to the classic screen.
    {
      name: "new-ui-classic",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: showClassic,
    },
    // The classic screen's chat window, with a message with an emote and a link in it.
    {
      name: "classic-game-chat",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame();
      },
      prepare: async (page) => {
        await showClassic(page);
        await page.keyboard.press("Alt+KeyC");
        await page.locator("#game-chat-input").waitFor();
        await page.fill(
          "#game-chat-input",
          "Hello Kappa, see https://example.com",
        );
        await page.press("#game-chat-input", "Enter");
        await page.locator("#game-chat-text", { hasText: "Hello" }).waitFor();
        await settle(page);
      },
    },
    // After Bob ends a five-player game. It is now a shared replay that Bob leads. The account goes
    // back a turn on its own, so that the timeline also marks the turn that Bob shows.
    {
      name: "new-ui-shared-replay",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        await page.getByRole("button", { name: "Previous turn" }).click();
        await page.getByRole("button", { name: /'s turn$/u }).waitFor();
      },
    },
    // Bob, who leads a five-player shared replay, starts a hypothetical that the account follows.
    {
      name: "new-ui-spectator-hypothetical",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().startHypothetical();
        await page.getByText("Shared hypothetical").waitFor();
      },
    },
    // The menu that views a five-player shared replay from another seat, with the pointer on the
    // first seat.
    {
      name: "new-ui-view-as-menu",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        await page.getByRole("button", { name: /^Viewing as /u }).click();
        await page.getByRole("menu").waitFor();
      },
      hover: async (page) => {
        await page.getByRole("menu").locator("button").first().hover();
      },
    },
    // Bob passes the lead of the shared replay to the account, which opens the menu of "Play
    // again".
    {
      name: "new-ui-shared-replay-leader",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.playAndMisplay();
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        const game = cast.bobsGame();
        game.passLeader();
        await page.getByRole("button", { name: "Leader: You" }).waitFor();
        // Bob's table is a speedrun, where "Play again" restarts the game at once when everyone is
        // ready. Bob is not, so that the button opens its menu instead.
        await game.setReady(false);
        await page.getByRole("button", { name: "Play again" }).click();
        await page.getByText(/^Not ready: Bob/u).waitFor();
      },
    },
    // The leader of the shared replay opens the menu that passes the lead to someone else, and
    // points at the first person in it.
    {
      name: "new-ui-leader-menu",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.playAndMisplay();
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().passLeader();
        await page.getByRole("button", { name: "Leader: You" }).click();
        await page.getByRole("menu").waitFor();
      },
      // The pointer is on the first person, to show that the names can be pressed.
      hover: async (page) => {
        await page.getByRole("menuitem").first().hover();
      },
    },
    // The leader of the shared replay points at the button that starts a hypothetical, which is
    // only an icon, so its tooltip says what it does.
    {
      name: "new-ui-enter-hypothetical-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame();
        await game.playAndMisplay();
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().passLeader();
        await page.getByRole("button", { name: "Leader: You" }).waitFor();
      },
      hover: async (page) => {
        await hoverForTooltip(
          page,
          page.getByRole("button", { name: "Enter hypothetical" }),
        );
      },
    },
    // A hypothetical that the account leads in a five-player game, from the first turn, after a
    // player plays a card in it.
    {
      name: "new-ui-hypothetical",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().passLeader();
        // Only the leader can start a hypothetical, so wait until the lead reaches the account.
        await page.getByRole("button", { name: "Leader: You" }).waitFor();
        await page.getByRole("button", { name: "First turn" }).click();
        await page
          .locator('#game-new-ui button[aria-label="First turn"]:disabled')
          .waitFor();
        await page.getByRole("button", { name: "Enter hypothetical" }).click();
        // Whoever goes first plays the first card in their hand.
        await playCard(
          page,
          page
            .locator(
              '#game-new-ui button[aria-label$="the play stacks or the discard pile"]',
            )
            .first(),
        );
        await page
          .locator("#game-new-ui [data-turn]", { hasText: /^2$/u })
          .waitFor();
        await settle(page);
      },
    },
  ];
}

/** Makes the account see the classic screen, as a setup step. */
async function useClassicScreen(cast: Cast) {
  await cast.setNewUi(false);
}

/** Switches the New UI to the classic screen. */
async function showClassic(page: Page) {
  await page.getByRole("button", { name: "Classic UI" }).click();
  await page.waitForSelector(".konvajs-content");
  await settle(page);
}

/** Bob ends his game, which makes it a shared replay that he leads. */
async function endBobsGame(page: Page, cast: Cast) {
  await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
  await cast.bobsGame().end();
  await page.getByRole("button", { name: "Ready" }).waitFor();
}

/** Leaves the table of the pregame screen. */
async function leaveTable(page: Page) {
  await page.click("#nav-buttons-pregame-leave");
  await page.locator("#lobby-pregame").waitFor({ state: "hidden" });
  await settle(page);
}

/** Joins the first table, unless the account is already at one. */
async function joinTable(page: Page) {
  const pregame = page.locator("#lobby-pregame");
  const row = page.locator("#lobby-games-table-tbody tr").first();
  await pregame.or(row).filter({ visible: true }).first().waitFor();
  if (!(await pregame.isVisible())) {
    await clickRow(page, row, pregame, "visible");
  }
}

/** Bundles the stylesheets of the current checkout into the directory that the server serves. */
async function buildBundle(directory: string) {
  const bundlePath = path.join(directory, "public/css", BUNDLE_FILENAME);
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await run(process.execPath, [
    path.join(ROOT, "packages/scripts/src/buildCss.ts"),
    bundlePath,
  ]);
}

/** Bundles the stylesheets of a Git ref, with the bundler of that ref. */
async function buildRefBundle(ref: string, directory: string): Promise<string> {
  const source = path.join(directory, "compare-source");
  await mkdir(source);
  // Refs before the switch to ES modules name the bundler "buildCss.mts".
  const { stdout: bundler } = await run(
    "git",
    [
      "ls-tree",
      "--name-only",
      ref,
      "--",
      "packages/scripts/src/buildCss.ts",
      "packages/scripts/src/buildCss.mts",
    ],
    { cwd: ROOT },
  );
  const bundlerPath = bundler.trim();
  // The bundler reads the stylesheets, and searches these directories for icon names.
  const paths = [
    "public/css",
    bundlerPath,
    "packages/client/src",
    "public/standalone",
    "server/src",
    "server/templates",
  ];
  const archive = path.join(directory, "compare.tar");
  await run("git", ["archive", "--output", archive, ref, "--", ...paths], {
    cwd: ROOT,
  });
  await run("tar", ["-xf", archive, "-C", source]);
  await symlink(
    path.join(ROOT, "node_modules"),
    path.join(source, "node_modules"),
  );
  const bundlePath = path.join(directory, "compare.min.css");
  await run(process.execPath, [path.join(source, bundlerPath), bundlePath]);
  return await Bun.file(bundlePath).text();
}

/** Serves the client and the static files of the current checkout, as a deployment does. */
async function linkPublicFiles(directory: string) {
  const links: Array<readonly [string, string]> = [
    ["public/css/critical.min.css", "public/css/critical.min.css"],
    ["public/js/lib", "public/js/lib"],
    ["public/sounds", "public/sounds"],
    ["public/standalone", "public/standalone"],
    ["public/webfonts", "public/webfonts"],
  ];
  for (const name of await readdir(path.join(ROOT, "public/img"))) {
    if (name !== "favicon.ico") {
      links.push([`public/img/${name}`, `public/img/${name}`]);
    }
  }
  for (const name of await readdir(path.join(ROOT, "public/js/bundles"))) {
    if (name !== "version.txt") {
      links.push([`public/js/bundles/${name}`, `public/js/bundles/${name}`]);
    }
  }
  await Promise.all(
    links.map(async ([from, to]) => {
      await symlink(path.join(ROOT, from), path.join(directory, to));
    }),
  );
}

/** Bob's game with the browser's account. */
interface BobsGame {
  /**
   * The player whose turn it is plays a card that the team can play now, or one that it cannot. The
   * account can move only until the page loads.
   */
  readonly play: (
    player: "account" | "bob",
    playable: boolean,
  ) => Promise<void>;
  /** The account plays a card, Bob plays one, and the account misplays one. */
  readonly playAndMisplay: () => Promise<void>;
  /**
   * Each player in turn discards their oldest card that the team can lose, for the given number of
   * turns. When the team has every clue token, the player gives a clue instead.
   */
  readonly discardTurns: (turns: number) => Promise<void>;
  /**
   * The players take turns until the deck is empty: each plays a card if they can, or else discards
   * a card that the team can lose, or else gives a clue.
   */
  readonly emptyDeck: () => Promise<void>;
  /**
   * Bob gives the account a rank clue that touches its newest card, the account discards its oldest
   * card, and Bob gives a clue that misses the newest card.
   */
  readonly clueTwice: () => Promise<void>;
  /** The card that the first clue of `clueTwice` touched. */
  readonly cluedCard: () => CardOrder | undefined;
  /** A note that names a card's identity, such as "r3". */
  readonly identityNote: (order: CardOrder) => Promise<string>;
  /** Bob ends the game, which turns it into a shared replay that he leads. */
  readonly end: () => Promise<void>;
  /** Makes the browser's account the leader of the shared replay. */
  readonly passLeader: () => void;
  /** Bob, who leads the shared replay, starts a hypothetical that everyone watches. */
  readonly startHypothetical: () => void;
  /**
   * Tells the leader of the shared replay whether Bob will play again. It returns once the server
   * has told the others.
   */
  readonly setReady: (ready: boolean) => Promise<void>;
}

/**
 * The accounts of one browser page, which it uses for the isolated states, and the games that they
 * set up. Each cast has names of its own, so that casts can run at the same time.
 */
interface Cast {
  /** The session cookie of the browser's account. */
  readonly cookie: string;
  /**
   * A saved game of the browser's account, which deals the same cards as the last seeded game, and
   * has the same moves.
   */
  readonly replayId: number;
  /** Sets whether the browser's account sees the New UI. */
  readonly setNewUi: (newUi: boolean) => Promise<void>;
  /**
   * Starts Bob's game, where the browser's account plays. It has two players unless the state asks
   * for more, up to five.
   */
  readonly startBobsGame: (numPlayers?: number) => Promise<BobsGame>;
  readonly bobsGame: () => BobsGame;
  /** Disconnects the browser's account after the setup of a state, so that the page can connect. */
  readonly disconnectAccount: () => void;
  /** Closes the table of the last state and disconnects its accounts. */
  readonly closeState: () => Promise<void>;
}

type Peer = ReturnType<typeof socketClient> & { readonly userId: UserId };

async function connect(
  address: string,
  username: string,
  bot = false,
): Promise<Peer> {
  const peer = socketClient(address, await login(address, username, bot));
  const { userId } = await peer.receive(
    "welcome",
    SERVER_EVENT_SCHEMAS.welcome,
  );
  return { ...peer, userId };
}

/** The events of a game, as a peer sees them. A spectator sees every card. */
async function loadEvents(peer: Peer, tableId: number) {
  peer.send("gameStateLoad", { tableId });
  const { events } = await peer.receive(
    "gameState",
    SERVER_EVENT_SCHEMAS.gameState,
  );
  return events;
}
type GameEvents = Awaited<ReturnType<typeof loadEvents>>;

/** Starts a table's game and loads it for each of its players. Returns each player's seat. */
async function startTable(
  owner: Peer,
  players: readonly Peer[],
  tableId: number,
): Promise<ReadonlyMap<Peer, number>> {
  owner.send("tableStart", {
    tableId,
    intendedPlayerIds: players.map((peer) => peer.userId),
  });
  const seats = await Promise.all(
    players.map(async (peer) => {
      await peer.receive(
        "tableJoined",
        SERVER_EVENT_SCHEMAS.tableJoined,
        entersGame,
      );
      const init = await peer.request("gameInitLoad", { tableId });
      peer.send("gameStateLoad", { tableId });
      await peer.receive("gameState", SERVER_EVENT_SCHEMAS.gameState);
      peer.send("gameLoaded", { tableId });
      const index = ourPlayerIndex(init);
      assertDefined(index, "The game has no seat for the account.");
      return [peer, index] as const;
    }),
  );
  return new Map(seats);
}

/**
 * Makes every account leave a table, which closes it. The first account must still attend it, and
 * gets the lobby's message that the table is gone.
 */
async function closeTable(peers: readonly Peer[], tableId: number) {
  for (const peer of peers) {
    peer.send("tableUnattend", { tableId });
  }
  const [first] = peers;
  assertDefined(first, "No account attends the table.");
  await first.receive(
    "tableRemoved",
    SERVER_EVENT_SCHEMAS.tableRemoved,
    (data) => data.tableId === tableId,
  );
}

/**
 * Plays one turn of a game between two players and ends it, so that it is saved. The pages of tags
 * show it if it has the tag.
 */
async function playGame(
  alice: Peer,
  bob: Peer,
  suffix: string,
  tag: boolean,
): Promise<number> {
  alice.send("tableCreate", {
    settings: {
      name: "Seeded game",
      maxPlayers: DEFAULT_MAX_PLAYERS,
      options: {},
      deal: { type: "seed", suffix },
    },
  });
  const { tableId } = await alice.receive(
    "tableJoined",
    SERVER_EVENT_SCHEMAS.tableJoined,
  );
  bob.send("tableJoin", { tableId });
  await bob.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
  const seats = await startTable(alice, [alice, bob], tableId);
  const first = [...seats].find(([, index]) => index === 0)?.[0];
  assertDefined(first, "Neither player goes first.");
  const events = await loadEvents(first, tableId);
  const card = events.find(
    (action) => action.type === "draw" && action.playerIndex === 0,
  );
  if (card?.type !== "draw") {
    throw new Error("The first player has no cards.");
  }
  first.send("playerAction", {
    tableId,
    action: { type: "play", order: card.order },
  });
  await first.receive("gameEvent", SERVER_EVENT_SCHEMAS.gameEvent);
  alice.send("tableTerminate", { tableId });
  const finished = await alice.receive(
    "gameFinished",
    SERVER_EVENT_SCHEMAS.gameFinished,
  );
  assertDefined(finished.view.gameId, "The seeded game was not saved.");
  if (tag) {
    alice.send("tagAdd", { tableId, tag: TAG });
  }
  // The players are now in a shared replay of the game. Leave it, or the browser would join it.
  await closeTable([bob, alice], tableId);
  return finished.view.gameId;
}

interface Seed {
  /** The last game that the seed saved. */
  readonly replayId: number;
  /** The session cookie of the browser's account in the states that are not isolated. */
  readonly cookie: string;
  /**
   * Closes the open table and disconnects the accounts there, so that casts can use their names.
   */
  readonly closeOpenTable: () => Promise<void>;
  readonly peers: readonly Peer[];
}

/**
 * Saves a few games. Leaves another account at an open table that has options and spectators, and a
 * bot online, so that the lobby shows a lobby chat message and the tabs of the online users list.
 */
async function seed(address: string): Promise<Seed> {
  let replayId = 0;
  // Each game gets new connections, so that the server's messages about one game cannot affect the
  // next.
  for (let i = 1; i <= NUM_SEEDED_GAMES; i++) {
    const alice = await connect(address, USERNAME);
    const bob = await connect(address, BOB);
    replayId = await playGame(alice, bob, i.toString(), true);
    alice.socket.close();
    bob.socket.close();
  }

  const bob = await connect(address, BOB);
  const tableId = await createBobsTable(bob, `${BOB}'s table`);
  bob.send("chat", { text: "Hello from the seeded lobby." });
  const spectators = await spectate(address, SPECTATOR_NAMES, tableId);
  const bot = await connect(address, "Robot", true);
  const cookie = await login(address, USERNAME);

  return {
    replayId,
    cookie,
    closeOpenTable: async () => {
      bob.send("tableLeave", { tableId });
      await bob.receive(
        "tableRemoved",
        SERVER_EVENT_SCHEMAS.tableRemoved,
        (data) => data.tableId === tableId,
      );
      for (const peer of [bob, ...spectators]) {
        peer.socket.close();
      }
    },
    peers: [bob, ...spectators, bot],
  };
}

/**
 * Bob creates his table: a speedrun of a variant with a long name and six suits, so that the
 * screens show how they fit both. Returns the table.
 */
async function createBobsTable(
  bob: Peer,
  name: string,
  deal?: { readonly type: "seed"; readonly suffix: string },
): Promise<number> {
  bob.send("settings", {
    settings: { hGroupConventions: true, hGroupLevel: H_GROUP_LEVEL },
  });
  bob.send("tableCreate", {
    settings: {
      name,
      maxPlayers: DEFAULT_MAX_PLAYERS,
      options: {
        speedrun: true,
        deckPlays: true,
        variantId: getVariant(LONG_VARIANT_NAME).id,
      },
      ...(deal !== undefined && { deal }),
    },
  });
  const { tableId } = await bob.receive(
    "tableJoined",
    SERVER_EVENT_SCHEMAS.tableJoined,
  );
  return tableId;
}

/**
 * Has accounts watch a table. There are more than the game screen's chat header names, so that it
 * offers to show the rest.
 */
async function spectate(
  address: string,
  names: readonly string[],
  tableId: number,
): Promise<readonly Peer[]> {
  const spectators: Peer[] = [];
  for (const name of names) {
    const spectator = await connect(address, name);
    spectator.send("tableSpectate", { tableId });
    await spectator.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    spectators.push(spectator);
  }
  return spectators;
}

/** The name of an account in a cast. The first cast has the plain names. */
function castName(name: string, castIndex: number): string {
  return castIndex === 0 ? name : `${name}${castIndex + 1}`;
}

/**
 * Clicks a row of the lobby's table list until the click opens its table: until an element shows or
 * hides. The lobby ignores a click on a row that has just appeared or moved, and the tables of
 * other states can move it at any time. The row animates, so it is never stable.
 */
async function clickRow(
  page: Page,
  row: Locator,
  opened: Locator,
  state: "visible" | "hidden",
) {
  await row.waitFor();
  for (let attempt = 1; ; attempt++) {
    await page.waitForTimeout(ROW_CLICK_DELAY_MILLISECONDS);
    const visible = await opened.isVisible();
    if (visible === (state === "visible")) {
      return;
    }
    await row.click({ force: true });
    try {
      await opened.waitFor({ state, timeout: ROW_CLICK_WAIT_MILLISECONDS });
      return;
    } catch (error) {
      if (attempt === MAX_ROW_CLICKS) {
        throw error;
      }
    }
  }
}

/** The turn of a game, and the seat of the player whose turn it is. */
function readTurn(events: GameEvents) {
  const turn = events.findLast((event) => event.type === "turn");
  return turn?.type === "turn"
    ? { turn: turn.turn, player: turn.currentPlayerIndex ?? 0 }
    : { turn: 0, player: 0 };
}

/** Creates the accounts of a cast. */
async function createCast(
  address: string,
  castIndex: number,
  seeded: Pick<Seed, "replayId">,
): Promise<Cast> {
  function name(base: string) {
    return castName(base, castIndex);
  }
  const accountName = name(USERNAME);
  const cookie = await login(address, accountName);
  let { replayId } = seeded;
  // The first cast has the names of the seeded games, so it watches the last one.
  if (castIndex > 0) {
    const alice = await connect(address, accountName);
    const bob = await connect(address, name(BOB));
    replayId = await playGame(alice, bob, NUM_SEEDED_GAMES.toString(), false);
    alice.socket.close();
    bob.socket.close();
  }

  /** The accounts that the last state connected, besides the browser's. */
  let peers: Peer[] = [];
  /** The connection of the browser's account, before the page loads. */
  let account: Peer | undefined;
  /**
   * The table of the last state, which the browser's account is at, and the first account there.
   */
  let table: { readonly id: number; readonly owner: Peer } | undefined;
  /** Ends the game of the last state, if it is not over. */
  let endGame: (() => Promise<void>) | undefined;
  let currentBobsGame: BobsGame | undefined;

  async function connectPeer(username: string) {
    const peer = await connect(address, username);
    peers.push(peer);
    return peer;
  }

  async function connectAccount(newUi: boolean) {
    account ??= await connect(address, accountName);
    account.send("settings", { settings: { newUi } });
    // The server does not answer a change of settings. It runs the requests of the lobby in order,
    // so a reply to the next one shows that the change is saved.
    await account.request("chatPmHistory", { limit: 1 });
    return account;
  }

  function disconnectAccount() {
    account?.socket.close();
    account = undefined;
  }

  async function setNewUi(newUi: boolean) {
    await connectAccount(newUi);
    disconnectAccount();
  }

  async function startBobsGame(numPlayers = 2): Promise<BobsGame> {
    const you = await connectAccount(true);
    const bob = await connectPeer(name(BOB));
    const tableId = await createBobsTable(bob, `${name(BOB)}'s table`, {
      type: "seed",
      suffix: BOBS_GAME_SEED_SUFFIX,
    });
    const spectators = await spectate(
      address,
      SPECTATOR_NAMES.map(name),
      tableId,
    );
    peers.push(...spectators);
    const [firstSpectator] = spectators;
    assertDefined(firstSpectator, "There is no spectator to see every card.");
    const viewer: Peer = firstSpectator;
    you.send("tableJoin", { tableId });
    await you.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    const others: Peer[] = [];
    for (const other of OTHER_PLAYER_NAMES.slice(0, numPlayers - 2)) {
      const peer = await connectPeer(name(other));
      peer.send("tableJoin", { tableId });
      await peer.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
      others.push(peer);
    }
    const seats = await startTable(bob, [bob, you, ...others], tableId);
    table = { id: tableId, owner: bob };
    let over = false;
    endGame = async () => {
      if (!over) {
        await end();
      }
    };

    function seat(player: "account" | "bob") {
      const index = seats.get(player === "bob" ? bob : you);
      assertDefined(index, `The ${player} has no seat.`);
      return index;
    }

    /** Whose turn it is. */
    async function turnOf(): Promise<"account" | "bob"> {
      const { player } = readTurn(await loadEvents(viewer, tableId));
      return player === seat("bob") ? "bob" : "account";
    }

    /** Makes a move for a player, and waits until the server has made it. */
    async function move(
      player: "account" | "bob",
      action: z.input<typeof playerActionRequestSchema>["action"],
    ) {
      await moveAt(seat(player), action);
    }

    /** Makes a move for the player in a seat, and waits until the server has made it. */
    async function moveAt(
      index: number,
      action: z.input<typeof playerActionRequestSchema>["action"],
    ) {
      const { turn } = readTurn(await loadEvents(viewer, tableId));
      if (index === seat("account")) {
        assertDefined(
          account,
          "The account can only move before the page loads.",
        );
      }
      console.error(
        "DEBUG move",
        turn,
        index,
        JSON.stringify(action),
        JSON.stringify(await handAt(index)),
      );
      const peer = [...seats].find(([, other]) => other === index)?.[0];
      assertDefined(peer, `No player sits in seat ${index}.`);
      peer.send("playerAction", { tableId, action });
      await viewer.receive(
        "gameEvent",
        SERVER_EVENT_SCHEMAS.gameEvent,
        (data) =>
          data.events.some(
            (event) => event.type === "turn" && event.turn === turn + 1,
          ),
      );
    }

    /** The cards in a player's hand, oldest first, with what they are. */
    async function hand(player: "account" | "bob") {
      return await handAt(seat(player));
    }

    /** The cards in the hand of the player in a seat, oldest first, with what they are. */
    async function handAt(index: number): Promise<
      ReadonlyArray<{
        readonly order: CardOrder;
        readonly suitIndex: number;
        readonly rank: number;
        readonly playable: boolean;
      }>
    > {
      const events = await loadEvents(viewer, tableId);
      const gone = new Set<CardOrder>();
      for (const event of events) {
        if (
          event.type === "play"
          || event.type === "discard"
          || event.type === "misplay"
        ) {
          gone.add(event.order);
        }
      }
      const stacks = new Map<number, number>();
      for (const event of events) {
        if (event.type === "play" && event.identity !== undefined) {
          stacks.set(event.identity.suitIndex, event.identity.rank);
        }
      }
      const cards: Array<{
        readonly order: CardOrder;
        readonly suitIndex: number;
        readonly rank: number;
        readonly playable: boolean;
      }> = [];
      for (const event of events) {
        if (
          event.type === "draw"
          && event.playerIndex === index
          && !gone.has(event.order)
          && event.identity !== undefined
        ) {
          const { suitIndex, rank } = event.identity;
          cards.push({
            order: event.order,
            suitIndex,
            rank,
            playable: rank === (stacks.get(suitIndex) ?? 0) + 1,
          });
        }
      }
      return cards;
    }

    async function play(player: "account" | "bob", playable: boolean) {
      if ((await turnOf()) !== player) {
        throw new Error(`It is not the turn of the ${player}.`);
      }
      const variant = getVariant(LONG_VARIANT_NAME);
      // A play of a card of an inverted suit, such as orange, discards it instead.
      const cards = await hand(player);
      const card = cards.find(
        (other) =>
          other.playable === playable
          && variant.suits[other.suitIndex]?.inverted !== true,
      );
      assertDefined(
        card,
        `The ${player} has no card to ${playable ? "play" : "misplay"}. Choose another seed for Bob's game.`,
      );
      await move(player, { type: "play", order: card.order });
    }

    let clueTarget: { order: CardOrder; rank: number } | undefined;

    /** Bob gives the account a rank clue. */
    async function clueAccount() {
      const handCards = await hand("account");
      const cards = handCards.filter((card) => isValidClueRank(card.rank));
      let card: (typeof cards)[number] | undefined;
      if (clueTarget === undefined) {
        card = cards.at(-1);
        clueTarget = card;
      } else {
        const { rank } = clueTarget;
        card = cards.find((other) => other.rank !== rank);
      }
      assertDefined(card, "The account has no card for Bob to clue.");
      await move("bob", {
        type: "clue",
        receiverIndex: seat("account") as PlayerIndex,
        clue: { type: "rank", rank: card.rank as ClueRank },
      });
    }

    async function discardTurns(turns: number) {
      const variant = getVariant(LONG_VARIANT_NAME);
      for (let i = 0; i < turns; i++) {
        const events = await loadEvents(viewer, tableId);
        const { player } = readTurn(events);
        const clues =
          MAX_CLUES
          - events.filter((event) => event.type === "clue").length
          + events.filter((event) => event.type === "discard").length;

        // Bob's table is a speedrun, which ends once the team cannot get a perfect score. So the
        // player keeps 5s and cards that have a copy in the discard pile. They also keep cards of
        // an inverted suit, such as orange, whose 1s are critical.
        const discarded = new Set<string>();
        for (const event of events) {
          if (event.type === "discard" && event.identity !== undefined) {
            discarded.add(`${event.identity.suitIndex}-${event.identity.rank}`);
          }
        }
        const cards = await handAt(player);
        const card = cards.find(
          (other) =>
            other.rank !== MAX_RANK
            && !discarded.has(`${other.suitIndex}-${other.rank}`)
            && variant.suits[other.suitIndex]?.inverted !== true,
        );
        if (card !== undefined && clues < MAX_CLUES) {
          await moveAt(player, { type: "discard", order: card.order });
          continue;
        }

        const receiver = (player + 1) % seats.size;
        const receiverCards = await handAt(receiver);
        const touched = receiverCards.find((other) =>
          isValidClueRank(other.rank),
        );
        assertDefined(touched, `Seat ${receiver} has no card to clue.`);
        await moveAt(player, {
          type: "clue",
          receiverIndex: receiver as PlayerIndex,
          clue: { type: "rank", rank: touched.rank as ClueRank },
        });
      }
    }

    async function emptyDeck() {
      const variant = getVariant(LONG_VARIANT_NAME);
      const deckSize = getTotalCardsInDeck(variant);
      for (;;) {
        const events = await loadEvents(viewer, tableId);
        if (
          events.filter((event) => event.type === "draw").length >= deckSize
        ) {
          return;
        }
        const { player } = readTurn(events);

        // A discard and the play of the last card of a suit each give back a clue token.
        let clues = MAX_CLUES;
        const stacks = new Map<number, number>();
        const discarded = new Map<string, number>();
        for (const event of events) {
          if (event.type === "clue") {
            clues--;
          } else if (event.type === "discard" && event.identity !== undefined) {
            clues = Math.min(clues + 1, MAX_CLUES);
            const key = `${event.identity.suitIndex}-${event.identity.rank}`;
            discarded.set(key, (discarded.get(key) ?? 0) + 1);
          } else if (event.type === "play" && event.identity !== undefined) {
            const { suitIndex, rank } = event.identity;
            stacks.set(suitIndex, rank);
            if (rank === MAX_RANK) {
              clues = Math.min(clues + 1, MAX_CLUES);
            }
          }
        }
        // A play of a card of an inverted suit, such as orange, discards it, and a discard plays
        // it. So the players keep those cards.
        const fullHand = await handAt(player);
        const cards = fullHand.filter(
          (card) => variant.suits[card.suitIndex]?.inverted !== true,
        );
        const playable = cards.find((card) => card.playable);
        if (playable !== undefined) {
          await moveAt(player, { type: "play", order: playable.order });
          continue;
        }

        // Bob's table is a speedrun, which ends once the team cannot get a perfect score. So the
        // player keeps the last copy of each card that is still to be played.
        const expendable = cards.find((card) => {
          const suit = variant.suits[card.suitIndex];
          assertDefined(suit, `There is no suit ${card.suitIndex}.`);
          const stack = stacks.get(card.suitIndex);
          const played = stack !== undefined && card.rank <= stack;
          const copies = getNumCopiesOfCard(suit, card.rank as Rank, variant);
          const left =
            copies - (discarded.get(`${card.suitIndex}-${card.rank}`) ?? 0);
          return played || left > 1;
        });
        if (expendable !== undefined && clues < MAX_CLUES) {
          await moveAt(player, { type: "discard", order: expendable.order });
          continue;
        }

        const receiver = (player + 1) % seats.size;
        const receiverCards = await handAt(receiver);
        const touched = receiverCards.find((other) =>
          isValidClueRank(other.rank),
        );
        assertDefined(touched, `Seat ${receiver} has no card to clue.`);
        if (clues === 0) {
          throw new Error(
            "The team cannot play, discard, or clue. Choose another seed for Bob's game.",
          );
        }
        await moveAt(player, {
          type: "clue",
          receiverIndex: receiver as PlayerIndex,
          clue: { type: "rank", rank: touched.rank as ClueRank },
        });
      }
    }

    async function end() {
      bob.send("tableTerminate", { tableId });
      await bob.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished);
      over = true;
    }

    // When Bob goes first, he clues the newest card of the browser's account, so that its hand
    // shows a clued card, and it is the account's turn.
    if ((await turnOf()) === "bob") {
      const cards = await hand("account");
      const newest = cards.at(-1);
      if (newest !== undefined && newest.rank !== START_CARD_RANK) {
        await move("bob", {
          type: "clue",
          receiverIndex: seat("account") as PlayerIndex,
          clue: { type: "rank", rank: newest.rank as ClueRank },
        });
      }
    }

    currentBobsGame = {
      play,
      playAndMisplay: async () => {
        await play("account", true);
        await play("bob", true);
        await play("account", false);
      },
      discardTurns,
      emptyDeck,
      clueTwice: async () => {
        if ((await turnOf()) === "account") {
          await play("account", true);
        }
        await clueAccount();
        // The oldest card, which the first clue did not touch.
        const [oldest] = await hand("account");
        assertDefined(oldest, "The account has no cards.");
        await move("account", { type: "discard", order: oldest.order });
        await clueAccount();
      },
      cluedCard: () => clueTarget?.order,
      identityNote: async (order) => {
        const cards = await hand("account");
        const card = cards.find((other) => other.order === order);
        assertDefined(card, `The card ${order} is not in the account's hand.`);
        const abbreviation =
          getVariant(LONG_VARIANT_NAME).suitAbbreviations[card.suitIndex];
        assertDefined(
          abbreviation,
          `The suit ${card.suitIndex} has no abbreviation.`,
        );
        return `${abbreviation.toLowerCase()}${card.rank}`;
      },
      end,
      passLeader: () => {
        bob.send("tableSetOwner", { tableId, userId: you.userId });
      },
      startHypothetical: () => {
        bob.send("replayAction", {
          tableId,
          action: { type: "hypothetical", control: { type: "start" } },
        });
      },
      setReady: async (ready) => {
        await bob.request("tableRestartDecline", { tableId, declined: !ready });
      },
    };
    return currentBobsGame;
  }

  return {
    cookie,
    replayId,
    setNewUi,
    startBobsGame,
    bobsGame: () => {
      assertDefined(currentBobsGame, "The state did not start Bob's game.");
      return currentBobsGame;
    },
    disconnectAccount,
    closeState: async () => {
      if (table !== undefined) {
        await endGame?.();
        // The browser's account is still at the table, and would return to it.
        const you = await connect(address, accountName);
        await closeTable(
          [table.owner, ...peers.filter((peer) => peer !== table?.owner), you],
          table.id,
        );
        you.socket.close();
      }
      disconnectAccount();
      for (const peer of peers) {
        peer.socket.close();
      }
      peers = [];
      table = undefined;
      endGame = undefined;
      currentBobsGame = undefined;
    },
  };
}

/** Runs in the page. */
function setTheme(theme: Theme) {
  document.documentElement.dataset["theme"] = theme;
}

/** Runs in the page. Loads a bundle in place of the page's stylesheets, or restores them. */
async function useStylesheet(href: string | undefined) {
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[href*="/public/css/"]',
  )) {
    link.remove();
  }
  document.querySelector("#ui-screenshots-stylesheet")?.remove();
  if (href === undefined) {
    return;
  }
  const link = document.createElement("link");
  link.id = "ui-screenshots-stylesheet";
  link.rel = "stylesheet";
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve);
    link.addEventListener("error", reject);
  });
  link.href = href;
  document.head.append(link);
  await loaded;
  await document.fonts.ready;
}

/**
 * Runs in the page. Reads the computed styles of every rendered element and its generated content.
 * Custom properties are left out, because the properties that use them show their effect. The first
 * call keeps them in the page. The second call returns how its styles differ from the kept ones, so
 * that the styles themselves never leave the page.
 */
function compareStyles(compare: boolean): readonly string[] {
  type Styles = Record<string, Record<string, string>>;
  const store = globalThis as unknown as { uiScreenshotsStyles?: Styles };
  const styles: Styles = {};
  // eslint-disable-next-line unicorn/consistent-function-scoping -- This runs in the page.
  function getPath(element: Element): string {
    const parts: string[] = [];
    for (
      let current: Element | null = element;
      current !== null && current !== document.documentElement;
      current = current.parentElement
    ) {
      const index =
        current.parentElement === null
          ? 0
          : [...current.parentElement.children].indexOf(current);
      const id = current.id === "" ? "" : `#${current.id}`;
      parts.unshift(`${current.tagName.toLowerCase()}${id}:${index}`);
    }
    return parts.join(" > ");
  }
  for (const element of [
    document.documentElement,
    ...document.querySelectorAll("body *"),
  ]) {
    if (!element.checkVisibility()) {
      continue;
    }
    for (const pseudo of [undefined, "::before", "::after"]) {
      const computed = getComputedStyle(element, pseudo);
      if (
        pseudo !== undefined
        && (computed.content === "none" || computed.content === "normal")
      ) {
        continue;
      }
      const properties: Record<string, string> = {};
      for (const property of computed) {
        if (!property.startsWith("--")) {
          properties[property] = computed.getPropertyValue(property);
        }
      }
      styles[`${getPath(element)}${pseudo ?? ""}`] = properties;
    }
  }

  const kept = store.uiScreenshotsStyles;
  if (!compare || kept === undefined) {
    store.uiScreenshotsStyles = styles;
    return [];
  }
  delete store.uiScreenshotsStyles;
  const differences: string[] = [];
  for (const [key, properties] of Object.entries(kept)) {
    const other = styles[key];
    if (other === undefined) {
      differences.push(`${key}: only with the current stylesheets`);
      continue;
    }
    for (const [property, value] of Object.entries(properties)) {
      if (other[property] !== value) {
        differences.push(
          `${key} ${property}: ${String(other[property])} -> ${value}`,
        );
      }
    }
  }
  for (const key of Object.keys(styles)) {
    if (kept[key] === undefined) {
      differences.push(`${key}: only with the compared stylesheets`);
    }
  }
  return differences;
}

interface Options {
  readonly states: readonly string[];
  readonly widths: readonly number[];
  readonly themes: readonly Theme[];
  readonly compare: string | undefined;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      state: { type: "string", multiple: true },
      width: { type: "string", multiple: true },
      theme: { type: "string" },
      compare: { type: "string" },
    },
  });
  const widths = (values.width ?? []).map(Number);
  const allowedWidths = SIZES.map((size) => size.width);
  for (const width of widths) {
    if (!allowedWidths.includes(width as (typeof allowedWidths)[number])) {
      throw new Error(`The width must be one of: ${allowedWidths.join(", ")}`);
    }
  }
  const { theme } = values;
  if (theme !== undefined && !THEMES.includes(theme as Theme)) {
    throw new Error(`The theme must be one of: ${THEMES.join(", ")}`);
  }
  return {
    states: values.state ?? [],
    widths,
    themes: theme === undefined ? THEMES : [theme as Theme],
    compare: values.compare,
  };
}

interface Results {
  /** The lines of the comparison report. */
  readonly comparison: string[];
  readonly errors: string[];
}

/** Takes the screenshots of states, one at a time, in a new page of a browser context. */
async function capture(
  context: BrowserContext,
  address: string,
  states: readonly State[],
  cast: Cast,
  options: Options,
  compareBundle: string | undefined,
  results: Results,
) {
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MILLISECONDS);
  page.on("pageerror", (error) => {
    results.errors.push(error.message);
  });
  if (compareBundle !== undefined) {
    await page.route(`**${COMPARE_BUNDLE_PATH}`, async (route) => {
      await route.fulfill({ contentType: "text/css", body: compareBundle });
    });
  }

  for (const state of states) {
    try {
      await captureState(
        page,
        address,
        state,
        cast,
        options,
        compareBundle,
        results,
      );
    } catch (error) {
      // The page as the state left it, to see why it failed.
      await page.screenshot({
        path: path.join(OUTPUT_DIRECTORY, `${state.name}-failed.png`),
      });
      throw error;
    }
    console.info(`Captured: ${state.name}`);
  }

  await page.close();
}

/** Takes the screenshots of a state. */
async function captureState(
  page: Page,
  address: string,
  state: State,
  cast: Cast,
  options: Options,
  compareBundle: string | undefined,
  results: Results,
) {
  const bundleHref = `/public/css/${BUNDLE_FILENAME}`;
  const sizes = SIZES.filter(
    (size) =>
      options.widths.length === 0 || options.widths.includes(size.width),
  );
  {
    await page.setViewportSize(SETUP_SIZE);
    if (state.setup !== undefined) {
      await page.goto("about:blank");
      await state.setup(cast);
      cast.disconnectAccount();
    }
    const response = await page.goto(`${address}${state.path}`);
    if (response === null || !response.ok()) {
      throw new Error(
        `Failed to load "${state.path}" (HTTP ${String(response?.status())}).`,
      );
    }
    // The critical CSS is a copy of some of the bundle's rules, so leave it out. Otherwise, it
    // would hide the rules that only it applies.
    await page.evaluate(useStylesheet, bundleHref);
    await settle(page);
    await state.prepare?.(page, cast);
    // Keep the pointer off of the page, so that no element shows its hover style.
    await page.mouse.move(0, SETUP_SIZE.height - 1);
    await settle(page);

    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const theme of options.themes) {
        await page.evaluate(setTheme, theme);
        if (state.hover !== undefined) {
          // Move the pointer onto the element again, so that a tooltip opens at its new position.
          await page.mouse.move(0, size.height - 1);
          await (typeof state.hover === "string"
            ? page.hover(state.hover)
            : state.hover(page, cast));
        }
        await settle(page);
        const file = path.join(
          OUTPUT_DIRECTORY,
          `${state.name}-${size.width}-${theme}`,
        );
        // Animations that never end, such as a pulse, show their first frame.
        await page.screenshot({ path: `${file}.png`, animations: "disabled" });

        if (compareBundle !== undefined) {
          // A difference counts only if it shows twice, because a page can still change on its own
          // (for example, when the server sends an update).
          let differences: readonly string[] | undefined;
          for (let i = 0; i < 2 && differences?.length !== 0; i++) {
            await page.evaluate(compareStyles, false);
            await page.evaluate(useStylesheet, COMPARE_BUNDLE_PATH);
            await settle(page);
            const found = await page.evaluate(compareStyles, true);
            if (found.length > 0) {
              await page.screenshot({
                path: `${file}.compare.png`,
                animations: "disabled",
              });
            }
            differences =
              differences === undefined
                ? found
                : differences.filter((line) => found.includes(line));
            await page.evaluate(useStylesheet, bundleHref);
            await settle(page);
          }
          if (differences === undefined || differences.length === 0) {
            await rm(`${file}.compare.png`, { force: true });
          } else {
            results.comparison.push(
              `## ${state.name} ${size.width} ${theme}`,
              ...differences,
              "",
            );
          }
        }
      }
    }
    await state.cleanup?.(page);
    if (state.isolated === true) {
      await page.goto("about:blank");
      await cast.closeState();
    }
  }
}

async function writeReports(options: Options, results: Results) {
  if (options.compare !== undefined) {
    const report = path.join(OUTPUT_DIRECTORY, "compare.txt");
    await writeFile(report, results.comparison.join("\n"));
    const count = results.comparison.filter((line) =>
      line.startsWith("## "),
    ).length;
    console.info(
      count === 0
        ? `No computed style differs from "${options.compare}".`
        : `Computed styles differ in ${count} screenshots: ${report}`,
    );
  }

  if (results.errors.length > 0) {
    console.warn(`Errors in the pages:\n${results.errors.join("\n")}`);
  }
}

async function main() {
  const options = parseOptions();
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await mkdir(path.join(ROOT, "dist"), { recursive: true });
  const directory = await mkdtemp(path.join(ROOT, "dist/ui-screenshots-"));
  const database = await evaluationDatabase();
  let server: ReturnType<typeof startProcess> | undefined;
  let seeded: Seed | undefined;
  try {
    await prepareRoot(directory, database, DOMAIN);
    // A production domain makes the server listen on every interface unless told otherwise.
    await appendFile(path.join(directory, ".env"), "LISTEN_HOST=127.0.0.1\n");
    await buildBundle(directory);
    const compareBundle =
      options.compare === undefined
        ? undefined
        : await buildRefBundle(options.compare, directory);
    await linkPublicFiles(directory);
    await buildRust(directory);
    await installSchema(directory);
    server = startProcess(directory);
    const localAddress = await server.ready;
    const { port } = new URL(localAddress);
    const address = `http://${DOMAIN}:${port}`;

    const seedResult = await seed(localAddress);
    seeded = seedResult;
    const allStates = getStates();
    const states = allStates.filter(
      (state) =>
        options.states.length === 0 || options.states.includes(state.name),
    );
    const unknown = options.states.filter((name) =>
      states.every((state) => state.name !== name),
    );
    if (unknown.length > 0) {
      throw new Error(
        `Unknown states: ${unknown.join(", ")}. The states are: ${allStates
          .map((state) => state.name)
          .join(", ")}`,
      );
    }
    // One cast for each page that takes the screenshots of the isolated states that are signed in,
    // and one for the page of those that are signed out.
    const allCasts = await Promise.all(
      Array.from(
        { length: NUM_WORKERS + 1 },
        async (_cast, index) =>
          await createCast(localAddress, index, seedResult),
      ),
    );
    const casts = allCasts.slice(0, NUM_WORKERS);
    const signedOutCast = allCasts.at(-1);
    assertDefined(signedOutCast, "There is no cast.");
    // The server shows the tutorial to an account that is a few seconds old, and the browser's
    // accounts are not new.
    const sql = database.connect();
    await sql`UPDATE users SET datetime_created = datetime_created - interval '1 day'`;
    await sql.end();

    await run(process.execPath, [
      "x",
      "--bun",
      "--no-install",
      "playwright",
      "install",
      "--only-shell",
      "chromium",
    ]);
    await using browser = await chromium.launch({
      args: ["--mute-audio", `--host-resolver-rules=MAP ${DOMAIN} 127.0.0.1`],
    });
    /** A browser context that is signed in with a session cookie, or signed out. */
    async function newContext(cookie: string | undefined) {
      // Without the permission, the lobby shows a modal that asks for it.
      const context = await browser.newContext({
        colorScheme: "light",
        permissions: cookie === undefined ? [] : ["notifications"],
      });
      if (cookie !== undefined) {
        const [name = "", value] = cookie.split("=", 2);
        assertDefined(value, "The session cookie has no value.");
        await context.addCookies([{ name, value, domain: DOMAIN, path: "/" }]);
      }
      return context;
    }
    const results: Results = {
      comparison: [],
      errors: [],
    };
    const [firstCast] = casts;
    assertDefined(firstCast, "There is no cast.");
    const shared = states.filter((state) => state.isolated !== true);
    const isolated = states.filter((state) => state.isolated === true);
    const signedIn = isolated.filter((state) => state.loggedIn);
    // The pages that are signed out do not show who is online, so they can run with the lobby's.
    const signedOutContext = await newContext(undefined);
    const lobbyContext = await newContext(seedResult.cookie);
    await Promise.all([
      capture(
        signedOutContext,
        address,
        shared.filter((state) => !state.loggedIn),
        firstCast,
        options,
        compareBundle,
        results,
      ),
      capture(
        lobbyContext,
        address,
        shared.filter((state) => state.loggedIn),
        firstCast,
        options,
        compareBundle,
        results,
      ),
    ]);

    // The first cast uses the names of the accounts at the open table.
    await seedResult.closeOpenTable();
    await Promise.all([
      ...casts.map(async (cast, index) => {
        await capture(
          await newContext(cast.cookie),
          address,
          signedIn.filter((_state, i) => i % casts.length === index),
          cast,
          options,
          compareBundle,
          results,
        );
      }),
      capture(
        signedOutContext,
        address,
        isolated.filter((state) => !state.loggedIn),
        signedOutCast,
        options,
        compareBundle,
        results,
      ),
    ]);
    await writeReports(options, results);
    console.info(`Screenshots: ${OUTPUT_DIRECTORY}`);
  } finally {
    if (seeded !== undefined) {
      for (const peer of seeded.peers) {
        peer.socket.close();
      }
    }
    if (server !== undefined) {
      await stopChild(server.child);
    }
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error("Failed to take the screenshots:", error);
  process.exitCode = 1;
}
