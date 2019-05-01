/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

const colors = require('../../data/colors');
const suits = require('../../data/suits');
const variants = require('../../data/variants');
const characters = require('../../data/characters');

// Define the defeault qualities of a card
exports.CARD_W = 286;
exports.CARD_H = 406;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
exports.PHASER_DEMO_SCALE = 0.35;
exports.CARD_FADE = 0.6;

// Other miscellaneous constants
exports.LABEL_COLOR = '#d8d5ef'; // Off-white
exports.TOOLTIP_DELAY = 500; // In milliseconds
exports.ARROW_COLOR = {
    DEFAULT: '#ffffff', // White
    RETOUCHED: '#737373', // Dark gray
    HIGHLIGHT: '#ffdf00', // Yellow
};

// These constants much match their server-side counterparts
exports.ACT = {
    CLUE: 0,
    PLAY: 1,
    DISCARD: 2,
    DECKPLAY: 3,
};
exports.CLUE_TYPE = {
    RANK: 0,
    COLOR: 1,
};
exports.REPLAY_ACTION_TYPE = {
    TURN: 0,
    ARROW: 1,
    LEADER_TRANSFER: 2,
    MORPH: 3,
    SOUND: 4,
    HYPO_START: 5,
    HYPO_END: 6,
    HYPO_ACTION: 7,
};
exports.REPLAY_ARROW_ORDER = {
    STACK1: -1,
    STACK2: -2,
    STACK3: -3,
    STACK4: -4,
    STACK5: -5,
    STACK6: -6,
    DECK: -7,
    CLUES: -8,
    PACE: -9,
    EFFICIENCY: -10,
    MIN_EFFICIENCY: -11,
};
exports.STACK_DIRECTION = { // Used in the "Up or Down" variants
    UNDECIDED: 0,
    UP: 1,
    DOWN: 2,
    FINISHED: 3,
};
exports.START_CARD_RANK = 7;

// Validate the colors from the JSON file, filling in some values if necessary
const initColors = () => {
    for (const colorName of Object.keys(colors)) {
        const color = colors[colorName];

        // Copy the name to the object
        color.name = colorName;

        // Validate that there is an abbreviation
        if (!Object.hasOwnProperty.call(color, 'abbreviation')) {
            // Assume that it is the first letter of the color
            color.abbreviation = colorName.charAt(0);
        }

        // Validate that there is a fill
        if (!Object.hasOwnProperty.call(color, 'fill')) {
            throw new Error(`Failed to find the fill for the "${colorName}" color.`);
        }
    }
};
initColors();
exports.COLORS = colors;

// Validate the suits from the JSON file, filling in some values if necessary
const initSuits = () => {
    for (const suitName of Object.keys(suits)) {
        const suit = suits[suitName];

        // Validate that there is a name
        if (!Object.hasOwnProperty.call(suit, 'name')) {
            // By default, the suit is named the same as the key
            suit.name = suitName;
        }

        // Validate that there is an abbreviation
        if (!Object.hasOwnProperty.call(suit, 'abbreviation')) {
            if (
                Object.hasOwnProperty.call(colors, suit.name)
                && Object.hasOwnProperty.call(colors[suit.name], 'abbreviation')
            ) {
                // By default, use the abbreviation of the color with the same name
                suit.abbreviation = colors[suit.name].abbreviation;
            } else {
                // Assume that it is the first letter of the color
                suit.abbreviation = suit.name.charAt(0);
            }
        }

        // Validate the clue colors (the colors that touch this suit)
        if (suit.allClueColors) {
            // Handle suits that are touched by all color clues
            suit.clueColors = Object.values(colors);
        } else if (Object.hasOwnProperty.call(suit, 'clueColors')) {
            // Convert strings to objects
            const colorList = [];
            for (const color of suit.clueColors) {
                if (Object.hasOwnProperty.call(colors, color)) {
                    colorList.push(colors[color]);
                } else {
                    const msg = `The color "${color}" in the suit "${suitName}" does not exist.`;
                    throw new Error(msg);
                }
            }
            suit.clueColors = colorList;
        } else if (Object.hasOwnProperty.call(colors, suit.name)) {
            // By default, use the color of the same name
            const color = colors[suit.name];
            suit.clueColors = [color];
        } else if (suitName !== 'Unknown') {
            // The "Unknown" suit is not supposed to have clue colors
            let msg = `Failed to find the clue colors for the "${suitName}" suit. `;
            msg += `(There is no corresponding color named "${suitName}".)`;
            throw new Error(msg);
        }

        // Validate the clue ranks (the ranks that touch this suit)
        if (!Object.hasOwnProperty.call(suit, 'clueRanks')) {
            // Assume that the ranks work normally (e.g. a rank 1 clue touches a blue 1)
            suit.clueRanks = 'normal';
        }

        // Validate that there is a fill
        if (!Object.hasOwnProperty.call(suit, 'fill')) {
            if (Object.hasOwnProperty.call(colors, suit.name)) {
                // By default, use the fill of the color with the same name
                suit.fill = colors[suit.name].fill;
            } else if (suit.clueColors.length > 0) {
                // Assume that is it the same as the first clue color
                suit.fill = suit.clueColors[0].fill;
            } else {
                let msg = `Failed to find the fill for the "${suitName}" suit. `;
                msg += `(There is no corresponding color named "${suitName}".)`;
                throw new Error(msg);
            }
        }

        // Validate that there is a "oneOfEach" property
        if (!Object.hasOwnProperty.call(suit, 'oneOfEach')) {
            // By default, the suit is not one of each (e.g. every card is critical)
            suit.oneOfEach = false;
        }
    }
};
initSuits();
exports.SUITS = suits;

const initVariants = () => {
    for (const variantName of Object.keys(variants)) {
        const variant = variants[variantName];

        // Copy the name to the object
        variant.name = variantName;

        // Validate that there is an ID
        if (!Object.hasOwnProperty.call(variant, 'id')) {
            throw new Error(`The "${variantName}" variant does not have an ID.`);
        }

        // Validate the suits
        if (!Object.hasOwnProperty.call(variant, 'suits')) {
            throw new Error(`The "${variantName}" variant does not have suits.`);
        }

        // Convert suit strings to objects
        const suitList = [];
        for (const suit of variant.suits) {
            if (Object.hasOwnProperty.call(suits, suit)) {
                suitList.push(suits[suit]);
            } else {
                const msg = `The suit "${suit}" in the variant "${variantName}" does not exist.`;
                throw new Error(msg);
            }
        }
        variant.suits = suitList;

        // Derive the ranks (the ranks that the cards of each suit will be)
        // By default, assume ranks 1 through 5
        variant.ranks = [1, 2, 3, 4, 5];
        if (variantName.startsWith('Up or Down')) {
            // The "Up or Down" variants have START cards
            variant.ranks.push(exports.START_CARD_RANK);
        }

        // Validate or derive the clue colors (the colors available to clue in this variant)
        if (Object.hasOwnProperty.call(variant, 'clueColors')) {
            // The clue colors were specified in the JSON, so convert color strings to objects
            const colorList = [];
            for (const color of variant.clueColors) {
                if (Object.hasOwnProperty.call(colors, color)) {
                    colorList.push(colors[color]);
                } else {
                    const msg = `The color "${color}" in the variant "${variantName}" does not exist.`;
                    throw new Error(msg);
                }
            }
            variant.clueColors = colorList;
        } else {
            // The clue colors were not specified in the JSON, so derive them from the suits
            variant.clueColors = [];
            for (const suit of variant.suits) {
                if (suit.allClueColors) {
                    // If a suit is touched by all colors, then we don't want to add
                    // every single clue color to the variant clue list
                    continue;
                }
                for (const color of suit.clueColors) {
                    if (!variant.clueColors.includes(color)) {
                        variant.clueColors.push(color);
                    }
                }
            }
        }

        // Derive the clue ranks (the ranks available to clue in this variant)
        if (variantName.startsWith('Number Mute')) {
            variant.clueRanks = [];
        } else if (variantName.startsWith('Multi-Fives')) {
            variant.clueRanks = [1, 2, 3, 4];
        } else {
            // By default, assume that we can clue ranks 1 through 5
            variant.clueRanks = [1, 2, 3, 4, 5];
        }

        // Validate that there is a "showSuitNames" property
        if (!Object.hasOwnProperty.call(variant, 'showSuitNames')) {
            // By default, we do not show suit names
            variant.showSuitNames = false;
        }

        // Validate that there is a "spacing" property
        if (!Object.hasOwnProperty.call(variant, 'spacing')) {
            // By default, we do not want to put a separator after this variant
            variant.spacing = false;
        }

        // Assume 5 cards per stack
        variant.maxScore = variant.suits.length * 5;

        // Variants with dual-color suits need to adjust the positions of elements in the corner
        // of the card (e.g. the note indicator) because it will overlap with the triangle that
        // shows the color composition of the suit
        variant.offsetCornerElements = variant.suits.some(suit => suit.clueColors.length > 1);
    }
};
initVariants();
exports.VARIANTS = variants;

const initCharacters = () => {
    for (const characterName of Object.keys(characters)) {
        const character = characters[characterName];

        // Copy the name to the object
        character.name = characterName;

        // Validate that there is a description
        if (!Object.hasOwnProperty.call(character, 'description')) {
            throw new Error(`The "${characterName}" character does not have a description.`);
        }

        // Validate that there is an emoji
        if (!Object.hasOwnProperty.call(character, 'emoji')) {
            throw new Error(`The "${characterName}" character does not have an emoji.`);
        }
    }
};
initCharacters();
exports.CHARACTERS = characters;

// Also make the constants available from the JavaScript console (for debugging purposes)
window.constants = exports;
