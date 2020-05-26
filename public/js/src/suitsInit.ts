// Imports
import Color from './Color';
import suitsJSON from './data/suits.json';
import Suit from './Suit';

type SuitJSON = {
  name?: string;
  abbreviation?: string;
  clueColors?: string[];
  fill?: string;
  fillColors?: string[];
  oneOfEach?: boolean;
  pip: string;
  reversed?: boolean;

  allClueColors?: boolean;
  allClueRanks?: boolean;
  noClueColors?: boolean;
  noClueRanks?: boolean;
};
type SuitEntryIterable = Iterable<[string, SuitJSON]>;

export default (COLORS: Map<string, Color>) => {
  const SUITS: Map<string, Suit> = new Map();

  for (const [suitName, suitJSON] of Object.entries(suitsJSON) as SuitEntryIterable) {
    // Validate the name
    // If it is not specified, assume that it is the same as the key
    // (the name can sometimes be different from the key because
    // multiple suits share the same name for some specific variants)
    const name: string = suitJSON.name || suitName;
    if (name === '') {
      throw new Error('There is a suit with an empty name in the "suits.json" file.');
    }

    // Validate the abbreviation
    // If it is not specified, use the abbreviation of the color with the same name
    // Otherwise, use the first letter of the suit
    let abbreviation: string = suitJSON.abbreviation || '';
    if (abbreviation === '') {
      const color = COLORS.get(name);
      if (typeof color !== 'undefined') {
        abbreviation = color.abbreviation;
      } else {
        abbreviation = name.charAt(0);
      }
    }
    if (abbreviation.length !== 1) {
      throw new Error(`The "${suitName}" suit has an abbreviation with more than one letter.`);
    }

    // Validate the four clue properties
    // If these are not specified, the suit functions normally
    // (this has to be done before validating the clue colors)
    if (Object.hasOwnProperty.call(suitJSON, 'allClueColors') && suitJSON.allClueColors !== true) {
      throw new Error(`The "allClueColors" property for the suit "${suitName}" must be set to true.`);
    }
    const allClueColors: boolean = suitJSON.allClueColors || false;
    if (Object.hasOwnProperty.call(suitJSON, 'allClueRanks') && suitJSON.allClueRanks !== true) {
      throw new Error(`The "allClueRanks" property for the suit "${suitName}" must be set to true.`);
    }
    const allClueRanks: boolean = suitJSON.allClueRanks || false;
    if (Object.hasOwnProperty.call(suitJSON, 'noClueColors') && suitJSON.noClueColors !== true) {
      throw new Error(`The "noClueColors" property for the suit "${suitName}" must be set to true.`);
    }
    const noClueColors: boolean = suitJSON.noClueColors || false;
    if (Object.hasOwnProperty.call(suitJSON, 'noClueRanks') && suitJSON.noClueRanks !== true) {
      throw new Error(`The "noClueRanks" property for the suit "${suitName}" must be set to true.`);
    }
    const noClueRanks: boolean = suitJSON.noClueRanks || false;

    // Validate the clue colors (the colors that touch this suit)
    // If it is not specified, use the color of the same name
    const clueColors: Color[] = [];
    if (Object.hasOwnProperty.call(suitJSON, 'clueColors')) {
      if (!Array.isArray(suitJSON.clueColors)) {
        throw new Error(`The clue colors for the suit "${suitName}" was not specified as an array.`);
      }

      // The clue colors are specified as an array of strings
      // Convert the strings to objects
      for (const colorString of suitJSON.clueColors) {
        if (typeof colorString !== 'string') {
          throw new Error(`One of the clue colors for the suit "${suitName}" was not specified as a string.`);
        }

        const colorObject = COLORS.get(colorString);
        if (typeof colorObject !== 'undefined') {
          clueColors.push(colorObject);
        } else {
          throw new Error(`The color "${colorString}" in the suit "${suitName}" does not exist.`);
        }
      }
    } else if (!suitJSON.allClueColors && !suitJSON.noClueColors) {
      // The clue colors were not specified; by default, use the color of the same name
      const color = COLORS.get(name);
      if (typeof color !== 'undefined') {
        clueColors.push(color);
      } else if (name !== 'Unknown') {
        // The "Unknown" suit is not supposed to have clue colors
        let msg = `Failed to find the clue colors for the "${suitName}" suit. `;
        msg += `(There is no corresponding color named "${suitName}".)`;
        throw new Error(msg);
      }
    }

    // Validate the fill and colorblind fill
    // If it is not specified, use the fill of the color with the same name
    // Otherwise, assume the fill of the first clue color
    let fill: string = suitJSON.fill || '';
    let fillColorblind: string = '';
    if (fill === '') {
      const color = COLORS.get(name);
      if (typeof color !== 'undefined') {
        fill = color.fill;
        fillColorblind = color.fillColorblind;
      } else if (clueColors.length > 0) {
        fill = clueColors[0].fill;
      } else {
        let msg = `Failed to find the fill for the "${suitName}" suit. `;
        msg += `(There is no corresponding color named "${suitName}" and this suit has no clue colors specified.)`;
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
      throw new Error(`The "fillColor" array for the suit "${suitName}" is empty.`);
    }
    const fillColors: string[] = suitJSON.fillColors || [];

    // Validate the "oneOfEach" property
    // If it is not specified, the suit is not one of each (e.g. every card is not critical)
    if (Object.hasOwnProperty.call(suitJSON, 'oneOfEach') && suitJSON.oneOfEach !== true) {
      throw new Error(`The "oneOfEach" property for the suit "${suitName}" must be set to true.`);
    }
    const oneOfEach: boolean = suitJSON.oneOfEach || false;

    // Validate the "pip" property
    const pip: string = suitJSON.pip || '';
    if (pip === '' && suitName !== 'Unknown') {
      throw new Error(`Failed to find the pip for the "${suitName}" suit.`);
    }

    // Validate the "reversed" property
    // If it is not specified, the suit is not reversed (i.e. played from 1 to 5 as normal)
    if (Object.hasOwnProperty.call(suitJSON, 'reversed') && suitJSON.reversed !== true) {
      throw new Error(`The "reversed" property for the suit "${suitName}" must be set to true.`);
    }
    const reversed: boolean = suitJSON.reversed || false;

    // Add it to the map
    const suit: Suit = {
      name,
      abbreviation,
      clueColors,
      fill,
      fillColorblind,
      fillColors,
      oneOfEach,
      pip,
      reversed,

      allClueColors,
      allClueRanks,
      noClueColors,
      noClueRanks,
    };
    SUITS.set(suitName, suit);
  }

  return SUITS;
};
