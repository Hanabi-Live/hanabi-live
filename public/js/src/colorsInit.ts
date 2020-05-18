// Imports
import Color from './Color';
import colorsJSON from './data/colors.json';

type ColorJSON = {
  fill: string;
  fillColorblind?: string;
  abbreviation?: string;
};
type ColorEntryIterable = Iterable<[string, ColorJSON]>;

export default () => {
  const COLORS: Map<string, Color> = new Map();

  for (const [colorName, colorJSON] of Object.entries(colorsJSON) as ColorEntryIterable) {
    // Validate the name
    const name: string = colorName;
    if (name === '') {
      throw new Error('There is a color with an empty name in the "colors.json" file.');
    }

    // Validate the abbreviation
    // If it is not specified, assume that it is the first letter of the color
    const abbreviation: string = colorJSON.abbreviation || name.charAt(0);
    if (abbreviation.length !== 1) {
      throw new Error(`The "${name}" color has an abbreviation with more than one letter.`);
    }

    // Validate the fill
    const fill: string = colorJSON.fill;
    if (fill === '') {
      throw new Error(`The "${name}" color has an empty fill.`);
    }

    // Validate the colorblind fill
    // (optionally, there can be an alternate fill when "Colorblind Mode" is enabled)
    const fillColorblind: string = colorJSON.fillColorblind || fill;
    // (if it is not specified, then just use the default fill)

    // Add it to the map
    const color: Color = {
      name,
      fill,
      fillColorblind,
      abbreviation,
    };
    COLORS.set(colorName, color);
  }

  return COLORS;
};
