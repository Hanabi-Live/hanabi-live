/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

// Define the defeault qualities of a card
exports.CARD_W = 286;
exports.CARD_H = 406;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
exports.PHASER_DEMO_SCALE = 0.35;
exports.CARD_FADE = 0.6;

// Other misc. constants
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

class Color {
    constructor(name, abbreviation, hexCode) {
        this.name = name;
        this.abbreviation = abbreviation;
        this.hexCode = hexCode;
    }
}

const COLOR = {
    // No variant
    BLUE: new Color('Blue', 'B', '#0044cc'),
    GREEN: new Color('Green', 'G', '#00cc00'),
    YELLOW: new Color('Yellow', 'Y', '#ccaa22'),
    RED: new Color('Red', 'R', '#aa0000'),
    PURPLE: new Color('Purple', 'P', '#6600cc'),
    UNKNOWN: new Color('Unknown', 'U', '#cccccc'),

    // Basic variants
    TEAL: new Color('Teal', 'T', '#00cccc'),
    BLACK: new Color('Black', 'K', '#111111'),
    WHITE: new Color('White', 'W', '#d9d9d9'),
    BROWN: new Color('Brown', 'N', '#654321'),
    PINK: new Color('Pink', 'I', '#ff69b4'),

    // Black combination variants
    DARK_PINK: new Color('Dark Pink', 'I', '#660033'),
    GRAY: new Color('Gray', 'A', '#555555'),
    CHOCOLATE: new Color('Chocolate', 'C', '#4d2800'),

    // "Ambiguous" variants
    L_BLUE: new Color('Sky', 'S', '#1a66ff'),
    D_BLUE: new Color('Navy', 'N', '#002b80'),
    L_GREEN: new Color('Lime', 'L', '#1aff1a'),
    D_GREEN: new Color('Forest', 'F', '#008000'),
    L_RED: new Color('Tomato', 'T', '#e60000'),
    D_RED: new Color('Mahogany', 'M', '#660000'),

    // "Very Ambiguous" various
    BLUE1: new Color('Sky', 'S', '#4d88ff'),
    BLUE3: new Color('Navy', 'N', '#001a4d'),
    RED1: new Color('Tomato', 'T', '#ff1a1a'),
    RED3: new Color('Mahogany', 'M', '#330000'),

    // Dual-color variants
    NAVY: new Color('Navy', 'N', '#000066'),
    ORANGE: new Color('Orange', 'O', '#ff8800'),
    TAN: new Color('Tan', 'T', '#999900'),
    MAHOGANY: new Color('Mahogany', 'M', '#660016'),
    LIME: new Color('Lime', 'L', '#80c000'),
    CARDINAL: new Color('Cardinal', 'C', '#810735'),
    INDIGO: new Color('Indigo', 'I', '#1a0082'),
};
exports.COLOR = COLOR;

const FILL_TYPE = {
    SOLID: 'solid',
    LINEAR_GRADIENT: 'linear_gradient',
    RADIAL_GRADIENT: 'radial_gradient',
};

// Base colors
const baseColors = [
    COLOR.BLUE,
    COLOR.GREEN,
    COLOR.YELLOW,
    COLOR.RED,
    COLOR.PURPLE,
];
const baseColors4 = $.extend([], baseColors);
baseColors4.pop();
const baseColors3 = $.extend([], baseColors4);
baseColors3.pop();
const baseColors2 = $.extend([], baseColors3);
baseColors2.pop();
const baseColors1 = $.extend([], baseColors2);
baseColors1.pop();

// Teal
const baseColorsPlusTeal = $.extend([], baseColors);
baseColorsPlusTeal.push(COLOR.TEAL);

// Black
const baseColorsPlusBlack = $.extend([], baseColors);
baseColorsPlusBlack.push(COLOR.BLACK);
const baseColors4plusBlack = $.extend([], baseColors4);
baseColors4plusBlack.push(COLOR.BLACK);
const baseColors3plusBlack = $.extend([], baseColors3);
baseColors3plusBlack.push(COLOR.BLACK);

// Pink
const baseColorsPlusPink = $.extend([], baseColors);
baseColorsPlusPink.push(COLOR.PINK);
const baseColors4plusPink = $.extend([], baseColors4);
baseColors4plusPink.push(COLOR.PINK);
const baseColors3plusPink = $.extend([], baseColors3);
baseColors3plusPink.push(COLOR.PINK);
const baseColors2plusPink = $.extend([], baseColors2);
baseColors2plusPink.push(COLOR.PINK);
const baseColors1plusPink = $.extend([], baseColors1);
baseColors1plusPink.push(COLOR.PINK);

// Black & Pink
const baseColors4plusBlackPink = $.extend([], baseColors4plusBlack);
baseColors4plusBlackPink.push(COLOR.PINK);
const baseColors3plusBlackPink = $.extend([], baseColors3plusBlack);
baseColors3plusBlackPink.push(COLOR.PINK);

// Brown
const baseColorsPlusBrown = $.extend([], baseColors);
baseColorsPlusBrown.push(COLOR.BROWN);
const baseColors4plusBrown = $.extend([], baseColors4);
baseColors4plusBrown.push(COLOR.BROWN);
const baseColors3plusBrown = $.extend([], baseColors3);
baseColors3plusBrown.push(COLOR.BROWN);
const baseColors2plusBrown = $.extend([], baseColors2);
baseColors2plusBrown.push(COLOR.BROWN);
const baseColors1plusBrown = $.extend([], baseColors1);
baseColors1plusBrown.push(COLOR.BROWN);

// Black & Brown
const baseColors4plusBlackBrown = $.extend([], baseColors4plusBlack);
baseColors4plusBlackBrown.push(COLOR.BROWN);
const baseColors3plusBlackBrown = $.extend([], baseColors3plusBlack);
baseColors3plusBlackBrown.push(COLOR.BROWN);

// Pink & Brown
const baseColors4plusPinkBrown = $.extend([], baseColors4plusPink);
baseColors4plusPinkBrown.push(COLOR.BROWN);
const baseColors3plusPinkBrown = $.extend([], baseColors3plusPink);
baseColors3plusPinkBrown.push(COLOR.BROWN);
const baseColors2plusPinkBrown = $.extend([], baseColors2plusPink);
baseColors2plusPinkBrown.push(COLOR.BROWN);
const baseColors1plusPinkBrown = $.extend([], baseColors1plusPink);
baseColors1plusPinkBrown.push(COLOR.BROWN);

// Specify between solid color and gradients,
// along with additional args in the case of gradients
class FillSpec {
    constructor(fillType, args = null) {
        this.fillType = fillType;
        this.args = args;
    }
}

const solidFillSpec = new FillSpec(FILL_TYPE.SOLID);
const multiBkgFillSpec = new FillSpec(
    FILL_TYPE.LINEAR_GRADIENT,
    [0, 0, 0, exports.CARD_H],
);
const multiNumberFillSpec = new FillSpec(
    FILL_TYPE.LINEAR_GRADIENT,
    [0, 14, 0, 110],
);
const multiSymbolFillSpec = new FillSpec(
    FILL_TYPE.RADIAL_GRADIENT,
    [75, 150, 25, 75, 150, 75],
);

exports.CARD_AREA = {
    BACKGROUND: 'background',
    NUMBER: 'number',
    SYMBOL: 'symbol',
};

// Bundles fill specs together for all the card attributes (background, number, symbol)
const buildCardFillSpec = (
    backgroundFillSpec,
    numberFillSpec,
    symbolFillSpec,
) => new Map([
    [exports.CARD_AREA.BACKGROUND, backgroundFillSpec],
    [exports.CARD_AREA.NUMBER, numberFillSpec],
    [exports.CARD_AREA.SYMBOL, symbolFillSpec],
]);
const basicCardFillSpec = buildCardFillSpec(
    solidFillSpec,
    solidFillSpec,
    solidFillSpec,
);
const multiCardFillSpec = buildCardFillSpec(
    multiBkgFillSpec,
    multiNumberFillSpec,
    multiSymbolFillSpec,
);

// Generates a vertical gradient that is evenly distributed between its component colors
const evenLinearGradient = (ctx, colors, args) => {
    const grad = ctx.createLinearGradient(...args);
    const nColors = colors.length;
    for (let i = 0; i < nColors; ++i) {
        grad.addColorStop(i / (nColors - 1), colors[i].hexCode);
    }
    return grad;
};

// Generates a radial gradient that is evenly distributed between its component colors
const evenRadialGradient = (ctx, colors, args) => {
    const grad = ctx.createRadialGradient(...args);
    const nColors = colors.length;
    for (let i = 0; i < nColors; ++i) {
        grad.addColorStop(i / (nColors - 1), colors[i].hexCode);
    }
    return grad;
};

class Suit {
    constructor(
        name,
        abbreviation,
        fillColors,
        cardFillSpec,
        clueColors,
        oneOfEach = false,
    ) {
        this.name = name;
        this.abbreviation = abbreviation;
        this.fillColors = fillColors;
        this.cardFillSpec = cardFillSpec;
        this.clueColors = clueColors;
        this.oneOfEach = oneOfEach;
    }

    // Returns the style (color, gradient, etc.) for a given card area (bkg, number, symbol)
    style(ctx, cardArea) {
        const fillSpec = this.cardFillSpec.get(cardArea); // "this.cardFillSpec" is a Map()
        const { fillType } = fillSpec;
        const colors = this.fillColors;

        if (fillType === FILL_TYPE.SOLID) {
            // "colors" in this case should be a single color, not an array
            return colors.hexCode;
        }
        if (fillType === FILL_TYPE.LINEAR_GRADIENT) {
            return evenLinearGradient(ctx, colors, fillSpec.args);
        }
        if (fillType === FILL_TYPE.RADIAL_GRADIENT) {
            return evenRadialGradient(ctx, colors, fillSpec.args);
        }

        return null;
    }
}

// It probably isn't design-necessary to define this list of suits, but it will only hurt if we have
// a lot of instances of suits that vary in property between variants
const SUIT = {
    // The base game
    BLUE: new Suit(
        'Blue',
        'B',
        COLOR.BLUE,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    GREEN: new Suit(
        'Green',
        'G',
        COLOR.GREEN,
        basicCardFillSpec,
        [COLOR.GREEN],
    ),
    YELLOW: new Suit(
        'Yellow',
        'Y',
        COLOR.YELLOW,
        basicCardFillSpec,
        [COLOR.YELLOW],
    ),
    RED: new Suit(
        'Red',
        'R',
        COLOR.RED,
        basicCardFillSpec,
        [COLOR.RED],
    ),
    PURPLE: new Suit(
        'Purple',
        'P',
        COLOR.PURPLE,
        basicCardFillSpec,
        [COLOR.PURPLE],
    ),

    // This represents cards of unknown suit; it must not be included in variants
    UNKNOWN: new Suit(
        'Unknown',
        '',
        COLOR.UNKNOWN,
        basicCardFillSpec,
        null,
        [],
    ),

    // Basic variants
    TEAL: new Suit(
        'Teal',
        'T',
        COLOR.TEAL,
        basicCardFillSpec,
        [COLOR.TEAL],
    ),
    WHITE: new Suit(
        'White',
        'W',
        COLOR.WHITE,
        basicCardFillSpec,
        [COLOR.WHITE],
    ),
    BROWN: new Suit(
        'Brown',
        'N',
        COLOR.BROWN,
        basicCardFillSpec,
        [COLOR.BROWN],
    ),
    BLACK: new Suit(
        'Black',
        'K',
        COLOR.BLACK,
        basicCardFillSpec,
        [COLOR.BLACK],
        true, // This suit has one of each card
    ),
    RAINBOW: new Suit(
        'Rainbow',
        'M',
        baseColors,
        multiCardFillSpec,
        Object.values(COLOR),
    ),
    PINK: new Suit(
        'Pink',
        'P',
        COLOR.PINK,
        basicCardFillSpec,
        [COLOR.PINK],
    ),

    // Black combination suits
    DARK_RAINBOW: new Suit(
        'Rainbow',
        'M',
        [
            new Color(null, null, '#000555'),
            new Color(null, null, '#005505'),
            new Color(null, null, '#555500'),
            new Color(null, null, '#5F0000'),
            new Color(null, null, '#550055'),
        ],
        multiCardFillSpec,
        Object.values(COLOR),
        true, // This suit has one of each card
    ),
    DARK_PINK: new Suit(
        'Dark Pink',
        'I',
        COLOR.DARK_PINK,
        basicCardFillSpec,
        [COLOR.PINK],
        true, // This suit has one of each card
    ),
    GRAY: new Suit(
        'Gray',
        'A',
        COLOR.GRAY,
        basicCardFillSpec,
        [COLOR.GRAY],
        true, // This suit has one of each card
    ),
    CHOCOLATE: new Suit(
        'Chocolate',
        'C',
        COLOR.CHOCOLATE,
        basicCardFillSpec,
        [COLOR.BROWN],
        true, // This suit has one of each card
    ),

    // For "Color Blind"
    CB_BLUE: new Suit(
        'Blue',
        'B',
        COLOR.BLUE,
        basicCardFillSpec,
        [],
    ),
    CB_GREEN: new Suit(
        'Green',
        'G',
        COLOR.GREEN,
        basicCardFillSpec,
        [],
    ),
    CB_YELLOW: new Suit(
        'Yellow',
        'Y',
        COLOR.YELLOW,
        basicCardFillSpec,
        [],
    ),
    CB_RED: new Suit(
        'Red',
        'R',
        COLOR.RED,
        basicCardFillSpec,
        [],
    ),
    CB_PURPLE: new Suit(
        'Purple',
        'P',
        COLOR.PURPLE,
        basicCardFillSpec,
        [],
    ),
    CB_TEAL: new Suit(
        'Teal',
        'T',
        COLOR.TEAL,
        basicCardFillSpec,
        [],
    ),

    // For "Ambiguous"
    L_BLUE: new Suit(
        'Sky',
        'S',
        COLOR.L_BLUE,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    D_BLUE: new Suit(
        'Navy',
        'N',
        COLOR.D_BLUE,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    L_GREEN: new Suit(
        'Lime',
        'L',
        COLOR.L_GREEN,
        basicCardFillSpec,
        [COLOR.GREEN],
    ),
    D_GREEN: new Suit(
        'Forest',
        'F',
        COLOR.D_GREEN,
        basicCardFillSpec,
        [COLOR.GREEN],
    ),
    L_RED: new Suit(
        'Tomato',
        'T',
        COLOR.L_RED,
        basicCardFillSpec,
        [COLOR.RED],
    ),
    D_RED: new Suit(
        'Mahogany',
        'B',
        COLOR.D_RED,
        basicCardFillSpec,
        [COLOR.RED],
    ),

    // For "Very Ambiguous"
    BLUE1: new Suit(
        'Sky',
        'S',
        COLOR.BLUE1,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    BLUE2: new Suit(
        'Berry',
        'B',
        COLOR.BLUE,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    BLUE3: new Suit(
        'Navy',
        'N',
        COLOR.BLUE3,
        basicCardFillSpec,
        [COLOR.BLUE],
    ),
    RED1: new Suit(
        'Tomato',
        'T',
        COLOR.RED1,
        basicCardFillSpec,
        [COLOR.RED],
    ),
    RED2: new Suit(
        'Ruby',
        'R',
        COLOR.RED,
        basicCardFillSpec,
        [COLOR.RED],
    ),
    RED3: new Suit(
        'Mahogany',
        'M',
        COLOR.RED3,
        basicCardFillSpec,
        [COLOR.RED],
    ),

    // For "Dual-Color (6 Suits)"
    M_GREEN: new Suit(
        'Green',
        'G',
        COLOR.GREEN,
        basicCardFillSpec,
        [
            COLOR.BLUE,
            COLOR.YELLOW,
        ],
    ),
    M_PURPLE: new Suit(
        'Purple',
        'P',
        COLOR.PURPLE,
        basicCardFillSpec,
        [
            COLOR.BLUE,
            COLOR.RED,
        ],
    ),
    NAVY: new Suit(
        'Navy',
        'N',
        COLOR.NAVY,
        basicCardFillSpec,
        [
            COLOR.BLUE,
            COLOR.BLACK,
        ],
    ),
    ORANGE: new Suit(
        'Orange',
        'O',
        COLOR.ORANGE,
        basicCardFillSpec,
        [
            COLOR.YELLOW,
            COLOR.RED,
        ],
    ),
    TAN: new Suit(
        'Tan',
        'T',
        COLOR.TAN,
        basicCardFillSpec,
        [
            COLOR.YELLOW,
            COLOR.BLACK,
        ],
    ),
    MAHOGANY: new Suit(
        'Mahogany',
        'M',
        COLOR.MAHOGANY,
        basicCardFillSpec,
        [
            COLOR.RED,
            COLOR.BLACK,
        ],
    ),

    // For "Dual-Color (5 Suits)"
    M_TEAL: new Suit(
        'Teal',
        'T',
        COLOR.TEAL,
        basicCardFillSpec,
        [
            COLOR.BLUE,
            COLOR.GREEN,
        ],
    ),
    LIME: new Suit(
        'Lime',
        'L',
        COLOR.LIME,
        basicCardFillSpec,
        [
            COLOR.GREEN,
            COLOR.YELLOW,
        ],
    ),
    // Orange is reused
    CARDINAL: new Suit(
        'Cardinal',
        'C',
        COLOR.CARDINAL,
        basicCardFillSpec,
        [
            COLOR.RED,
            COLOR.PURPLE,
        ],
    ),
    INDIGO: new Suit(
        'Indigo',
        'I',
        COLOR.INDIGO,
        basicCardFillSpec,
        [
            COLOR.PURPLE,
            COLOR.BLUE,
        ],
    ),
};
exports.SUIT = SUIT;

class Variant {
    constructor(suits, clueColors, showSuitNames, spacing = false) {
        this.suits = suits;
        this.ranks = [1, 2, 3, 4, 5];
        this.clueColors = clueColors;
        // We draw text of the suit names below the stacks for confusing variants
        this.showSuitNames = showSuitNames;
        this.spacing = spacing;

        // Dual-color variants will have triangles in the corner of the card to indicate what colors
        // the suit is composed of; if so, we will need to move the note indicator downwards
        this.offsetCornerElements = suits.some(
            suit => suit !== SUIT.RAINBOW
                && suit !== SUIT.DARK_RAINBOW
                && suit.clueColors.length > 1,
        );
        this.maxScore = suits.length * 5;
    }
}

exports.VARIANTS = {
    // Normal
    'No Variant': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Six Suits': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Four Suits': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Three Suits': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Black
    'Black (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.BLACK,
        ],
        baseColorsPlusBlack,
        false,
    ),
    'Black (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
        ],
        baseColors4plusBlack,
        false,
        true, // This is the final variant in this section
    ),

    // Rainbow
    'Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'Rainbow (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'Rainbow (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.RAINBOW,
        ],
        baseColors2,
        false,
        true, // This is the final variant in this section
    ),

    // Pink
    'Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.PINK,
        ],
        baseColorsPlusPink,
        false,
    ),
    'Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'Pink (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
        ],
        baseColors3plusPink,
        false,
    ),
    'Pink (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.PINK,
        ],
        baseColors2plusPink,
        false,
        true, // This is the final variant in this section
    ),

    // White
    'White (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.WHITE,
        ],
        baseColors,
        false,
    ),
    'White (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
        ],
        baseColors4,
        false,
    ),
    'White (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.WHITE,
        ],
        baseColors3,
        false,
    ),
    'White (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.WHITE,
        ],
        baseColors2,
        false,
        true, // This is the final variant in this section
    ),

    // Brown
    'Brown (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.BROWN,
        ],
        baseColorsPlusBrown,
        false,
    ),
    'Brown (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BROWN,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Brown (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BROWN,
        ],
        baseColors3plusBrown,
        false,
    ),
    'Brown (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.BROWN,
        ],
        baseColors2plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Black & Rainbow
    'Black & Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.RAINBOW,
        ],
        baseColors4plusBlack,
        false,
    ),
    'Black & Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BLACK,
            SUIT.RAINBOW,
        ],
        baseColors3plusBlack,
        false,
        true, // This is the final variant in this section
    ),

    // Black & Pink
    'Black & Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.PINK,
        ],
        baseColors4plusBlackPink,
        false,
    ),
    'Black & Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BLACK,
            SUIT.PINK,
        ],
        baseColors3plusBlackPink,
        false,
        true, // This is the final variant in this section
    ),

    // Black & White
    'Black & White (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.WHITE,
        ],
        baseColors4plusBlack,
        false,
    ),
    'Black & White (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BLACK,
            SUIT.WHITE,
        ],
        baseColors3plusBlack,
        false,
        true, // This is the final variant in this section
    ),

    // Black & Brown
    'Black & Brown (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.BROWN,
        ],
        baseColors4plusBlackBrown,
        false,
    ),
    'Black & Brown (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BLACK,
            SUIT.BROWN,
        ],
        baseColors3plusBlackBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Rainbow & Pink
    'Rainbow & Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'Rainbow & Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.PINK,
        ],
        baseColors3plusPink,
        false,
    ),
    'Rainbow & Pink (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.RAINBOW,
            SUIT.PINK,
        ],
        baseColors2plusPink,
        false,
        true, // This is the final variant in this section
    ),

    // Rainbow & White
    'Rainbow & White (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.WHITE,
        ],
        baseColors4,
        false,
    ),
    'Rainbow & White (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.WHITE,
        ],
        baseColors3,
        false,
    ),
    'Rainbow & White (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.RAINBOW,
            SUIT.WHITE,
        ],
        baseColors2,
        false,
        true, // This is the final variant in this section
    ),

    // Rainbow & Brown
    'Rainbow & Brown (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.BROWN,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Rainbow & Brown (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.BROWN,
        ],
        baseColors3plusBrown,
        false,
    ),
    'Rainbow & Brown (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.RAINBOW,
            SUIT.BROWN,
        ],
        baseColors2plusBrown,
        false,
    ),
    'Rainbow & Brown (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.RAINBOW,
            SUIT.BROWN,
        ],
        baseColors1plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Pink & White
    'Pink & White (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
            SUIT.WHITE,
        ],
        baseColors4plusPink,
        false,
    ),
    'Pink & White (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
            SUIT.WHITE,
        ],
        baseColors3plusPink,
        false,
    ),
    'Pink & White (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.PINK,
            SUIT.WHITE,
        ],
        baseColors2plusPink,
        false,
    ),
    'Pink & White (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.PINK,
            SUIT.WHITE,
        ],
        baseColors1plusPink,
        false,
        true, // This is the final variant in this section
    ),

    // Pink & Brown
    'Pink & Brown (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
            SUIT.BROWN,
        ],
        baseColors4plusPinkBrown,
        false,
    ),
    'Pink & Brown (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
            SUIT.BROWN,
        ],
        baseColors3plusPinkBrown,
        false,
    ),
    'Pink & Brown (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.PINK,
            SUIT.BROWN,
        ],
        baseColors2plusPinkBrown,
        false,
    ),
    'Pink & Brown (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.PINK,
            SUIT.BROWN,
        ],
        baseColors1plusPinkBrown,
        false,
        true, // This is the final variant in this section
    ),

    // White & Brown
    'White & Brown (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
            SUIT.BROWN,
        ],
        baseColors4plusBrown,
        false,
    ),
    'White & Brown (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.WHITE,
            SUIT.BROWN,
        ],
        baseColors3plusBrown,
        false,
    ),
    'White & Brown (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.WHITE,
            SUIT.BROWN,
        ],
        baseColors2plusBrown,
        false,
    ),
    'White & Brown (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.WHITE,
            SUIT.BROWN,
        ],
        baseColors1plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Dark Rainbow
    'Dark Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.DARK_RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Dark Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'Black & Dark Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.DARK_RAINBOW,
        ],
        baseColors4plusBlack,
        false,
    ),
    'Pink & Dark Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
            SUIT.DARK_RAINBOW,
        ],
        baseColors4plusPink,
        false,
    ),
    'Pink & Dark Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
            SUIT.DARK_RAINBOW,
        ],
        baseColors3plusPink,
        false,
    ),
    'White & Dark Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
            SUIT.DARK_RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'White & Dark Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.WHITE,
            SUIT.DARK_RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'Brown & Dark Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BROWN,
            SUIT.DARK_RAINBOW,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Brown & Dark Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BROWN,
            SUIT.DARK_RAINBOW,
        ],
        baseColors3plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Dark Pink
    'Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.DARK_PINK,
        ],
        baseColorsPlusPink,
        false,
    ),
    'Dark Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'Black & Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.DARK_PINK,
        ],
        baseColors4plusBlackPink,
        false,
    ),
    'Rainbow & Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.DARK_PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'Rainbow & Dark Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.DARK_PINK,
        ],
        baseColors3plusPink,
        false,
    ),
    'White & Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
            SUIT.DARK_PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'White & Dark Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.WHITE,
            SUIT.DARK_PINK,
        ],
        baseColors3plusPink,
        false,
    ),
    'Brown & Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BROWN,
            SUIT.DARK_PINK,
        ],
        baseColors4plusPinkBrown,
        false,
    ),
    'Brown & Dark Pink (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BROWN,
            SUIT.DARK_PINK,
        ],
        baseColors3plusPinkBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Gray
    'Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.GRAY,
        ],
        baseColors,
        false,
    ),
    'Gray (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.GRAY,
        ],
        baseColors4,
        false,
    ),
    'Black & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.GRAY,
            SUIT.BLACK,
        ],
        baseColors4plusBlack,
        false,
    ),
    'Rainbow & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.GRAY,
        ],
        baseColors4,
        false,
    ),
    'Rainbow & Gray (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.GRAY,
        ],
        baseColors3,
        false,
    ),
    'Pink & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
            SUIT.GRAY,
        ],
        baseColors4plusPink,
        false,
    ),
    'Pink & Gray (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
            SUIT.GRAY,
        ],
        baseColors3plusPink,
        false,
    ),
    'Brown & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BROWN,
            SUIT.GRAY,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Brown & Gray (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.BROWN,
            SUIT.GRAY,
        ],
        baseColors3plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Chocolate
    'Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.CHOCOLATE,
        ],
        baseColorsPlusBrown,
        false,
    ),
    'Chocolate (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Black & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.BLACK,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBlackBrown,
        false,
    ),
    'Rainbow & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Rainbow & Chocolate (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
            SUIT.CHOCOLATE,
        ],
        baseColors3plusBrown,
        false,
    ),
    'Pink & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PINK,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusPinkBrown,
        false,
    ),
    'Pink & Chocolate (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.PINK,
            SUIT.CHOCOLATE,
        ],
        baseColors3plusPinkBrown,
        false,
    ),
    'White & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBrown,
        false,
    ),
    'White & Chocolate (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.WHITE,
            SUIT.CHOCOLATE,
        ],
        baseColors3plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Dark Mixes
    'Dark Rainbow & Dark Pink (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_RAINBOW,
            SUIT.DARK_PINK,
        ],
        baseColors4plusPink,
        false,
    ),
    'Dark Rainbow & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_RAINBOW,
            SUIT.GRAY,
        ],
        baseColors4,
        false,
    ),
    'Dark Rainbow & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_RAINBOW,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBrown,
        false,
    ),
    'Dark Pink & Gray (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_PINK,
            SUIT.GRAY,
        ],
        baseColors4plusPink,
        false,
    ),
    'Dark Pink & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.DARK_PINK,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusPinkBrown,
        false,
    ),
    'Gray & Chocolate (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.GRAY,
            SUIT.CHOCOLATE,
        ],
        baseColors4plusBrown,
        false,
        true, // This is the final variant in this section
    ),

    // Color Blind
    'Color Blind (6 Suits)': new Variant(
        [
            SUIT.CB_BLUE,
            SUIT.CB_GREEN,
            SUIT.CB_YELLOW,
            SUIT.CB_RED,
            SUIT.CB_PURPLE,
            SUIT.CB_TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Color Blind (5 Suits)': new Variant(
        [
            SUIT.CB_BLUE,
            SUIT.CB_GREEN,
            SUIT.CB_YELLOW,
            SUIT.CB_RED,
            SUIT.CB_PURPLE,
        ],
        baseColors,
        false,
    ),
    'Color Blind (4 Suits)': new Variant(
        [
            SUIT.CB_BLUE,
            SUIT.CB_GREEN,
            SUIT.CB_YELLOW,
            SUIT.CB_RED,
        ],
        baseColors4,
        false,
    ),
    'Color Blind (3 Suits)': new Variant(
        [
            SUIT.CB_BLUE,
            SUIT.CB_GREEN,
            SUIT.CB_YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Number Blind
    'Number Blind (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Number Blind (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Number Blind (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Number Blind (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Color Mute
    'Color Mute (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        [],
        false,
    ),
    'Color Mute (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        [],
        false,
    ),
    'Color Mute (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        [],
        false,
    ),
    'Color Mute (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        [],
        false,
        true, // This is the final variant in this section
    ),

    // Number Mute
    'Number Mute (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Number Mute (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Number Mute (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Number Mute (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Ambiguous
    'Ambiguous (6 Suits)': new Variant(
        [
            // L stands for light
            // D stands for dark
            SUIT.L_BLUE,
            SUIT.D_BLUE,
            SUIT.L_GREEN,
            SUIT.D_GREEN,
            SUIT.L_RED,
            SUIT.D_RED,
        ],
        [
            COLOR.BLUE,
            COLOR.GREEN,
            COLOR.RED,
        ],
        true,
    ),
    'Ambiguous (4 Suits)': new Variant(
        [
            SUIT.L_BLUE,
            SUIT.D_BLUE,
            SUIT.L_RED,
            SUIT.D_RED,
        ],
        [
            COLOR.BLUE,
            COLOR.RED,
        ],
        true,
    ),
    'Ambiguous & White (5 Suits)': new Variant(
        [
            SUIT.L_BLUE,
            SUIT.D_BLUE,
            SUIT.L_RED,
            SUIT.D_RED,
            SUIT.WHITE,
        ],
        [
            COLOR.BLUE,
            COLOR.RED,
        ],
        true,
    ),
    'Ambiguous & Rainbow (5 Suits)': new Variant(
        [
            SUIT.L_BLUE,
            SUIT.D_BLUE,
            SUIT.L_RED,
            SUIT.D_RED,
            SUIT.RAINBOW,
        ],
        [
            COLOR.BLUE,
            COLOR.RED,
        ],
        true,
    ),
    'Very Ambiguous (6 Suits)': new Variant(
        [
            SUIT.BLUE1,
            SUIT.BLUE2,
            SUIT.BLUE3,
            SUIT.RED1,
            SUIT.RED2,
            SUIT.RED3,
        ],
        [
            COLOR.BLUE,
            COLOR.RED,
        ],
        true,
        true, // This is the final variant in this section
    ),

    // Dual-Color
    'Dual-Color (6 Suits)': new Variant(
        [
            SUIT.M_GREEN, // Blue + Yellow
            SUIT.M_PURPLE, // Blue + Red
            SUIT.NAVY, // Blue + Black
            SUIT.ORANGE, // Yellow + Red
            SUIT.TAN, // Yellow + Black
            SUIT.MAHOGANY, // Red + Black
        ],
        [
            COLOR.BLUE,
            COLOR.YELLOW,
            COLOR.RED,
            COLOR.BLACK,
        ],
        true,
    ),
    'Dual-Color (5 Suits)': new Variant(
        [
            SUIT.M_TEAL, // Blue + Green
            SUIT.LIME, // Green + Yellow
            SUIT.ORANGE, // Yellow + Red
            SUIT.CARDINAL, // Red + Purple
            SUIT.INDIGO, // Purple + Blue
        ],
        baseColors,
        true,
    ),
    'Dual-Color (3 Suits)': new Variant(
        [
            SUIT.M_GREEN, // Blue + Yellow
            SUIT.M_PURPLE, // Blue + Red
            SUIT.ORANGE, // Yellow + Red
        ],
        [
            COLOR.BLUE,
            COLOR.YELLOW,
            COLOR.RED,
        ],
        true,
    ),
    'Dual-Color & Rainbow (6 Suits)': new Variant(
        [
            SUIT.M_TEAL, // Blue + Green
            SUIT.LIME, // Green + Yellow
            SUIT.ORANGE, // Yellow + Red
            SUIT.CARDINAL, // Red + Purple
            SUIT.INDIGO, // Purple + Blue
            SUIT.RAINBOW,
        ],
        baseColors,
        true,
    ),
    'Dual-Color & Rainbow (4 Suits)': new Variant(
        [
            SUIT.M_GREEN, // Blue + Yellow
            SUIT.M_PURPLE, // Blue + Red
            SUIT.ORANGE, // Yellow + Red
            SUIT.RAINBOW,
        ],
        [
            COLOR.BLUE,
            COLOR.YELLOW,
            COLOR.RED,
        ],
        true,
        true, // This is the final variant in this section
    ),

    // Multi-Fives
    'Multi-Fives (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Multi-Fives (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Multi-Fives (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Multi-Fives (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
    ),
    'Multi-Fives & Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Multi-Fives & Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'Multi-Fives & Rainbow (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'Multi-Fives & Rainbow (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.RAINBOW,
        ],
        baseColors2,
        false,
        true, // This is the final variant in this section
    ),

    // Clue Starved
    'Clue Starved (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Clue Starved (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Clue Starved (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
        true, // This is the final variant in this section
    ),

    // Up or Down
    'Up or Down (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        true,
    ),
    'Up or Down (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        true,
    ),
    'Up or Down & White (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.WHITE,
        ],
        baseColors,
        true,
    ),
    'Up or Down & White (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
        ],
        baseColors4,
        true,
    ),
    'Up or Down & Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.RAINBOW,
        ],
        baseColors,
        true,
    ),
    'Up or Down & Rainbow (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.RAINBOW,
        ],
        baseColors4,
        true,
    ),
    'Up or Down & White & Rainbow (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.WHITE,
            SUIT.RAINBOW,
        ],
        baseColors4,
        true,
        true, // This is the final variant in this section
    ),

    // Cow & Pig
    'Cow & Pig (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Cow & Pig (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Cow & Pig (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Cow & Pig (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Duck
    'Duck (6 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
            SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Duck (5 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
            SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Duck (4 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
            SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Duck (3 Suits)': new Variant(
        [
            SUIT.BLUE,
            SUIT.GREEN,
            SUIT.YELLOW,
        ],
        baseColors3,
        false,
        true, // This is the final variant in this section
    ),

    // Mixed
    'African American': new Variant(
        [
            SUIT.L_RED,
            SUIT.D_RED,
            SUIT.WHITE,
            SUIT.L_BLUE,
            SUIT.D_BLUE,
            SUIT.BLACK,
        ],
        [
            COLOR.BLUE,
            COLOR.RED,
            COLOR.BLACK,
        ],
        true,
    ),
    'Wild & Crazy': new Variant(
        [
            SUIT.M_GREEN, // Blue + Yellow
            SUIT.M_PURPLE, // Blue + Red
            SUIT.ORANGE, // Yellow + Red
            SUIT.WHITE,
            SUIT.RAINBOW,
            SUIT.BLACK,
        ],
        [
            COLOR.BLUE,
            COLOR.YELLOW,
            COLOR.RED,
            COLOR.BLACK,
        ],
        true,
    ),
};

// Copy the name of each variant inside of the object for later use
for (const name of Object.keys(exports.VARIANTS)) {
    exports.VARIANTS[name].name = name;
}

class Character {
    constructor(description, emoji) {
        this.description = description;
        this.emoji = emoji;
    }
}

exports.CHARACTERS = {
    // Clue restriction characters (giving)
    'Fuming': new Character(
        'Can only clue numbers and [random color]',
        '🌋',
    ),
    'Dumbfounded': new Character(
        'Can only clue colors and [random number]',
        '🤯',
    ),
    'Inept': new Character(
        'Cannot give any clues that touch [random suit] cards',
        '🤔',
    ),
    'Awkward': new Character(
        'Cannot give any clues that touch [random number]s',
        '😬',
    ),
    'Conservative': new Character(
        'Can only give clues that touch a single card',
        '🕇',
    ),
    'Greedy': new Character(
        'Can only give clues that touch 2+ cards',
        '🤑',
    ),
    'Picky': new Character(
        'Can only clue odd numbers or odd colors',
        '🤢',
    ),
    'Spiteful': new Character(
        'Cannot clue the player to their left',
        '😈',
    ),
    'Insolent': new Character(
        'Cannot clue the player to their right',
        '😏',
    ),
    'Vindictive': new Character(
        'Must clue if they received a clue since their last turn',
        '🗡️',
    ),
    'Miser': new Character(
        'Can only clue if there are 4 or more clues available',
        '💰',
    ),
    'Compulsive': new Character(
        'Can only clue if it touches the newest or oldest card in someone\'s hand',
        '📺',
    ),
    'Mood Swings': new Character(
        'Clues given must alternate between color and number',
        '👧',
    ),
    'Insistent': new Character(
        'Must continue to clue cards until one of them is played or discarded',
        '😣',
    ),

    // Clue restriction characters (receiving)
    'Vulnerable': new Character(
        'Cannot receive a number 2 or number 5 clue',
        '🛡️',
    ),
    'Color-Blind': new Character(
        'Cannot receive a color clue',
        '👓',
    ),

    // Play restriction characters
    'Follower': new Character(
        'Cannot play a card unless two cards of the same rank have already been played',
        '👁️',
    ),
    'Impulsive': new Character(
        'Must play slot 1 if it has been clued',
        '💉',
    ),
    'Indolent': new Character(
        'Cannot play a card if they played on the last round',
        '💺',
    ),
    'Hesitant': new Character(
        'Cannot play cards from slot 1',
        '👴🏻',
    ),

    // Discard restriction characters
    'Anxious': new Character(
        'Cannot discard if there is an even number of clues available (including 0)',
        '😰',
    ),
    'Traumatized': new Character(
        'Cannot discard if there is an odd number of clues available',
        '😨',
    ),
    'Wasteful': new Character(
        'Cannot discard if there are 2 or more clues available',
        '🗑️',
    ),

    // Extra turn characters
    'Genius': new Character(
        'Must clue both a number and a color (uses two clues)',
        '🧠',
    ),
    'Synesthetic': new Character(
        'Gives number and color clues at the same time',
        '🎨',
    ),
    'Panicky': new Character(
        'When discarding, discards twice if 4 clues or less',
        '😳',
    ),

    // Other
    'Contrarian': new Character(
        'Play order inverts after taking a turn, 2-turn end game',
        '🙅',
    ),
    'Stubborn': new Character(
        'Must perform a different action type than the player that came before them',
        '😠',
    ),
    'Blind Spot': new Character(
        'Cannot see the cards of the player to their left',
        '🚗',
    ),
    'Oblivious': new Character(
        'Cannot see the cards of the player to their right',
        '🚂',
    ),
    /*
    'Forgetful': new Character(
        'Hand is shuffled after discarding (but before drawing)',
        '🔀',
    ),
    */
};

// Copy the name of each character inside of the object for later use
for (const name of Object.keys(exports.CHARACTERS)) {
    exports.CHARACTERS[name].name = name;
}

// Ensure that the constants cannot be modified (but this only freezes one layer deep)
for (const property of Object.keys(exports)) {
    Object.freeze(property);
}

// Also make the constants available from the JavaScript console (for debugging purposes)
window.constants = exports;
