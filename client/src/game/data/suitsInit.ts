import suitsJSON from '../../../../data/suits.json';
import Color from '../types/Color';
import Suit from '../types/Suit';

const SUIT_REVERSED_SUFFIX = ' Reversed';

// "SuitJSON" is almost exactly the same as "Suit"
// However, in "SuitJSON", some fields are optional, but in "Suit",
// we want all fields to be initialized
interface SuitJSON {
  name: string;
  abbreviation?: string;
  clueColors?: string[];
  displayName?: string;
  fill?: string;
  fillColors?: string[];
  oneOfEach?: boolean;
  pip: string;
  reversed?: boolean;

  allClueColors?: boolean;
  allClueRanks?: boolean;
  noClueColors?: boolean;
  noClueRanks?: boolean;
}

export default function suitsInit(COLORS: Map<string, Color>) {
  const SUITS = new Map<string, Suit>();

  for (const suitJSON of suitsJSON as SuitJSON[]) {
    // Validate the name
    const name: string = suitJSON.name;
    if (name === '') {
      throw new Error('There is a suit with an empty name in the "suits.json" file.');
    }

    // Validate the abbreviation
    // If it is not specified, use the abbreviation of the color with the same name
    // Otherwise, assume that it is the first letter of the suit
    let abbreviation: string = suitJSON.abbreviation ?? '';
    if (abbreviation === '') {
      const color = COLORS.get(name);
      if (color !== undefined) {
        abbreviation = color.abbreviation;
      } else {
        abbreviation = name.charAt(0);
      }
    }
    if (abbreviation.length !== 1) {
      throw new Error(`The "${suitJSON.name}" suit has an abbreviation that is not one letter long.`);
    }

    // Validate the four clue properties
    // If these are not specified, the suit functions normally
    // (this has to be done before validating the clue colors)
    if (Object.hasOwnProperty.call(suitJSON, 'allClueColors') && suitJSON.allClueColors !== true) {
      throw new Error(`The "allClueColors" property for the suit "${suitJSON.name}" must be set to true.`);
    }
    const allClueColors: boolean = suitJSON.allClueColors ?? false;
    if (Object.hasOwnProperty.call(suitJSON, 'allClueRanks') && suitJSON.allClueRanks !== true) {
      throw new Error(`The "allClueRanks" property for the suit "${suitJSON.name}" must be set to true.`);
    }
    const allClueRanks: boolean = suitJSON.allClueRanks ?? false;
    if (Object.hasOwnProperty.call(suitJSON, 'noClueColors') && suitJSON.noClueColors !== true) {
      throw new Error(`The "noClueColors" property for the suit "${suitJSON.name}" must be set to true.`);
    }
    const noClueColors: boolean = suitJSON.noClueColors ?? false;
    if (Object.hasOwnProperty.call(suitJSON, 'noClueRanks') && suitJSON.noClueRanks !== true) {
      throw new Error(`The "noClueRanks" property for the suit "${suitJSON.name}" must be set to true.`);
    }
    const noClueRanks: boolean = suitJSON.noClueRanks ?? false;

    // Validate the clue colors (the colors that touch this suit)
    // If it is not specified, use the color of the same name
    const clueColors: Color[] = [];
    if (Object.hasOwnProperty.call(suitJSON, 'clueColors')) {
      if (!Array.isArray(suitJSON.clueColors)) {
        throw new Error(`The clue colors for the suit "${suitJSON.name}" was not specified as an array.`);
      }

      // The clue colors are specified as an array of strings
      // Convert the strings to objects
      for (const colorString of suitJSON.clueColors) {
        if (typeof colorString !== 'string') {
          throw new Error(`One of the clue colors for the suit "${suitJSON.name}" was not specified as a string.`);
        }

        const colorObject = COLORS.get(colorString);
        if (colorObject !== undefined) {
          clueColors.push(colorObject);
        } else {
          throw new Error(`The color "${colorString}" in the suit "${suitJSON.name}" does not exist.`);
        }
      }
    } else if (!allClueColors && !noClueColors) {
      // The clue colors were not specified; by default, use the color of the same name
      const color = COLORS.get(name);
      if (color !== undefined) {
        clueColors.push(color);
      } else if (name !== 'Unknown') {
        // The "Unknown" suit is not supposed to have clue colors
        let msg = `Failed to find the clue colors for the "${suitJSON.name}" suit. `;
        msg += `(There is no corresponding color named "${suitJSON.name}".)`;
        throw new Error(msg);
      }
    }

    // The display name is optional; if not specified, then use the normal suit name
    const displayName: string = suitJSON.displayName ?? suitJSON.name;

    // Validate the fill and colorblind fill
    // If it is not specified, use the fill of the color with the same name
    // Otherwise, assume the fill of the first clue color
    let fill: string = suitJSON.fill ?? '';
    let fillColorblind = '';
    if (fill === '') {
      const color = COLORS.get(name);
      if (color !== undefined) {
        fill = color.fill;
        fillColorblind = color.fillColorblind;
      } else if (clueColors.length > 0) {
        fill = clueColors[0].fill;
      } else {
        let msg = `Failed to find the fill for the "${suitJSON.name}" suit. `;
        msg += `(There is no corresponding color named "${suitJSON.name}" and this suit has no clue colors specified.)`;
        throw new Error(msg);
      }
    }
    if (fillColorblind === '') {
      fillColorblind = fill;
    }

    // Validate the fill colors
    if (
      Object.hasOwnProperty.call(suitJSON, 'fillColors')
      && Array.isArray(suitJSON.fillColors)
      && suitJSON.fillColors.length === 0
    ) {
      throw new Error(`The "fillColor" array for the suit "${suitJSON.name}" is empty.`);
    }
    const fillColors: string[] = suitJSON.fillColors || [];

    // Validate the "oneOfEach" property
    // If it is not specified, the suit is not one of each (e.g. every card is not critical)
    if (Object.hasOwnProperty.call(suitJSON, 'oneOfEach') && suitJSON.oneOfEach !== true) {
      throw new Error(`The "oneOfEach" property for the suit "${suitJSON.name}" must be set to true.`);
    }
    const oneOfEach: boolean = suitJSON.oneOfEach ?? false;

    // Validate the "pip" property
    const pip: string = suitJSON.pip || '';
    if (pip === '' && suitJSON.name !== 'Unknown') {
      throw new Error(`Failed to find the pip for the "${suitJSON.name}" suit.`);
    }

    // Add it to the map
    const suit: Suit = {
      name,
      abbreviation,
      clueColors,
      displayName,
      fill,
      fillColorblind,
      fillColors,
      oneOfEach,
      pip,
      reversed: false,

      allClueColors,
      allClueRanks,
      noClueColors,
      noClueRanks,
    };
    SUITS.set(suitJSON.name, suit);

    // Additionally, add the reversed version of this suit
    const suitReversed: Suit = {
      ...suit,
      reversed: true,
    };
    SUITS.set(suitJSON.name + SUIT_REVERSED_SUFFIX, suitReversed);
  }

  return SUITS;
}
