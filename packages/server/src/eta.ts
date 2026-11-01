import { Eta } from "eta";

/** Creates the template engine used for rendering the website. */
export function createEta(): Eta {
  return new Eta({
    // Prefer the Golang template syntax, which is not the default.
    tags: ["{{", "}}"],

    // By default, Eta will allow undefined values to bubble through to the template. We want to
    // explicitly throw an error in this case. This solution was recommended by Ben Gubler in the
    // Discord server.
    functionHeader: `
      if (it !== undefined) {
        for (const [key, value] of Object.entries(it)) {
          // Eta passes the layout blocks (an object) to the layout template under this key.
          if (key === "__blocks") {
            continue;
          }

          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            throw new Error('The template value of "' + key + '" has a type of: ' + typeof value);
          }

          if (typeof value === "string" && value.trim() === "") {
            throw new Error('The template value of "' + key + '" is empty.');
          }
        }
      }
    `,
  });
}
