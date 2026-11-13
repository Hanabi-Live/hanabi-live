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
// - `--coverage`: Also list the selectors of the CSS bundle that match no element in any state.

// A state with a `record` step also saves a video of that step, at the first width, such as
// "new-ui-play.webm".

/* eslint-disable no-await-in-loop -- The browser visits the states one at a time. */

import type {
  playerActionRequestSchema,
  replayGameSchema,
  UserId,
} from "@hanabi-live/data";
import {
  DEFAULT_MAX_PLAYERS,
  MAX_CHAT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TABLE_NAME_LENGTH,
  packEvent,
  SERVER_EVENT_SCHEMAS,
  VERSION,
} from "@hanabi-live/data";
import type {
  CardOrder,
  ClueRank,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  getVariant,
  isValidClueRank,
  MAX_CLUES,
  MAX_RANK,
  MAX_STRIKES,
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
import { setTimeout } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";
import type { BrowserContext, Locator, Page } from "playwright";
import { chromium } from "playwright";
import type * as z from "zod";
import { evaluationDatabase } from "./database.ts";
import {
  buildRust,
  cookieUserId,
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

/** Long enough for the transitions of the stylesheets to finish. */
const SETTLE_MILLISECONDS = 400;

/** How long to rest the pointer on an element, so that its tooltip opens after its delay. */
const TOOLTIP_WAIT_MILLISECONDS = 1000;

/** How many times to press Escape to go from the deepest screen back to the lobby. */
const MAX_ESCAPES = 3;

/** The seed of the first seeded game: two players, the variant with ID 0, and the first seed. */
const SEED = "p2v0s1";

/** The tag that the seeded games have, for the tagged games pages. */
const TAG = "layered finesse";

/** The accounts that watch the open table. */
const SPECTATOR_NAMES = ["Carol", "Dave", "Erin", "Frank"] as const;

/** The variant of the open table. */
const LONG_VARIANT_NAME = "Rainbow-Ones & Orange (6 Suits)";

/** The variant of the shared replay that shows a card morphed to a suit without a rank. */
const PRISM_VARIANT_NAME = "Prism (5 Suits)";

/** The index of the Prism suit in that variant. */
const PRISM_SUIT_INDEX = 4;

/**
 * The card that the leader morphs: the newest card of the second player. A hypothetical hides the
 * hand of the player whose turn it is.
 */
const PRISM_MORPH_ORDER = 9;

/** The account that leads that shared replay. */
const PRISM_LEADER_NAME = "Grace";

/** The account that leads the shared replay of a 5-player game. */
const FIVE_PLAYER_LEADER_NAME = "Heidi";

/** The players of that game, none of whom is the browser's account, so that it only watches. */
const FIVE_PLAYER_NAMES = ["Bob", "Carol", "Dave", "Erin", "Frank"] as const;

/** Each player's cards in a 5-player game. */
const FIVE_PLAYER_HAND_SIZE = 4;

/** The moves of that game, enough to step through and jump across. */
const FIVE_PLAYER_NUM_MOVES = 20;

/** The variant of the game that ends with a perfect score. It has few cards, so it ends quickly. */
const PERFECT_VARIANT_NAME = "3 Suits";

/** The accounts that play that game first, to save its deal and moves. */
const PERFECT_PLAYER_NAMES = ["Ivan", "Judy"] as const;

/** How many seeds to try for a game that its players can finish with a perfect score. */
const MAX_PERFECT_SEEDS = 20;

/** More moves than a game of that variant can take, in case the players get stuck. */
const MAX_PERFECT_MOVES = 200;

/**
 * The tables where the accounts of the perfect game complete a stack, lose a card, and strike out,
 * for the account to watch in the classic and the new game screen.
 */
const STACK_SIGNALS_TABLE_NAME = "Classic signals";
const STACK_SIGNALS_NEW_UI_TABLE_NAME = "New UI signals";

/**
 * How long a stack completion, a drop of the maximum score, or a misplay takes, with time to spare.
 */
const SIGNAL_MILLISECONDS = 2500;

/** How long the perfect score finale lasts, with time to spare. */
const FINALE_MILLISECONDS = 6000;

/** The H-Group level that the account at the open table chooses. */
const H_GROUP_LEVEL = 3;

/** How many times to check whether it is Bob's turn, and how long to wait between checks. */
const MAX_TURN_CHECKS = 50;
const TURN_CHECK_MILLISECONDS = 100;

/** The account that the browser logs in with. Others play the seeded games. */
const USERNAME = "Alice";

interface State {
  readonly name: string;
  readonly path: string;
  readonly loggedIn: boolean;
  /** Runs at the setup size, after the page loads. */
  readonly prepare?: (page: Page) => Promise<void>;
  /** Runs after the screenshots, so that the next state starts from the lobby. */
  readonly cleanup?: (page: Page) => Promise<void>;
  /**
   * The element that the pointer rests on during the screenshots, such as one with a tooltip: a
   * selector, or a function that moves the pointer.
   */
  readonly hover?: string | ((page: Page) => Promise<void>);
  /**
   * Runs after `prepare`, while a video records the page, so that an animation can be seen. It
   * should wait until the animation ends.
   */
  readonly record?: (page: Page) => Promise<void>;
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
  await page.waitForTimeout(SETTLE_MILLISECONDS);
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
  await page.waitForTimeout(SETTLE_MILLISECONDS);
}

async function clickNav(page: Page, id: string) {
  await page.click(`#nav-buttons-lobby-${id}`);
  await page.waitForTimeout(SETTLE_MILLISECONDS);
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
  await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
}

/**
 * Leaves a replay. The server keeps the account in it until it goes back to the lobby. In a
 * hypothetical, the first Escape only ends the hypothetical.
 */
async function leaveReplay(page: Page) {
  const lobby = page.locator("#lobby");
  for (let i = 0; i < MAX_ESCAPES && !(await lobby.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(SETTLE_MILLISECONDS);
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

/**
 * Runs in the page. The index of the hand in the classic game screen whose cards can be dragged.
 */
function getDraggableHandIndex(): number {
  const hands = (
    globalThis as unknown as {
      globals: {
        elements: {
          playerHands: ReadonlyArray<{
            children: ReadonlyArray<{ draggable: () => boolean }>;
          }>;
        };
      };
    }
  ).globals.elements.playerHands;
  const index = hands.findIndex(
    (hand) => hand.children.at(0)?.draggable() === true,
  );
  if (index === -1) {
    throw new Error("No hand has a card that can be dragged.");
  }
  return index;
}

/** Runs in the page. Shows the restart dialog of the classic game screen. */
function showRestartDialog() {
  const { elements, layers } = (
    globalThis as unknown as {
      globals: {
        elements: { restartArea: { visible: (visible: boolean) => void } };
        layers: { UI2: { batchDraw: () => void } };
      };
    }
  ).globals;
  elements.restartArea.visible(true);
  layers.UI2.batchDraw();
}

/** Runs in the page. Opens the modal that changes the efficiency modifier. */
function showSetModifierModal() {
  const { elements } = (
    globalThis as unknown as {
      globals: {
        elements: { efficiencyNumberLabel: { fire: (event: string) => void } };
      };
    }
  ).globals;
  elements.efficiencyNumberLabel.fire("dbltap");
}

/**
 * Runs in the page. Shows the second hand of the classic game screen (the largest) as its player
 * sees it, and gives each card a different set of possibility rows. The variant has five suits and
 * five ranks.
 */
function showPossibilityRows() {
  // These values match `PipState` of the game library, which the page does not expose.
  const HIDDEN = 0;
  const ELIMINATED = 1;
  const VISIBLE = 2;

  function rankState(
    rank: number,
    ranks: readonly number[],
    eliminatedRanks: readonly number[],
  ): number {
    if (ranks.includes(rank)) {
      return VISIBLE;
    }
    return eliminatedRanks.includes(rank) ? ELIMINATED : HIDDEN;
  }

  function row(
    suitIndexes: readonly number[],
    ranks: readonly number[],
    eliminatedRanks: readonly number[] = [],
  ) {
    return {
      suitPips: suitIndexes.map((suitIndex) => ({
        suitIndex,
        state: VISIBLE,
        positive: false,
      })),
      rankPips: [1, 2, 3, 4, 5].map((rank) => ({
        rank,
        state: rankState(rank, ranks, eliminatedRanks),
        positive: false,
      })),
    };
  }

  const cardRows = [
    [row([0, 1, 2, 3, 4], [1, 2, 3, 4]), row([0], [5])],
    [
      row([0], [1, 2, 3, 4], [5]),
      row([1], [1, 2, 3, 4, 5]),
      row([3], [2, 3, 4, 5], [1]),
    ],
    [row([0, 1], [1, 2]), row([2, 3], [3, 4]), row([4], [5])],
    [row([0], [1]), row([1], [2]), row([2], [3]), row([3], [4]), row([4], [5])],
    [row([0, 1, 2], [1, 2, 3]), row([3, 4], [4, 5])],
  ];

  interface Card {
    setEmpathy: (enabled: boolean) => void;
    possibilityRowsToDraw: unknown;
    pipsAllowed: { suit: boolean; rank: boolean };
    updatePipVisibility: () => void;
  }
  const { elements, layers } = (
    globalThis as unknown as {
      globals: {
        elements: {
          playerHands: ReadonlyArray<{
            children: ReadonlyArray<{ card: Card }>;
          }>;
        };
        layers: { card: { batchDraw: () => void } };
      };
    }
  ).globals;
  for (const [i, { card }] of (
    elements.playerHands[1]?.children ?? []
  ).entries()) {
    card.setEmpathy(true);
    card.possibilityRowsToDraw = cardRows[i % cardRows.length];
    card.pipsAllowed = { suit: true, rank: true };
    card.updatePipVisibility();
  }
  layers.card.batchDraw();
}

/** Runs in the page. Switches the classic game screen to the next empathy style. */
function cycleEmpathy() {
  const { empathy } = globalThis as unknown as { empathy: () => string };
  empathy();
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
  await page.waitForTimeout(SETTLE_MILLISECONDS);
  await page.waitForFunction(isGameScreenResized);
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
  await page.waitForTimeout(SETTLE_MILLISECONDS);
}

/** Long enough for a play or a misplay to finish its animation. */
const PLAY_ANIMATION_MILLISECONDS = 3000;

/** How many moves a drag takes, so that the game screen sees the pointer travel. */
const DRAG_STEPS = 10;

/** Drags a card from a hand onto the play stacks or the discard pile, as a player would. */
async function dragCard(page: Page, card: Locator, zone: "play" | "discard") {
  const from = await card.boundingBox();
  const to = await page
    .locator(
      zone === "play"
        ? "#game-new-ui [data-play-stacks]"
        : '#game-new-ui [aria-label="Discards"]',
    )
    .boundingBox();
  if (from === null || to === null) {
    throw new Error(`The card or the ${zone} zone is not on the screen.`);
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: DRAG_STEPS,
  });
  await page.mouse.up();
}

/** How long the video of a shared replay leader's moves waits after each one, to see it. */
const LEADER_MOVE_WAIT_MILLISECONDS = 1200;

/** How long the video waits after the leader's last move, until the screen is still. */
const LEADER_SETTLE_MILLISECONDS = 1500;

/** Leaves the classic game screen for the new one, if the game shows the classic one. */
async function showNewUi(page: Page) {
  const hands = page.locator('#game-new-ui [aria-label="Hands"]');
  if (!(await hands.isVisible())) {
    await clickCanvasElement(page, ["newUiButton"]);
  }
  await hands.waitFor();
}

/** Plays a card from the account's hand, if it has one of the kind. */
async function playAccountCard(page: Page, order: CardOrder | undefined) {
  if (order === undefined) {
    throw new Error("The account has no card of the kind to play.");
  }
  await dragCard(
    page,
    page.locator(`#game-new-ui [data-card-order="${order}"] button`),
    "play",
  );
  await page.waitForTimeout(PLAY_ANIMATION_MILLISECONDS);
}

function getStates({
  replayId,
  startGame,
  endGame,
  passLeader,
  clueAccount,
  findAccountCard,
  playBobCard,
  showPrismMorph,
  leaderGoTo,
  lastClueSegment,
  showFivePlayerReplay,
  showPerfectScore,
  showStackSignals,
}: Pick<
  Seed,
  | "replayId"
  | "startGame"
  | "endGame"
  | "passLeader"
  | "clueAccount"
  | "findAccountCard"
  | "playBobCard"
  | "showPrismMorph"
  | "leaderGoTo"
  | "lastClueSegment"
  | "showFivePlayerReplay"
  | "showPerfectScore"
  | "showStackSignals"
>): readonly State[] {
  // Ends the shared replay of the "prism-unknown-rank" state.
  let closePrismReplay: (() => void) | undefined;

  // The shared replay of the "new-ui-shared-replay-five-players" state.
  let fivePlayerReplay: FivePlayerReplay | undefined;

  // The game of the "new-ui-perfect-score" state.
  let perfectScore: PerfectScore | undefined;

  // The game of the "stack-signals" state.
  let stackSignals: StackSignals | undefined;

  // The card in the account's hand that the clue log shows the clues about.
  let cluedCard: CardOrder | undefined;

  // Whether the WebSocket server answers with an error, for the "loading-error" state. The route
  // that does it stays, because Playwright cannot remove a WebSocket route.
  let failWebSocket = false;

  return [
    { name: "login", path: "/", loggedIn: false },
    { name: "scores", path: `/scores/${USERNAME}`, loggedIn: false },
    {
      name: "history",
      path: `/history/${USERNAME}`,
      loggedIn: false,
      // Sort one column, so that the sort arrows show both states.
      prepare: async (page) => {
        await page.locator("th[data-sortable]").first().click();
      },
    },
    {
      name: "missing-scores",
      path: `/missing-scores/${USERNAME}`,
      loggedIn: false,
    },
    {
      // The rows, where a variant without a score shows a dash.
      name: "missing-scores-rows",
      path: `/missing-scores/${USERNAME}`,
      loggedIn: false,
      prepare: async (page) => {
        await page
          .locator(".missing-scores-row")
          .last()
          .scrollIntoViewIfNeeded();
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
    { name: "seed", path: `/seed/${SEED}`, loggedIn: false },
    { name: "tags", path: `/tags/${USERNAME}`, loggedIn: false },
    { name: "tag", path: `/tag/${encodeURIComponent(TAG)}`, loggedIn: false },
    { name: "password-reset", path: "/password-reset", loggedIn: false },
    {
      name: "login-alert",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await page.click("#login-button");
        await page.locator("#login-alert").waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
      },
    },
    // The server rejects the client while it loads, so the loading card shows the error.
    {
      name: "loading-error",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        failWebSocket = true;
        await page.route("**/test-cookie", async (route) => {
          await route.fulfill({ status: 200 });
        });
        await page.routeWebSocket(
          (url) => url.pathname === "/ws",
          (ws) => {
            if (failWebSocket) {
              ws.send(
                packEvent("error", {
                  // The message of "validate_client_version" on the server.
                  message: [
                    "You are running an outdated version of the client code.",
                    "You are on: old",
                    "The latest: new",
                    "Please perform a refresh to get the latest version.",
                  ].join("\n"),
                  code: "outdatedClient",
                  latestVersion: "new",
                }),
              );
            } else {
              ws.connectToServer();
            }
          },
        );
        await page.reload();
        await page.locator("#error-modal").waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      cleanup: async (page) => {
        failWebSocket = false;
        await page.unroute("**/test-cookie");
      },
    },
    // The username has no account, so the form asks to confirm its creation.
    {
      name: "login-no-account",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await page.fill("#login-username", "Nobody");
        await page.fill("#login-password", "password");
        await page.click("#login-button");
        await page.locator("#login-no-account").waitFor();
      },
    },
    // The account has no password, so the alert links to the password reset instructions.
    {
      name: "login-password-reset",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await page.route("**/login", async (route) => {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              message: "This account requires a password reset.",
              code: "passwordResetRequired",
            }),
          });
        });
        await page.fill("#login-username", "Nobody");
        await page.fill("#login-password", "password");
        await page.click("#login-button");
        await page.locator("#login-alert").waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
      },
      cleanup: async (page) => {
        await page.unroute("**/login");
      },
    },
    {
      name: "login-change-password",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await page.click("#change-password-link");
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
      },
    },
    // A new account sees the tutorial. These states sign in after the check that skips it.
    {
      name: "tutorial",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await signInNewAccount(page, "TutorialFirst");
      },
      cleanup: signOutOfNewAccount,
    },
    {
      name: "tutorial-team",
      path: "/",
      loggedIn: false,
      prepare: async (page) => {
        await signInNewAccount(page, "TutorialTeam");
        for (const button of ["yes", "2-yes", "2-1-ok", "3-ok", "4-no"]) {
          await page.click(`#tutorial-${button}`);
          await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        }
        await page.locator("#tutorial-5-casual").waitFor();
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
    {
      name: "emoji-picker-search",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.click("#lobby-chat-input + button");
        await page.fill("#emoji-picker input", "cat");
      },
      // The name of a symbol shows in the site's tooltip, which waits for the pointer to rest.
      hover: async (page) => {
        await page.hover(
          '#emoji-picker [role="tabpanel"] > button:first-child',
        );
        await page.locator(".tooltip-bubble:popover-open").waitFor();
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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    {
      name: "chat-length-near-limit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.fill("#lobby-chat-input", longText(MAX_CHAT_LENGTH - 20));
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
      name: "create-game-name-over-limit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.fill(
          "#createTableName",
          longText(MAX_TABLE_NAME_LENGTH + 5),
        );
      },
      hover: "#createTableName ~ span",
    },
    {
      name: "button-focus",
      path: "/",
      loggedIn: true,
      // A button shows its focus outline only when the keyboard moves the focus to it.
      prepare: async (page) => {
        await clickNav(page, "create-game");
        await page.focus("#create-game-submit");
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      // The form remembers its options, which the other states need to be the defaults.
      cleanup: async (page) => {
        await page.fill("#createTableTimeBaseMinutes", "2");
        await page.click('label[for="createTableTimed"]');
        await page.click('label[for="createTableOneExtraCard"]');
        await page.fill("#create-game-variant-dropdown2", "No Variant");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
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
      // The other source, a shared replay (which can be a spoiler-free review), and an error.
      name: "watch-replay-json",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "replay");
        await page.click('label[for="replay-source-json"]');
        await page.click('label[for="replay-visibility-shared"]');
        await page.click("#replay-submit");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      // The form remembers its source, which the replay states need to be the ID.
      cleanup: async (page) => {
        await page.evaluate(() => {
          globalThis.localStorage.removeItem("watchReplaySource");
        });
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
      // The level row only shows with the H-Group features. "Saved" shows for a short time, so only
      // the first screenshots have it.
      name: "settings-h-group",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "settings");
        await page.locator('label[for="hGroupConventions"]').last().click();
      },
      cleanup: async (page) => {
        await page.locator('label[for="hGroupConventions"]').last().click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    {
      // The "Reduced motion" row is below the first screen of settings.
      name: "settings-reduced-motion",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "settings");
        await page.locator("#reducedMotion").last().scrollIntoViewIfNeeded();
      },
    },
    // Its video moves the mouse over checkbox rows, then clicks the padding at the corner of a row
    // twice, which turns the setting on and off.
    {
      name: "settings-row-hover",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await clickNav(page, "settings");
      },
      hover: async (page) => {
        await page
          .locator(".lobby-row", { has: page.locator("#keldonMode") })
          .last()
          .hover();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      record: async (page) => {
        function row(id: string) {
          return page
            .locator(".lobby-row", { has: page.locator(`#${id}`) })
            .last();
        }
        for (const id of ["keldonMode", "colorblindMode", "realLifeMode"]) {
          await row(id).hover();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
        for (let i = 0; i < 2; i++) {
          await row("realLifeMode").click({ position: { x: 4, y: 4 } });
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    {
      name: "replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
      },
      cleanup: leaveReplay,
    },
    // The tooltip of the deck in the classic game screen, which lists the game's options.
    {
      name: "replay-tooltip",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
      },
      hover: async (page) => {
        await hoverCanvasElement(page, ["deck"]);
        await page.locator(".game-tooltips-ul").waitFor();
      },
      cleanup: leaveReplay,
    },
    // The tooltip of the spectators icon in the classic game screen, which lists their names.
    {
      name: "replay-spectators-tooltip",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
      },
      hover: async (page) => {
        await hoverCanvasElement(page, ["spectatorsLabel"]);
        await page.locator(".game-tooltips-ol").waitFor();
      },
      cleanup: leaveReplay,
    },
    // The restart dialog of the classic game screen. It must be drawn above the clue log.
    {
      name: "replay-restart",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await page.evaluate(showRestartDialog);
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      cleanup: leaveReplay,
    },
    // The modal that changes a card into another during a hypothetical.
    {
      name: "morph-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await hoverCanvasElement(page, ["enterHypoButton"]);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await leaveReplay(page);
      },
    },
    // The modal that goes to a turn of the replay (Alt + t).
    {
      name: "set-turn-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await page.keyboard.press("Alt+t");
        await page.locator("#set-turn-modal").waitFor();
      },
      cleanup: leaveReplay,
    },
    // The modal that changes the efficiency modifier, which a double tap on the efficiency opens.
    {
      name: "set-modifier-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await page.evaluate(showSetModifierModal);
        await page.locator("#set-modifier-modal").waitFor();
      },
      cleanup: leaveReplay,
    },
    // A hypothetical in the replay, with "Edit cards" checked and the other checkboxes not.
    {
      name: "hypothetical",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await clickCanvasElement(page, ["enterHypoButton"]);
        await clickCanvasElement(page, ["editCardsCheckbox"]);
      },
      cleanup: leaveReplay,
    },
    // Every hand's view of its cards, while the spacebar is held, with the empathy style that
    // `empathy()` picks first: one possibility row for each suit.
    {
      name: "replay-empathy-row-per-suit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await page.evaluate(cycleEmpathy);
      },
      // Press the spacebar again at each size, since the redrawn screen does not keep the view.
      hover: async (page) => {
        await page.keyboard.up("Space");
        await page.keyboard.down("Space");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      cleanup: async (page) => {
        await page.keyboard.up("Space");
        await leaveReplay(page);
      },
    },
    // A card that is dragged over the clue log in a hypothetical. It must be drawn above
    // everything.
    {
      name: "hypothetical-drag",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
        await clickCanvasElement(page, ["enterHypoButton"]);
      },
      hover: async (page) => {
        await page.mouse.up();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        const handIndex = await page.evaluate(getDraggableHandIndex);
        await hoverCanvasElement(page, [
          "playerHands",
          handIndex,
          "children",
          0,
        ]);
        await page.mouse.down();
        // The clue log is in the top right of the screen.
        const box = await page.locator(".konvajs-content").boundingBox();
        if (box === null) {
          throw new Error("The game screen is not drawn.");
        }
        await page.mouse.move(
          box.x + box.width * 0.9,
          box.y + box.height * 0.2,
          { steps: 10 },
        );
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      cleanup: async (page) => {
        await page.mouse.up();
        await leaveReplay(page);
      },
    },
    // Cards in the classic screen that show possibility rows: from one row of all the suits to a
    // row for each suit.
    {
      name: "possibility-rows",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayId);
      },
      hover: async (page) => {
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await page.waitForFunction(isGameScreenResized);
        await page.evaluate(showPossibilityRows);
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
      cleanup: leaveReplay,
    },
    // A shared replay of a Prism game in the classic screen, in a hypothetical where the leader
    // morphed a card to the Prism suit without a rank.
    {
      name: "prism-unknown-rank",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        closePrismReplay = await showPrismMorph();
        // The client ignores a "/game/<id>" path for an account that is a few seconds old, so
        // spectate the shared replay from its row in the lobby. The lobby ignores a click on a row
        // that just moved, so wait for the new row to settle first.
        const row = page.locator("#lobby-games-table-tbody tr", {
          hasText: PRISM_LEADER_NAME,
        });
        await row.waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        await row.click({ force: true });
        await page.waitForSelector(".konvajs-content");
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
      },
      // Escape cannot end a hypothetical that another account leads, so use the lobby button.
      cleanup: async (page) => {
        await clickCanvasElement(page, ["lobbyButton"]);
        await page.locator("#lobby").waitFor();
        closePrismReplay?.();
        closePrismReplay = undefined;
      },
    },
    // Joining a table keeps the account in it, so these states come last.
    { name: "pregame", path: "/", loggedIn: true, prepare: joinTable },
    {
      name: "pregame-panel-game-chat",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await joinTable(page);
        await clickPanelButton(page, "game-chat");
      },
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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The account does not own the seeded table, so the form suggests the options to its owner.
    {
      name: "pregame-suggest-options",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await joinTable(page);
        await page.click("#nav-buttons-pregame-change-options");
        await page.locator("#create-game-submit").scrollIntoViewIfNeeded();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The server lists the proposed options in the table chat, one option on each line.
    {
      name: "pregame-proposed-options",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await joinTable(page);
        await page.click("#nav-buttons-pregame-change-options");
        await page.fill("#createTableName", "Proposed Name");
        await page.click("#create-game-submit");
        await page
          .locator("#lobby-chat-pregame-text .cp")
          .first()
          .waitFor({ state: "attached" });
        await page
          .locator("#lobby-toggle-show-game-chat")
          .dispatchEvent("click");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // Starting the game ends the pregame, so this state comes after the pregame states.
    {
      name: "new-ui-game",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        // The settings are only in the lobby, so leave the pregame screen to turn on "New UI".
        await joinTable(page);
        await page.click("#nav-buttons-pregame-unattend");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await clickNav(page, "settings");
        // The checkbox itself is hidden behind its styled label.
        await page.locator('label[for="newUi"]').first().click();
        await page.keyboard.press("Escape");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await joinTable(page);
        // Clicking the table's row joins it as a player when there is room, but only spectates it
        // when the account is already watching.
        const join = page.locator("#nav-buttons-pregame-join");
        if (await join.isVisible()) {
          await join.click();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
        await startGame();
        await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
      },
    },
    // The game from the previous state, with a message that is too long in its chat.
    {
      name: "new-ui-chat-length-over-limit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.fill("#game-chat-input", longText(MAX_CHAT_LENGTH + 20));
      },
      // The input is hidden at the last width, where the chat panel is closed.
      cleanup: async (page) => {
        await page.locator("#game-chat-input").fill("", { force: true });
      },
      hover: async (page) => {
        await hoverIfVisible(page, "#game-chat-input ~ span");
      },
    },
    // The game from the previous state, after the account plays a card that it does not know. Its
    // video shows the play.
    {
      name: "new-ui-play",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
      },
      record: async (page) => {
        await playAccountCard(page, await findAccountCard(true));
      },
    },
    // The game from the previous state, after Bob plays a card and the account misplays one. Its
    // video shows the misplay. Bob then plays another card, so that it is the account's turn again.
    {
      name: "new-ui-misplay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
        await playBobCard();
        await page.waitForTimeout(PLAY_ANIMATION_MILLISECONDS);
      },
      record: async (page) => {
        await playAccountCard(page, await findAccountCard(false));
      },
      cleanup: async () => {
        await playBobCard();
      },
    },
    // The game from the previous state, after the account plays a card and steps back over it in
    // the in-game replay. Its video shows the step back, where the drawn card goes back to the
    // deck.
    {
      name: "new-ui-replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        // A card that the team can play, so that the game does not reach its last strike.
        await playAccountCard(page, await findAccountCard(true));
        await page.getByRole("button", { name: "Replay" }).click();
      },
      record: async (page) => {
        await page.getByRole("button", { name: "Previous turn" }).click();
        await page.waitForTimeout(PLAY_ANIMATION_MILLISECONDS);
      },
    },
    // The game from the previous state, after Bob clues the account twice, with the account's
    // discard between the clues. The mouse button is held down on the card that the first clue
    // touched and the second missed, so the clue log shows only those two clues. Its video shows
    // the second clue.
    {
      name: "new-ui-clue-log-press",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
        cluedCard = await clueAccount();
        const hand = page.locator(
          `#game-new-ui [aria-label="${USERNAME}'s hand"]`,
        );
        // The oldest card, which the first clue did not touch.
        await dragCard(page, hand.locator("button").last(), "discard");
        // The card is orange, which is inverted, so the discard is a misplay, which takes a while.
        await page.waitForTimeout(PLAY_ANIMATION_MILLISECONDS);
      },
      record: async (page) => {
        await clueAccount();
        await page.waitForTimeout(PLAY_ANIMATION_MILLISECONDS);
      },
      // The clue log filters while the mouse button is held down on a card.
      hover: async (page) => {
        if (cluedCard !== undefined) {
          await page.mouse.up();
          await hoverIfVisible(
            page,
            `#game-new-ui [data-card-order="${cluedCard}"]`,
          );
          await page.mouse.down();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
      },
    },
    {
      name: "new-ui-tooltip",
      path: "/",
      loggedIn: true,
      hover: '#game-new-ui [aria-label^="About efficiency"]',
    },
    {
      name: "new-ui-pace-tooltip",
      path: "/",
      loggedIn: true,
      hover: '#game-new-ui [aria-label^="About pace"]',
    },
    // The tooltips of a discarded card and of a clue in the clue log wait for the pointer to rest.
    {
      name: "new-ui-discard-tooltip",
      path: "/",
      loggedIn: true,
      hover: async (page) => {
        await page
          .locator('#game-new-ui [data-card-place^="discard-"]')
          .first()
          .hover();
        await page.waitForTimeout(TOOLTIP_WAIT_MILLISECONDS);
      },
    },
    {
      name: "new-ui-clue-log-tooltip",
      path: "/",
      loggedIn: true,
      hover: async (page) => {
        await page
          .locator('#game-new-ui [aria-label="Clue log"] li button')
          .first()
          .hover();
        await page.waitForTimeout(TOOLTIP_WAIT_MILLISECONDS);
      },
    },
    // The same game, with the menu of the "End game" button open.
    {
      name: "new-ui-end-game-menu",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page
          .getByRole("button", { name: "End game", exact: true })
          .click();
      },
    },
    // The same game, after the account votes to end it. The account then takes back its vote, so
    // that the game goes on.
    {
      name: "new-ui-end-vote",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page
          .getByRole("button", { name: "End game", exact: true })
          .click();
        await page.getByRole("menuitem", { name: /Vote to end/u }).click();
        await page.getByRole("button", { name: "Voted to end" }).waitFor();
      },
      cleanup: async (page) => {
        await page.getByRole("button", { name: "Voted to end" }).click();
        await page.getByRole("menuitem", { name: /Take back/u }).click();
      },
    },
    // The same game, after the account switches to the classic screen.
    {
      name: "new-ui-classic",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.getByRole("button", { name: "Classic view" }).click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The same game, with the modal that asks which card to play (the "a" hotkey). Bob's clue in
    // the video of the "new-ui-clue-log-press" state made it the account's turn.
    {
      name: "play-discard-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.keyboard.press("a");
        await page.locator("#play-discard-modal").waitFor();
      },
      cleanup: async (page) => {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The same game, with a note that is too long on the account's first card. The classic screen
    // draws its hands again when the window resizes, which closes the note, so each width opens it.
    {
      name: "new-ui-classic-note-over-limit",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        const classic = page.getByRole("button", { name: "Classic view" });
        if (await classic.isVisible()) {
          await classic.click();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
      },
      hover: async (page) => {
        // Let a note that the resize closed finish fading out.
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await page.waitForFunction(isGameScreenResized);
        const input = page.locator('input[id^="tooltip-"][id$="-input"]');
        if (!(await input.isVisible())) {
          await hoverCanvasElement(page, ["playerHands", 0, "children", 0]);
          // The table is a speedrun, where Ctrl + right-click opens a note.
          await page.keyboard.down("Control");
          await page.mouse.down({ button: "right" });
          await page.mouse.up({ button: "right" });
          await page.keyboard.up("Control");
          await input.fill(longText(MAX_NOTE_LENGTH + 20));
        }
        await page.hover('[id^="tooltip-"][id$="-length-counter"] > span');
      },
      // Close the note without saving it.
      cleanup: async (page) => {
        await page.keyboard.press("Escape");
      },
    },
    // The same game, with the classic screen's chat window open and a message with an emote and a
    // link in it.
    {
      name: "classic-game-chat",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        const classic = page.getByRole("button", { name: "Classic view" });
        if (await classic.isVisible()) {
          await classic.click();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
        await page.keyboard.press("Alt+KeyC");
        await page.locator("#game-chat-input").waitFor();
        await page.fill(
          "#game-chat-input",
          "Hello Kappa, see https://example.com",
        );
        await page.press("#game-chat-input", "Enter");
        await page.locator("#game-chat-text", { hasText: "Hello" }).waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The same game, back in the new screen, after Bob ends it. It is now a shared replay that Bob
    // leads.
    {
      name: "new-ui-shared-replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        const hands = page.locator('#game-new-ui [aria-label="Hands"]');
        if (!(await hands.isVisible())) {
          await clickCanvasElement(page, ["newUiButton"]);
        }
        await hands.waitFor();
        await endGame();
        await page.getByRole("button", { name: "Ready" }).waitFor();
      },
    },
    // Bob leads the shared replay while the account follows. Its video shows how each of his moves
    // looks: a step forward to his last clue and back again (where no card moves), a jump to the
    // first turn, a step on from there, and a jump to the last turn.
    {
      name: "new-ui-shared-replay-leader-moves",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await page.locator('#game-new-ui [aria-label="Hands"]').waitFor();
        leaderGoTo((await lastClueSegment()) - 1);
        await page.waitForTimeout(LEADER_SETTLE_MILLISECONDS);
      },
      record: async (page) => {
        const clue = await lastClueSegment();
        // The timeline's turns count from 1, and its segments from 0.
        const lastTurn = await page
          .getByRole("slider", { name: "Turn" })
          .getAttribute("aria-valuemax");
        const lastSegment = Number(lastTurn) - 1;
        for (const segment of [clue, clue - 1, 0, 1]) {
          leaderGoTo(segment);
          await page.waitForTimeout(LEADER_MOVE_WAIT_MILLISECONDS);
        }
        leaderGoTo(lastSegment);
        await page.waitForTimeout(LEADER_SETTLE_MILLISECONDS);
      },
    },
    {
      name: "new-ui-shared-replay-leader",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        passLeader();
        await page.getByRole("button", { name: "Pass leader" }).waitFor();
      },
    },
    // The modal that passes the lead of the shared replay to someone else. Loading the page passes
    // the lead back to Bob, as in the next state.
    {
      name: "set-leader-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        passLeader();
        await page.getByRole("button", { name: "Pass leader" }).click();
        await page.locator("#set-leader-modal").waitFor();
      },
      cleanup: async (page) => {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // A hypothetical that the account leads, from the first turn, after a player plays a card in
    // it, with "Edit cards" on. Loading the page leaves the shared replay for a moment, which
    // passes the lead back to Bob, so he passes it again.
    {
      name: "new-ui-hypothetical",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        passLeader();
        // Only the leader can start a hypothetical, so wait until the lead reaches the account.
        await page.getByRole("button", { name: "Pass leader" }).waitFor();
        // The button is disabled when the replay already shows the first turn.
        const firstTurn = page.getByRole("button", { name: "First turn" });
        if (await firstTurn.isEnabled()) {
          await firstTurn.click();
        }
        await page
          .locator('#game-new-ui button[aria-label="First turn"]:disabled')
          .waitFor();
        await page.getByRole("button", { name: "Enter hypothetical" }).click();
        // Whoever goes first plays the first card in their hand. When the game ended before anyone
        // moved (without the "new-ui-replay" state), the hypothetical is already over.
        const card = page
          .locator(
            '#game-new-ui button[aria-label$="the play stacks or the discard pile"]',
          )
          .first();
        if (await card.isVisible()) {
          await dragCard(page, card, "play");
          await page.getByText("Turn 2", { exact: true }).waitFor();
        }
        await page.getByRole("button", { name: "Edit cards" }).click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // A shared replay of a 5-player game that another account leads, which the account spectates.
    // Its video shows the leader's moves: a step forward onto a clue, a step back from that clue
    // onto another, a jump to the first turn, a step on from there, and a jump to the last turn.
    {
      name: "new-ui-shared-replay-five-players",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        fivePlayerReplay = await showFivePlayerReplay();
        await page.getByRole("button", { name: "Lobby", exact: true }).click();
        await page.locator("#lobby").waitFor();
        // As in the "prism-unknown-rank" state, spectate from the row once it has settled.
        const row = page.locator("#lobby-games-table-tbody tr", {
          hasText: FIVE_PLAYER_LEADER_NAME,
        });
        await row.waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        await row.click({ force: true });
        const hands = page.locator('#game-new-ui [aria-label="Hands"]');
        await page.locator("#lobby").waitFor({ state: "hidden" });
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        if (!(await hands.isVisible())) {
          await clickCanvasElement(page, ["newUiButton"]);
        }
        await hands.waitFor();
        fivePlayerReplay.goTo(fivePlayerReplay.clueStep - 1);
        await page.waitForTimeout(LEADER_SETTLE_MILLISECONDS);
      },
      record: async (page) => {
        if (fivePlayerReplay === undefined) {
          return;
        }
        const { clueStep, lastSegment } = fivePlayerReplay;
        for (const segment of [clueStep, clueStep - 1, 0, 1]) {
          fivePlayerReplay.goTo(segment);
          await page.waitForTimeout(LEADER_MOVE_WAIT_MILLISECONDS);
        }
        fivePlayerReplay.goTo(lastSegment);
        await page.waitForTimeout(LEADER_SETTLE_MILLISECONDS);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      cleanup: async () => {
        fivePlayerReplay?.close();
        fivePlayerReplay = undefined;
      },
    },
    // A game that another account starts one play before a perfect score, which the account joins.
    // Its video shows the last play and the finale.
    {
      name: "new-ui-perfect-score",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        perfectScore = await showPerfectScore();
        const lobbyButton = page.getByRole("button", {
          name: "Lobby",
          exact: true,
        });
        if (await lobbyButton.isVisible()) {
          await lobbyButton.click();
        }
        await page.locator("#lobby").waitFor();
        // The "new-ui-game" state turns on "New UI", unless this state runs without it.
        await clickNav(page, "settings");
        if (!(await page.locator("#newUi").first().isChecked())) {
          // The checkbox itself is hidden behind its styled label.
          await page.locator('label[for="newUi"]').first().click();
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        // As in the "prism-unknown-rank" state, join from the row once it has settled.
        const row = page.locator("#lobby-games-table-tbody tr", {
          hasText: PERFECT_PLAYER_NAMES[0],
        });
        await row.waitFor();
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        await row.click({ force: true });
        await page.locator("#lobby-pregame").waitFor();
        const join = page.locator("#nav-buttons-pregame-join");
        if (await join.isVisible()) {
          await join.click();
          await page.waitForTimeout(SETTLE_MILLISECONDS);
        }
        await perfectScore.start();
        await page.locator("#lobby").waitFor({ state: "hidden" });
        await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
        await showNewUi(page);
      },
      record: async (page) => {
        await perfectScore?.playLast(page);
        await page.waitForTimeout(FINALE_MILLISECONDS);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      cleanup: async () => {
        perfectScore?.close();
        perfectScore = undefined;
      },
    },
    // A game on the classic screen that the account watches. Its video shows a stack that a play
    // completes, a lost card that lowers the maximum score, and three misplays, the last of which
    // ends the game.
    {
      name: "stack-signals",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await watchStackSignals(page, false);
      },
      record: async (page) => {
        await stackSignals?.play(page);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      cleanup: async () => {
        stackSignals?.close();
        stackSignals = undefined;
      },
    },
    // The same moves in the new game screen.
    {
      name: "new-ui-stack-signals",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await watchStackSignals(page, true);
      },
      record: async (page) => {
        await stackSignals?.play(page);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      cleanup: async () => {
        stackSignals?.close();
        stackSignals = undefined;
      },
    },
  ];

  /**
   * Has the accounts of the perfect game play it again at a new table, and makes the account watch
   * it in the classic or the new game screen.
   */
  async function watchStackSignals(page: Page, newUi: boolean) {
    const tableName = newUi
      ? STACK_SIGNALS_NEW_UI_TABLE_NAME
      : STACK_SIGNALS_TABLE_NAME;
    stackSignals = await showStackSignals(tableName);
    // The account can still watch the game of the previous state.
    const lobby = page.locator("#lobby");
    if (!(await lobby.isVisible())) {
      const lobbyButton = page.getByRole("button", {
        name: "Lobby",
        exact: true,
      });
      await ((await lobbyButton.isVisible())
        ? lobbyButton.click()
        : clickCanvasElement(page, ["lobbyButton"]));
    }
    await lobby.waitFor();
    // The "new-ui-game" state turns on "New UI".
    await clickNav(page, "settings");
    if ((await page.locator("#newUi").first().isChecked()) !== newUi) {
      // The checkbox itself is hidden behind its styled label.
      await page.locator('label[for="newUi"]').first().click();
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(SETTLE_MILLISECONDS);
    // As in the "prism-unknown-rank" state, spectate from the row once it has settled.
    const row = page.locator("#lobby-games-table-tbody tr", {
      hasText: tableName,
    });
    await row.waitFor();
    await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
    await row.click({ force: true });
    await (newUi
      ? page.locator('#game-new-ui [aria-label="Hands"]').waitFor()
      : page.waitForSelector(".konvajs-content"));
    await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
  }
}

/** Joins the first table, unless the account is already at one. */
async function joinTable(page: Page) {
  const pregame = page.locator("#lobby-pregame");
  // The row of the first table that can be joined animates, so it is never stable.
  const row = page.locator("#lobby-games-table-tbody tr").first();
  await pregame.or(row).filter({ visible: true }).first().waitFor();
  if (!(await pregame.isVisible())) {
    await row.click({ force: true });
  }
  await pregame.waitFor();
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

/** Plays one turn of a game between two players and ends it, so that it is saved. */
async function playGame(alice: Peer, bob: Peer): Promise<number> {
  alice.send("tableCreate", {
    settings: {
      name: "Seeded game",
      maxPlayers: DEFAULT_MAX_PLAYERS,
      options: {},
    },
  });
  const { tableId } = await alice.receive(
    "tableJoined",
    SERVER_EVENT_SCHEMAS.tableJoined,
  );
  bob.send("tableJoin", { tableId });
  await bob.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
  alice.send("tableStart", {
    tableId,
    intendedPlayerIds: [alice.userId, bob.userId],
  });
  const peers = [alice, bob];
  const games = await Promise.all(
    peers.map(async (peer) => {
      await peer.receive(
        "tableJoined",
        SERVER_EVENT_SCHEMAS.tableJoined,
        entersGame,
      );
      const init = await peer.request("gameInitLoad", { tableId });
      peer.send("gameStateLoad", { tableId });
      const history = await peer.receive(
        "gameState",
        SERVER_EVENT_SCHEMAS.gameState,
      );
      peer.send("gameLoaded", { tableId });
      return { peer, init, history };
    }),
  );
  const first = games.find((game) => ourPlayerIndex(game.init) === 0);
  assertDefined(first, "Neither player goes first.");
  const card = first.history.events.find(
    (action) => action.type === "draw" && action.playerIndex === 0,
  );
  if (card?.type !== "draw") {
    throw new Error("The first player has no cards.");
  }
  first.peer.send("playerAction", {
    tableId,
    action: { type: "play", order: card.order },
  });
  await first.peer.receive("gameEvent", SERVER_EVENT_SCHEMAS.gameEvent);
  alice.send("tableTerminate", { tableId });
  const finished = await alice.receive(
    "gameFinished",
    SERVER_EVENT_SCHEMAS.gameFinished,
  );
  assertDefined(finished.view.gameId, "The seeded game was not saved.");
  alice.send("tagAdd", { tableId, tag: TAG });
  // The players are now in a shared replay of the game. Leave it, or the browser would join it.
  for (const peer of peers) {
    peer.send("tableUnattend", { tableId });
  }
  await bob.receive(
    "tableRemoved",
    SERVER_EVENT_SCHEMAS.tableRemoved,
    (data) => data.tableId === tableId,
  );
  return finished.view.gameId;
}

/** A shared replay of a 5-player game that another account leads. */
interface FivePlayerReplay {
  /** The leader shows a segment to everyone in the replay. */
  readonly goTo: (segment: number) => void;
  /** A segment that shows a clue, right after another clue. */
  readonly clueStep: number;
  readonly lastSegment: number;
  /** Disconnects the leader. */
  readonly close: () => void;
}

/** A game, one play before a perfect score, that another account starts with the browser's. */
interface PerfectScore {
  /** Starts the game, once the browser's account has joined its table. */
  readonly start: () => Promise<void>;
  /** Makes the last play: the other account's, or the browser's account's, after `start`. */
  readonly playLast: (page: Page) => Promise<void>;
  /** Disconnects the other account. */
  readonly close: () => void;
}

/** A game that another account's teammates play, which the browser's account can watch. */
interface StackSignals {
  /** Completes a stack, loses a card that the team needs, and then strikes out. */
  readonly play: (page: Page) => Promise<void>;
  /** Disconnects the players. */
  readonly close: () => void;
}

interface Seed {
  readonly replayId: number;
  /** Starts the game at Bob's table, where the browser's account must be a player. */
  readonly startGame: () => Promise<void>;
  /** Ends the game at Bob's table, which turns it into a shared replay that Bob leads. */
  readonly endGame: () => Promise<void>;
  /** Makes the browser's account the leader of the shared replay at Bob's table. */
  readonly passLeader: () => void;
  /**
   * When it is his turn, Bob gives the browser's account a rank clue. The first clue touches its
   * newest card, and later clues miss that card. Returns that card, if Bob could give the clue.
   */
  readonly clueAccount: () => Promise<CardOrder | undefined>;
  /** Returns a card in the account's hand that the team can play now, or one that it cannot. */
  readonly findAccountCard: (
    playable: boolean,
  ) => Promise<CardOrder | undefined>;
  /** When it is his turn, Bob plays a card that the team can play. */
  readonly playBobCard: () => Promise<void>;
  /**
   * Has another account create a shared replay of a Prism game, start a hypothetical, and morph a
   * card to the Prism suit without a rank, before the browser joins. Returns a function that
   * disconnects the account.
   */
  readonly showPrismMorph: () => Promise<() => void>;
  /**
   * Has another account create a shared replay of a 5-player game and lead it, before the browser
   * joins.
   */
  readonly showFivePlayerReplay: () => Promise<FivePlayerReplay>;
  /**
   * Has two other accounts play a game to a perfect score. Then one of them opens a table that
   * deals the game again, one play before its end, for the browser's account to join.
   */
  readonly showPerfectScore: () => Promise<PerfectScore>;
  /**
   * Has the accounts of the perfect game play it again, from the play before one of its stacks is
   * complete, at a table that the browser's account can watch.
   */
  readonly showStackSignals: (tableName: string) => Promise<StackSignals>;
  /** Bob, as the leader of the shared replay at his table, shows a segment to everyone there. */
  readonly leaderGoTo: (segment: number) => void;
  /** The segment of the shared replay at Bob's table that shows the game's last clue. */
  readonly lastClueSegment: () => Promise<number>;
  readonly cookie: string;
  readonly peers: readonly Peer[];
}

/**
 * Saves a few games. Leaves another account at an open table that has options and a spectator, and
 * a bot online, so that the lobby shows a lobby chat message and the tabs of the online users list.
 */
async function seed(address: string): Promise<Seed> {
  let replayId = 0;
  // Each game gets new connections, so that the server's messages about one game cannot affect the
  // next.
  for (let i = 0; i < 3; i++) {
    const alice = await connect(address, USERNAME);
    const bob = await connect(address, "Bob");
    replayId = await playGame(alice, bob);
    alice.socket.close();
    bob.socket.close();
  }

  const bob = await connect(address, "Bob");
  bob.send("settings", {
    settings: { hGroupConventions: true, hGroupLevel: H_GROUP_LEVEL },
  });
  bob.send("tableCreate", {
    settings: {
      name: "Bob's table",
      maxPlayers: DEFAULT_MAX_PLAYERS,
      // A long variant name with six suits, so that the screens show how they fit both.
      options: {
        speedrun: true,
        deckPlays: true,
        variantId: getVariant(LONG_VARIANT_NAME).id,
      },
    },
  });
  const { tableId } = await bob.receive(
    "tableJoined",
    SERVER_EVENT_SCHEMAS.tableJoined,
  );
  bob.send("chat", { text: "Hello from the seeded lobby." });
  // More spectators than the game screen's chat header names, so that it offers to show the rest.
  const spectators: Peer[] = [];
  for (const name of SPECTATOR_NAMES) {
    const spectator = await connect(address, name);
    spectator.send("tableSpectate", { tableId });
    await spectator.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    spectators.push(spectator);
  }
  const bot = await connect(address, "Robot", true);

  let bobIndex: number | undefined;
  let clueTarget: { order: CardOrder; rank: ClueRank } | undefined;

  async function startGame() {
    bob.send("tableStart", {
      tableId,
      intendedPlayerIds: [bob.userId, cookieUserId(cookie)],
    });
    await bob.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
      entersGame,
    );
    const init = await bob.request("gameInitLoad", { tableId });
    bobIndex = ourPlayerIndex(init);
    bob.send("gameStateLoad", { tableId });
    const { events } = await bob.receive(
      "gameState",
      SERVER_EVENT_SCHEMAS.gameState,
    );
    bob.send("gameLoaded", { tableId });

    // When Bob goes first, he clues the newest card of the browser's account, so that its hand
    // shows a clued card.
    if (ourPlayerIndex(init) !== 0) {
      return;
    }
    const newest = events.findLast(
      (event) => event.type === "draw" && event.playerIndex !== 0,
    );
    if (newest?.type !== "draw") {
      return;
    }
    const rank = newest.identity?.rank;
    if (rank === undefined || rank === START_CARD_RANK) {
      return;
    }
    // A rank clue, since the variant's clue colors do not match its suits one to one.
    bob.send("playerAction", {
      tableId,
      action: {
        type: "clue",
        receiverIndex: newest.playerIndex,
        clue: { type: "rank", rank },
      },
    });
    await bob.receive("gameEvent", SERVER_EVENT_SCHEMAS.gameEvent);
  }

  // The browser logs in as Alice, with a session of its own.
  const cookie = await login(address, USERNAME);
  async function endGame() {
    bob.send("tableTerminate", { tableId });
    await bob.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished);
  }

  function passLeader() {
    bob.send("tableSetOwner", { tableId, userId: cookieUserId(cookie) });
  }

  function leaderGoTo(segment: number) {
    bob.send("replayAction", {
      tableId,
      action: {
        type: "turn",
        turn: segment,
      },
    });
  }

  /** Each move is a segment, so the move's position among the moves is the segment after it. */
  async function lastClueSegment() {
    const events = await loadEvents();
    const moves = events.filter(
      (event) =>
        event.type === "play"
        || event.type === "discard"
        || event.type === "misplay"
        || event.type === "clue",
    );
    const index = moves.findLastIndex((event) => event.type === "clue");
    if (index < 1) {
      throw new Error(
        "The game at Bob's table has no clue after its first move.",
      );
    }
    return index + 1;
  }

  /** The events of the game, as a peer sees them. A spectator sees every card. */
  async function loadEvents(peer: Peer = bob) {
    peer.send("gameStateLoad", { tableId });
    const { events } = await peer.receive(
      "gameState",
      SERVER_EVENT_SCHEMAS.gameState,
    );
    return events;
  }
  type GameEvents = Awaited<ReturnType<typeof loadEvents>>;

  function isBobsTurn(events: GameEvents) {
    const turn = events.findLast((event) => event.type === "turn");
    return turn?.type === "turn" && turn.currentPlayerIndex === bobIndex;
  }

  /** The account's last move reaches Bob on another connection, so this waits for his turn. */
  async function waitForBobsTurn() {
    let events = await loadEvents();
    for (
      let attempt = 1;
      attempt < MAX_TURN_CHECKS && !isBobsTurn(events);
      attempt++
    ) {
      await setTimeout(TURN_CHECK_MILLISECONDS);
      events = await loadEvents();
    }
    return events;
  }

  /**
   * Returns a card in a hand that the team can play now, or one that it cannot, from the events
   * that show it.
   */
  function findCard(
    events: GameEvents,
    inHand: (playerIndex: number) => boolean,
    playable: boolean,
  ): CardOrder | undefined {
    const variant = getVariant(LONG_VARIANT_NAME);
    const gone = new Set<CardOrder>();
    const stacks = new Map<number, number>();
    for (const event of events) {
      if (
        event.type === "play"
        || event.type === "discard"
        || event.type === "misplay"
      ) {
        gone.add(event.order);
      }
      if (event.type === "play" && event.identity !== undefined) {
        stacks.set(event.identity.suitIndex, event.identity.rank);
      }
    }
    for (const event of events) {
      if (
        event.type !== "draw"
        || !inHand(event.playerIndex)
        || gone.has(event.order)
        || event.identity === undefined
      ) {
        continue;
      }
      const { suitIndex, rank } = event.identity;
      // A play of a card of an inverted suit, such as orange, discards it instead.
      if (variant.suits[suitIndex]?.inverted === true) {
        continue;
      }
      if ((rank === (stacks.get(suitIndex) ?? 0) + 1) === playable) {
        return event.order;
      }
    }
    return undefined;
  }

  async function findAccountCard(
    playable: boolean,
  ): Promise<CardOrder | undefined> {
    return findCard(
      await loadEvents(),
      (playerIndex) => playerIndex !== bobIndex,
      playable,
    );
  }

  /** When it is his turn, Bob plays a card that the team can play. */
  async function playBobCard() {
    await waitForBobsTurn();
    // Bob does not see his own cards, but a spectator does.
    const spectator = spectators[0];
    assertDefined(spectator, "There is no spectator to see Bob's cards.");
    const order = findCard(
      await loadEvents(spectator),
      (playerIndex) => playerIndex === bobIndex,
      true,
    );
    assertDefined(order, "Bob has no card that the team can play.");
    bob.send("playerAction", { tableId, action: { type: "play", order } });
    await bob.receive(
      "gameEvent",
      SERVER_EVENT_SCHEMAS.gameEvent,
      (data) => data.event.type === "play" && data.event.order === order,
    );
  }

  async function clueAccount(): Promise<CardOrder | undefined> {
    const events = await waitForBobsTurn();

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
    const hand: Array<{
      order: CardOrder;
      rank: ClueRank;
      target: PlayerIndex;
    }> = [];
    for (const event of events) {
      if (
        event.type === "draw"
        && event.playerIndex !== bobIndex
        && !gone.has(event.order)
        && isValidClueRank(event.identity?.rank)
      ) {
        hand.push({
          order: event.order,
          rank: event.identity.rank,
          target: event.playerIndex,
        });
      }
    }
    let card: (typeof hand)[number] | undefined;
    if (clueTarget === undefined) {
      card = hand.at(-1);
      if (card !== undefined) {
        clueTarget = card;
      }
    } else {
      const { rank } = clueTarget;
      card = hand.find((other) => other.rank !== rank);
    }
    if (card === undefined) {
      return undefined;
    }
    bob.send("playerAction", {
      tableId,
      action: {
        type: "clue",
        receiverIndex: card.target,
        clue: { type: "rank", rank: card.rank },
      },
    });
    await bob.receive(
      "gameEvent",
      SERVER_EVENT_SCHEMAS.gameEvent,
      (data) =>
        data.event.type === "clue" && data.event.playerIndex === bobIndex,
    );
    return clueTarget?.order;
  }

  async function showPrismMorph() {
    const leader = await connect(address, PRISM_LEADER_NAME);
    leader.send("replayCreate", {
      source: {
        type: "imported",
        game: {
          // The account in the browser only watches, so it sees every card.
          playerNames: ["Bob", PRISM_LEADER_NAME],
          seed: SEED,
          options: { variantId: getVariant(PRISM_VARIANT_NAME).id },
        },
      },
      visibility: { type: "shared", joinExisting: false, spoilerFree: false },
    });
    const { tableId: replayTableId } = await leader.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
      entersGame,
    );
    await leader.request("gameInitLoad", { tableId: replayTableId });
    leader.send("gameLoaded", { tableId: replayTableId });
    leader.send("replayAction", {
      tableId: replayTableId,
      action: { type: "hypothetical", control: { type: "start" } },
    });
    await leader.receive(
      "replayAction",
      SERVER_EVENT_SCHEMAS.replayAction,
      (data) =>
        data.action.type === "hypothetical"
        && data.action.control.type === "start",
    );

    leader.send("replayAction", {
      tableId: replayTableId,
      action: {
        type: "hypothetical",
        control: {
          type: "event",
          event: {
            type: "morph",
            order: PRISM_MORPH_ORDER,
            identity: { suitIndex: PRISM_SUIT_INDEX },
          },
        },
      },
    });
    await leader.receive(
      "replayAction",
      SERVER_EVENT_SCHEMAS.replayAction,
      (data) =>
        data.action.type === "hypothetical"
        && data.action.control.type === "event",
    );

    return () => {
      leader.socket.close();
    };
  }

  async function showFivePlayerReplay(): Promise<FivePlayerReplay> {
    const { deck, actions, clueStep } = fivePlayerGame();
    const leader = await connect(address, FIVE_PLAYER_LEADER_NAME);
    leader.send("replayCreate", {
      source: {
        type: "imported",
        game: { playerNames: [...FIVE_PLAYER_NAMES], deck, actions },
      },
      visibility: { type: "shared", joinExisting: false, spoilerFree: false },
    });
    const { tableId: replayTableId } = await leader.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
      entersGame,
    );
    await leader.request("gameInitLoad", { tableId: replayTableId });
    leader.send("gameLoaded", { tableId: replayTableId });
    return {
      goTo: (segment) => {
        leader.send("replayAction", {
          tableId: replayTableId,
          action: { type: "turn", turn: segment },
        });
      },
      clueStep,
      lastSegment: actions.length,
      close: () => {
        leader.socket.close();
      },
    };
  }

  /** The cards that a set of events shows, by order. Each player sees the other's cards. */
  function cardIdentities(
    views: readonly GameEvents[],
  ): ReadonlyMap<CardOrder, { suitIndex: number; rank: number }> {
    const identities = new Map<
      CardOrder,
      { suitIndex: number; rank: number }
    >();
    for (const events of views) {
      for (const event of events) {
        if (
          (event.type === "draw"
            || event.type === "play"
            || event.type === "discard")
          && event.identity !== undefined
        ) {
          identities.set(event.order, event.identity);
        }
      }
    }
    return identities;
  }

  interface Seat {
    readonly peer: Peer;
    readonly index: number | undefined;
  }

  /** The events of a game, as each player sees them. */
  async function loadViews(
    seats: readonly Seat[],
    gameTableId: number,
  ): Promise<readonly GameEvents[]> {
    return await Promise.all(
      seats.map(async ({ peer }) => {
        peer.send("gameStateLoad", { tableId: gameTableId });
        const { events } = await peer.receive(
          "gameState",
          SERVER_EVENT_SCHEMAS.gameState,
        );
        return events;
      }),
    );
  }

  /**
   * The state of a game of `PERFECT_VARIANT_NAME` that two players see, where each sees the other's
   * cards. Returns undefined if the game is over.
   */
  function readGame(views: readonly GameEvents[]) {
    const variant = getVariant(PERFECT_VARIANT_NAME);
    const identities = cardIdentities(views);
    const [events] = views;
    assertDefined(events, "There are no events.");
    const hands = new Map<number, CardOrder[]>();
    const stacks = variant.suits.map(() => 0);
    const discarded = new Map<string, number>();
    let clues = MAX_CLUES;
    // The first seat goes first. A turn event comes only after the first move.
    let turn = { turn: 0, currentPlayerIndex: 0 };
    for (const event of events) {
      switch (event.type) {
        case "draw": {
          hands.set(event.playerIndex, [
            ...(hands.get(event.playerIndex) ?? []),
            event.order,
          ]);
          break;
        }

        case "play":
        case "discard":
        case "misplay": {
          hands.set(
            event.playerIndex,
            (hands.get(event.playerIndex) ?? []).filter(
              (order) => order !== event.order,
            ),
          );
          const identity = identities.get(event.order);
          if (identity === undefined) {
            break;
          }
          if (event.type === "play") {
            stacks[identity.suitIndex] = identity.rank;
            if (identity.rank === variant.stackSize && clues < MAX_CLUES) {
              clues++;
            }
          } else {
            const key = `${identity.suitIndex}-${identity.rank}`;
            discarded.set(key, (discarded.get(key) ?? 0) + 1);
            if (event.type === "discard") {
              clues++;
            }
          }
          break;
        }

        case "clue": {
          clues--;
          break;
        }

        case "turn": {
          if (event.currentPlayerIndex !== undefined) {
            turn = {
              turn: event.turn,
              currentPlayerIndex: event.currentPlayerIndex,
            };
          }
          break;
        }

        case "gameOver": {
          return undefined;
        }

        default: {
          break;
        }
      }
    }

    function identityOf(order: CardOrder) {
      const identity = identities.get(order);
      assertDefined(identity, `No player sees card ${order}.`);
      return identity;
    }

    /** Whether the team needs a card, and has no other copy of it. */
    function isCritical(order: CardOrder) {
      const { suitIndex, rank } = identityOf(order);
      const lost = discarded.get(`${suitIndex}-${rank}`) ?? 0;
      return (
        rank > (stacks[suitIndex] ?? 0) && numCopies(rank as Rank) - lost === 1
      );
    }

    function isPlayable(order: CardOrder) {
      const { suitIndex, rank } = identityOf(order);
      return stacks[suitIndex] === rank - 1;
    }
    const player = turn.currentPlayerIndex;
    const receiverIndex = hands.keys().find((index) => index !== player);
    assertDefined(receiverIndex, "There is no other player.");
    return {
      variant,
      hands,
      stacks,
      discarded,
      clues,
      strikes: events.filter((event) => event.type === "misplay").length,
      turn: turn.turn,
      player,
      hand: hands.get(player) ?? [],
      receiverIndex: receiverIndex as PlayerIndex,
      identityOf,
      isCritical,
      isPlayable,
    };
  }
  type Game = NonNullable<ReturnType<typeof readGame>>;

  /** A rank clue from the player whose turn it is to the other player, about their first card. */
  function rankClue(game: Game) {
    const [first] = game.hands.get(game.receiverIndex) ?? [];
    assertDefined(first, `Player ${game.receiverIndex} has no cards.`);
    return {
      type: "clue" as const,
      receiverIndex: game.receiverIndex,
      clue: {
        type: "rank" as const,
        rank: game.identityOf(first).rank as ClueRank,
      },
    };
  }

  /**
   * The next move of a player who knows every card in the hands: a play if they can, or else a rank
   * clue to the other player, or else a discard of a card that the team does not need. Returns
   * undefined if every card would be needed, or if the game is over.
   */
  function perfectGameMove(views: readonly GameEvents[]) {
    const game = readGame(views);
    if (game === undefined) {
      return undefined;
    }
    const {
      variant,
      hands,
      stacks,
      discarded,
      clues,
      player,
      hand,
      identityOf,
      isPlayable,
    } = game;
    const score = stacks.reduce((sum, rank) => sum + rank, 0);

    const playable = hand.find((order) => isPlayable(order));
    if (playable !== undefined) {
      return {
        player,
        turn: game.turn,
        action: { type: "play" as const, order: playable },
        rank: identityOf(playable).rank,
        last: score + 1 === variant.maxScore,
      };
    }

    if (clues > 0) {
      return {
        player,
        turn: game.turn,
        action: rankClue(game),
        rank: undefined,
        last: false,
      };
    }

    // A card that is already played, or one with another copy in the hands, or else one with
    // another copy that is not discarded.
    const inHands = [...hands.values()].flat();
    function sameCards(order: CardOrder) {
      const { suitIndex, rank } = identityOf(order);
      return inHands.filter((other) => {
        const identity = identityOf(other);
        return identity.suitIndex === suitIndex && identity.rank === rank;
      }).length;
    }
    const discard =
      hand.find((order) => {
        const { suitIndex, rank } = identityOf(order);
        return rank <= (stacks[suitIndex] ?? 0);
      })
      ?? hand.find((order) => sameCards(order) > 1)
      ?? hand.find((order) => {
        const { suitIndex, rank } = identityOf(order);
        const lost = discarded.get(`${suitIndex}-${rank}`) ?? 0;
        return numCopies(rank as Rank) - lost > 1;
      });
    if (discard === undefined) {
      return undefined;
    }
    return {
      player,
      turn: game.turn,
      action: { type: "discard" as const, order: discard },
      rank: undefined,
      last: false,
    };
  }

  /**
   * Plays a game of a seed, until it ends with a perfect score. Returns the game, the turn of its
   * last play, the player who made it, and the card, or undefined if the players could not get a
   * perfect score.
   */
  async function playPerfectGame(suffix: string) {
    const players = await Promise.all(
      PERFECT_PLAYER_NAMES.map(async (name) => await connect(address, name)),
    );
    const [owner, other] = players;
    assertDefined(owner, "There is no owner.");
    assertDefined(other, "There is no other player.");
    owner.send("tableCreate", {
      settings: {
        name: "Perfect game",
        maxPlayers: DEFAULT_MAX_PLAYERS,
        options: { variantId: getVariant(PERFECT_VARIANT_NAME).id },
        deal: { type: "seed", suffix },
      },
    });
    const { tableId: perfectTableId } = await owner.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
    );
    other.send("tableJoin", { tableId: perfectTableId });
    await other.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    owner.send("tableStart", {
      tableId: perfectTableId,
      intendedPlayerIds: players.map((peer) => peer.userId),
    });
    const seats = await Promise.all(
      players.map(async (peer) => {
        await peer.receive(
          "tableJoined",
          SERVER_EVENT_SCHEMAS.tableJoined,
          entersGame,
        );
        const init = await peer.request("gameInitLoad", {
          tableId: perfectTableId,
        });
        peer.send("gameStateLoad", { tableId: perfectTableId });
        await peer.receive("gameState", SERVER_EVENT_SCHEMAS.gameState);
        peer.send("gameLoaded", { tableId: perfectTableId });
        return { peer, index: ourPlayerIndex(init) };
      }),
    );

    interface Play {
      readonly turn: number;
      readonly player: number;
      readonly order: CardOrder;
    }
    let result: { gameId: number; last: Play; stackDone: Play } | undefined;
    // The first play that completes a stack, before the last play.
    let stackDone: Play | undefined;
    for (let move = 0; move < MAX_PERFECT_MOVES; move++) {
      const next = perfectGameMove(await loadViews(seats, perfectTableId));
      if (next === undefined) {
        break;
      }
      const seat = seats.find(({ index }) => index === next.player);
      assertDefined(seat, `No account sits in seat ${next.player}.`);
      seat.peer.send("playerAction", {
        tableId: perfectTableId,
        action: next.action,
      });
      if (next.action.type === "play") {
        const play = {
          turn: next.turn,
          player: next.player,
          order: next.action.order,
        };
        if (next.last) {
          const finished = await seat.peer.receive(
            "gameFinished",
            SERVER_EVENT_SCHEMAS.gameFinished,
          );
          assertDefined(
            finished.view.gameId,
            "The perfect game was not saved.",
          );
          if (stackDone !== undefined) {
            result = { gameId: finished.view.gameId, last: play, stackDone };
          }
          break;
        }
        if (next.rank === getVariant(PERFECT_VARIANT_NAME).stackSize) {
          stackDone ??= play;
        }
      }
      await seat.peer.receive(
        "gameEvent",
        SERVER_EVENT_SCHEMAS.gameEvent,
        // Each move starts the next turn. The events of earlier moves can still be waiting.
        (data) =>
          data.event.type === "turn" && data.event.turn === next.turn + 1,
      );
    }

    if (result === undefined && stackDone === undefined) {
      owner.send("tableTerminate", { tableId: perfectTableId });
      await owner.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished);
    }
    // The players are now in a shared replay of the game. Leave it, so that it closes.
    for (const { peer } of seats) {
      peer.send("tableUnattend", { tableId: perfectTableId });
    }
    await owner.receive(
      "tableRemoved",
      SERVER_EVENT_SCHEMAS.tableRemoved,
      (data) => data.tableId === perfectTableId,
    );
    for (const peer of players) {
      peer.socket.close();
    }
    return result;
  }

  let perfectGame: ReturnType<typeof findPerfectGame> | undefined;

  /** Plays seeds until a game ends with a perfect score. */
  async function findPerfectGame() {
    for (let suffix = 1; suffix <= MAX_PERFECT_SEEDS; suffix++) {
      const game = await playPerfectGame(suffix.toString());
      if (game !== undefined) {
        return game;
      }
    }
    throw new Error(
      `No seed of the first ${MAX_PERFECT_SEEDS} gives a perfect score.`,
    );
  }

  async function showPerfectScore(): Promise<PerfectScore> {
    perfectGame ??= findPerfectGame();
    const { gameId, last } = await perfectGame;
    const { turn, player, order } = last;

    const [ownerName] = PERFECT_PLAYER_NAMES;
    const owner = await connect(address, ownerName);
    owner.send("tableCreate", {
      settings: {
        name: "Perfect score",
        maxPlayers: DEFAULT_MAX_PLAYERS,
        options: {},
        deal: { type: "replay", gameId, turn },
      },
    });
    const { tableId: ownerTableId } = await owner.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
    );

    let ownerIndex: number | undefined;
    async function start() {
      owner.send("tableStart", {
        tableId: ownerTableId,
        intendedPlayerIds: [owner.userId, cookieUserId(cookie)],
      });
      await owner.receive(
        "tableJoined",
        SERVER_EVENT_SCHEMAS.tableJoined,
        entersGame,
      );
      const init = await owner.request("gameInitLoad", {
        tableId: ownerTableId,
      });
      ownerIndex = ourPlayerIndex(init);
      owner.send("gameStateLoad", { tableId: ownerTableId });
      await owner.receive("gameState", SERVER_EVENT_SCHEMAS.gameState);
      owner.send("gameLoaded", { tableId: ownerTableId });
    }

    async function playLast(page: Page) {
      if (ownerIndex !== player) {
        await playAccountCard(page, order);
        return;
      }
      owner.send("playerAction", {
        tableId: ownerTableId,
        action: { type: "play", order },
      });
      await owner.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished);
    }

    return {
      start,
      playLast,
      close: () => {
        owner.socket.close();
      },
    };
  }

  /**
   * Has the two accounts of the perfect game play it again, from the play before a stack is
   * complete, at a table that the browser's account can watch. `play` completes the stack, then
   * loses a card that the team needs, then misplays three times, which ends the game.
   */
  async function showStackSignals(tableName: string): Promise<StackSignals> {
    perfectGame ??= findPerfectGame();
    const { gameId, stackDone } = await perfectGame;
    const players = await Promise.all(
      PERFECT_PLAYER_NAMES.map(async (name) => await connect(address, name)),
    );
    const [owner, other] = players;
    assertDefined(owner, "There is no owner.");
    assertDefined(other, "There is no other player.");
    owner.send("tableCreate", {
      settings: {
        name: tableName,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        options: {},
        deal: { type: "replay", gameId, turn: stackDone.turn },
      },
    });
    const { tableId: signalsTableId } = await owner.receive(
      "tableJoined",
      SERVER_EVENT_SCHEMAS.tableJoined,
    );
    other.send("tableJoin", { tableId: signalsTableId });
    await other.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
    owner.send("tableStart", {
      tableId: signalsTableId,
      intendedPlayerIds: players.map((peer) => peer.userId),
    });
    const seats = await Promise.all(
      players.map(async (peer) => {
        await peer.receive(
          "tableJoined",
          SERVER_EVENT_SCHEMAS.tableJoined,
          entersGame,
        );
        const init = await peer.request("gameInitLoad", {
          tableId: signalsTableId,
        });
        peer.send("gameStateLoad", { tableId: signalsTableId });
        await peer.receive("gameState", SERVER_EVENT_SCHEMAS.gameState);
        peer.send("gameLoaded", { tableId: signalsTableId });
        return { peer, index: ourPlayerIndex(init) };
      }),
    );

    async function readSignalsGame() {
      const game = readGame(await loadViews(seats, signalsTableId));
      assertDefined(game, "The game ended too soon.");
      return game;
    }

    /** Makes a move for the player whose turn it is, and waits until the server has made it. */
    async function move(
      game: Game,
      action: z.input<typeof playerActionRequestSchema>["action"],
      endsGame = false,
    ) {
      const seat = seats.find(({ index }) => index === game.player);
      assertDefined(seat, `No account sits in seat ${game.player}.`);
      seat.peer.send("playerAction", { tableId: signalsTableId, action });
      await (endsGame
        ? seat.peer.receive("gameFinished", SERVER_EVENT_SCHEMAS.gameFinished)
        : seat.peer.receive(
            "gameEvent",
            SERVER_EVENT_SCHEMAS.gameEvent,
            (data) =>
              data.event.type === "turn" && data.event.turn === game.turn + 1,
          ));
    }

    async function play(page: Page) {
      // The play completes a stack.
      await move(await readSignalsGame(), {
        type: "play",
        order: stackDone.order,
      });
      await page.waitForTimeout(SIGNAL_MILLISECONDS);

      // A card that the team needs is lost, which lowers the maximum score. Until a player has one,
      // and the team has a clue to get back, the players give clues and discard other cards.
      for (let i = 0; i < MAX_PERFECT_MOVES; i++) {
        const game = await readSignalsGame();
        const critical = game.hand.find((order) => game.isCritical(order));
        if (critical !== undefined && game.clues < MAX_CLUES) {
          await move(game, { type: "discard", order: critical });
          break;
        }
        const trash = game.hand.find((order) => !game.isCritical(order));
        await move(
          game,
          game.clues > 0 || trash === undefined
            ? rankClue(game)
            : { type: "discard", order: trash },
        );
      }
      await page.waitForTimeout(SIGNAL_MILLISECONDS);

      // Three misplays end the game.
      for (let i = 0; i < MAX_PERFECT_MOVES; i++) {
        const game = await readSignalsGame();
        const unplayable = game.hand.filter((order) => !game.isPlayable(order));
        const order =
          unplayable.find((card) => !game.isCritical(card)) ?? unplayable[0];
        assertDefined(order, `Player ${game.player} has no card to misplay.`);
        const last = game.strikes === MAX_STRIKES - 1;
        await move(game, { type: "play", order }, last);
        await page.waitForTimeout(SIGNAL_MILLISECONDS);
        if (last) {
          break;
        }
      }
    }

    return {
      play,
      close: () => {
        for (const peer of players) {
          peer.socket.close();
        }
      },
    };
  }

  return {
    showFivePlayerReplay,
    showPerfectScore,
    showStackSignals,
    replayId,
    startGame,
    endGame,
    passLeader,
    clueAccount,
    findAccountCard,
    playBobCard,
    showPrismMorph,
    leaderGoTo,
    lastClueSegment,
    cookie,
    peers: [bob, ...spectators, bot],
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

/**
 * Runs in the page. Every selector of the CSS bundle, and the ones that match an element now, each
 * after the condition of its media query. User actions (such as hovering) and pseudo-elements are
 * left out of the match, so that a selector counts when the element that it styles exists.
 */
function getSelectors(): {
  readonly all: readonly string[];
  readonly matched: readonly string[];
} {
  const sheet = [...document.styleSheets].find(
    (stylesheet) =>
      stylesheet.ownerNode instanceof HTMLLinkElement
      && stylesheet.ownerNode.id === "ui-screenshots-stylesheet",
  );
  if (sheet === undefined) {
    throw new Error("The CSS bundle is not loaded.");
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping -- This runs in the page.
  function splitSelectors(selectorText: string): readonly string[] {
    const selectors: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selectorText.length; i++) {
      const character = selectorText.charAt(i);
      if (character === "(") {
        depth++;
      } else if (character === ")") {
        depth--;
      } else if (character === "," && depth === 0) {
        selectors.push(selectorText.slice(start, i).trim());
        start = i + 1;
      }
    }
    selectors.push(selectorText.slice(start).trim());
    return selectors;
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping -- This runs in the page.
  function matches(selector: string): boolean {
    const elementSelector = selector
      .replaceAll(/::?(?:after|before)\b|::[\w-]+/gu, "")
      .replaceAll(
        /:(?:hover|active|focus|focus-visible|focus-within|popover-open)\b/gu,
        "",
      )
      .trim();
    try {
      return (
        document.querySelector(elementSelector === "" ? "*" : elementSelector)
        !== null
      );
    } catch {
      return false;
    }
  }

  const all: string[] = [];
  const matched: string[] = [];
  function visit(rules: CSSRuleList, condition: string, active: boolean) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const selector of splitSelectors(rule.selectorText)) {
          all.push(`${condition}${selector}`);
          if (active && matches(selector)) {
            matched.push(`${condition}${selector}`);
          }
        }
      } else if (rule instanceof CSSMediaRule) {
        visit(
          rule.cssRules,
          `@media ${rule.conditionText} `,
          active && globalThis.matchMedia(rule.conditionText).matches,
        );
      } else if (rule instanceof CSSLayerBlockRule) {
        visit(rule.cssRules, condition, active);
      }
    }
  }
  visit(sheet.cssRules, "", true);
  return { all, matched };
}

interface Options {
  readonly states: readonly string[];
  readonly widths: readonly number[];
  readonly themes: readonly Theme[];
  readonly compare: string | undefined;
  readonly coverage: boolean;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      state: { type: "string", multiple: true },
      width: { type: "string", multiple: true },
      theme: { type: "string" },
      compare: { type: "string" },
      coverage: { type: "boolean" },
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
    coverage: values.coverage ?? false,
  };
}

interface Results {
  /** The lines of the comparison report. */
  readonly comparison: string[];
  readonly allSelectors: Set<string>;
  readonly matchedSelectors: Set<string>;
  readonly errors: string[];
}

async function capture(
  context: BrowserContext,
  address: string,
  states: readonly State[],
  options: Options,
  compareBundle: string | undefined,
  results: Results,
) {
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    results.errors.push(error.message);
  });
  if (compareBundle !== undefined) {
    await page.route(`**${COMPARE_BUNDLE_PATH}`, async (route) => {
      await route.fulfill({ contentType: "text/css", body: compareBundle });
    });
  }

  const bundleHref = `/public/css/${BUNDLE_FILENAME}`;
  const sizes = SIZES.filter(
    (size) =>
      options.widths.length === 0 || options.widths.includes(size.width),
  );

  for (const state of states) {
    await page.setViewportSize(SETUP_SIZE);
    const response = await page.goto(`${address}${state.path}`);
    if (response === null || !response.ok()) {
      throw new Error(
        `Failed to load "${state.path}" (HTTP ${String(response?.status())}).`,
      );
    }
    // The critical CSS is a copy of some of the bundle's rules, so leave it out. Otherwise, it
    // would hide the rules that only it applies.
    await page.evaluate(useStylesheet, bundleHref);
    await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
    // The server shows a tutorial to accounts that were created a few seconds ago.
    const skipTutorial = page.locator("#tutorial-no");
    if (await skipTutorial.isVisible()) {
      await skipTutorial.click();
      await page.waitForTimeout(SETTLE_MILLISECONDS * 2);
    }
    await state.prepare?.(page);
    if (state.record !== undefined) {
      const video = path.join(OUTPUT_DIRECTORY, `${state.name}.webm`);
      await page.screencast.start({ path: video, size: SETUP_SIZE });
      await state.record(page);
      await page.screencast.stop();
    }
    // Keep the pointer off of the page, so that no element shows its hover style.
    await page.mouse.move(0, SETUP_SIZE.height - 1);
    await page.waitForTimeout(SETTLE_MILLISECONDS);

    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const theme of options.themes) {
        await page.evaluate(setTheme, theme);
        if (state.hover !== undefined) {
          // Move the pointer onto the element again, so that a tooltip opens at its new position.
          await page.mouse.move(0, size.height - 1);
          await (typeof state.hover === "string"
            ? page.hover(state.hover)
            : state.hover(page));
        }
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        const file = path.join(
          OUTPUT_DIRECTORY,
          `${state.name}-${size.width}-${theme}`,
        );
        await page.screenshot({ path: `${file}.png` });

        if (options.coverage) {
          const { all, matched } = await page.evaluate(getSelectors);
          for (const selector of all) {
            results.allSelectors.add(selector);
          }
          for (const selector of matched) {
            results.matchedSelectors.add(selector);
          }
        }

        if (compareBundle !== undefined) {
          // A difference counts only if it shows twice, because a page can still change on its own
          // (for example, when the server sends an update).
          let differences: readonly string[] | undefined;
          for (let i = 0; i < 2 && differences?.length !== 0; i++) {
            await page.evaluate(compareStyles, false);
            await page.evaluate(useStylesheet, COMPARE_BUNDLE_PATH);
            await page.waitForTimeout(SETTLE_MILLISECONDS);
            const found = await page.evaluate(compareStyles, true);
            if (found.length > 0) {
              await page.screenshot({ path: `${file}.compare.png` });
            }
            differences =
              differences === undefined
                ? found
                : differences.filter((line) => found.includes(line));
            await page.evaluate(useStylesheet, bundleHref);
            await page.waitForTimeout(SETTLE_MILLISECONDS);
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
    console.info(`Captured: ${state.name}`);
  }

  await page.close();
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

  if (options.coverage) {
    const unused = [...results.allSelectors].filter(
      (selector) => !results.matchedSelectors.has(selector),
    );
    const report = path.join(OUTPUT_DIRECTORY, "unused-selectors.txt");
    await writeFile(
      report,
      [
        "# Selectors of the CSS bundle that matched no element in any state. States that the",
        "# script does not visit (such as modals and error messages) can still use them.",
        ...unused,
      ].join("\n"),
    );
    console.info(`${unused.length} selectors matched nothing: ${report}`);
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

    seeded = await seed(localAddress);
    const states = getStates(seeded).filter(
      (state) =>
        options.states.length === 0 || options.states.includes(state.name),
    );
    const unknown = options.states.filter((name) =>
      states.every((state) => state.name !== name),
    );
    if (unknown.length > 0) {
      throw new Error(
        `Unknown states: ${unknown.join(", ")}. The states are: ${getStates(
          seeded,
        )
          .map((state) => state.name)
          .join(", ")}`,
      );
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
    const [name = "", value] = seeded.cookie.split("=", 2);
    assertDefined(value, "The session cookie has no value.");
    const contexts = {
      loggedOut: await browser.newContext({ colorScheme: "light" }),
      // Without the permission, the lobby shows a modal that asks for it.
      loggedIn: await browser.newContext({
        colorScheme: "light",
        permissions: ["notifications"],
      }),
    };
    await contexts.loggedIn.addCookies([
      { name, value, domain: DOMAIN, path: "/" },
    ]);
    const results: Results = {
      comparison: [],
      allSelectors: new Set(),
      matchedSelectors: new Set(),
      errors: [],
    };
    await capture(
      contexts.loggedOut,
      address,
      states.filter((state) => !state.loggedIn),
      options,
      compareBundle,
      results,
    );
    await capture(
      contexts.loggedIn,
      address,
      states.filter((state) => state.loggedIn),
      options,
      compareBundle,
      results,
    );
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

/**
 * A 5-player game of No Variant with a deck in rank order, so that the first hands hold the 1s. On
 * each turn, the player plays a card that the team can play, or else clues the next player about
 * the rank of their first card, or else discards their first card. Also returns a segment that
 * shows a clue right after another clue.
 */
function fivePlayerGame() {
  const variant = getVariant(DEFAULT_VARIANT_NAME);
  const deck: Array<{ suitIndex: SuitIndex; rank: Rank }> = [];
  for (const rank of variant.ranks) {
    for (let copy = 0; copy < numCopies(rank); copy++) {
      for (const suitIndex of variant.suits.keys()) {
        deck.push({ suitIndex: suitIndex as SuitIndex, rank });
      }
    }
  }
  function cardAt(order: number) {
    const card = deck[order];
    assertDefined(card, `The deck has no card ${order}.`);
    return card;
  }

  const numPlayers = FIVE_PLAYER_NAMES.length;
  const hands: number[][] = Array.from(
    { length: numPlayers },
    (_hand, player) =>
      Array.from(
        { length: FIVE_PLAYER_HAND_SIZE },
        (_card, slot) => player * FIVE_PLAYER_HAND_SIZE + slot,
      ),
  );
  // A player's hand, which the game changes as its player plays, discards, and draws.
  // eslint-disable-next-line complete/no-mutable-return
  function handOf(player: number): number[] {
    const hand = hands[player];
    assertDefined(hand, `There is no player ${player}.`);
    return hand;
  }
  let nextCard = numPlayers * FIVE_PLAYER_HAND_SIZE;
  const stacks = variant.suits.map(() => 0);
  let clues = MAX_CLUES;
  const actions: Array<
    NonNullable<z.input<typeof replayGameSchema>["actions"]>[number]
  > = [];
  let clueStep: number | undefined;

  for (let turn = 0; turn < FIVE_PLAYER_NUM_MOVES; turn++) {
    const player = turn % numPlayers;
    const hand = handOf(player);
    const playable = hand.find((order) => {
      const { suitIndex, rank } = cardAt(order);
      return stacks[suitIndex] === rank - 1;
    });
    if (playable !== undefined) {
      const { suitIndex, rank } = cardAt(playable);
      stacks[suitIndex] = rank;
      hand.splice(hand.indexOf(playable), 1);
      actions.push({ type: "play", order: playable });
    } else if (clues > 0) {
      const receiver = (player + 1) % numPlayers;
      const [first] = handOf(receiver);
      assertDefined(first, `Player ${receiver} has no cards.`);
      clues--;
      actions.push({
        type: "clue",
        receiverIndex: receiver as PlayerIndex,
        clue: { type: "rank", rank: cardAt(first).rank as ClueRank },
      });
      if (clueStep === undefined && actions.at(-2)?.type === "clue") {
        clueStep = actions.length;
      }
      continue;
    } else {
      const order = hand.shift();
      assertDefined(order, `Player ${player} has no cards.`);
      clues++;
      actions.push({ type: "discard", order });
    }
    if (nextCard < deck.length) {
      hand.push(nextCard);
      nextCard++;
    }
  }

  if (clueStep === undefined) {
    throw new Error("The 5-player game has no two clues in a row.");
  }
  return { deck, actions, clueStep };
}

/** How many copies of a rank each suit of No Variant has. */
function numCopies(rank: Rank): number {
  if (rank === 1) {
    return 3;
  }
  return rank === MAX_RANK ? 1 : 2;
}
