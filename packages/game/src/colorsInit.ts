import type { z } from "zod";
import type { catalogColorSchema } from "./generated/protocol.ts";
import type { Color } from "./interfaces/Color.ts";
import colorsJson from "./json/colors.json" with { type: "json" };

/**
 * The colors of `colors.json`, or of the entries given, such as the colors of a variant's rules
 * from the server.
 */
export function colorsInit(
  // A test validates the file against the server's catalog contract.
  entries: ReadonlyArray<z.infer<typeof catalogColorSchema>> = colorsJson,
): ReadonlyMap<string, Color> {
  const colors = new Map<string, Color>();

  for (const colorJson of entries) {
    const { fill, name } = colorJson;

    // If the abbreviation is not specified, assume that it is the first letter of the color.
    const abbreviation = colorJson.abbreviation ?? name.charAt(0);

    // If the colorblind fill is not specified, assume that it is the same as the default fill.
    const fillColorblind = colorJson.fillColorblind ?? fill;

    // Construct the color object and add it to the map.
    const color: Color = {
      name,
      abbreviation,
      fill,
      fillColorblind,
    };
    colors.set(name, color);
  }

  return colors;
}
