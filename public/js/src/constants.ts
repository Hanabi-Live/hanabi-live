/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

import colorsJSON from './data/colors.json';
import suitsJSON from './data/suits.json';
import variantsJSON from './data/variants.json';
import charactersJSON from './data/characters.json';

export const MAX_CLUE_NUM = 8;

// Define the default qualities of a card
export const CARD_W = 286;
export const CARD_H = 406;
export const PLAY_AREA_PADDING = 1.15;
export const HAND_PADDING = 1.05;
export const HAND_BASE_SCALE = 0.40;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
export const PLAY_AREA_BASE_SCALE = 0.40;

export const CARD_FADE = 0.6;

// Other miscellaneous constants
export const LABEL_COLOR = '#d8d5ef'; // Off-white
export const TOOLTIP_DELAY = 500; // In milliseconds
export const ARROW_COLOR = {
    DEFAULT: '#ffffff', // White
    RETOUCHED: '#737373', // Dark gray
    HIGHLIGHT: '#ffdf00', // Yellow
};

// These constants much match their server-side counterparts
export const ACT = {
    CLUE: 0,
    PLAY: 1,
    DISCARD: 2,
    DECKPLAY: 3,
};
export const CLUE_TYPE = {
    RANK: 0,
    COLOR: 1,
};
export const REPLAY_ACTION_TYPE = {
    TURN: 0,
    ARROW: 1,
    LEADER_TRANSFER: 2,
    MORPH: 3,
    SOUND: 4,
    HYPO_START: 5,
    HYPO_END: 6,
    HYPO_ACTION: 7,
};
export const REPLAY_ARROW_ORDER = {
    DECK: -1,
    CLUES: -2,
    PACE: -3,
    EFFICIENCY: -4,
    MIN_EFFICIENCY: -5,
};
export const STACK_DIRECTION = { // Used in the "Up or Down" variants
    UNDECIDED: 0,
    UP: 1,
    DOWN: 2,
    FINISHED: 3,
};
export const STACK_BASE_RANK = 0;
export const UNKNOWN_CARD_RANK = 6;
export const START_CARD_RANK = 7;

/*
    Import colors from the JSON file and create a map
*/

interface Color {
    readonly name: string,

    readonly abbreviation: string,
    readonly fill: string,
}

export const COLORS: Map<string, Color> = new Map();

for (const [colorName, colorJSON] of Object.entries(colorsJSON)) {
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

    // Add it to the map
    const color: Color = {
        name,
        abbreviation,
        fill,
    };
    COLORS.set(colorName, color);
}

/*
    Import suits from the JSON file and create a map
*/

interface Suit {
    readonly name: string,

    readonly abbreviation: string,
    readonly allClueColors: boolean,
    readonly clueColors: Array<Color>,
    readonly clueRanks: string,
    readonly fill: string,
    readonly fillColors: Array<string>,
    readonly oneOfEach: boolean,
    readonly pip: string,
}

export const SUITS: Map<string, Suit> = new Map();

for (const [suitName, suitJSON] of Object.entries(suitsJSON)) {
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
        const msg = `The "allClueColors" property for the suit "${suitName}" must be set to true.`;
        throw new Error(msg);
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
                const msg = `The color "${colorString}" in the suit "${suitName}" does not exist.`;
                throw new Error(msg);
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
        const msg = `The "oneOfEach" property for the suit "${suitName}" must be set to true.`;
        throw new Error(msg);
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

interface Variant {
    readonly name: string,

    readonly id: number,
    readonly suits: Array<Suit>,
    readonly ranks: Array<number>,
    readonly clueColors: Array<Color>,
    readonly clueRanks: Array<number>,
    readonly showSuitNames: boolean,
    readonly spacing: boolean,
    readonly maxScore: number,
    readonly offsetCornerElements: boolean,
}

export const VARIANTS: Map<string, Variant> = new Map();

for (const [variantName, variantJSON] of Object.entries(variantsJSON)) {
    // Validate the name
    const name: string = variantName;
    if (name === '') {
        throw new Error('There is a variant with an empty name in the "variants.json" file.');
    }

    // Validate the ID
    const id: number = variantJSON.id;
    if (id < 0) {
        throw new Error(`The "${name}" variant does not have an ID.`);
    }

    // Validate the suits
    if (!Object.hasOwnProperty.call(variantJSON, 'suits')) {
        throw new Error(`The "${name}" variant does not have suits.`);
    }
    if (!Array.isArray(variantJSON.suits)) {
        throw new Error(`The suits for the variant "${name}" were not specified as an array.`);
    }
    if (variantJSON.suits.length === 0) {
        throw new Error(`The suits for the variant "${name}" is empty.`);
    }

    // The suits are specified as an array of strings
    // Convert the strings to objects
    const suits: Array<Suit> = [];
    for (const suitString of variantJSON.suits) {
        if (typeof suitString !== 'string') {
            const msg = `One of the suits for the variant "${name}" was not specified as a string.`;
            throw new Error(msg);
        }

        const suitObject = SUITS.get(suitString);
        if (suitObject) {
            suits.push(suitObject);
        } else {
            const msg = `The suit "${suitString}" in the variant "${name}" does not exist.`;
            throw new Error(msg);
        }
    }

    // Derive the ranks (the ranks that the cards of each suit will be)
    // By default, assume ranks 1 through 5
    const ranks = [1, 2, 3, 4, 5];
    if (name.startsWith('Up or Down')) {
        // The "Up or Down" variants have START cards
        ranks.push(START_CARD_RANK);
    }

    // Validate the clue colors (the colors available to clue in this variant)
    const clueColors: Array<Color> = [];
    if (Object.hasOwnProperty.call(variantJSON, 'clueColors')) {
        if (!Array.isArray(variantJSON.clueColors)) {
            const msg = `The clue colors for the variant "${name}" were not specified as an array.`;
            throw new Error(msg);
        }

        // The clue colors are specified as an array of strings
        // Convert the strings to objects
        for (const colorString of variantJSON.clueColors!) {
            if (typeof colorString !== 'string') {
                throw new Error(`One of the clue colors for the variant "${name}" was not specified as a string.`);
            }

            const colorObject = COLORS.get(colorString);
            if (colorObject) {
                clueColors.push(colorObject);
            } else {
                const msg = `The color "${colorString}" in the variant "${name}" does not exist.`;
                throw new Error(msg);
            }
        }
    } else {
        // The clue colors were not specified in the JSON, so derive them from the suits
        for (const suit of suits) {
            if (suit.allClueColors) {
                // If a suit is touched by all colors, then we don't want to add
                // every single clue color to the variant clue list
                continue;
            }
            for (const color of suit.clueColors) {
                if (!clueColors.includes(color)) {
                    clueColors.push(color);
                }
            }
        }
    }

    // Validate the clue ranks (the ranks available to clue in this variant)
    // If it is not specified, assume that players can clue ranks 1 through 5
    const clueRanks: Array<number> = variantJSON.clueRanks || [1, 2, 3, 4, 5];

    // Validate the "showSuitNames" property
    // If it is not specified, assume that we are not showing the suit names
    if (
        Object.hasOwnProperty.call(variantJSON, 'showSuitNames')
        && variantJSON.showSuitNames !== true
    ) {
        const msg = `The "showSuitNames" property for the variant "${variantName}" must be set to true.`;
        throw new Error(msg);
    }
    const showSuitNames: boolean = variantJSON.showSuitNames || false;

    // Validate the "spacing" property
    // If it is not specified, assume that there is no spacing
    if (
        Object.hasOwnProperty.call(variantJSON, 'spacing')
        && variantJSON.spacing !== true
    ) {
        const msg = `The "spacing" property for the variant "${variantName}" must be set to true.`;
        throw new Error(msg);
    }
    const spacing: boolean = variantJSON.spacing || false;

    // Assume 5 cards per stack
    const maxScore = suits.length * 5;

    // Variants with dual-color suits need to adjust the positions of elements in the corner
    // of the card (e.g. the note indicator) because it will overlap with the triangle that
    // shows the color composition of the suit
    const offsetCornerElements = suits.some((suit: Suit) => suit.clueColors.length > 1);

    // Add it to the map
    const variant: Variant = {
        name,
        id,
        suits,
        ranks,
        clueColors,
        clueRanks,
        showSuitNames,
        spacing,
        maxScore,
        offsetCornerElements,
    };
    VARIANTS.set(variantName, variant);
}

interface Character {
    readonly name: string,

    readonly id: number,
    readonly description: string,
    readonly emoji: string,
}

export const CHARACTERS: Map<string, Character> = new Map();

for (const [characterName, characterJSON] of Object.entries(charactersJSON)) {
    // Validate the name
    const name: string = characterName;
    if (name === '') {
        throw new Error('There is a character with an empty name in the "characters.json" file.');
    }

    // Validate the description
    const description: string = characterJSON.description || '';
    if (description === '') {
        throw new Error(`The "${characterName}" character does not have a description.`);
    }

    // Validate the emoji
    const emoji: string = characterJSON.emoji || '';
    if (emoji === '') {
        throw new Error(`The "${characterName}" character does not have an emoji.`);
    }
}
