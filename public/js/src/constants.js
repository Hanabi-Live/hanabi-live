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
    DECK: -1,
    CLUES: -2,
    PACE: -3,
    EFFICIENCY: -4,
    MIN_EFFICIENCY: -5,
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

exports.COLOR = {
    // Normal
    BLUE: new Color('Blue', 'B', '#0044cc'),
    GREEN: new Color('Green', 'G', '#00cc00'),
    YELLOW: new Color('Yellow', 'Y', '#ccaa22'),
    RED: new Color('Red', 'R', '#aa0000'),
    PURPLE: new Color('Purple', 'P', '#6600cc'),
    UNKNOWN: new Color('Unknown', 'U', '#cccccc'),

    // Basic variants
    TEAL: new Color('Teal', 'C', '#00cccc'),
    WHITE: new Color('White', 'W', '#d9d9d9'),
    BLACK: new Color('Black', 'K', '#111111'),
    GRAY: new Color('Gray', 'G', '#555555'),

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

const FILL_TYPE = {
    SOLID: 'solid',
    LINEAR_GRADIENT: 'linear_gradient',
    RADIAL_GRADIENT: 'radial_gradient',
};

const baseColors = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.PURPLE,
];
const baseColorsPlusTeal = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.PURPLE,
    exports.COLOR.TEAL,
];
const baseColorsPlusBlack = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.PURPLE,
    exports.COLOR.BLACK,
];
const baseColors4 = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
];
const baseColors4plusBlack = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.BLACK,
];
const baseColors3 = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
];
const baseColors3plusBlack = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.BLACK,
];
const baseColors2 = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
];

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
exports.SUIT = {
    // The base game
    BLUE: new Suit(
        'Blue',
        'B',
        exports.COLOR.BLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    GREEN: new Suit(
        'Green',
        'G',
        exports.COLOR.GREEN,
        basicCardFillSpec,
        [exports.COLOR.GREEN],
    ),
    YELLOW: new Suit(
        'Yellow',
        'Y',
        exports.COLOR.YELLOW,
        basicCardFillSpec,
        [exports.COLOR.YELLOW],
    ),
    RED: new Suit(
        'Red',
        'R',
        exports.COLOR.RED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
    PURPLE: new Suit(
        'Purple',
        'P',
        exports.COLOR.PURPLE,
        basicCardFillSpec,
        [exports.COLOR.PURPLE],
    ),

    // This represents cards of unknown suit; it must not be included in variants
    UNKNOWN: new Suit(
        'Unknown',
        '',
        exports.COLOR.UNKNOWN,
        basicCardFillSpec,
        null,
        [],
    ),

    // Basic variants
    TEAL: new Suit(
        'Teal',
        'T',
        exports.COLOR.TEAL,
        basicCardFillSpec,
        [exports.COLOR.TEAL],
    ),
    WHITE: new Suit(
        'White',
        'W',
        exports.COLOR.WHITE,
        basicCardFillSpec,
        [exports.COLOR.WHITE],
    ),
    BLACK: new Suit(
        'Black',
        'K',
        exports.COLOR.BLACK,
        basicCardFillSpec,
        [exports.COLOR.BLACK],
        true, // This suit has one of each card
    ),
    RAINBOW: new Suit(
        'Rainbow',
        'M',
        baseColors,
        multiCardFillSpec,
        Object.values(exports.COLOR),
    ),
    GRAY: new Suit(
        'Gray',
        'G',
        exports.COLOR.GRAY,
        basicCardFillSpec,
        [exports.COLOR.GRAY],
        true, // This suit has one of each card
    ),
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
        Object.values(exports.COLOR),
        true, // This suit has one of each card
    ),

    // For "Color Blind"
    CB_BLUE: new Suit(
        'Blue',
        'B',
        exports.COLOR.BLUE,
        basicCardFillSpec,
        [],
    ),
    CB_GREEN: new Suit(
        'Green',
        'G',
        exports.COLOR.GREEN,
        basicCardFillSpec,
        [],
    ),
    CB_YELLOW: new Suit(
        'Yellow',
        'Y',
        exports.COLOR.YELLOW,
        basicCardFillSpec,
        [],
    ),
    CB_RED: new Suit(
        'Red',
        'R',
        exports.COLOR.RED,
        basicCardFillSpec,
        [],
    ),
    CB_PURPLE: new Suit(
        'Purple',
        'P',
        exports.COLOR.PURPLE,
        basicCardFillSpec,
        [],
    ),
    CB_TEAL: new Suit(
        'Teal',
        'T',
        exports.COLOR.TEAL,
        basicCardFillSpec,
        [],
    ),

    // For "Ambiguous"
    L_BLUE: new Suit(
        'Sky',
        'S',
        exports.COLOR.L_BLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    D_BLUE: new Suit(
        'Navy',
        'N',
        exports.COLOR.D_BLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    L_GREEN: new Suit(
        'Lime',
        'L',
        exports.COLOR.L_GREEN,
        basicCardFillSpec,
        [exports.COLOR.GREEN],
    ),
    D_GREEN: new Suit(
        'Forest',
        'F',
        exports.COLOR.D_GREEN,
        basicCardFillSpec,
        [exports.COLOR.GREEN],
    ),
    L_RED: new Suit(
        'Tomato',
        'T',
        exports.COLOR.L_RED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
    D_RED: new Suit(
        'Mahogany',
        'B',
        exports.COLOR.D_RED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),

    // For "Very Ambiguous"
    BLUE1: new Suit(
        'Sky',
        'S',
        exports.COLOR.BLUE1,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    BLUE2: new Suit(
        'Berry',
        'B',
        exports.COLOR.BLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    BLUE3: new Suit(
        'Navy',
        'N',
        exports.COLOR.BLUE3,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    RED1: new Suit(
        'Tomato',
        'T',
        exports.COLOR.RED1,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
    RED2: new Suit(
        'Ruby',
        'R',
        exports.COLOR.RED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
    RED3: new Suit(
        'Mahogany',
        'M',
        exports.COLOR.RED3,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),

    // For "Dual-Color (6 Suits)"
    M_GREEN: new Suit(
        'Green',
        'G',
        exports.COLOR.GREEN,
        basicCardFillSpec,
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
        ],
    ),
    M_PURPLE: new Suit(
        'Purple',
        'P',
        exports.COLOR.PURPLE,
        basicCardFillSpec,
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
    ),
    NAVY: new Suit(
        'Navy',
        'N',
        exports.COLOR.NAVY,
        basicCardFillSpec,
        [
            exports.COLOR.BLUE,
            exports.COLOR.BLACK,
        ],
    ),
    ORANGE: new Suit(
        'Orange',
        'O',
        exports.COLOR.ORANGE,
        basicCardFillSpec,
        [
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
        ],
    ),
    TAN: new Suit(
        'Tan',
        'T',
        exports.COLOR.TAN,
        basicCardFillSpec,
        [
            exports.COLOR.YELLOW,
            exports.COLOR.BLACK,
        ],
    ),
    MAHOGANY: new Suit(
        'Mahogany',
        'M',
        exports.COLOR.MAHOGANY,
        basicCardFillSpec,
        [
            exports.COLOR.RED,
            exports.COLOR.BLACK,
        ],
    ),

    // For "Dual-Color (5 Suits)"
    M_TEAL: new Suit(
        'Teal',
        'T',
        exports.COLOR.TEAL,
        basicCardFillSpec,
        [
            exports.COLOR.BLUE,
            exports.COLOR.GREEN,
        ],
    ),
    LIME: new Suit(
        'Lime',
        'L',
        exports.COLOR.LIME,
        basicCardFillSpec,
        [
            exports.COLOR.GREEN,
            exports.COLOR.YELLOW,
        ],
    ),
    // Orange is reused
    CARDINAL: new Suit(
        'Cardinal',
        'C',
        exports.COLOR.CARDINAL,
        basicCardFillSpec,
        [
            exports.COLOR.RED,
            exports.COLOR.PURPLE,
        ],
    ),
    INDIGO: new Suit(
        'Indigo',
        'I',
        exports.COLOR.INDIGO,
        basicCardFillSpec,
        [
            exports.COLOR.PURPLE,
            exports.COLOR.BLUE,
        ],
    ),
};

class Variant {
    constructor(suits, clueColors, showSuitNames) {
        this.suits = suits;
        this.ranks = [1, 2, 3, 4, 5];
        this.clueColors = clueColors;
        // We draw text of the suit names below the stacks for confusing variants
        this.showSuitNames = showSuitNames;
        // Dual-color variants will have triangles in the corner of the card to indicate what colors
        // the suit is composed of; if so, we will need to move the note indicator downwards
        this.offsetCornerElements = suits.some(
            s => s !== exports.SUIT.RAINBOW
                && s !== exports.SUIT.DARK_RAINBOW
                && s.clueColors.length > 1,
        );
        this.maxScore = suits.length * 5;
    }
}

exports.VARIANTS = {
    // Normal
    'No Variant': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Six Suits': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Four Suits': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Three Suits': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
        ],
        baseColors3,
        false,
    ),

    // White
    'White (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.WHITE,
        ],
        baseColors,
        false,
    ),
    'White (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.WHITE,
        ],
        baseColors4,
        false,
    ),
    'White (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.WHITE,
        ],
        baseColors3,
        false,
    ),
    'White (3 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.WHITE,
        ],
        baseColors2,
        false,
    ),

    // Black
    'Black (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.BLACK,
        ],
        baseColorsPlusBlack,
        false,
    ),
    'Black (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.BLACK,
        ],
        baseColors4plusBlack,
        false,
    ),

    // Rainbow
    'Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'Rainbow (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'Rainbow (3 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.RAINBOW,
        ],
        baseColors2,
        false,
    ),

    // White & Black
    'White & Black (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.WHITE,
            exports.SUIT.BLACK,
        ],
        baseColors4plusBlack,
        false,
    ),
    'White & Black (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.WHITE,
            exports.SUIT.BLACK,
        ],
        baseColors3plusBlack,
        false,
    ),

    // White & Rainbow
    'White & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.WHITE,
            exports.SUIT.RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'White & Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.WHITE,
            exports.SUIT.RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'White & Rainbow (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.WHITE,
            exports.SUIT.RAINBOW,
        ],
        baseColors2,
        false,
    ),

    // Black & Rainbow
    'Black & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.BLACK,
            exports.SUIT.RAINBOW,
        ],
        baseColors4plusBlack,
        false,
    ),
    'Black & Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.BLACK,
            exports.SUIT.RAINBOW,
        ],
        baseColors3plusBlack,
        false,
    ),

    // Gray
    'Gray (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.GRAY,
        ],
        baseColors,
        false,
    ),
    'Gray (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.GRAY,
        ],
        baseColors4,
        false,
    ),

    // Black & Gray
    'Black & Gray (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.GRAY,
            exports.SUIT.BLACK,
        ],
        baseColors4plusBlack,
        false,
    ),

    // Rainbow & Gray
    'Rainbow & Gray (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.RAINBOW,
            exports.SUIT.GRAY,
        ],
        baseColors4,
        false,
    ),
    'Rainbow & Gray (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RAINBOW,
            exports.SUIT.GRAY,
        ],
        baseColors3,
        false,
    ),

    // Dark Rainbow
    'Dark Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.DARK_RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Dark Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.DARK_RAINBOW,
        ],
        baseColors4,
        false,
    ),

    // Black & Dark Rainbow
    'Black & Dark Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.BLACK,
            exports.SUIT.DARK_RAINBOW,
        ],
        baseColors4plusBlack,
        false,
    ),

    // Gray & Dark Rainbow
    'Gray & Dark Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.GRAY,
            exports.SUIT.DARK_RAINBOW,
        ],
        baseColors4,
        false,
    ),

    // Color Blind
    'Color Blind (6 Suits)': new Variant(
        [
            exports.SUIT.CB_BLUE,
            exports.SUIT.CB_GREEN,
            exports.SUIT.CB_YELLOW,
            exports.SUIT.CB_RED,
            exports.SUIT.CB_PURPLE,
            exports.SUIT.CB_TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Color Blind (5 Suits)': new Variant(
        [
            exports.SUIT.CB_BLUE,
            exports.SUIT.CB_GREEN,
            exports.SUIT.CB_YELLOW,
            exports.SUIT.CB_RED,
            exports.SUIT.CB_PURPLE,
        ],
        baseColors,
        false,
    ),
    'Color Blind (4 Suits)': new Variant(
        [
            exports.SUIT.CB_BLUE,
            exports.SUIT.CB_GREEN,
            exports.SUIT.CB_YELLOW,
            exports.SUIT.CB_RED,
        ],
        baseColors4,
        false,
    ),
    'Color Blind (3 Suits)': new Variant(
        [
            exports.SUIT.CB_BLUE,
            exports.SUIT.CB_GREEN,
            exports.SUIT.CB_YELLOW,
        ],
        baseColors3,
        false,
    ),

    // Ambiguous
    'Ambiguous (6 Suits)': new Variant(
        [
            // L stands for light
            // D stands for dark
            exports.SUIT.L_BLUE,
            exports.SUIT.D_BLUE,
            exports.SUIT.L_GREEN,
            exports.SUIT.D_GREEN,
            exports.SUIT.L_RED,
            exports.SUIT.D_RED,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.GREEN,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Ambiguous (4 Suits)': new Variant(
        [
            exports.SUIT.L_BLUE,
            exports.SUIT.D_BLUE,
            exports.SUIT.L_RED,
            exports.SUIT.D_RED,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Ambiguous & White (5 Suits)': new Variant(
        [
            exports.SUIT.L_BLUE,
            exports.SUIT.D_BLUE,
            exports.SUIT.L_RED,
            exports.SUIT.D_RED,
            exports.SUIT.WHITE,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Ambiguous & Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.L_BLUE,
            exports.SUIT.D_BLUE,
            exports.SUIT.L_RED,
            exports.SUIT.D_RED,
            exports.SUIT.RAINBOW,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Very Ambiguous (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE1,
            exports.SUIT.BLUE2,
            exports.SUIT.BLUE3,
            exports.SUIT.RED1,
            exports.SUIT.RED2,
            exports.SUIT.RED3,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
        true,
    ),

    // Dual-Color
    'Dual-Color (6 Suits)': new Variant(
        [
            exports.SUIT.M_GREEN, // Blue + Yellow
            exports.SUIT.M_PURPLE, // Blue + Red
            exports.SUIT.NAVY, // Blue + Black
            exports.SUIT.ORANGE, // Yellow + Red
            exports.SUIT.TAN, // Yellow + Black
            exports.SUIT.MAHOGANY, // Red + Black
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
            exports.COLOR.BLACK,
        ],
        true,
    ),
    'Dual-Color (5 Suits)': new Variant(
        [
            exports.SUIT.M_TEAL, // Blue + Green
            exports.SUIT.LIME, // Green + Yellow
            exports.SUIT.ORANGE, // Yellow + Red
            exports.SUIT.CARDINAL, // Red + Purple
            exports.SUIT.INDIGO, // Purple + Blue
        ],
        baseColors,
        true,
    ),
    'Dual-Color (3 Suits)': new Variant(
        [
            exports.SUIT.M_GREEN, // Blue + Yellow
            exports.SUIT.M_PURPLE, // Blue + Red
            exports.SUIT.ORANGE, // Yellow + Red
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Dual-Color & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.M_TEAL, // Blue + Green
            exports.SUIT.LIME, // Green + Yellow
            exports.SUIT.ORANGE, // Yellow + Red
            exports.SUIT.CARDINAL, // Red + Purple
            exports.SUIT.INDIGO, // Purple + Blue
            exports.SUIT.RAINBOW,
        ],
        baseColors,
        true,
    ),
    'Dual-Color & Rainbow (4 Suits)': new Variant(
        [
            exports.SUIT.M_GREEN, // Blue + Yellow
            exports.SUIT.M_PURPLE, // Blue + Red
            exports.SUIT.ORANGE, // Yellow + Red
            exports.SUIT.RAINBOW,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
        ],
        true,
    ),

    // Multi-Fives
    'Multi-Fives (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Multi-Fives (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Multi-Fives (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Multi-Fives (3 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
        ],
        baseColors3,
        false,
    ),
    'Multi-Fives & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.RAINBOW,
        ],
        baseColors,
        false,
    ),
    'Multi-Fives & Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.RAINBOW,
        ],
        baseColors4,
        false,
    ),
    'Multi-Fives & Rainbow (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RAINBOW,
        ],
        baseColors3,
        false,
    ),
    'Multi-Fives & Rainbow (3 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.RAINBOW,
        ],
        baseColors2,
        false,
    ),

    // Clue Starved
    'Clue Starved (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Clue Starved (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Clue Starved (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
        ],
        baseColors4,
        false,
    ),

    // Up or Down
    'Up or Down (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        true,
    ),
    'Up or Down (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        baseColors,
        true,
    ),
    'Up or Down & White (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.WHITE,
        ],
        baseColors,
        true,
    ),
    'Up or Down & White (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.WHITE,
        ],
        baseColors4,
        true,
    ),
    'Up or Down & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.RAINBOW,
        ],
        baseColors,
        true,
    ),
    'Up or Down & Rainbow (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.RAINBOW,
        ],
        baseColors4,
        true,
    ),
    'Up or Down & White & Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.WHITE,
            exports.SUIT.RAINBOW,
        ],
        baseColors4,
        true,
    ),

    // Duck
    'Duck (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.TEAL,
        ],
        baseColorsPlusTeal,
        false,
    ),
    'Duck (5 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        baseColors,
        false,
    ),
    'Duck (4 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
        ],
        baseColors4,
        false,
    ),
    'Duck (3 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
        ],
        baseColors3,
        false,
    ),

    // Mixed
    'African American': new Variant(
        [
            exports.SUIT.L_RED,
            exports.SUIT.D_RED,
            exports.SUIT.WHITE,
            exports.SUIT.L_BLUE,
            exports.SUIT.D_BLUE,
            exports.SUIT.BLACK,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
            exports.COLOR.BLACK,
        ],
        true,
    ),
    'Wild & Crazy': new Variant(
        [
            exports.SUIT.M_GREEN, // Blue + Yellow
            exports.SUIT.M_PURPLE, // Blue + Red
            exports.SUIT.ORANGE, // Yellow + Red
            exports.SUIT.WHITE,
            exports.SUIT.RAINBOW,
            exports.SUIT.BLACK,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
            exports.COLOR.BLACK,
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
