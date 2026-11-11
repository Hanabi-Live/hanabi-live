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

/* eslint-disable no-await-in-loop -- The browser visits the states one at a time. */

import { SERVER_COMMAND_SCHEMAS, VERSION } from "@hanabi-live/data";
import { START_CARD_RANK } from "@hanabi-live/game";
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
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { evaluationDatabase } from "./database.ts";
import {
  ROOT,
  buildRust,
  installSchema,
  login,
  prepareRoot,
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

/** How many times to press Escape to go from the deepest screen back to the lobby. */
const MAX_ESCAPES = 3;

/** The seed of the first seeded game: two players, the variant with ID 0, and the first seed. */
const SEED = "p2v0s1";

/** The accounts that watch the open table. */
const SPECTATOR_NAMES = ["Carol", "Dave", "Erin", "Frank"] as const;

/** The variant of the open table. */
const LONG_VARIANT_NAME = "Rainbow-Ones & Orange (6 Suits)";

/** The H-Group level that the account at the open table chooses. */
const H_GROUP_LEVEL = 3;

/** The login version that makes an account a bot. */
const BOT_VERSION = "bot";

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
}

async function clickNav(page: Page, id: string) {
  await page.click(`#nav-buttons-lobby-${id}`);
  await page.waitForTimeout(SETTLE_MILLISECONDS);
}

/**
 * Opens the replay of a seeded game from the lobby. The client ignores a "/replay/<id>" path for an
 * account that is a few seconds old.
 */
async function openReplay(page: Page, replayID: number) {
  await clickNav(page, "replay");
  await page.fill("#replay-id", replayID.toString());
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

function getStates({
  replayID,
  startGame,
  endGame,
  passLeader,
}: Pick<
  Seed,
  "replayID" | "startGame" | "endGame" | "passLeader"
>): readonly State[] {
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
    { name: "variant", path: "/variant/0", loggedIn: false },
    { name: "seed", path: `/seed/${SEED}`, loggedIn: false },
    { name: "password-reset", path: "/password-reset", loggedIn: false },
    { name: "lobby", path: "/", loggedIn: true },
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
        await openReplay(page, replayID);
      },
      cleanup: leaveReplay,
    },
    // The tooltip of the deck in the classic game screen, which lists the game's options.
    {
      name: "replay-tooltip",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayID);
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
        await openReplay(page, replayID);
      },
      hover: async (page) => {
        await hoverCanvasElement(page, ["spectatorsLabel"]);
        await page.locator(".game-tooltips-ol").waitFor();
      },
      cleanup: leaveReplay,
    },
    // The modal that changes a card into another during a hypothetical.
    {
      name: "morph-modal",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        await openReplay(page, replayID);
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
        await openReplay(page, replayID);
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
    // The game from the previous state, after the account plays a card and steps back over it in
    // the in-game replay.
    {
      name: "new-ui-replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        const hand = page.locator(
          `#game-new-ui [aria-label="${USERNAME}'s hand"]`,
        );
        await hand.locator("button").first().click();
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.waitForTimeout(SETTLE_MILLISECONDS);
        await page.getByRole("button", { name: "Replay" }).click();
        await page.getByRole("button", { name: "Previous turn" }).click();
      },
    },
    {
      name: "new-ui-tooltip",
      path: "/",
      loggedIn: true,
      hover: '#game-new-ui [aria-label^="About efficiency"]',
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
    // The same game, back in the new screen, after Bob ends it. It is now a shared replay that Bob
    // leads.
    {
      name: "new-ui-shared-replay",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        const hands = page.locator('#game-new-ui [aria-label="Hands"]');
        if (!(await hands.isVisible())) {
          await clickCanvasElement(page, ["newUIButton"]);
        }
        await hands.waitFor();
        await endGame();
        await page.getByRole("button", { name: "Ready" }).waitFor();
      },
    },
    {
      name: "new-ui-shared-replay-leader",
      path: "/",
      loggedIn: true,
      prepare: async (page) => {
        passLeader(USERNAME);
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
      prepare: async (page) => {
        passLeader(USERNAME);
        // Only the leader can start a hypothetical, so wait until the lead reaches the account.
        await page.getByRole("button", { name: "Pass leader" }).waitFor();
        // The button is disabled when the replay already shows the first turn.
        const firstTurn = page.getByRole("button", { name: "First turn" });
        if (await firstTurn.isEnabled()) {
          await firstTurn.click();
        }
        await page.getByText(/^Turn 1 of/u).waitFor();
        await page.getByRole("button", { name: "Enter hypothetical" }).click();
        // Whoever goes first plays the first card in their hand. When the game ended before anyone
        // moved (without the "new-ui-replay" state), the hypothetical is already over.
        const card = page
          .locator('#game-new-ui button[aria-label$="Play or discard"]')
          .first();
        if (await card.isVisible()) {
          await card.click();
          await page.getByRole("button", { name: "Play", exact: true }).click();
          await page.getByText("Hypothetical: turn 2").waitFor();
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
    path.join(ROOT, "packages/scripts/src/buildCSS.ts"),
    bundlePath,
  ]);
}

/** Bundles the stylesheets of a Git ref, with the bundler of that ref. */
async function buildRefBundle(ref: string, directory: string): Promise<string> {
  const source = path.join(directory, "compare-source");
  await mkdir(source);
  // Refs before the switch to ES modules name the bundler "buildCSS.mts".
  const { stdout: bundler } = await run(
    "git",
    [
      "ls-tree",
      "--name-only",
      ref,
      "--",
      "packages/scripts/src/buildCSS.ts",
      "packages/scripts/src/buildCSS.mts",
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

type Peer = ReturnType<typeof socketClient>;

async function connect(
  address: string,
  username: string,
  version?: string,
): Promise<Peer> {
  const peer = socketClient(address, await login(address, username, version));
  await peer.receive("welcome", SERVER_COMMAND_SCHEMAS.welcome);
  return peer;
}

/** Plays one turn of a game between two players and ends it, so that it is saved. */
async function playGame(alice: Peer, bob: Peer): Promise<number> {
  alice.send("tableCreate", { settings: { name: "Seeded game" } });
  const { tableID } = await alice.receive(
    "joined",
    SERVER_COMMAND_SCHEMAS.joined,
  );
  bob.send("tableJoin", { tableID });
  await bob.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
  alice.send("tableStart", { tableID });
  const peers = [alice, bob];
  const games = await Promise.all(
    peers.map(async (peer) => {
      await peer.receive("tableStarted", SERVER_COMMAND_SCHEMAS.tableStarted);
      peer.send("gameInitLoad", { tableID });
      const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
      peer.send("gameStateLoad", { tableID });
      const history = await peer.receive(
        "gameEventList",
        SERVER_COMMAND_SCHEMAS.gameEventList,
      );
      peer.send("loaded", { tableID });
      return { peer, init, history };
    }),
  );
  const first = games.find((game) => game.init.ourPlayerIndex === 0);
  assertDefined(first, "Neither player goes first.");
  const card = first.history.events.find(
    (action) => action.type === "draw" && action.playerIndex === 0,
  );
  if (card?.type !== "draw") {
    throw new Error("The first player has no cards.");
  }
  first.peer.send("playerAction", {
    tableID,
    action: { type: "play", order: card.order },
  });
  await first.peer.receive("gameEvent", SERVER_COMMAND_SCHEMAS.gameEvent);
  alice.send("tableTerminate", { tableID });
  const finished = await alice.receive(
    "finishOngoingGame",
    SERVER_COMMAND_SCHEMAS.finishOngoingGame,
  );
  assertDefined(finished.gameID, "The seeded game was not saved.");
  // The players are now in a shared replay of the game. Leave it, or the browser would join it.
  for (const peer of peers) {
    peer.send("tableUnattend", { tableID });
  }
  await bob.receive(
    "tableGone",
    SERVER_COMMAND_SCHEMAS.tableGone,
    (data) => data.tableID === tableID,
  );
  return finished.gameID;
}

interface Seed {
  readonly replayID: number;
  /** Starts the game at Bob's table, where the browser's account must be a player. */
  readonly startGame: () => Promise<void>;
  /** Ends the game at Bob's table, which turns it into a shared replay that Bob leads. */
  readonly endGame: () => Promise<void>;
  /** Makes another account the leader of the shared replay at Bob's table. */
  readonly passLeader: (username: string) => void;
  readonly cookie: string;
  readonly peers: readonly Peer[];
}

/**
 * Saves a few games. Leaves another account at an open table that has options and a spectator, and
 * a bot online, so that the lobby shows a lobby chat message and the tabs of the online users list.
 */
async function seed(address: string): Promise<Seed> {
  let replayID = 0;
  // Each game gets new connections, so that the server's messages about one game cannot affect the
  // next.
  for (let i = 0; i < 3; i++) {
    const alice = await connect(address, USERNAME);
    const bob = await connect(address, "Bob");
    replayID = await playGame(alice, bob);
    alice.socket.close();
    bob.socket.close();
  }

  const bob = await connect(address, "Bob");
  bob.send("setting", {
    settings: { hGroupConventions: true, hGroupLevel: H_GROUP_LEVEL },
  });
  bob.send("tableCreate", {
    settings: {
      name: "Bob's table",
      // A long variant name with six suits, so that the screens show how they fit both.
      options: {
        speedrun: true,
        deckPlays: true,
        variantName: LONG_VARIANT_NAME,
      },
    },
  });
  const { tableID } = await bob.receive(
    "joined",
    SERVER_COMMAND_SCHEMAS.joined,
  );
  bob.send("chat", { text: "Hello from the seeded lobby." });
  // More spectators than the game screen's chat header names, so that it offers to show the rest.
  const spectators: Peer[] = [];
  for (const name of SPECTATOR_NAMES) {
    const spectator = await connect(address, name);
    spectator.send("tableSpectate", { tableID });
    await spectator.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
    spectators.push(spectator);
  }
  const bot = await connect(address, "Robot", BOT_VERSION);

  async function startGame() {
    bob.send("tableStart", { tableID });
    await bob.receive("tableStarted", SERVER_COMMAND_SCHEMAS.tableStarted);
    bob.send("gameInitLoad", { tableID });
    const init = await bob.receive("init", SERVER_COMMAND_SCHEMAS.init);
    bob.send("gameStateLoad", { tableID });
    const { events } = await bob.receive(
      "gameEventList",
      SERVER_COMMAND_SCHEMAS.gameEventList,
    );
    bob.send("loaded", { tableID });

    // When Bob goes first, he clues the newest card of the browser's account, so that its hand
    // shows a clued card.
    if (init.ourPlayerIndex !== 0) {
      return;
    }
    const newest = events.findLast(
      (event) => event.type === "draw" && event.playerIndex !== 0,
    );
    if (
      newest?.type !== "draw"
      || newest.rank === undefined
      || newest.rank === START_CARD_RANK
    ) {
      return;
    }
    // A rank clue, since the variant's clue colors do not match its suits one to one.
    bob.send("playerAction", {
      tableID,
      action: {
        type: "rankClue",
        target: newest.playerIndex,
        rank: newest.rank,
      },
    });
    await bob.receive("gameEvent", SERVER_COMMAND_SCHEMAS.gameEvent);
  }

  // The browser logs in as Alice, with a session of its own.
  const cookie = await login(address, USERNAME);
  async function endGame() {
    bob.send("tableTerminate", { tableID });
    await bob.receive(
      "finishOngoingGame",
      SERVER_COMMAND_SCHEMAS.finishOngoingGame,
    );
  }

  function passLeader(username: string) {
    bob.send("tableSetLeader", { tableID, username });
  }

  return {
    replayID,
    startGame,
    endGame,
    passLeader,
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
