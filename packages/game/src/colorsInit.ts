import type { z } from "zod";
import type { catalogColorSchema } from "./generated/protocol.js";
import type { Color } from "./interfaces/Color.js";
import colorsJSON from "./json/colors.json" with { type: "json" };

export function colorsInit(): ReadonlyMap<string, Color> {
  const colors = new Map<string, Color>();

  // A test validates the file against the server's catalog contract.
  const entries = colorsJSON as ReadonlyArray<
    z.infer<typeof catalogColorSchema>
  >;
  for (const colorJSON of entries) {
    const { name, fill } = colorJSON;

    // If the abbreviation is not specified, assume that it is the first letter of the color.
    const abbreviation = colorJSON.abbreviation ?? name.charAt(0);

    // If the colorblind fill is not specified, assume that it is the same as the default fill.
    const fillColorblind = colorJSON.fillColorblind ?? fill;

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
