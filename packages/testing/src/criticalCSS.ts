// Generates the critical CSS: the rules from the CSS bundle that style the part of the login page
// that is visible before the rest of the bundle loads. Run it through "runTests.ts", which provides
// the database and builds the server:
// - `bun run build-critical-css` rewrites "public/css/critical.min.css".
// - `bun run test-critical-css` fails if that file is out of date.

import { VERSION } from "@hanabi-live/data";
import { transform } from "lightningcss";
import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { evaluationDatabase } from "./database";
import {
  ROOT,
  buildRust,
  installSchema,
  prepareRoot,
  startProcess,
  stopChild,
} from "./mainProcessSupport";
import { redisFixture } from "./redisFixture";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

const CRITICAL_CSS_PATH = path.join(ROOT, "public/css/critical.min.css");

/** A domain that is not local, so that the server renders the page as it does in production. */
const PRODUCTION_DOMAIN = "critical-css.example";

/** The viewport that is considered to be "above the fold". */
const VIEWPORT = { width: 1200, height: 900 } as const;

/** The name that production pages load the CSS bundle with. */
const BUNDLE_FILENAME = `main.${VERSION}.min.css`;

/** Bundles the stylesheets into the directory that the server serves them from. */
async function buildBundle(directory: string): Promise<string> {
  const bundlePath = path.join(directory, "public/css", BUNDLE_FILENAME);
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await run(process.execPath, [
    path.join(ROOT, "packages/scripts/src/buildCSS.mts"),
    bundlePath,
  ]);
  return await Bun.file(bundlePath).text();
}

/**
 * Runs in the page. A rule is critical if the first element that one of its selectors matches
 * starts within the viewport. Rules inside media queries are checked the same way, and other
 * at-rules (such as font faces and keyframes) are left out.
 */
async function getCriticalCSS({
  bundle,
  bundleFilename,
}: {
  readonly bundle: string;
  readonly bundleFilename: string;
}): Promise<string> {
  // The layout must be measured with the bundle, not the stylesheets that development pages load.
  const stylesheets = [...document.styleSheets].map((sheet) => sheet.href);
  if (stylesheets.every((href) => href?.endsWith(bundleFilename) !== true)) {
    throw new Error(
      `The page did not load "${bundleFilename}": ${stylesheets.join(", ")}`,
    );
  }

  // Measure the layout with the fonts that the page ships, so that it does not depend on the fonts
  // installed on this computer.
  await document.fonts.ready;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(bundle);

  // The helper functions run in the page, so they must be defined inside of this function, which is
  // the only code that Playwright sends to the page.

  /** Splits a selector list on the commas that are not inside of parentheses. */
  // eslint-disable-next-line unicorn/consistent-function-scoping
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

  // eslint-disable-next-line unicorn/consistent-function-scoping
  function isAboveFold(selector: string): boolean {
    // Pseudo-elements never match an element, but they style the element that they belong to.
    const elementSelector = selector.replaceAll(
      /::?(?:after|before)\b|::[\w-]+/gu,
      "",
    );
    let element: Element | null;
    try {
      element = document.querySelector(
        elementSelector === "" ? "*" : elementSelector,
      );
    } catch {
      return false;
    }
    return (
      element !== null
      && element.getBoundingClientRect().top <= window.innerHeight
    );
  }

  function getCriticalRules(rules: CSSRuleList): readonly string[] {
    const critical: string[] = [];
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const selectors = splitSelectors(rule.selectorText).filter(isAboveFold);
        if (selectors.length > 0) {
          critical.push(`${selectors.join(",")}{${rule.style.cssText}}`);
        }
      } else if (rule instanceof CSSMediaRule) {
        const inner = getCriticalRules(rule.cssRules);
        if (inner.length > 0) {
          critical.push(`@media ${rule.conditionText}{${inner.join("\n")}}`);
        }
      }
    }
    return critical;
  }

  return getCriticalRules(sheet.cssRules).join("\n");
}

/** Renders the page as it first appears, before the client script runs. */
async function extract(address: string, bundle: string): Promise<string> {
  await run(process.execPath, [
    "x",
    "--bun",
    "--no-install",
    "playwright",
    "install",
    "--only-shell",
    "chromium",
  ]);
  await using browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEWPORT,
    javaScriptEnabled: false,
    colorScheme: "light",
  });
  const response = await page.goto(address);
  if (response === null || !response.ok()) {
    throw new Error(
      `Failed to load "${address}" (HTTP ${String(response?.status())}).`,
    );
  }
  const critical = await page.evaluate(getCriticalCSS, {
    bundle,
    bundleFilename: BUNDLE_FILENAME,
  });
  if (critical === "") {
    throw new Error("No rules from the CSS bundle style the top of the page.");
  }
  const { code } = transform({
    filename: "critical.css",
    code: new TextEncoder().encode(critical),
    minify: true,
  });
  return new TextDecoder().decode(code);
}

/** Starts the compiled server in a temporary directory that serves the stylesheets. */
async function generate(): Promise<string> {
  await mkdir(path.join(ROOT, "dist"), { recursive: true });
  const directory = await mkdtemp(path.join(ROOT, "dist/critical-css-"));
  const database = await evaluationDatabase();
  const redis = await redisFixture();
  let server: ReturnType<typeof startProcess> | undefined;
  try {
    await prepareRoot(directory, database, PRODUCTION_DOMAIN);
    // A production domain makes the server listen on every interface unless told otherwise.
    await appendFile(
      path.join(directory, ".env"),
      `REDIS_URL=${redis.url}\nLISTEN_HOST=127.0.0.1\n`,
    );
    const bundle = await buildBundle(directory);
    await symlink(
      path.join(ROOT, "public/webfonts"),
      path.join(directory, "public/webfonts"),
    );
    await buildRust(directory);
    await installSchema(directory);
    server = startProcess(directory);
    return await extract(await server.ready, bundle);
  } finally {
    if (server !== undefined) {
      await stopChild(server.child);
    }
    await redis.close();
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  if (args.some((arg) => arg !== "--write")) {
    throw new Error("The only supported argument is: --write");
  }

  const critical = await generate();
  if (write) {
    await Bun.write(CRITICAL_CSS_PATH, critical);
    console.info(`Wrote: ${CRITICAL_CSS_PATH}`);
    return 0;
  }

  const committed = await Bun.file(CRITICAL_CSS_PATH).text();
  if (critical === committed) {
    console.info("The critical CSS is up to date.");
    return 0;
  }
  console.error(
    'The critical CSS is out of date. Regenerate it with "bun run build-critical-css" and commit "public/css/critical.min.css".',
  );
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("Failed to generate the critical CSS:", error);
    process.exitCode = 1;
  });
