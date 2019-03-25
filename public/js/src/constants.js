/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

exports.CARDW = 286;
exports.CARDH = 406;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
exports.PHASER_DEMO_SCALE = 0.35;

const Color = function Color(name, abbreviation, hexCode) {
    this.name = name;
    this.abbreviation = abbreviation;
    this.hexCode = hexCode;
};

exports.COLOR = {
    // Normal
    BLUE: new Color('Blue', 'B', '#0044cc'),
    GREEN: new Color('Green', 'G', '#00cc00'),
    YELLOW: new Color('Yellow', 'Y', '#ccaa22'),
    RED: new Color('Red', 'R', '#aa0000'),
    PURPLE: new Color('Purple', 'P', '#6600cc'),
    GRAY: new Color('Gray', 'G', '#cccccc'), // For unknown cards

    // Basic variants
    WHITE: new Color('White', 'W', '#d9d9d9'),
    BLACK: new Color('Black', 'K', '#111111'),

    NAVY: new Color('Navy', 'N', '#000066'),
    ORANGE: new Color('Orange', 'O', '#ff8800'), // ff8800 is orange, ff33cc is pink, ff00ff is magenta
    TAN: new Color('Tan', 'T', '#999900'),
    MAHOGANY: new Color('Mahogany', 'M', '#660016'),
    TEAL: new Color('Teal', 'T', '#00b3b3'),
    LIME: new Color('Lime', 'L', '#80c000'),
    CARDINAL: new Color('Cardinal', 'C', '#810735'),
    INDIGO: new Color('Indigo', 'I', '#1a0082'),
    LBLUE: new Color('Sky', 'S', '#1a66ff'),
    DBLUE: new Color('Navy', 'N', '#002b80'),
    LGREEN: new Color('Lime', 'L', '#1aff1a'),
    DGREEN: new Color('Forest', 'F', '#008000'),
    LRED: new Color('Tomato', 'T', '#e60000'),
    DRED: new Color('Mahogany', 'M', '#660000'),
    BLUE1: new Color('Sky', 'S', '#4d88ff'),
    BLUE3: new Color('Navy', 'N', '#001a4d'),
    RED1: new Color('Tomato', 'T', '#ff1a1a'),
    RED3: new Color('Mahogany', 'M', '#330000'),
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
const baseColorsPlusOrange = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.PURPLE,
    exports.COLOR.ORANGE,
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
const baseColors2 = [
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
];

// Specify between solid color and gradients,
// along with additional args in the case of gradients
const FillSpec = function FillSpec(fillType, args = null) {
    this.fillType = fillType;
    this.args = args;
};

const solidFillSpec = new FillSpec(FILL_TYPE.SOLID);
const multiBkgFillSpec = new FillSpec(
    FILL_TYPE.LINEAR_GRADIENT,
    [0, 0, 0, exports.CARDH],
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

// Bundles fill specs together for all the card attributes
// (background, number, symbol)
const BuildCardFillSpec = function BuildCardFillSpec(
    backgroundFillSpec,
    numberFillSpec,
    symbolFillSpec,
) {
    return new Map([
        [exports.CARD_AREA.BACKGROUND, backgroundFillSpec],
        [exports.CARD_AREA.NUMBER, numberFillSpec],
        [exports.CARD_AREA.SYMBOL, symbolFillSpec],
    ]);
};
const basicCardFillSpec = BuildCardFillSpec(
    solidFillSpec,
    solidFillSpec,
    solidFillSpec,
);
const multiCardFillSpec = BuildCardFillSpec(
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

// Pair each suit name with the color(s) that correspond(s) to it
const Suit = function Suit(
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
};

// Returns the style (color, gradient, etc.) for a given card area
// (bkg, number, symbol)
Suit.prototype.style = function style(ctx, cardArea) {
    const fillSpec = this.cardFillSpec.get(cardArea);
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
};

// It probably isn't design-necessary to define this list of suits, but it
// will only hurt if we have a lot of instances of suits that vary in
// property between variants
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
    GRAY: new Suit(
        // This represents cards of unknown suit; it must not be included in variants
        'Gray',
        '',
        exports.COLOR.GRAY,
        basicCardFillSpec,
        null,
        [],
    ),

    // Basic variants
    ORANGE: new Suit(
        'Orange',
        'O',
        exports.COLOR.ORANGE,
        basicCardFillSpec,
        [exports.COLOR.ORANGE],
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
        // Color ordering is not guaranteed to be the same as declaration order
        // Do not these values for the rainbow suit; instead, use special cases
        // e.g. if (suit === SUIT.RAINBOW, color_match = true)
        'Rainbow',
        'M',
        baseColors,
        multiCardFillSpec,
        Object.values(exports.COLOR),
    ),
    RAINBOW1OE: new Suit(
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
    CB_ORANGE: new Suit(
        'Orange',
        'O',
        exports.COLOR.ORANGE,
        basicCardFillSpec,
        [],
    ),

    // For "Ambiguous"
    LBLUE: new Suit(
        'Sky',
        'S',
        exports.COLOR.LBLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    DBLUE: new Suit(
        'Navy',
        'N',
        exports.COLOR.DBLUE,
        basicCardFillSpec,
        [exports.COLOR.BLUE],
    ),
    LGREEN: new Suit(
        'Lime',
        'L',
        exports.COLOR.LGREEN,
        basicCardFillSpec,
        [exports.COLOR.GREEN],
    ),
    DGREEN: new Suit(
        'Forest',
        'F',
        exports.COLOR.DGREEN,
        basicCardFillSpec,
        [exports.COLOR.GREEN],
    ),
    LRED: new Suit(
        'Tomato',
        'T',
        exports.COLOR.LRED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
    DRED: new Suit(
        'Mahogany',
        'B',
        exports.COLOR.DRED,
        basicCardFillSpec,
        [exports.COLOR.RED],
    ),
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
    MGREEN: new Suit(
        'Green',
        'G',
        exports.COLOR.GREEN,
        basicCardFillSpec,
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
        ],
    ),
    MPURPLE: new Suit(
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
    MORANGE: new Suit(
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
    TEAL: new Suit(
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
    // MORANGE is reused
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
            exports.COLOR.BLUE,
            exports.COLOR.PURPLE,
        ],
    ),
};

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

const Variant = function Variant(suits, clueColors, showSuitNames) {
    this.suits = suits;
    this.ranks = [1, 2, 3, 4, 5];
    this.clueColors = clueColors;
    this.showSuitNames = showSuitNames;
    // We draw text of the suit names below the stacks for confusing variants
    this.offsetCardIndicators = suits.some(
        s => s !== exports.SUIT.RAINBOW
            && s !== exports.SUIT.RAINBOW1OE
            && s.clueColors.length > 1,
    );
    this.maxScore = suits.length * 5;
};

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
            exports.SUIT.ORANGE,
        ],
        baseColorsPlusOrange,
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

    // Dark Rainbow
    'Dark Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.RAINBOW1OE,
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
            exports.SUIT.RAINBOW1OE,
        ],
        baseColors4,
        false,
    ),
    'Black & Dark Rainbow (6 Suits)': new Variant(
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.BLACK,
            exports.SUIT.RAINBOW1OE,
        ],
        baseColors4plusBlack,
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
            exports.SUIT.CB_ORANGE,
        ],
        baseColorsPlusOrange,
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
            exports.SUIT.LBLUE,
            exports.SUIT.DBLUE,
            exports.SUIT.LGREEN,
            exports.SUIT.DGREEN,
            exports.SUIT.LRED,
            exports.SUIT.DRED,
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
            exports.SUIT.LBLUE,
            exports.SUIT.DBLUE,
            exports.SUIT.LRED,
            exports.SUIT.DRED,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED,
        ],
        true,
    ),
    'Ambiguous & White (5 Suits)': new Variant(
        [
            exports.SUIT.LBLUE,
            exports.SUIT.DBLUE,
            exports.SUIT.LRED,
            exports.SUIT.DRED,
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
            exports.SUIT.LBLUE,
            exports.SUIT.DBLUE,
            exports.SUIT.LRED,
            exports.SUIT.DRED,
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
            exports.SUIT.MGREEN, // Blue + Yellow
            exports.SUIT.MPURPLE, // Blue + Red
            exports.SUIT.NAVY, // Blue + Black
            exports.SUIT.MORANGE, // Yellow + Red
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
            exports.SUIT.TEAL, // Blue + Green
            exports.SUIT.LIME, // Green + Yellow
            exports.SUIT.MORANGE, // Yellow + Red
            exports.SUIT.CARDINAL, // Red + Purple
            exports.SUIT.INDIGO, // Purple + Blue
        ],
        baseColors,
        true,
    ),
    'Dual-Color (3 Suits)': new Variant(
        [
            exports.SUIT.MGREEN, // Blue + Yellow
            exports.SUIT.MPURPLE, // Blue + Red
            exports.SUIT.MORANGE, // Yellow + Red
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
            exports.SUIT.TEAL, // Blue + Green
            exports.SUIT.LIME, // Green + Yellow
            exports.SUIT.MORANGE, // Yellow + Red
            exports.SUIT.CARDINAL, // Red + Purple
            exports.SUIT.INDIGO, // Purple + Blue
            exports.SUIT.RAINBOW,
        ],
        baseColors,
        true,
    ),
    'Dual-Color & Rainbow (4 Suits)': new Variant(
        [
            exports.SUIT.MGREEN, // Blue + Yellow
            exports.SUIT.MPURPLE, // Blue + Red
            exports.SUIT.MORANGE, // Yellow + Red
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
            exports.SUIT.ORANGE,
        ],
        baseColorsPlusOrange,
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
            exports.SUIT.ORANGE,
        ],
        baseColorsPlusOrange,
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
            exports.SUIT.ORANGE,
        ],
        baseColorsPlusOrange,
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
            exports.SUIT.ORANGE,
        ],
        baseColorsPlusOrange,
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
            exports.SUIT.LRED,
            exports.SUIT.DRED,
            exports.SUIT.WHITE,
            exports.SUIT.LBLUE,
            exports.SUIT.DBLUE,
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
            exports.SUIT.MGREEN, // Blue + Yellow
            exports.SUIT.MPURPLE, // Blue + Red
            exports.SUIT.MORANGE, // Yellow + Red
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

const Character = function Character(description, emoji) {
    this.description = description;
    this.emoji = emoji;
};
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

// This must match the "replayActionType" constants in the "constants.go" file
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

// This only freezes one layer deep; to do any better, we should likely
// involve a library like immutablejs. But probably not worth bothering with.
for (const property of Object.keys(exports)) {
    Object.freeze(property);
}

// Also make the constants available from the JavaScript console (for debugging purposes)
window.constants = exports;
