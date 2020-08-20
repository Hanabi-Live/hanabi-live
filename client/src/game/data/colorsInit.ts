import colorsJSON from '../../../../data/colors.json';
import Color from '../types/Color';

// "ColorJSON" is almost exactly the same as "Color"
// However, in "ColorJSON", some fields are optional, but in "Color",
// we want all fields to be initialized
interface ColorJSON {
  name: string;
  fill: string;
  fillColorblind?: string;
  abbreviation?: string;
}

export default function colorsInit() {
  const COLORS = new Map<string, Color>();

  for (const colorJSON of colorsJSON as ColorJSON[]) {
    // Validate the name
    const name: string = colorJSON.name;
    if (name === '') {
      throw new Error('There is a color with an empty name in the "colors.json" file.');
    }

    // Validate the abbreviation
    // If it is not specified, assume that it is the first letter of the color
    const abbreviation: string = colorJSON.abbreviation ?? name.charAt(0);
    if (abbreviation.length !== 1) {
      throw new Error(`The "${colorJSON.name}" color has an abbreviation that is not one letter long.`);
    }

    // Validate the fill
    const fill: string = colorJSON.fill;
    if (colorJSON.fill === '') {
      throw new Error(`The "${colorJSON.name}" color has an empty fill.`);
    }

    // Validate the colorblind fill (which is an alternate fill when "Colorblind Mode" is enabled)
    // If it is not specified, assume that it is the same as the default fill
    const fillColorblind: string = colorJSON.fillColorblind ?? fill;

    // Add it to the map
    const color: Color = {
      name,
      abbreviation,
      fill,
      fillColorblind,
    };
    COLORS.set(colorJSON.name, color);
  }

  return COLORS;
}
