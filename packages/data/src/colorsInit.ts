import colorsJSON from "./json/colors.json";
import type { Color } from "./types/Color";

export function colorsInit(): ReadonlyMap<string, Color> {
  const colors = new Map<string, Color>();

  const colorsJSONArray = Array.from(colorsJSON);
  if (colorsJSONArray.length === 0) {
    throw new Error('The "colors.json" file did not have any elements in it.');
  }

  for (const colorJSON of colorsJSONArray) {
    // Validate the name
    const { name } = colorJSON;
    if (name === "") {
      throw new Error(
        'There is a color with an empty name in the "colors.json" file.',
      );
    }

    // Validate the abbreviation. If it is not specified, assume that it is the first letter of the
    // color.
    const abbreviation = colorJSON.abbreviation ?? name.charAt(0);
    if (abbreviation.length !== 1) {
      throw new Error(
        `The "${colorJSON.name}" color has an abbreviation that is not one letter long.`,
      );
    }

    // Validate the fill.
    const { fill } = colorJSON;
    if (fill.length === 0) {
      throw new Error(`The "${colorJSON.name}" color has an empty fill.`);
    }

    // Validate the colorblind fill (which is an alternate fill when "Colorblind Mode" is enabled).
    // If it is not specified, assume that it is the same as the default fill.
    const fillColorblind = colorJSON.fillColorblind ?? fill;

    // Add it to the map.
    const color: Color = {
      name,
      abbreviation,
      fill,
      fillColorblind,
    };
    colors.set(colorJSON.name, color);
  }

  return colors;
}
