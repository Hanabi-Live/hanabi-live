import colorsJSON from "./json/colors.json";
import type { Color } from "./types/Color";

export function colorsInit(): ReadonlyMap<string, Color> {
  const colors = new Map<string, Color>();

  if (colorsJSON.length === 0) {
    throw new Error('The "colors.json" file did not have any elements in it.');
  }

  for (const colorJSON of colorsJSON) {
    // Validate the name
    if (colorJSON.name === "") {
      throw new Error(
        'There is a color with an empty name in the "colors.json" file.',
      );
    }
    const { name } = colorJSON;

    // Validate the abbreviation.
    if (
      colorJSON.abbreviation !== undefined &&
      colorJSON.abbreviation.length !== 1
    ) {
      throw new Error(
        `The "${colorJSON.name}" color has an abbreviation that is not one letter long.`,
      );
    }

    // If the abbreviation is not specified, assume that it is the first letter of the color.
    const abbreviation = colorJSON.abbreviation ?? name.charAt(0);

    // Validate the fill.
    if (colorJSON.fill === "") {
      throw new Error(
        `The "${colorJSON.name}" color has an empty "fill" property.`,
      );
    }
    const { fill } = colorJSON;

    // Validate the colorblind fill (which is an alternate fill when "Colorblind Mode" is enabled).
    if (colorJSON.fillColorblind === "") {
      throw new Error(
        `The "${colorJSON.name}" color has an empty "fillColorblind" property.`,
      );
    }

    // If the colorblind fill is not specified, assume that it is the same as the default fill.
    const fillColorblind = colorJSON.fillColorblind ?? fill;

    // Construct the color object and add it to the map.
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
