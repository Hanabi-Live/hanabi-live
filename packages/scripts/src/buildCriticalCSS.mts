// Extracts the critical CSS: the rules from the CSS bundle that style the part of the page visible
// when it first loads. Usage: `bun buildCriticalCSS.mts <url> <bundle>`. This writes
// "public/css/critical.css", which "buildCSS.mts --critical" then minifies.

import path from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "public", "css", "critical.css");

/** The viewport that is considered to be "above the fold". */
const VIEWPORT = { width: 1200, height: 900 } as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Runs in the page. A rule is critical if the first element that one of its selectors matches
 * starts within the viewport. Rules inside media queries are checked the same way, and other
 * at-rules (such as font faces and keyframes) are left out.
 */
function getCriticalCSS(bundle: string): string {
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

async function main() {
  const [url, bundlePath, ...rest] = process.argv.slice(2);
  if (url === undefined || bundlePath === undefined || rest.length > 0) {
    fail("Usage: bun buildCriticalCSS.mts <url> <bundle>");
  }

  const bundle = await Bun.file(bundlePath).text();
  await using browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  const response = await page.goto(url);
  if (response === null || !response.ok()) {
    fail(`Failed to load "${url}" (HTTP ${String(response?.status())}).`);
  }

  const critical = await page.evaluate(getCriticalCSS, bundle);
  if (critical === "") {
    fail(`No rules from "${bundlePath}" style the top of "${url}".`);
  }
  await Bun.write(OUTPUT_PATH, `${critical}\n`);
}

await main();
