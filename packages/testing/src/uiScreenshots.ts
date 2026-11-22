// Takes screenshots of the site's screens at several widths. It starts this checkout's server with
// a disposable database and seeds it through the client protocol, so that every run sees the same
// pages. Run it through "runTests.ts", which provides the database and builds the server and a
// development client: `bun run ui-screenshots [options]`. An error or warning in a page, a New UI
// game screen whose hands, play stacks, and discard pile do not line up at the top, or a New UI bar
// along the bottom of the screen with two rows, fails the run.

// Options:
// - `--state <name>`: Only this state. Repeat it for more than one.
// - `--width <pixels>`: Only this width. Repeat it for more than one.
// - `--dark`: Show the dark theme, which the "Dark mode" setting turns on. The screenshots end in
//   "-dark.png".
// - `--compare <git ref>`: Also report every computed style that differs from the stylesheets of
//   that ref, and take a screenshot with them wherever a difference shows.

// Each run deletes the screenshots of the run before it. It writes "index.html", a page that shows
// every screenshot of the run, so that they can be opened together.

// Each state sets up what it shows, so that it can run alone. The states that show the lobby run
// first, one at a time, since they show every account that is online and every table. The isolated
// states then run in several browser pages at once. Each page uses its own accounts.

/* eslint-disable no-await-in-loop -- A browser page visits its states one at a time. */

import type { playerActionRequestSchema, UserId } from "@hanabi-live/data";
import {
  DEFAULT_MAX_PLAYERS,
  IDLE_WARNING_MS,
  MAX_CHAT_LENGTH,
  SERVER_EVENT_SCHEMAS,
  VERSION,
} from "@hanabi-live/data";
import type {
  CardOrder,
  ClueRank,
  ColorIndex,
  PlayerIndex,
  Rank,
} from "@hanabi-live/game";
import {
  getNumCopiesOfCard,
  getTotalCardsInDeck,
  getVariant,
  isValidClueRank,
  MAX_CLUES,
  MAX_RANK,
  MAX_STRIKES,
  START_CARD_RANK,
} from "@hanabi-live/game";
import { assertDefined, SECOND_IN_MILLISECONDS } from "complete-common";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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
import type { BrowserContext, Locator, Page, WebSocketRoute } from "playwright";
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
  // The New UI shows the bar along the bottom only from 1600px (see "BAR_ONE_ROW_WIDTH").
  {
    width: 1920,
    height: 900,
  },
  {
    width: 1600,
    height: 900,
  },
  {
    width: 1200,
    height: 800,
  },
  {
    width: 800,
    height: 500,
  },
  {
    width: 600,
    height: 500,
  },
  // The smallest supported width (see "AGENTS.md"). Do not make it wider: a phone that is 360px
  // wide is more common than one that is 375px wide.
  {
    width: 360,
    height: 700,
  },
] as const;

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

/**
 * The most time that starting the server, seeding it, or signing in its accounts takes. A phase
 * that takes longer is stuck, and the run stops with its name.
 */
const SETUP_TIMEOUT_MILLISECONDS = 60_000;

/** The most time that one state takes, at every width. */
const STATE_TIMEOUT_MILLISECONDS = 2 * 60_000;

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

/** The cards in the discards, and the first card of the next player's hand. */
const DISCARD_CARD_SELECTOR = '#game-new-ui [data-card-place^="discard-"]';
const NEXT_HAND_FIRST_CARD_SELECTOR =
  '#game-new-ui [data-card-place="hand-1-0"]';

/** Bob's arrow, but not a copy of an earlier arrow that is still fading out. */
const ARROW_SELECTOR = "#game-new-ui [data-highlight-arrow]:not([inert])";

/**
 * A card of the account's own hand, counted from 0 on the left. The account's hand is the first on
 * the screen, whatever its seat.
 */
function ownCard(page: Page, index: number): Locator {
  return page
    .locator("#game-new-ui [data-hand]")
    .first()
    .locator("[data-card-place]")
    .nth(index);
}

/**
 * Taps the middle of an element as a finger does. The browser has no touch screen, so it sends the
 * events of a tap that the page reads: a touch pointer goes down and up, and then clicks.
 */
async function tap(locator: Locator) {
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      pointerType: "touch",
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    for (const type of ["pointerdown", "pointerup", "click"]) {
      element.dispatchEvent(new PointerEvent(type, init));
    }
  });
}

/** Notes whose keywords draw a mark or a border on a card, by the place of the card. */
const KEYWORD_NOTES = [
  ["hand-1-1", "f"],
  ["hand-1-2", "cm"],
  ["hand-1-3", "ptd"],
  // Two keywords, so that the card shows both of their marks.
  ["hand-2-0", "[fix][!]"],
  ["hand-2-1", "spook"],
  ["hand-2-2", "!"],
  ["hand-2-3", "blank"],
] as const;

/** The note that the account writes on the next player's first card. */
const NEXT_HAND_NOTE = "r1 maybe :D";

/** Moves the mouse over the next player's clue button in the New UI, which brightens it. */
async function pointAtNextPlayersClueButton(page: Page) {
  await page
    .locator("#game-new-ui [data-hand]")
    .nth(1)
    .locator("[data-clue-button] button")
    .hover();
}

/**
 * Opens the New UI's clue menu on the next player's hand, and chooses the first clue that the rules
 * allow, so that its cards show which ones it would touch.
 */
async function chooseClueForNextPlayer(page: Page) {
  await page
    .locator("#game-new-ui [data-hand]")
    .nth(1)
    .locator("[data-clue-button] button")
    .click();
  await page
    .getByRole("dialog", { name: /^Give .* a clue$/u })
    .locator("button[aria-pressed]:enabled:not([data-clue-preview])")
    .first()
    .click();
  await settle(page);
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

/** The accounts that play a game and review another in the lobby. */
const LOBBY_GAME_NAMES = ["Mallory", "Nora", "Oscar", "Peggy"] as const;

/** The player whose "Best scores" tab the screenshots show, with the scores that the seed gives. */
const BEST_SCORES_USERNAME = LOBBY_GAME_NAMES[2];

/** The account that owns the open table and plays Bob's game with the browser's account. */
const BOB = "Bob";

/**
 * The accounts that also play Bob's game when it has more than two players. One name is as long as
 * a username can be with the suffix of a cast, so that a crowded table shows how a long name fits.
 */
const OTHER_PLAYER_NAMES = ["Ivan_Wolfgang", "Heidi", "Grace"] as const;

/** The variant of the open table. */
const LONG_VARIANT_NAME = "Rainbow-Ones & Orange (6 Suits)";

/** A variant whose clues show as animals, since players hear them only as "moo" and "oink". */
const ANIMAL_CLUE_VARIANT_NAME = "Cow and Pig (6 Suits)";

/** A variant with suits of two colors, whose play stacks have labels that name their suits. */
const DUAL_COLOR_VARIANT_NAME = "Dual-Color & Rainbow (6 Suits)";

/** A variant whose played cards go into a hole, so that the players cannot see their strikes. */
const HOLE_VARIANT_NAME = "Throw It in a Hole (5 Suits)";

/**
 * The seed of Bob's game, so that every state deals the same cards. Each player has a card that the
 * team can play, and the account has one that it cannot.
 */
const BOBS_GAME_SEED_SUFFIX = "1";

/** The clock of a timed game of Bob's. */
const TIME_CONTROL = {
  baseSeconds: 300,
  perTurnSeconds: 20,
} as const;

/** The H-Group level that the account at the open table chooses. */
const H_GROUP_LEVEL = 3;

/** The account that the browser logs in with. Others play the seeded games. */
const USERNAME = "Alice";

/** How many times a state clicks an element that can miss while the page redraws it. */
const MAX_CLICK_ATTEMPTS = 3;

/** The name of the table of `openLockedTable`, which has a password. */
const LOCKED_TABLE_NAME = "Locked table";

/** A username that no account has, for the warning of "warning-modal". */
const MISSING_USERNAME = "NoSuchPlayer";

/** The warning that the server sends for `MISSING_USERNAME`. */
const MISSING_USERNAME_WARNING = `The username of "${MISSING_USERNAME}" does not exist in the database.`;

/** The error that the server sends when it stops for maintenance. */
const MAINTENANCE_ERROR =
  "The server is going down for maintenance. Your game progress has been saved.\nReload the page after the server restarts.";

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
  /**
   * Runs after `prepare`, and opens a window, such as the New UI's chat window. Each screenshot of
   * the page has one of the window beside it, which ends in ".window".
   */
  readonly openWindow?: (page: Page) => Promise<Page>;
  /** Runs after the screenshots, so that the next state starts from the lobby. */
  readonly cleanup?: (page: Page) => Promise<void>;
  /**
   * The element that the pointer rests on during the screenshots, such as one with a tooltip: a
   * selector, or a function that moves the pointer.
   */
  readonly hover?: string | ((page: Page, cast: Cast) => Promise<void>);
  /** The text of an error that the page logs on purpose, such as an error from the server. */
  readonly expectedConsoleError?: string;
}

/**
 * Turns the H-Group features on or off on the Settings page. Their checkbox is the label beside it.
 */
async function toggleHGroupConventions(page: Page, on: boolean) {
  if ((await page.locator("#hGroupConventions").isChecked()) !== on) {
    await page
      .locator('.lobby-row-checkbox label[for="hGroupConventions"]')
      .click();
  }
}

/**
 * Opens the menu of a button, unless it is open. The New UI's bar moves between the bottom of the
 * screen and the right column when the window changes its size, and that closes its menus.
 */
async function openMenu(button: Locator) {
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
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
    if ((!fireworks && running.length === 0) || remaining <= 0) {
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
  if (!(await page.locator(".konvajs-content").isVisible())) {
    return;
  }

  await page.waitForFunction(isGameScreenResized);
  await page.waitForTimeout(CANVAS_SETTLE_MILLISECONDS);
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

/** Runs in the page. The center of the top card of the first play stack that has a played card. */
function getPlayedCardCenter(): { readonly x: number; readonly y: number } {
  interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  interface Stack {
    children: Array<{
      card: { isStackBase: boolean };
      getClientRect: () => Rect;
    }>;
  }
  const { playStacks } = (
    globalThis as unknown as {
      globals: { elements: { playStacks: Map<unknown, Stack> } };
    }
  ).globals.elements;
  for (const stack of playStacks.values()) {
    const top = stack.children.at(-1);
    if (top !== undefined && !top.card.isStackBase) {
      const rect = top.getClientRect();
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
  }
  throw new Error("No play stack has a played card.");
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

/**
 * The options of Bob's game for a state that presses or right-clicks the cards of a game. In a
 * speedrun, those clicks make moves instead.
 */
const NO_SPEEDRUN = { speedrun: false } as const;

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
    {
      name: "login",
      path: "/",
      loggedIn: false,
    },
    {
      name: "profile",
      path: `/profile/${USERNAME}`,
      loggedIn: false,
    },
    {
      name: "best-scores",
      path: `/best-scores/${BEST_SCORES_USERNAME}`,
      loggedIn: false,
      // The scores link to their games.
      prepare: async (page) => {
        await page.locator('a[href^="/replay/"]').first().waitFor();
      },
    },
    {
      name: "history",
      path: `/history/${USERNAME}`,
      loggedIn: false,
      // Filter by a player count, so that the filters show a selected choice, and type in the
      // search box, so that it suggests variant names.
      prepare: async (page) => {
        await page
          .getByRole("button", {
            name: "2",
            exact: true,
          })
          .click();
        await page.getByRole("button", { name: "Clear filters" }).waitFor();
        await page.getByRole("combobox", { name: "Variant" }).fill("no v");
        await page.getByRole("listbox").waitFor();
      },
    },
    // Open a dropdown, which the page draws.
    {
      name: "dropdown",
      path: `/history/${USERNAME}`,
      loggedIn: false,
      prepare: async (page) => {
        await page.getByRole("combobox", { name: "Sort" }).click();
        await page.getByRole("option", { name: "Lowest score" }).waitFor();
      },
    },
    {
      name: "shared-missing-scores",
      path: `/shared-missing-scores/2/${USERNAME}/Bob`,
      loggedIn: false,
      prepare: async (page) => {
        await page.click("#advanced-filters-toggle");
      },
    },
    {
      name: "seed",
      path: `/seed/${SEED}`,
      loggedIn: false,
    },
    {
      name: "tags",
      path: `/tags/${USERNAME}`,
      loggedIn: false,
    },
    {
      name: "password-reset",
      path: "/password-reset",
      loggedIn: false,
    },
    {
      name: "pips-reference",
      path: "/public/standalone/pips-reference.html",
      loggedIn: false,
      prepare: async (page) => {
        await page.locator(".pip-count").waitFor();
      },
    },
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
    {
      name: "lobby",
      path: "/",
      loggedIn: true,
    },
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
    // A table with a password asks for it before the account joins.
    {
      name: "password-modal",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.openLockedTable();
      },
      prepare: async (page) => {
        const row = page.locator('#lobby [id^="join-"]', {
          hasText: LOCKED_TABLE_NAME,
        });
        const modal = page.locator("#password-modal");
        // The tables of the other states can redraw the list while the page clicks the row, which
        // then misses it.
        for (let attempt = 1; ; attempt++) {
          await row.click();
          try {
            await modal.waitFor({ timeout: SECOND_IN_MILLISECONDS });
            break;
          } catch (error) {
            if (attempt === MAX_CLICK_ATTEMPTS) {
              throw error;
            }
          }
        }
        await settle(page);
      },
    },
    // A request that the server rejects shows a warning, such as a friend who does not exist.
    {
      name: "warning-modal",
      path: "/",
      loggedIn: true,
      expectedConsoleError: MISSING_USERNAME_WARNING,
      prepare: async (page) => {
        await page.fill("#lobby-chat-input", `/friend ${MISSING_USERNAME}`);
        await page.press("#lobby-chat-input", "Enter");
        await page.locator("#warning-modal").waitFor();
        await settle(page);
      },
    },
    // An error that the page did not catch shows its stack trace.
    {
      name: "error-modal",
      path: "/",
      loggedIn: true,
      isolated: true,
      prepare: async (page) => {
        await page.evaluate(dispatchUncaughtError);
        await page.locator("#error-modal").waitFor();
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
      // The extra options, a clock, a dimmed option, and two errors.
      name: "create-game-extra-options",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.click("#create-game-show-extra-options");
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
        await settle(page);
      },
    },
    {
      // The menu of curated variants, which opens from the variant dropdown.
      name: "create-game-curated-variants",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.selectOption(
          "#create-game-variant-dropdown1",
          "Other curated variants",
        );
        await page
          .getByRole("navigation", { name: "Other curated variants" })
          .waitFor();
        await settle(page);
      },
    },
    {
      // The variant builder, with two special suits that it combines into one variant.
      name: "create-game-variant-builder",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.click('button[aria-label="Build a variant"]');
        const builder = page.locator("#create-game-variant-builder");
        await builder
          .getByRole("button", {
            name: "Add a suit",
            exact: true,
          })
          .click();
        await builder
          .getByRole("button", {
            name: "Rainbow",
            exact: true,
          })
          .click();
        await builder
          .getByRole("button", {
            name: "Black",
            exact: true,
          })
          .click();
        // The dropdown shows the variant that the builder chose.
        await page
          .locator("#create-game-variant-dropdown1")
          .locator('option[value="Black & Rainbow (6 Suits)"]')
          .waitFor({ state: "attached" });
        // The menu of a deck card, which makes its suit dark or reversed. The deck comes before the
        // suit buttons of the same name.
        await builder
          .getByRole("button", {
            name: "Rainbow",
            exact: true,
          })
          .first()
          .click();
        // The menu is in the site's tooltip, outside of the builder.
        await page.getByRole("dialog").waitFor();
        await settle(page);
      },
      // The form remembers its variant, which the other states need to be the default.
      cleanup: async (page) => {
        await page.selectOption("#create-game-variant-dropdown1", "No Variant");
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
    // The open list of H-Group levels, which is a grid.
    {
      name: "settings-h-group-level",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "settings");
        await toggleHGroupConventions(page, true);
        await page.locator("#hGroupLevel").selectOption("12");
      },
      hover: async (page) => {
        const select = page.locator("#hGroupLevel");
        // The list stays open at another size, so it is not scrolled into view by a click.
        await select.evaluate((element) => {
          element.scrollIntoView({ block: "center" });
        });
        if (!(await select.evaluate((element) => element.matches(":open")))) {
          await select.click();
        }
        await select.locator("option").first().waitFor();
      },
      cleanup: async (page) => {
        const select = page.locator("#hGroupLevel");
        // With "--compare", the list is already closed: Chrome closes it when the stylesheets
        // change. Then the Escape key would close the settings instead.
        if (await select.evaluate((element) => element.matches(":open"))) {
          await page.keyboard.press("Escape");
        }
        await select.selectOption("");
        await toggleHGroupConventions(page, false);
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
    // Bob's game with five players, so that the game screen shows a crowded table. The account
    // shows the clocks, which an untimed game hides by default. The last clue touches a card that
    // an earlier clue touched, and a card that no clue touched.
    {
      name: "new-ui-five-players",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, {
          showClocks: true,
        });
        await game.clueAgain();
      },
    },
    // Bob's game with five players, with the warning that the game ends soon because no one took a
    // turn. The server warns only near the end of a long wait, so the state sends the warning
    // itself, through the connection of the page.
    {
      name: "new-ui-idle-warning",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page) => {
        const sockets: WebSocketRoute[] = [];
        await page.routeWebSocket("**/ws?*", (socket) => {
          socket.connectToServer();
          sockets.push(socket);
        });
        // The route only sees connections that open after it.
        await page.reload();
        await page.evaluate(useStylesheet, `/public/css/${BUNDLE_FILENAME}`);
        await page.waitForURL(/\/game\/\d+/u);
        await page.locator("#game-new-ui [data-hand]").first().waitFor();
        const tableId = Number(
          /\/game\/(?<tableId>\d+)/u.exec(page.url())?.groups?.["tableId"],
        );
        sockets.at(-1)?.send(
          JSON.stringify({
            event: "idleWarning",
            data: {
              idleRemainingMs: IDLE_WARNING_MS - 34 * SECOND_IN_MILLISECONDS,
              tableId,
            },
          }),
        );
        await page.locator("#idle-modal").waitFor();
        await settle(page);
      },
    },
    // Bob's game with five players, where the account plays a card on its turn that its note says
    // is not playable, which asks it to confirm.
    {
      name: "new-ui-confirm-play",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        // A speedrun plays a card without asking.
        const game = await cast.startBobsGame(5, undefined, {
          speedrun: false,
        });
        await game.discardUntilAccountsTurn();
        // No card of 5 can be played at the start.
        await game.noteHand("r5");
      },
      prepare: async (page) => {
        await playCard(
          page,
          page
            .locator(
              '#game-new-ui button[aria-label*="to the play stacks or the discard pile"]',
            )
            .first(),
        );
        await page.locator("#confirm-modal").waitFor();
        await settle(page);
      },
    },
    // Bob's game with five players, where the account opens the prompt that changes the efficiency.
    {
      name: "new-ui-efficiency-prompt",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page) => {
        await page
          .locator('#game-new-ui button[aria-label^="Future efficiency"]')
          .first()
          .click();
        await page.locator("#number-prompt").waitFor();
        await settle(page);
      },
    },
    // Bob's game with five players, after the server closed the connection for maintenance. The
    // state sends the server's error itself, through the connection of the page.
    {
      name: "new-ui-error-modal",
      path: "/",
      loggedIn: true,
      isolated: true,
      expectedConsoleError: MAINTENANCE_ERROR,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page) => {
        const sockets: WebSocketRoute[] = [];
        // After the error, the server stays down: a new connection never reaches it, and the page
        // waits instead of reloading.
        let serverDown = false;
        await page.routeWebSocket("**/ws?*", (socket) => {
          if (serverDown) {
            return;
          }
          socket.connectToServer();
          sockets.push(socket);
        });
        // The route only sees connections that open after it.
        await page.reload();
        await page.evaluate(useStylesheet, `/public/css/${BUNDLE_FILENAME}`);
        await page.waitForURL(/\/game\/\d+/u);
        await page.locator("#game-new-ui [data-hand]").first().waitFor();
        serverDown = true;
        sockets.at(-1)?.send(
          JSON.stringify({
            event: "error",
            data: {
              message: MAINTENANCE_ERROR,
              code: "maintenance",
            },
          }),
        );
        await page.locator("#error-modal").waitFor();
        await settle(page);
      },
    },
    // Bob's game with five players in color-blind mode, so that the corner of each card shows the
    // suit's letter before the rank. The players discard first, so that each row of the discard
    // pile shows its suit's letter before its cards. The last clue touches cards that no other clue
    // touched.
    {
      name: "new-ui-colorblind",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, {
          colorblindMode: true,
        });
        await game.discardTurns(15);
        await game.clueAgain();
      },
    },
    // A timed game with five players, which the account paused on its turn.
    {
      name: "new-ui-paused",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, { timed: true });
        await game.discardUntilAccountsTurn();
        await game.pause();
      },
    },
    // Bob's game with five players, with the chat in its own window. The account sends a message
    // from the window.
    {
      name: "new-ui-chat-window",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      openWindow: async (page) => {
        const [chatWindow] = await Promise.all([
          page.waitForEvent("popup"),
          page
            .getByRole("button", { name: "Open chat in a new window" })
            .click(),
        ]);
        const input = chatWindow.locator("#game-chat-input");
        await input.fill("Hello from the chat window");
        await input.press("Enter");
        await chatWindow
          .locator("#game-chat-text")
          .getByText("Hello from the chat window")
          .waitFor();
        return chatWindow;
      },
    },
    // Bob's game with five players in a variant with suits of two colors, so that each play stack
    // has a label beside it with its letter in notes and its colors. The tooltip of the first label
    // names its suit.
    {
      name: "new-ui-suit-labels",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5, DUAL_COLOR_VARIANT_NAME);
      },
      hover: async (page) => {
        await hoverForTooltip(page, page.locator("[data-suit-label]").first());
      },
    },
    // Bob's game with five players in a "Throw It in a Hole" variant. The strike boxes show
    // question marks, since the players cannot see their strikes. The account notes a rank on the
    // first stack base, so that the stack shows that card.
    {
      name: "new-ui-hole",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5, HOLE_VARIANT_NAME, NO_SPEEDRUN);
      },
      prepare: async (page) => {
        await writeNote(
          page,
          page.locator("#game-new-ui [data-stack-base]").first(),
          "3",
        );
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
    // After every player has discarded cards in a "Cow and Pig" game, so that the clue log and the
    // clue tokens show the animal of each clue instead of its color or number.
    {
      name: "new-ui-animal-clues",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, ANIMAL_CLUE_VARIANT_NAME);
        await game.discardTurns(15, { mixClueTypes: true });
      },
    },
    // It is the account's turn and the team has no clues, so that no hand shows a clue button.
    {
      name: "new-ui-no-clues",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.spendClues();
      },
    },
    // It is the account's turn and the team has every clue token, so that the discard pile shows
    // that no one can discard.
    {
      name: "new-ui-max-clues",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.returnToMaxClues();
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
    // After every player has discarded cards, a click on the third player's name lists their
    // actions: clues and discards.
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
        await page.locator("[data-name-chip]").nth(2).click();
        await page.getByRole("dialog").waitFor();
        await settle(page);
      },
    },
    // The action log tab of a five-player game after some turns of clues and discards. When the
    // status panel shares a box with the logs, the box's "Actions" tab opens it.
    {
      name: "new-ui-action-log",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardTurns(15);
      },
      // The tabs are opened at each size, since the logs move when the window changes its size.
      hover: async (page) => {
        // Only one of the two tabs is on the screen.
        await page
          .getByRole("tab", { name: /^(?:Action Log|Actions)$/u })
          .click();
        await settle(page);
      },
    },
    // On the account's turn in a five-player game, every other hand shows its clue button. The
    // mouse is over the next player's button, which raises it.
    {
      name: "new-ui-clue-buttons",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardUntilAccountsTurn();
      },
      hover: pointAtNextPlayersClueButton,
    },
    // On the account's turn in a five-player game, it opens the clue menu on the next player's hand
    // and chooses a clue. The clues that would touch no cards are left out.
    {
      name: "new-ui-clue-menu",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardUntilAccountsTurn();
      },
      prepare: chooseClueForNextPlayer,
    },
    // The account taps its last card on its turn in a five-player game, which opens the card's note
    // popup. In the phone layout, the popup is at the edge of the window.
    {
      name: "new-ui-note-popup",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, NO_SPEEDRUN);
        await game.discardUntilAccountsTurn();
      },
      prepare: async (page) => {
        await writeNote(page, ownCard(page, 3), "chop?");
      },
      hover: async (page) => {
        const card = ownCard(page, 3).getByRole("button").first();
        if ((await card.getAttribute("aria-expanded")) !== "false") {
          return;
        }

        await tap(card);
        await page.getByRole("menu").waitFor();
      },
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
    // The account drags a card, so that the play stacks and the discard pile show that it can drop
    // the card on them. A speedrun has no dragging.
    {
      name: "new-ui-drag",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, NO_SPEEDRUN);
        await game.discardUntilAccountsTurn();
      },
      hover: async (page) => {
        const from = await ownCard(page, 0).boundingBox();
        if (from === null) {
          throw new Error("The account's card is not on the screen.");
        }
        await page.mouse.move(
          from.x + from.width / 2,
          from.y + from.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          from.x + from.width / 2,
          from.y + from.height * 2,
          { steps: DRAG_STEPS },
        );
        await settle(page);
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
    // After a player discards a card, the account steps back over it in the in-game replay, where
    // the drawn card goes back to the deck. The bar says whose turn it is in the game.
    {
      name: "new-ui-replay",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.discardTurns(1);
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
        const game = await cast.startBobsGame(2, undefined, NO_SPEEDRUN);
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
        await cast.startBobsGame(5);
      },
      hover: async (page) => {
        await hoverForTooltip(
          page,
          page.locator('#game-new-ui [aria-label^="About efficiency"]'),
        );
      },
    },
    // The account types a note on the first card of the last player's hand, which is at the bottom
    // of the screen.
    {
      name: "new-ui-note-editor",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5, undefined, NO_SPEEDRUN);
      },
      prepare: async (page) => {
        await page
          .locator("#game-new-ui [data-hand]")
          .last()
          .locator("[data-card-place]")
          .first()
          .click({ button: "right" });
        await page.keyboard.type(NEXT_HAND_NOTE);
      },
    },
    // The account's notes: on the first card of its own hand, one that makes it show as its real
    // identity, which the clues always allow, so that its note shows a pencil. Other notes are on
    // its third card, which no clue touched, on its last card, which it marks as trash, on the next
    // player's first card, and on a discarded card. Notes on the other cards of the next two hands
    // show each mark and border that a keyword draws. The table has five players, and every player
    // has discarded cards, so that some cards are the last copies. The pointer is over the first
    // card.
    {
      name: "new-ui-note-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, NO_SPEEDRUN);
        await game.discardTurns(15);
      },
      prepare: async (page, cast) => {
        const first = ownCard(page, 0);
        const order = Number(await first.getAttribute("data-card-order"));
        await writeNote(
          page,
          first,
          await cast.bobsGame().identityNote(order as CardOrder),
        );
        await writeNote(page, ownCard(page, 2), "chop?");
        await writeNote(page, ownCard(page, 3), "kt");
        await writeNote(
          page,
          page.locator(NEXT_HAND_FIRST_CARD_SELECTOR),
          NEXT_HAND_NOTE,
        );
        for (const [place, text] of KEYWORD_NOTES) {
          await writeNote(
            page,
            page.locator(`#game-new-ui [data-card-place="${place}"]`),
            text,
          );
        }
        await writeNote(
          page,
          // The last card, since the rows of the discard pile overlap.
          page.locator(DISCARD_CARD_SELECTOR).last(),
          "discarded",
        );
      },
      hover: async (page) => {
        await hoverForTooltip(page, ownCard(page, 0));
      },
    },
    // The bubble of every card that a card can be, which opens over a card in the account's hand.
    // The table has five players, and every player has discarded cards, so that the account rules
    // out some of the cards. The variant's color clues touch every 1, so that the bubble can show
    // cards that the separate suits and ranks cannot show. The card's note rules out a red 1, a
    // green 1, and an orange 4, and the bubble says how many cards the note and the discarded cards
    // rule out. The card's pips show every mark: a suit that a clue touched, and suits and ranks
    // that the note or the seen cards rule out.
    {
      name: "new-ui-possible-cards",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, undefined, NO_SPEEDRUN);
        await game.discardTurns(15, { mixClueTypes: true });
      },
      prepare: async (page) => {
        await writeNote(page, ownCard(page, 2), "!r1, !g1, !o4");
      },
      hover: async (page) => {
        // The third card, since the clues leave both its suit and its rank unknown. The bubble
        // opens only while Space is held.
        await ownCard(page, 2).hover();
        await page.keyboard.down("Space");
        // A copy of the bubble of the last width can still be fading out.
        await page.locator("[data-possible-cards]:not([inert] *)").waitFor();
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
      hover: async (page) => {
        await openMenu(
          page.getByRole("button", {
            name: "End game",
            exact: true,
          }),
        );
      },
    },
    // The tooltip of a card on a play stack of the classic screen, in a shared replay: the notes of
    // the players on the card, and then the description of its suit.
    {
      name: "classic-stack-tooltip",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5, DUAL_COLOR_VARIANT_NAME);
        await game.playWithNotes(["m", "m"]);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        await showClassic(page);
      },
      hover: async (page) => {
        await settle(page);
        const point = await page.evaluate(getPlayedCardCenter);
        await page.mouse.move(point.x, point.y);
        await page.locator(TOOLTIP_SELECTOR).waitFor();
      },
    },
    // Bob points the arrow at the name of the second player, on the classic screen.
    {
      name: "classic-name-arrow",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        await showClassic(page);
        cast.bobsGame().showArrow({
          type: "player",
          playerIndex: 1 as PlayerIndex,
        });
        await settle(page);
      },
    },
    // Bob points the arrow at the discard pile, on the classic screen.
    {
      name: "classic-discard-arrow",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        await showClassic(page);
        cast.bobsGame().showArrow({
          type: "board",
          element: "discardPile",
        });
        await settle(page);
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
    // The players of a five-player game strike out. On the turn on which the game ended, the deck
    // shows how it ended. The pointer rests on it, which shows its tooltip.
    {
      name: "new-ui-game-over",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.strikeOut();
      },
      prepare: async (page) => {
        await page.locator("[data-result]").waitFor();
      },
      hover: async (page) => {
        await hoverForTooltip(page, page.locator("[data-result]"));
      },
    },
    // Bob, who leads a five-player shared replay, points an arrow at a card that a clue touched, so
    // that the arrow points up at it from below. The account follows him, so it sees the arrow.
    {
      name: "new-ui-arrow",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        const game = await cast.startBobsGame(5);
        await game.clueAgain();
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        // The tokens show only on the turn of the last clue.
        cast.bobsGame().showSegment(2);
        await page
          .locator("#game-new-ui [data-turn]", { hasText: /^3/u })
          .waitFor();
        await settle(page);
        const order = await page
          .locator("#game-new-ui [data-hand] [data-card-order]", {
            has: page.locator("[data-clue-marker]"),
          })
          .first()
          .getAttribute("data-card-order");
        cast.bobsGame().showArrow({
          type: "card",
          order: Number(order) as CardOrder,
        });
        await page.locator(ARROW_SELECTOR).waitFor();
        await settle(page);
      },
    },
    // Bob points the arrow at the discard pile instead.
    {
      name: "new-ui-discard-arrow",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().showArrow({
          type: "board",
          element: "discardPile",
        });
        await page.locator(ARROW_SELECTOR).waitFor();
        await settle(page);
      },
    },
    // Bob points the arrow at the name of the second player instead.
    {
      name: "new-ui-name-arrow",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().showArrow({
          type: "player",
          playerIndex: 1 as PlayerIndex,
        });
        await page.locator(ARROW_SELECTOR).waitFor();
        await settle(page);
      },
    },
    // The account watches a five-player game. Bob writes a note on the first card of his hand, so
    // that its sticky note shows a dot until the account reads it.
    {
      name: "new-ui-spectator-note",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startWatchedGame();
      },
      prepare: async (page, cast) => {
        await page.locator("#game-new-ui [data-hand]").first().waitFor();
        cast.watchedGame().writeNote(0 as CardOrder, "5 save?");
        await page
          .locator('#game-new-ui svg[aria-label="Note"] [data-note-unread]')
          .waitFor();
      },
    },
    // Bob, who leads a five-player shared replay, goes back to the first turn. The account follows
    // him, so a large "<<" flashes over the table. The flash is held at its peak.
    {
      name: "new-ui-leader-direction",
      path: "/",
      loggedIn: true,
      isolated: true,
      setup: async (cast) => {
        await cast.startBobsGame(5);
      },
      prepare: async (page, cast) => {
        await endBobsGame(page, cast);
        cast.bobsGame().showSegment(0);
        const arrows = page.locator("#game-new-ui [data-leader-direction]");
        await arrows.waitFor();
        await arrows.evaluate((element) => {
          for (const animation of element.getAnimations()) {
            animation.cancel();
          }
          (element as SVGElement).style.setProperty("opacity", "1");
        });
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
      },
      hover: async (page) => {
        await openMenu(page.getByRole("button", { name: /^Viewing as /u }));
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
        await page
          .getByRole("button", { name: `Leader: ${USERNAME}` })
          .waitFor();
        // Bob's table is a speedrun, where "Play again" restarts the game at once when everyone is
        // ready. Bob is not, so that the button opens its menu instead.
        await game.setReady(false);
      },
      hover: async (page) => {
        await openMenu(page.getByRole("button", { name: "Play again" }));
        // A copy of the menu can still fade out where it was before the window's new size.
        await page
          .getByRole("menu")
          .getByText(/^Not ready: Bob/u)
          .waitFor();
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
        await page
          .getByRole("button", { name: `Leader: ${USERNAME}` })
          .waitFor();
      },
      // The pointer is on the first person, to show that the names can be pressed.
      hover: async (page) => {
        await openMenu(
          page.getByRole("button", { name: `Leader: ${USERNAME}` }),
        );
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
        await page
          .getByRole("button", { name: `Leader: ${USERNAME}` })
          .waitFor();
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
        await page
          .getByRole("button", { name: `Leader: ${USERNAME}` })
          .waitFor();
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
              '#game-new-ui button[aria-label*="to the play stacks or the discard pile"]',
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

/** Switches the New UI to the classic screen with Alt + u. */
async function showClassic(page: Page) {
  await page.locator("body").press("Alt+u");
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
  // The bundler reads the stylesheets, and searches these directories for icon names. The bundler
  // can import other scripts from its directory.
  const paths = [
    "public/css",
    path.dirname(bundlerPath),
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
  // "bun install" copies the stylesheets and the font of Font Awesome into "public", where Git
  // ignores them. A ref from before then has its own copies.
  for (const file of ["public/css/lib", "public/webfonts/fa-solid-900.woff2"]) {
    const copy = path.join(source, file);
    if (existsSync(copy)) {
      continue;
    }
    await mkdir(path.dirname(copy), { recursive: true });
    await symlink(path.join(ROOT, file), copy);
  }
  // The server serves the bundle's font, which the bundler writes next to it.
  const bundlePath = path.join(directory, COMPARE_BUNDLE_PATH.slice(1));
  await run(process.execPath, [path.join(source, bundlerPath), bundlePath]);
  return await Bun.file(bundlePath).text();
}

/** Serves the client and the static files of the current checkout, as a deployment does. */
async function linkPublicFiles(directory: string) {
  const links: Array<readonly [string, string]> = [
    ["public/css/critical.min.css", "public/css/critical.min.css"],
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

/** A game of five other accounts, which the browser's account watches. */
interface WatchedGame {
  /** Bob writes a note on a card. */
  readonly writeNote: (order: CardOrder, text: string) => void;
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
  /** The players misplay a card on each turn until the game ends. */
  readonly strikeOut: () => Promise<void>;
  /**
   * The account and Bob write a note on a card that the player whose turn it is can play, and then
   * that player plays it. The account can do this only until the page loads.
   */
  readonly playWithNotes: (notes: readonly [string, string]) => Promise<void>;
  /**
   * Each player in turn discards their oldest card that the team can lose, for the given number of
   * turns. When the team has every clue token, the player gives a clue instead: a rank clue, or,
   * with `mixClueTypes`, a color clue and a rank clue in turn. A color clue names the card's suit
   * index, so the variant's clue colors must match its suits.
   */
  readonly discardTurns: (
    turns: number,
    options?: { readonly mixClueTypes?: boolean },
  ) => Promise<void>;
  /**
   * The players before the account discard as in `discardTurns`, until it is the account's turn.
   */
  readonly discardUntilAccountsTurn: () => Promise<void>;
  /**
   * Each player in turn gives the next player a rank clue, until it is the account's turn and the
   * team has no clue tokens. A player with no clue to give discards as in `discardTurns`.
   */
  readonly spendClues: () => Promise<void>;
  /**
   * The players clue and discard in turn until it is the account's turn, the team has every clue
   * token, and the discard pile has cards.
   */
  readonly returnToMaxClues: () => Promise<void>;
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
  /**
   * Two players in turn clue the hand of a player who is not the account. The first gives a rank
   * clue. The second gives a color clue that touches a card of the first clue and a card that no
   * clue touched.
   */
  readonly clueAgain: () => Promise<void>;
  /** The card that the first clue of `clueTwice` touched. */
  readonly cluedCard: () => CardOrder | undefined;
  /** A note that names a card's identity, such as "r3". */
  readonly identityNote: (order: CardOrder) => Promise<string>;
  /** The account writes a note on each card in its hand. It can only until the page loads. */
  readonly noteHand: (text: string) => Promise<void>;
  /** In a timed game, the account pauses it on its turn. It can only until the page loads. */
  readonly pause: () => Promise<void>;
  /** Bob ends the game, which turns it into a shared replay that he leads. */
  readonly end: () => Promise<void>;
  /** Makes the browser's account the leader of the shared replay. */
  readonly passLeader: () => void;
  /** Bob, who leads the shared replay, starts a hypothetical that everyone watches. */
  readonly startHypothetical: () => void;
  /** Bob, who leads the shared replay, takes everyone who follows him to a segment. */
  readonly showSegment: (segment: number) => void;
  /**
   * Bob, who leads the shared replay, points an arrow at a card, a player's name, or the discard
   * pile for everyone who follows him.
   */
  readonly showArrow: (
    target:
      | { type: "card"; order: CardOrder }
      | { type: "player"; playerIndex: PlayerIndex }
      | { type: "board"; element: "discardPile" },
  ) => void;
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
   * for more, up to five, and the variant of Bob's table unless the state asks for another.
   */
  readonly startBobsGame: (
    numPlayers?: number,
    variantName?: string,
    options?: {
      readonly showClocks?: boolean;
      readonly colorblindMode?: boolean;
      readonly timed?: boolean;
      readonly speedrun?: boolean;
    },
  ) => Promise<BobsGame>;
  readonly bobsGame: () => BobsGame;
  /** Bob opens a table with a password, which the browser's account does not join. */
  readonly openLockedTable: () => Promise<void>;
  /** Starts a five-player game that Bob leads, which the browser's account watches. */
  readonly startWatchedGame: () => Promise<WatchedGame>;
  readonly watchedGame: () => WatchedGame;
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
  return {
    ...peer,
    userId,
  };
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

/** Starts a game between two players. Returns the table and each player's seat. */
async function startGame(alice: Peer, bob: Peer, name: string, suffix: string) {
  alice.send("tableCreate", {
    settings: {
      name,
      maxPlayers: DEFAULT_MAX_PLAYERS,
      options: {},
      seedSuffix: suffix,
    },
  });
  const { tableId } = await alice.receive(
    "tableJoined",
    SERVER_EVENT_SCHEMAS.tableJoined,
  );
  bob.send("tableJoin", { tableId });
  await bob.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
  const seats = await startTable(alice, [alice, bob], tableId);
  return {
    tableId,
    seats,
  };
}

/**
 * Plays one turn of a game between two players and ends it, so that it is saved. The pages of tags
 * show it if it has the tag. The players leave its shared replay unless `stay` is set.
 */
async function playGame(
  alice: Peer,
  bob: Peer,
  suffix: string,
  tag: boolean,
  stay = false,
): Promise<number> {
  const { tableId, seats } = await startGame(alice, bob, "Seeded game", suffix);
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
    action: {
      type: "play",
      order: card.order,
    },
  });
  await first.receive("gameEvent", SERVER_EVENT_SCHEMAS.gameEvent);
  alice.send("tableTerminate", { tableId });
  const finished = await alice.receive(
    "gameFinished",
    SERVER_EVENT_SCHEMAS.gameFinished,
  );
  assertDefined(finished.view.gameId, "The seeded game was not saved.");
  if (tag) {
    alice.send("tagAdd", {
      tableId,
      tag: TAG,
    });
  }
  // The players are now in a shared replay of the game. Leave it, or the browser would join it.
  if (!stay) {
    await closeTable([bob, alice], tableId);
  }
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
  const lobbyPeers = await seedLobbyGames(address);
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
    peers: [bob, ...spectators, ...lobbyPeers, bot],
  };
}

/**
 * Other accounts play a game and review another, so that the lobby shows a row of each kind. They
 * stay until the end, and the lobby is the only screen that shows them.
 */
async function seedLobbyGames(address: string): Promise<readonly Peer[]> {
  const [malloryName, noraName, oscarName, peggyName] = LOBBY_GAME_NAMES;
  const mallory = await connect(address, malloryName);
  const nora = await connect(address, noraName);
  const oscar = await connect(address, oscarName);
  const peggy = await connect(address, peggyName);
  await startGame(mallory, nora, `${malloryName}'s table`, "lobby-game");
  await playGame(oscar, peggy, "lobby-replay", false, true);
  return [mallory, nora, oscar, peggy];
}

/**
 * Bob creates his table: a speedrun of a variant with a long name and six suits, so that the
 * screens show how they fit both, unless a state asks for another variant or no speedrun. In a
 * speedrun, a click on a card plays it, so the cards cannot be dragged. Returns the table.
 */
async function createBobsTable(
  bob: Peer,
  name: string,
  seedSuffix?: string,
  variantName = LONG_VARIANT_NAME,
  timed = false,
  speedrun = true,
): Promise<number> {
  bob.send("settings", {
    settings: {
      hGroupConventions: true,
      hGroupLevel: H_GROUP_LEVEL,
    },
  });
  bob.send("tableCreate", {
    settings: {
      name,
      maxPlayers: DEFAULT_MAX_PLAYERS,
      options: {
        // A speedrun has no clock, so a timed game is not one.
        speedrun: speedrun && !timed,
        deckPlays: true,
        variantId: getVariant(variantName).id,
        ...(timed && { timeControl: TIME_CONTROL }),
      },
      ...(seedSuffix !== undefined && { seedSuffix }),
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
      await opened.waitFor({
        state,
        timeout: ROW_CLICK_WAIT_MILLISECONDS,
      });
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
    ? {
        turn: turn.turn,
        player: turn.currentPlayerIndex ?? 0,
      }
    : {
        turn: 0,
        player: 0,
      };
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
  let currentWatchedGame: WatchedGame | undefined;
  /** Closes the table of `openLockedTable`. */
  let closeLockedTable: (() => Promise<void>) | undefined;
  /** Whether the browser's account has made a friend of a spectator of Bob's game. */
  let hasFriend = false;

  async function connectPeer(username: string) {
    const peer = await connect(address, username);
    peers.push(peer);
    return peer;
  }

  async function connectAccount(
    newUi: boolean,
    showClocks = false,
    colorblindMode = false,
  ) {
    account ??= await connect(address, accountName);
    account.send("settings", {
      settings: {
        newUi,
        showTimerInUntimed: showClocks,
        colorblindMode,
      },
    });
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

  async function openLockedTable() {
    const bob = await connectPeer(name(BOB));
    bob.send("tableCreate", {
      settings: {
        name: LOCKED_TABLE_NAME,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        options: {},
      },
      password: "hanabi",
    });
    const { tableId } = await bob.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
    );
    closeLockedTable = async () => {
      bob.send("tableLeave", { tableId });
      await bob.receive(
        "tableRemoved",
        SERVER_EVENT_SCHEMAS.tableRemoved,
        (data) => data.tableId === tableId,
      );
    };
  }

  async function startWatchedGame(): Promise<WatchedGame> {
    const you = await connectAccount(true);
    const bob = await connectPeer(name(BOB));
    const tableId = await createBobsTable(
      bob,
      `${name(BOB)}'s table`,
      BOBS_GAME_SEED_SUFFIX,
    );
    const players: Peer[] = [bob];
    for (const other of [...OTHER_PLAYER_NAMES, SPECTATOR_NAMES[0]]) {
      const peer = await connectPeer(name(other));
      peer.send("tableJoin", { tableId });
      await peer.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
      players.push(peer);
    }
    await startTable(bob, players, tableId);
    you.send("tableSpectate", { tableId });
    await you.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    table = {
      id: tableId,
      owner: bob,
    };
    let over = false;
    endGame = async () => {
      if (over) {
        return;
      }

      bob.send("tableTerminate", { tableId });
      await bob.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished);
      over = true;
    };
    currentWatchedGame = {
      writeNote: (order, text) => {
        bob.send("note", {
          tableId,
          order,
          text,
        });
      },
    };
    return currentWatchedGame;
  }

  async function startBobsGame(
    numPlayers = 2,
    variantName = LONG_VARIANT_NAME,
    {
      showClocks = false,
      colorblindMode = false,
      timed = false,
      speedrun = true,
    }: {
      readonly showClocks?: boolean;
      readonly colorblindMode?: boolean;
      readonly timed?: boolean;
      readonly speedrun?: boolean;
    } = {},
  ): Promise<BobsGame> {
    const you = await connectAccount(true, showClocks, colorblindMode);
    const bob = await connectPeer(name(BOB));
    const tableId = await createBobsTable(
      bob,
      `${name(BOB)}'s table`,
      BOBS_GAME_SEED_SUFFIX,
      variantName,
      timed,
      speedrun,
    );
    const spectators = await spectate(
      address,
      SPECTATOR_NAMES.map(name),
      tableId,
    );
    peers.push(...spectators);
    // One spectator is a friend, so that the game screen shows a friend among the people watching.
    if (!hasFriend) {
      you.send("friendAdd", { username: name(SPECTATOR_NAMES[1]) });
      // The server runs the requests of the lobby in order, so a reply to the next one shows that
      // the friend is saved.
      await you.request("chatPmHistory", { limit: 1 });
      hasFriend = true;
    }
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
    table = {
      id: tableId,
      owner: bob,
    };
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
      const peer = [...seats].find(([, other]) => other === index)?.[0];
      assertDefined(peer, `No player sits in seat ${index}.`);
      peer.send("playerAction", {
        tableId,
        action,
      });
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
          event.type !== "draw"
          || event.playerIndex !== index
          || gone.has(event.order)
          || event.identity === undefined
        ) {
          continue;
        }

        const { rank, suitIndex } = event.identity;
        cards.push({
          order: event.order,
          suitIndex,
          rank,
          playable: rank === (stacks.get(suitIndex) ?? 0) + 1,
        });
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
      await move(player, {
        type: "play",
        order: card.order,
      });
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
        clue: {
          type: "rank",
          rank: card.rank as ClueRank,
        },
      });
    }

    async function clueAgain() {
      const variant = getVariant(LONG_VARIANT_NAME);
      const { player } = readTurn(await loadEvents(viewer, tableId));
      // The receiver is neither of the two players who give the clues. It is not the account
      // either, whose cards do not show.
      for (let offset = 2; offset < seats.size; offset++) {
        const receiver = (player + offset) % seats.size;
        if (receiver === seat("account")) {
          continue;
        }
        const cards = await handAt(receiver);
        for (const first of cards) {
          // The color clue names the suit index, so the suit must have a clue color of its own.
          const suit = variant.suits[first.suitIndex];
          const color = variant.clueColors[first.suitIndex];
          const second = cards.find(
            (other) =>
              other.suitIndex === first.suitIndex && other.rank !== first.rank,
          );
          if (
            second === undefined
            || suit === undefined
            || color === undefined
            || suit.name !== color.name
            || !isValidClueRank(first.rank)
          ) {
            continue;
          }

          await moveAt(player, {
            type: "clue",
            receiverIndex: receiver as PlayerIndex,
            clue: {
              type: "rank",
              rank: first.rank,
            },
          });
          await moveAt((player + 1) % seats.size, {
            type: "clue",
            receiverIndex: receiver as PlayerIndex,
            clue: {
              type: "color",
              color: first.suitIndex as ColorIndex,
            },
          });
          return;
        }
      }
      throw new Error(
        "No hand has two cards of a suit to clue. Choose another seed for Bob's game.",
      );
    }

    async function discardUntilAccountsTurn() {
      while (
        readTurn(await loadEvents(viewer, tableId)).player !== seat("account")
      ) {
        await discardTurns(1);
      }
    }

    async function returnToMaxClues() {
      for (;;) {
        const events = await loadEvents(viewer, tableId);
        const { player } = readTurn(events);
        const clues =
          MAX_CLUES
          - events.filter((event) => event.type === "clue").length
          + events.filter((event) => event.type === "discard").length;
        const discards = events.filter(
          (event) => event.type === "discard",
        ).length;
        if (clues === MAX_CLUES && discards > 0 && player === seat("account")) {
          return;
        }
        await discardTurns(1);
      }
    }

    async function spendClues() {
      for (;;) {
        const events = await loadEvents(viewer, tableId);
        const { player } = readTurn(events);
        const clues =
          MAX_CLUES
          - events.filter((event) => event.type === "clue").length
          + events.filter((event) => event.type === "discard").length;
        if (clues === 0) {
          if (player === seat("account")) {
            return;
          }
          await discardTurns(1);
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
          clue: {
            type: "rank",
            rank: touched.rank as ClueRank,
          },
        });
      }
    }

    async function discardTurns(
      turns: number,
      { mixClueTypes = false }: { readonly mixClueTypes?: boolean } = {},
    ) {
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
          await moveAt(player, {
            type: "discard",
            order: card.order,
          });
          continue;
        }

        const receiver = (player + 1) % seats.size;
        const receiverCards = await handAt(receiver);
        const touched = receiverCards.find((other) =>
          isValidClueRank(other.rank),
        );
        assertDefined(touched, `Seat ${receiver} has no card to clue.`);
        const numClues = events.filter((event) => event.type === "clue").length;
        await moveAt(player, {
          type: "clue",
          receiverIndex: receiver as PlayerIndex,
          clue:
            mixClueTypes && numClues % 2 === 0
              ? {
                  type: "color",
                  color: touched.suitIndex as ColorIndex,
                }
              : {
                  type: "rank",
                  rank: touched.rank as ClueRank,
                },
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
            const { rank, suitIndex } = event.identity;
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
          await moveAt(player, {
            type: "play",
            order: playable.order,
          });
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
          await moveAt(player, {
            type: "discard",
            order: expendable.order,
          });
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
          clue: {
            type: "rank",
            rank: touched.rank as ClueRank,
          },
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
          clue: {
            type: "rank",
            rank: newest.rank as ClueRank,
          },
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
      strikeOut: async () => {
        const variant = getVariant(LONG_VARIANT_NAME);
        for (let i = 0; i < MAX_STRIKES; i++) {
          const { player } = readTurn(await loadEvents(viewer, tableId));
          // A play of a card of an inverted suit discards it instead.
          const cards = await handAt(player);
          const card = cards.find(
            (other) =>
              !other.playable
              && variant.suits[other.suitIndex]?.inverted !== true,
          );
          assertDefined(
            card,
            `Seat ${player} has no card to misplay. Choose another seed for Bob's game.`,
          );
          await moveAt(player, {
            type: "play",
            order: card.order,
          });
        }
        over = true;
      },
      playWithNotes: async ([accountNote, bobNote]) => {
        const MAX_TURNS = 10;
        let player = 0;
        let card: Awaited<ReturnType<typeof handAt>>[number] | undefined;
        for (let i = 0; card === undefined && i < MAX_TURNS; i++) {
          if (i > 0) {
            await discardTurns(1);
          }
          ({ player } = readTurn(await loadEvents(viewer, tableId)));
          const cards = await handAt(player);
          card = cards.find((other) => other.playable);
        }
        assertDefined(card, "No player has a playable card on their turn.");
        const { order } = card;
        for (const [peer, text] of [
          [you, accountNote],
          [bob, bobNote],
        ] as const) {
          peer.send("note", {
            tableId,
            order,
            text,
          });
        }
        await moveAt(player, {
          type: "play",
          order,
        });
      },
      discardTurns,
      spendClues,
      returnToMaxClues,
      discardUntilAccountsTurn,
      emptyDeck,
      clueAgain,
      clueTwice: async () => {
        if ((await turnOf()) === "account") {
          await play("account", true);
        }
        await clueAccount();
        // The oldest card, which the first clue did not touch.
        const [oldest] = await hand("account");
        assertDefined(oldest, "The account has no cards.");
        await move("account", {
          type: "discard",
          order: oldest.order,
        });
        await clueAccount();
      },
      cluedCard: () => clueTarget?.order,
      noteHand: async (text) => {
        for (const card of await hand("account")) {
          you.send("note", {
            tableId,
            order: card.order,
            text,
          });
        }
        // The server runs the requests of a connection in order, so a reply to the next one shows
        // that it saved the notes.
        await you.request("chatPmHistory", { limit: 1 });
      },
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
      pause: async () => {
        assertDefined(
          account,
          "The account can only pause before the page loads.",
        );
        account.send("pause", {
          tableId,
          paused: true,
        });
        await account.receive("pause", SERVER_EVENT_SCHEMAS.pause);
      },
      end,
      passLeader: () => {
        bob.send("tableSetOwner", {
          tableId,
          userId: you.userId,
        });
      },
      startHypothetical: () => {
        bob.send("replayAction", {
          tableId,
          action: {
            type: "hypothetical",
            control: {
              type: "start",
            },
          },
        });
      },
      showSegment: (segment) => {
        bob.send("replayAction", {
          tableId,
          action: {
            type: "turn",
            turn: segment,
          },
        });
      },
      showArrow: (target) => {
        bob.send("replayAction", {
          tableId,
          action: {
            type: "arrow",
            target,
          },
        });
      },
      setReady: async (ready) => {
        await bob.request("tableRestartDecline", {
          tableId,
          declined: !ready,
        });
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
    openLockedTable,
    startWatchedGame,
    watchedGame: () => {
      assertDefined(
        currentWatchedGame,
        "The state did not start a watched game.",
      );
      return currentWatchedGame;
    },
    disconnectAccount,
    closeState: async () => {
      await closeLockedTable?.();
      closeLockedTable = undefined;
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
      currentWatchedGame = undefined;
    },
  };
}

/**
 * Runs in the page. Sends an error event, as an error that the page did not catch does. Its stack
 * trace is not in the website's scripts, so the page does not report it.
 */
function dispatchUncaughtError() {
  const error = new TypeError("Cannot read properties of undefined");
  globalThis.dispatchEvent(
    new ErrorEvent("error", {
      error,
      message: error.message,
    }),
  );
}

/** Runs in the page. Shows the dark theme, as the "Dark mode" setting does. */
function showDarkTheme() {
  document.documentElement.dataset["theme"] = "dark";
}

/**
 * Runs in the page. Loads a bundle in place of the page's stylesheets, or restores them. The new
 * bundle loads before the old stylesheets go, so that the page always has styles. Without them, an
 * open select changes its `appearance`, and Chrome closes it.
 */
async function useStylesheet(href: string | undefined) {
  const old = [
    ...document.querySelectorAll<HTMLLinkElement>(
      'link[href*="/public/css/"], #ui-screenshots-stylesheet',
    ),
  ];
  if (href !== undefined) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener("load", resolve);
      link.addEventListener("error", reject);
    });
    link.href = href;
    document.head.append(link);
    await loaded;
    link.id = "ui-screenshots-stylesheet";
  }
  for (const link of old) {
    link.remove();
  }
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
      parts.push(`${current.tagName.toLowerCase()}${id}:${index}`);
    }
    return parts.toReversed().join(" > ");
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
  readonly dark: boolean;
  readonly compare: string | undefined;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      state: {
        type: "string",
        multiple: true,
      },
      width: {
        type: "string",
        multiple: true,
      },
      dark: {
        type: "boolean",
      },
      compare: {
        type: "string",
      },
    },
  });
  const widths = (values.width ?? []).map(Number);
  const allowedWidths = SIZES.map((size) => size.width);
  for (const width of widths) {
    if (!allowedWidths.includes(width as (typeof allowedWidths)[number])) {
      throw new Error(`The width must be one of: ${allowedWidths.join(", ")}`);
    }
  }
  return {
    states: values.state ?? [],
    widths,
    dark: values.dark ?? false,
    compare: values.compare,
  };
}

interface Results {
  /** The lines of the comparison report. */
  readonly comparison: string[];
  /**
   * The errors and warnings of the pages, and the screens whose layout breaks a rule. They fail the
   * run.
   */
  readonly errors: string[];
}

/**
 * Takes the screenshots of states, one at a time, in a browser context. Each state has a new page,
 * so that what a state does to its page cannot change the next state. For example, a state can
 * route the page's connections away from the server, and Playwright cannot remove such a route.
 */
async function capture(
  context: BrowserContext,
  address: string,
  states: readonly State[],
  cast: Cast,
  options: Options,
  compareBundle: string | undefined,
  results: Results,
) {
  if (compareBundle !== undefined) {
    await context.route(`**${COMPARE_BUNDLE_PATH}`, async (route) => {
      await route.fulfill({
        contentType: "text/css",
        body: compareBundle,
      });
    });
  }

  for (const state of states) {
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MILLISECONDS);
    page.on("pageerror", (error) => {
      results.errors.push(`${state.name}: ${error.message}`);
    });
    // Such as a script or image that the content security policy blocked, or a React warning.
    page.on("console", (message) => {
      const type = message.type();
      if (
        (type === "error" || type === "warning")
        && message.text() !== state.expectedConsoleError
      ) {
        results.errors.push(`${state.name}: ${type}: ${message.text()}`);
      }
    });
    try {
      await withTimeout(
        `State ${state.name}`,
        captureState(
          page,
          address,
          state,
          cast,
          options,
          compareBundle,
          results,
        ),
        STATE_TIMEOUT_MILLISECONDS,
      );
    } catch (error) {
      // The page as the state left it, to see why it failed.
      await page.screenshot({
        path: path.join(OUTPUT_DIRECTORY, `${state.name}-failed.png`),
      });
      throw error;
    }
    console.info(`Captured: ${state.name}`);
    await page.close();
  }
}

/**
 * Runs in the page. In the wide layout of the New UI, returns the tops of the hands, the play
 * stacks, and the discard pile, which must line up. Returns `undefined` on any other screen.
 */
function getColumnTops():
  | {
      readonly hands: number;
      readonly stacks: number;
      readonly discardPile: number;
    }
  | undefined {
  if (document.querySelector("[data-phone-layout]") !== null) {
    return undefined;
  }
  const hand = document.querySelector("[data-hand]");
  // The first child of the stacks' box holds the stacks. The box itself has no outline.
  const stacks = document.querySelector("[data-play-stacks] > div");
  const discardPile = document.querySelector("[data-discard-pile]");
  if (hand === null || stacks === null || discardPile === null) {
    return undefined;
  }
  return {
    hands: hand.getBoundingClientRect().top,
    stacks: stacks.getBoundingClientRect().top,
    discardPile: discardPile.getBoundingClientRect().top,
  };
}

/**
 * Runs in the page. Whether the New UI's bar along the bottom of the screen has a second row, for
 * the replay controls. Outside the phone layout, the bar must keep one row: when it has no room for
 * one, the status panel in the right column shows instead.
 */
function hasTwoRowBar(): boolean {
  const bar = document.querySelector("footer[data-own-row]");
  return bar !== null && bar.closest("[data-phone-layout]") === null;
}

/** How far apart, in CSS pixels, the tops of the New UI's columns can be and still line up. */
const COLUMN_TOP_TOLERANCE = 1;

/**
 * Runs in the page. Returns each element that sticks out of a box that it is in, such as a button
 * past the edge of a panel. A box is an element that is not inline, that shows its edges with a
 * background or a border, and that lets its content overflow. (A box that clips or scrolls its
 * content means to.) An element that is positioned, or that is in a positioned element inside the
 * box, is placed on purpose, such as a menu or a token that overhangs a card, so it does not count.
 * Neither does an element with a negative margin or a relative offset, or the option of a select,
 * which shows in the select's list. `tolerance` is in CSS pixels.
 */
function getOverflows(tolerance: number): readonly string[] {
  // eslint-disable-next-line unicorn/consistent-function-scoping -- This runs in the page.
  function pixels(value: string): number {
    return Number(value.replace(/px$/u, ""));
  }

  /** Names an element for the report: its tag, its ID or label, and the start of its text. */
  // eslint-disable-next-line unicorn/consistent-function-scoping -- This runs in the page.
  function describe(element: Element): string {
    const id = element.id === "" ? "" : `#${element.id}`;
    const label = element.getAttribute("aria-label");
    if (label !== null) {
      return `<${element.tagName.toLowerCase()}${id}> [${label}]`;
    }
    const text = element.textContent.trim().replaceAll(/\s+/gu, " ");
    const name = text === "" ? "" : ` "${text.slice(0, 30)}"`;
    return `<${element.tagName.toLowerCase()}${id}>${name}`;
  }

  function isBox(style: CSSStyleDeclaration): boolean {
    const background =
      style.backgroundImage !== "none"
      || !/^(?:transparent|rgba\([^)]*,\s*0\))$/u.test(style.backgroundColor);
    const border = ["top", "right", "bottom", "left"].some(
      (side) =>
        style.getPropertyValue(`border-${side}-style`) !== "none"
        && pixels(style.getPropertyValue(`border-${side}-width`)) > 0,
    );
    // An inline element's box is only its line of text, so an image or a button in the line can be
    // taller than it.
    return (
      style.display !== "inline"
      && (background || border)
      && style.overflowX === "visible"
      && style.overflowY === "visible"
    );
  }

  /** Whether an element is placed on purpose, so that it may stick out of its box. */

  function isPlaced(style: CSSStyleDeclaration): boolean {
    // A negative margin moves an element past its neighbors, such as the image of a pip with a
    // shadow, which is larger than the pip. A relative offset moves it from its place, such as a
    // close button that sits higher.
    const negativeMargin = [
      style.marginTop,
      style.marginRight,
      style.marginBottom,
      style.marginLeft,
    ].some((margin) => pixels(margin) < 0);
    const offset =
      style.position === "relative"
      && [style.top, style.right, style.bottom, style.left].some(
        (value) => value !== "auto" && pixels(value) !== 0,
      );
    return (
      style.position === "absolute"
      || style.position === "fixed"
      || negativeMargin
      || offset
    );
  }

  const overflows: string[] = [];

  /**
   * Checks the elements in `parent` against `box`, and the elements in them. What an element clips
   * does not count, but its own edges do.
   */
  function check(parent: Element, box: Element, outer: DOMRect) {
    for (const element of parent.children) {
      const style = getComputedStyle(element);
      if (
        style.display === "none"
        || isPlaced(style)
        || element instanceof HTMLOptionElement
      ) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const sides = {
        left: outer.left - rect.left,
        top: outer.top - rect.top,
        right: rect.right - outer.right,
        bottom: rect.bottom - outer.bottom,
      };
      const past = Object.entries(sides)
        .filter(([, distance]) => distance > tolerance)
        .map(([side, distance]) => `${distance.toFixed(1)}px on the ${side}`);
      if (
        past.length > 0
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0
      ) {
        overflows.push(
          `${describe(element)} sticks out of ${describe(box)} by ${past.join(" and ")}.`,
        );
      }
      if (style.overflowX === "visible" && style.overflowY === "visible") {
        check(element, box, outer);
      }
    }
  }

  for (const box of document.body.querySelectorAll("*")) {
    if (!isBox(getComputedStyle(box))) {
      continue;
    }
    const outer = box.getBoundingClientRect();
    if (outer.width > 0 && outer.height > 0) {
      check(box, box, outer);
    }
  }
  return overflows;
}

/** How far, in CSS pixels, an element can stick out of its box, for rounding. */
const OVERFLOW_TOLERANCE = 1;

/**
 * Runs in the page. Returns each button that makes a scroll area overflow when it is pressed. A
 * pressed button moves down by "--button-press-depth". In a scroll area that has no room for the
 * move, a press shows a scroll bar, which makes the area narrower and can wrap its content again.
 * The page itself counts as a scroll area.
 */
function getPressOverflows(): readonly string[] {
  const depth = getComputedStyle(document.documentElement)
    .getPropertyValue("--button-press-depth")
    .trim();
  if (depth === "") {
    return [
      'The page has no "--button-press-depth", so the press check cannot run.',
    ];
  }
  const buttons = document.querySelectorAll<HTMLElement>(
    "button:enabled, input[type='submit']:enabled, input[type='button']:enabled, .button:not(.disabled, .alt)",
  );
  const overflows = new Set<string>();
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    if (
      rect.width === 0
      || rect.height === 0
      || getComputedStyle(button).visibility === "hidden"
    ) {
      continue;
    }

    // Only a scroll area that does not overflow yet would show a new scroll bar.
    const areas: Element[] = [];
    for (
      let area = button.parentElement;
      area !== null;
      area = area.parentElement
    ) {
      const { overflowY } = getComputedStyle(area);
      if (
        (overflowY === "auto" || overflowY === "scroll")
        && area.scrollHeight <= area.clientHeight
      ) {
        areas.push(area);
      }
    }
    const page = document.scrollingElement;
    if (page !== null && page.scrollHeight <= page.clientHeight) {
      areas.push(page);
    }

    const { transition, translate } = button.style;
    button.style.transition = "none";
    button.style.translate = `0 ${depth}`;
    for (const area of areas) {
      if (area.scrollHeight <= area.clientHeight) {
        continue;
      }
      const label =
        button.getAttribute("aria-label")
        ?? button.textContent.trim().replaceAll(/\s+/gu, " ").slice(0, 30);
      const name = `<${area.tagName.toLowerCase()}${area.id === "" ? "" : `#${area.id}`}>`;
      overflows.add(
        `A press of "${label}" makes ${name} overflow by ${area.scrollHeight - area.clientHeight}px.`,
      );
    }
    button.style.translate = translate;
    button.style.transition = transition;
  }
  return [...overflows];
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
    const openedWindow = await state.openWindow?.(page);
    // Keep the pointer off of the page, so that no element shows its hover style.
    await page.mouse.move(0, SETUP_SIZE.height - 1);
    await settle(page);

    for (const size of sizes) {
      // The pointer leaves the element that it rests on first. Otherwise, at the new size, another
      // element can move under it and open its own tooltip.
      const viewport = page.viewportSize();
      if (viewport !== null) {
        await page.mouse.move(0, viewport.height - 1);
      }
      await page.setViewportSize(size);
      if (state.hover !== undefined) {
        // Move the pointer onto the element again, so that a tooltip opens at its new position.
        await page.mouse.move(0, size.height - 1);
        await (typeof state.hover === "string"
          ? page.hover(state.hover)
          : state.hover(page, cast));
      }
      if (options.dark) {
        await page.evaluate(showDarkTheme);
      }
      await settle(page);
      const file = path.join(
        OUTPUT_DIRECTORY,
        `${state.name}-${size.width}${options.dark ? "-dark" : ""}`,
      );
      // Animations that never end, such as a pulse, show their first frame.
      await page.screenshot({
        path: `${file}.png`,
        animations: "disabled",
      });
      const tops = await page.evaluate(getColumnTops);
      if (
        tops !== undefined
        && Math.max(tops.hands, tops.stacks, tops.discardPile)
          - Math.min(tops.hands, tops.stacks, tops.discardPile)
          > COLUMN_TOP_TOLERANCE
      ) {
        results.errors.push(
          `${state.name} ${size.width}: The tops of the hands (${tops.hands.toFixed(1)}px), the play stacks (${tops.stacks.toFixed(1)}px), and the discard pile (${tops.discardPile.toFixed(1)}px) do not line up.`,
        );
      }
      if (await page.evaluate(hasTwoRowBar)) {
        results.errors.push(
          `${state.name} ${size.width}: The bar along the bottom of the screen has two rows.`,
        );
      }
      for (const overflow of await page.evaluate(
        getOverflows,
        OVERFLOW_TOLERANCE,
      )) {
        results.errors.push(`${state.name} ${size.width}: ${overflow}`);
      }
      for (const overflow of await page.evaluate(getPressOverflows)) {
        results.errors.push(`${state.name} ${size.width}: ${overflow}`);
      }
      if (openedWindow !== undefined) {
        await settle(openedWindow);
        await openedWindow.screenshot({
          path: `${file}.window.png`,
          animations: "disabled",
        });
      }

      if (compareBundle === undefined) {
        continue;
      }

      // A difference counts only if it shows twice, because a page can still change on its own (for
      // example, when the server sends an update).
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
          `## ${state.name} ${size.width}`,
          ...differences,
          "",
        );
      }
    }
    await openedWindow?.close();
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

  if (results.errors.length === 0) {
    return;
  }
  console.error(`Errors in the pages:\n${results.errors.join("\n")}`);
  process.exitCode = 1;
}

/** Writes a page that shows every screenshot of the run, with its file name above it. */
async function writeIndex() {
  const entries = await readdir(OUTPUT_DIRECTORY);
  const files = entries.filter((file) => file.endsWith(".png")).toSorted();
  const figures = files.map(
    (file) =>
      `<figure><figcaption>${file}</figcaption><img src="${file}"></figure>`,
  );
  await writeFile(
    path.join(OUTPUT_DIRECTORY, "index.html"),
    `<!doctype html>
<meta charset="utf-8">
<title>UI screenshots</title>
<style>
  body { margin: 16px; background: #222; color: #eee; font-family: sans-serif; }
  figure { margin: 0 0 32px; }
  figcaption { margin-bottom: 8px; font-weight: bold; }
  img { display: block; max-width: 100%; }
</style>
${figures.join("\n")}
`,
  );
}

/**
 * Changes the seeded database for the states. The server shows the tutorial to an account that is a
 * few seconds old, and the browser's accounts are not new. A player whom no other score state shows
 * gets best scores, so that the "Best scores" tab has max scores, a lower score, and a max score
 * with an option (4 is "One Extra Card"). Each score gets a game, which the tab links to.
 */
async function prepareDatabase(
  sql: ReturnType<Awaited<ReturnType<typeof evaluationDatabase>>["connect"]>,
) {
  await sql`UPDATE users SET datetime_created = datetime_created - interval '1 day'`;
  await sql`
    INSERT INTO user_stats (user_id, variant_id, num_games, best_score3, best_score3_mod, best_score4, best_score4_mod, best_score5, best_score5_mod)
    SELECT users.id, variants.id, 3, best.three, 0, best.four, best.four_mod, best.five,
      CASE WHEN best.five IS NULL THEN NULL ELSE 0 END
    FROM users, variants, (VALUES
      ('No Variant', 25, 25, 0, 23),
      ('Rainbow (5 Suits)', 25, 21, 0, NULL),
      ('Black (6 Suits)', 30, 30, 4, NULL)
    ) AS best(name, three, four, four_mod, five)
    WHERE users.username = ${BEST_SCORES_USERNAME} AND variants.name = best.name
    ON CONFLICT (user_id, variant_id) DO UPDATE SET
      best_score3 = EXCLUDED.best_score3, best_score3_mod = EXCLUDED.best_score3_mod,
      best_score4 = EXCLUDED.best_score4, best_score4_mod = EXCLUDED.best_score4_mod,
      best_score5 = EXCLUDED.best_score5, best_score5_mod = EXCLUDED.best_score5_mod
  `;
  await sql`
    WITH cells AS (
      SELECT s.user_id, s.variant_id, n.num_players,
        CASE n.num_players WHEN 3 THEN s.best_score3 WHEN 4 THEN s.best_score4 ELSE s.best_score5 END AS score,
        CASE n.num_players WHEN 3 THEN s.best_score3_mod WHEN 4 THEN s.best_score4_mod ELSE s.best_score5_mod END AS modifier
      FROM user_stats s
      JOIN users ON users.id = s.user_id
      CROSS JOIN (VALUES (3), (4), (5)) AS n(num_players)
      WHERE users.username = ${BEST_SCORES_USERNAME}
    ), added AS (
      INSERT INTO games (name, num_players, variant_id, timed, speedrun, deck_plays, empty_clues,
        one_extra_card, one_less_card, all_or_nothing, detrimental_characters, seed, score,
        num_turns, end_condition, datetime_started, datetime_finished)
      SELECT 'Best scores', num_players, variant_id, false, false, false, false, modifier = 4,
        false, false, false, 'p' || num_players || 'v' || variant_id || 'best-scores', score, 40, 1,
        now() - interval '2 days', now() - interval '2 days'
      FROM cells
      WHERE score IS NOT NULL
      RETURNING id, variant_id, num_players
    ), participants AS (
      INSERT INTO game_participants (game_id, user_id, seat)
      SELECT added.id, users.id, 0
      FROM added, users
      WHERE users.username = ${BEST_SCORES_USERNAME}
    )
    UPDATE user_stats s SET
      best_score3_game_id = (SELECT id FROM added WHERE added.variant_id = s.variant_id AND added.num_players = 3),
      best_score4_game_id = (SELECT id FROM added WHERE added.variant_id = s.variant_id AND added.num_players = 4),
      best_score5_game_id = (SELECT id FROM added WHERE added.variant_id = s.variant_id AND added.num_players = 5)
    FROM users
    WHERE users.id = s.user_id AND users.username = ${BEST_SCORES_USERNAME}
  `;
}

/**
 * Waits for a phase of the run, and fails with its name when it takes too long, so that a stuck run
 * stops and says where it was stuck.
 */
async function withTimeout<T>(
  phase: string,
  promise: Promise<T>,
  milliseconds = SETUP_TIMEOUT_MILLISECONDS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${phase} timed out after ${milliseconds / SECOND_IN_MILLISECONDS} seconds.`,
        ),
      );
    }, milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const options = parseOptions();
  await rm(OUTPUT_DIRECTORY, {
    recursive: true,
    force: true,
  });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await mkdir(path.join(ROOT, "dist"), { recursive: true });
  const directory = await mkdtemp(path.join(ROOT, "dist/ui-screenshots-"));
  const database = await evaluationDatabase();
  let server: ReturnType<typeof startProcess> | undefined;
  let seeded: Seed | undefined;
  // The error that stopped the run, if any. A failed cleanup must not hide it.
  let failure: Error | undefined;
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
    const localAddress = await withTimeout("Starting the server", server.ready);
    const { port } = new URL(localAddress);
    const address = `http://${DOMAIN}:${port}`;

    const seedResult = await withTimeout("Seeding", seed(localAddress));
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
    const allCasts = await withTimeout(
      "Signing in the accounts",
      Promise.all(
        Array.from(
          { length: NUM_WORKERS + 1 },
          async (_cast, index) =>
            await createCast(localAddress, index, seedResult),
        ),
      ),
    );
    const casts = allCasts.slice(0, NUM_WORKERS);
    const signedOutCast = allCasts.at(-1);
    assertDefined(signedOutCast, "There is no cast.");
    {
      // The connection closes even when a change fails, so that it does not keep the run alive.
      await using sql = database.connect();
      await withTimeout("Preparing the database", prepareDatabase(sql));
    }

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
        await context.addCookies([
          {
            name,
            value,
            domain: DOMAIN,
            path: "/",
          },
        ]);
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
    await writeIndex();
    console.info(`Screenshots: ${OUTPUT_DIRECTORY}`);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (seeded !== undefined) {
      for (const peer of seeded.peers) {
        peer.socket.close();
      }
    }
    if (server !== undefined) {
      await stopChild(server.child);
    }
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
  try {
    await database.close();
  } catch (error) {
    if (failure === undefined) {
      throw error;
    }
    console.error("Failed to drop the database after the error below:", error);
  }
  if (failure !== undefined) {
    throw failure;
  }
}

try {
  await main();
} catch (error) {
  console.error("Failed to take the screenshots:", error);
  // A phase that timed out can leave a connection or a timer open, which would keep the process
  // alive.
  process.exit(1);
}
