import { describe, expect, test } from "@jest/globals";
import path from "node:path";
import { createEta } from "./eta";

const TEMPLATES_PATH = path.join(__dirname, "templates");

// These are the variables that every page needs. (See `getTemplateVariables`.)
const VARIABLES = {
  projectName: "Hanab Live",
  isDev: false,
  version: 1,
  title: "Main",
  domain: "localhost",
} as const;

function render(variables: Readonly<Record<string, unknown>>): string {
  const eta = createEta();
  eta.configure({ views: TEMPLATES_PATH });
  return eta.render("main", variables);
}

describe("eta", () => {
  // This exercises the layout, since Eta passes its own "__blocks" object to the layout template.
  test("renders a page that uses the layout", () => {
    const html = render(VARIABLES);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('id="page-wrapper"');
  });

  test("throws on a non-primitive template value", () => {
    expect(() => render({ ...VARIABLES, bad: {} })).toThrow(
      'The template value of "bad" has a type of: object',
    );
  });

  test("throws on an empty template string", () => {
    expect(() => render({ ...VARIABLES, domain: " " })).toThrow(
      'The template value of "domain" is empty.',
    );
  });
});
