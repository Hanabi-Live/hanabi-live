// Takes screenshots of the site's screens at several widths in both themes. It starts this
// checkout's server with a disposable database and seeds it through the client protocol, so that
// every run sees the same pages. Run it through "runTests.ts", which provides the database and
// builds the server and the client: `bun run ui-screenshots [options]`.

// Options:
// - `--state <name>`: Only this state. Repeat it for more than one. A state of Bob's game first
//   runs the states of that game before it, without screenshots.
// - `--width <pixels>`: Only this width. Repeat it for more than one.
// - `--theme <light|dark>`: Only this theme.
// - `--compare <git ref>`: Also report every computed style that differs from the stylesheets of
//   that ref, and take a screenshot with them wherever a difference shows.

// A state with a `record` step also saves a video of that step, at the first width, such as
// "new-ui-play.webm".

/* eslint-disable no-await-in-loop -- The browser visits the states one at a time. */

import type { UserId } from "@hanabi-live/data";
import {
  DEFAULT_MAX_PLAYERS,
  MAX_CHAT_LENGTH,
  SERVER_EVENT_SCHEMAS,
  VERSION,
} from "@hanabi-live/data";
import type { CardOrder, ClueRank, PlayerIndex } from "@hanabi-live/game";
import {
  getVariant,
  isValidClueRank,
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

/** Cards of the account's own hand, and the cards on the play stacks and in the discards. */
const OWN_FIRST_CARD_SELECTOR = '#game-new-ui [data-card-place="hand-0-0"]';
const OWN_SECOND_CARD_SELECTOR = '#game-new-ui [data-card-place="hand-0-1"]';
const STACK_CARD_SELECTOR = "#game-new-ui [data-play-stack]";
const DISCARD_CARD_SELECTOR = '#game-new-ui [data-card-place^="discard-"]';

/** Replaces the note on a card of the New UI, or deletes it with empty text. */
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

/** Clears the chosen clue in the New UI. */
async function clearClue(page: Page) {
  await page
    .locator(
      '#game-new-ui [aria-label="Give a clue"] button[aria-pressed="true"]',
    )
    .click();
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

/** The tag that the seeded games have, for the tagged games pages. */
const TAG = "layered finesse";

/** The accounts that watch the open table. */
const SPECTATOR_NAMES = ["Carol", "Dave", "Erin", "Frank"] as const;

/** The variant of the open table. */
const LONG_VARIANT_NAME = "Rainbow-Ones & Orange (6 Suits)";

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
  /**
   * Whether the state shows Bob's game, which the states before it move along. When `--state`
   * leaves out those states, the tool still runs their steps, without screenshots, so that the game
   * is the same as in a full run.
   */
  readonly bobsGame?: boolean;
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
  identityNote,
  leaderGoTo,
  lastClueSegment,
}: Pick<
  Seed,
  | "replayId"
  | "startGame"
  | "endGame"
  | "passLeader"
  | "clueAccount"
  | "findAccountCard"
  | "playBobCard"
  | "identityNote"
  | "leaderGoTo"
  | "lastClueSegment"
>): readonly State[] {
  // The card in the account's hand that the clue log shows the clues about.
  let cluedCard: CardOrder | undefined;

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
        await page.waitForTimeout(SETTLE_MILLISECONDS);
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
    // Joining a table keeps the account in it, so these states come last.
    { name: "pregame", path: "/", loggedIn: true, prepare: joinTable },
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
    // Starting the game ends the pregame, so this state comes after the pregame states.
    {
      name: "new-ui-game",
      path: "/",
      loggedIn: true,
      bobsGame: true,
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
    // The game from the previous state, with a clue chosen, so that "Give clue" can be pressed.
    {
      name: "new-ui-clue-chosen",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      // Clicking the clue again clears the choice.
      prepare: async (page) => {
        await clickRankOneClue(page);
      },
      cleanup: async (page) => {
        await clickRankOneClue(page);
      },
    },
    // The game from the previous state, with a clue chosen that touches no cards in Bob's hand, so
    // that "Give clue" says why it cannot be pressed.
    {
      name: "new-ui-clue-touches-nothing",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      prepare: async (page) => {
        await chooseClueThatTouchesNothing(page);
      },
      cleanup: async (page) => {
        await clearClue(page);
      },
    },
    // The game from the previous state, after the account plays a card that it does not know. Its
    // video shows the play.
    {
      name: "new-ui-play",
      path: "/",
      loggedIn: true,
      bobsGame: true,
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
      bobsGame: true,
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
      bobsGame: true,
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
      bobsGame: true,
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
      bobsGame: true,
      hover: '#game-new-ui [aria-label^="About efficiency"]',
    },
    // The same game, while the account types a note on the first card of the next player's hand.
    {
      name: "new-ui-note-editor",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      prepare: async (page) => {
        await page
          .locator('#game-new-ui [data-card-place="hand-1-0"]')
          .click({ button: "right" });
        await page.keyboard.type("r1 maybe :D");
      },
      // Save the note, for the next state.
      cleanup: async (page) => {
        await page.keyboard.press("Enter");
      },
    },
    // The same game, after the account writes a note on the first card of its own hand that makes
    // it show as its real identity, which the clues always allow, so that its badge shows a pencil.
    // Other notes are on its second card and on a discarded card. The pointer is over the first
    // card.
    {
      name: "new-ui-note-tooltip",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      prepare: async (page) => {
        const first = page.locator(OWN_FIRST_CARD_SELECTOR);
        const order = Number(await first.getAttribute("data-card-order"));
        await writeNote(page, first, await identityNote(order as CardOrder));
        await writeNote(page, page.locator(OWN_SECOND_CARD_SELECTOR), "chop?");
        await writeNote(
          page,
          page.locator(DISCARD_CARD_SELECTOR).first(),
          "misplayed",
        );
      },
      hover: async (page) => {
        await page.locator(OWN_FIRST_CARD_SELECTOR).hover();
        await page.waitForTimeout(TOOLTIP_WAIT_MILLISECONDS);
      },
      // Delete the notes.
      cleanup: async (page) => {
        for (const card of [
          page.locator(OWN_FIRST_CARD_SELECTOR),
          page.locator(OWN_SECOND_CARD_SELECTOR),
          page.locator('#game-new-ui [data-card-place="hand-1-0"]'),
          page.locator(STACK_CARD_SELECTOR).first(),
          page.locator(DISCARD_CARD_SELECTOR).first(),
        ]) {
          await writeNote(page, card, "");
        }
      },
    },
    // The same game, with the menu of the "End game" button open.
    {
      name: "new-ui-end-game-menu",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      prepare: async (page) => {
        await page
          .getByRole("button", { name: "End game", exact: true })
          .click();
      },
    },
    // The same game, after the account switches to the classic screen.
    {
      name: "new-ui-classic",
      path: "/",
      loggedIn: true,
      bobsGame: true,
      prepare: async (page) => {
        await page.getByRole("button", { name: "Classic view" }).click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
    // The same game, with the classic screen's chat window open and a message with an emote and a
    // link in it.
    {
      name: "classic-game-chat",
      path: "/",
      loggedIn: true,
      bobsGame: true,
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
      bobsGame: true,
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
      bobsGame: true,
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
      bobsGame: true,
      prepare: async (page) => {
        passLeader();
        await page.getByRole("button", { name: "Pass leader" }).waitFor();
      },
    },
    // A hypothetical that the account leads, from the first turn, after a player plays a card in
    // it, with "Edit cards" on. Loading the page leaves the shared replay for a moment, which
    // passes the lead back to Bob, so he passes it again.
    {
      name: "new-ui-hypothetical",
      path: "/",
      loggedIn: true,
      bobsGame: true,
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
          await page
            .locator("#game-new-ui [data-turn]", { hasText: /^2$/u })
            .waitFor();
        }
        await page.getByRole("button", { name: "Edit cards" }).click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
      },
    },
  ];
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
  /** A note that names the real identity of a card in the account's hand, such as "y2". */
  readonly identityNote: (order: CardOrder) => Promise<string>;
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

  async function identityNote(order: CardOrder) {
    const events = await loadEvents();
    const draw = events.find(
      (event) => event.type === "draw" && event.order === order,
    );
    if (draw?.type !== "draw" || draw.identity === undefined) {
      throw new Error(`Bob does not see the card ${order}.`);
    }
    const { suitIndex, rank } = draw.identity;
    const abbreviation =
      getVariant(LONG_VARIANT_NAME).suitAbbreviations[suitIndex];
    assertDefined(abbreviation, `The suit ${suitIndex} has no abbreviation.`);
    return `${abbreviation.toLowerCase()}${rank}`;
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

  return {
    replayId,
    startGame,
    endGame,
    passLeader,
    clueAccount,
    findAccountCard,
    playBobCard,
    identityNote,
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

async function capture(
  context: BrowserContext,
  address: string,
  states: readonly State[],
  setupOnly: ReadonlySet<State>,
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
    if (setupOnly.has(state)) {
      await state.record?.(page);
    } else if (state.record !== undefined) {
      const video = path.join(OUTPUT_DIRECTORY, `${state.name}.webm`);
      await page.screencast.start({ path: video, size: SETUP_SIZE });
      await state.record(page);
      await page.screencast.stop();
    }
    // Keep the pointer off of the page, so that no element shows its hover style.
    await page.mouse.move(0, SETUP_SIZE.height - 1);
    await page.waitForTimeout(SETTLE_MILLISECONDS);
    if (setupOnly.has(state)) {
      await state.cleanup?.(page);
      console.info(`Set up: ${state.name}`);
      continue;
    }

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
    const allStates = getStates(seeded);
    const chosen = allStates.filter(
      (state) =>
        options.states.length === 0 || options.states.includes(state.name),
    );
    const unknown = options.states.filter((name) =>
      chosen.every((state) => state.name !== name),
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
    // The states of Bob's game before the last chosen one, which bring the game to that point.
    const lastBobsGame = allStates.findLastIndex(
      (state) => state.bobsGame === true && chosen.includes(state),
    );
    const setupOnly = new Set(
      allStates.filter(
        (state, index) =>
          state.bobsGame === true
          && index < lastBobsGame
          && !chosen.includes(state),
      ),
    );
    const states = allStates.filter(
      (state) => chosen.includes(state) || setupOnly.has(state),
    );

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
      errors: [],
    };
    await capture(
      contexts.loggedOut,
      address,
      states.filter((state) => !state.loggedIn),
      setupOnly,
      options,
      compareBundle,
      results,
    );
    await capture(
      contexts.loggedIn,
      address,
      states.filter((state) => state.loggedIn),
      setupOnly,
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
