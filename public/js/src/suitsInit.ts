// Imports
import Color from './Color';
import Suit from './Suit';
import suitsJSON from './data/suits.json';

type SuitJSON = {
    abbreviation?: string,
    allClueColors?: boolean,
    clueColors?: string[],
    clueRanks?: string,
    fill?: string,
    fillColors?: string[],
    name?: string,
    oneOfEach?: boolean,
    pip: string,
};
type SuitEntryIterable = Iterable<[string, SuitJSON]>;

export default (COLORS: Map<string, Color>) => {
    const SUITS: Map<string, Suit> = new Map();

    for (const [suitName, suitJSON] of Object.entries(suitsJSON) as SuitEntryIterable) {
        // Validate the name
        // If it is not specified, assume that it is the same as the key
        // (the name can be sometimes different from the key because
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
            if (color) {
                abbreviation = color.abbreviation;
            } else {
                abbreviation = name.charAt(0);
            }
        }
        if (abbreviation.length !== 1) {
            throw new Error(`The "${suitName}" suit has an abbreviation with more than one letter.`);
        }

        // Validate the "allClueColors" property (for suits that are clued by every color)
        // If it is not specified, assume that it is false
        if (Object.hasOwnProperty.call(suitJSON, 'allClueColors') && suitJSON.allClueColors !== true) {
            throw new Error(`The "allClueColors" property for the suit "${suitName}" must be set to true.`);
        }
        const allClueColors: boolean = suitJSON.allClueColors || false;

        // Validate the clue colors (the colors that touch this suit)
        // If it is not specified, use the color of the same name
        let clueColors: Array<Color> = [];
        if (allClueColors) {
            // As a special case, handle suits that are touched by all color clues
            clueColors = [...COLORS.values()]; // Add all of the colors to the array
        } else if (Object.hasOwnProperty.call(suitJSON, 'clueColors')) {
            if (!Array.isArray(suitJSON.clueColors)) {
                throw new Error(`The clue colors for the suit "${suitName}" were not specified as an array.`);
            }

            // The clue colors are specified as an array of strings
            // Convert the strings to objects
            for (const colorString of suitJSON.clueColors) {
                if (typeof colorString !== 'string') {
                    throw new Error(`One of the clue colors for the suit "${suitName}" was not specified as a string.`);
                }

                const colorObject = COLORS.get(colorString);
                if (colorObject) {
                    clueColors.push(colorObject);
                } else {
                    throw new Error(`The color "${colorString}" in the suit "${suitName}" does not exist.`);
                }
            }
        } else {
            // The clue colors were not specified
            const color = COLORS.get(name);
            if (color) {
                clueColors.push(color);
            } else if (name !== 'Unknown') { // The "Unknown" suit is not supposed to have clue colors
                let msg = `Failed to find the clue colors for the "${suitName}" suit. `;
                msg += `(There is no corresponding color named "${suitName}".)`;
                throw new Error(msg);
            }
        }

        // Validate the clue ranks (the ranks that touch this suit)
        // If it is not specified, assume that the ranks work normally
        // (e.g. a rank 1 clue touches a blue 1)
        const clueRanks: string = suitJSON.clueRanks || 'normal';
        if (clueRanks === '') {
            throw new Error(`The "clueRanks" property for the "${suitName}" suit is empty.`);
        }

        // Validate the fill
        // If it is not specified, use the fill of the color with the same name
        // Otherwise, assume the fill of the first clue color
        let fill: string = suitJSON.fill || '';
        if (fill === '') {
            const color = COLORS.get(name);
            if (color) {
                fill = color.fill;
            } else if (clueColors.length > 0) {
                fill = clueColors[0].fill;
            } else {
                let msg = `Failed to find the fill for the "${suitName}" suit. `;
                msg += `(There is no corresponding color named "${suitName}" and this suit has no clue colors specified.)`;
                throw new Error(msg);
            }
        }

        // Validate the fill colors
        if (
            Object.hasOwnProperty.call(suitJSON, 'fillColors')
            && Array.isArray(suitJSON.fillColors)
            && suitJSON.fillColors.length === 0
        ) {
            throw new Error(`The "fillColor" array for the suit "${suitName}" is empty.`);
        }
        const fillColors: Array<string> = suitJSON.fillColors || [];

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

        // Add it to the map
        const suit: Suit = {
            name,
            abbreviation,
            allClueColors,
            clueColors,
            clueRanks,
            fill,
            fillColors,
            oneOfEach,
            pip,
        };
        SUITS.set(suitName, suit);
    }

    return SUITS;
};
