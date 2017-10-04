(function constants(exports) {
    exports.CARDW = 286;
    exports.CARDH = 406;

    const Color = function Color(name, abbreviation, hexCode) {
        this.name = name;
        this.abbreviation = abbreviation;
        this.hexCode = hexCode;
    };

    exports.COLOR = {
        BLUE: new Color('Blue', 'B', '#0044cc'),
        GREEN: new Color('Green', 'G', '#00cc00'),
        YELLOW: new Color('Yellow', 'Y', '#ccaa22'),
        RED: new Color('Red', 'R', '#aa0000'),
        PURPLE: new Color('Purple', 'P', '#6600cc'),
        BLACK: new Color('Black', 'K', '#111111'),
        WHITE: new Color('White', 'W', '#d9d9d9'),
        GRAY: new Color('Gray', 'G', '#cccccc'),
        MAGENTA: new Color('Magenta', 'M', '#8b008b'),
        NAVY: new Color('Navy', 'N', '#000066'),
        ORANGE: new Color('Orange', 'O', '#ff9900'),
        TAN: new Color('Tan', 'T', '#999900'),
        BURGUNDY: new Color('Burgundy', 'B', '#660016'),
        TEAL: new Color('Teal', 'T', '#00b3b3'),
        LIME: new Color('Lime', 'L', '#80c000'),
        CARDINAL: new Color('Cardinal', 'C', '#810735'),
        INDIGO: new Color('Indigo', 'I', '#1a0082'),
    };

    exports.SHAPE = {
        DIAMOND: 'diamond',
        CLUB: 'club',
        STAR: 'star',
        HEART: 'heart',
        CRESCENT: 'crescent',
        SPADE: 'spade',
        RAINBOW: 'rainbow',
    };

    exports.PATHFUNC = new Map();
    exports.PATHFUNC.set(
        exports.SHAPE.DIAMOND,
        (ctx) => {
            ctx.beginPath();
            ctx.moveTo(75, 0);
            ctx.quadraticCurveTo(110, 60, 150, 100);
            ctx.quadraticCurveTo(110, 140, 75, 200);
            ctx.quadraticCurveTo(40, 140, 0, 100);
            ctx.quadraticCurveTo(40, 60, 75, 0);
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.CLUB,
        (ctx) => {
            ctx.beginPath();
            ctx.moveTo(50, 180);
            ctx.lineTo(100, 180);
            ctx.quadraticCurveTo(80, 140, 75, 120);
            ctx.arc(110, 110, 35, 2.6779, 4.712, true);
            ctx.arc(75, 50, 35, 1, 2.1416, true);
            ctx.arc(40, 110, 35, 4.712, 0.4636, true);
            ctx.quadraticCurveTo(70, 140, 50, 180);
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.STAR,
        (ctx) => {
            ctx.translate(75, 100);
            ctx.beginPath();
            ctx.moveTo(0, -75);
            for (let i = 0; i < 5; i++) {
                ctx.rotate(Math.PI / 5);
                ctx.lineTo(0, -30);
                ctx.rotate(Math.PI / 5);
                ctx.lineTo(0, -75);
            }
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.HEART,
        (ctx) => {
            ctx.beginPath();
            ctx.moveTo(75, 65);
            ctx.bezierCurveTo(75, 57, 70, 45, 50, 45);
            ctx.bezierCurveTo(20, 45, 20, 82, 20, 82);
            ctx.bezierCurveTo(20, 100, 40, 122, 75, 155);
            ctx.bezierCurveTo(110, 122, 130, 100, 130, 82);
            ctx.bezierCurveTo(130, 82, 130, 45, 100, 45);
            ctx.bezierCurveTo(85, 45, 75, 57, 75, 65);
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.CRESCENT,
        (ctx) => {
            ctx.beginPath();
            ctx.arc(75, 100, 75, 3, 4.3, true);
            ctx.arc(48, 83, 52, 5, 2.5, false);
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.SPADE,
        (ctx) => {
            ctx.beginPath();
            ctx.beginPath();
            ctx.moveTo(50, 180);
            ctx.lineTo(100, 180);
            ctx.quadraticCurveTo(80, 140, 75, 120);
            ctx.arc(110, 110, 35, 2.6779, 5.712, true);
            ctx.lineTo(75, 0);
            ctx.arc(40, 110, 35, 3.712, 0.4636, true);
            ctx.quadraticCurveTo(70, 140, 50, 180);
        },
    );
    exports.PATHFUNC.set(
        exports.SHAPE.RAINBOW,
        (ctx) => {
            ctx.beginPath();
            ctx.moveTo(0, 140);
            ctx.arc(75, 140, 75, Math.PI, 0, false);
            ctx.lineTo(125, 140);
            ctx.arc(75, 140, 25, 0, Math.PI, true);
            ctx.lineTo(0, 140);
        },
    );

    /*
        TODO: these functinos obviously belong somewhere else
    */

    exports.backpath = function backpath(ctx, p, xrad, yrad) {
        ctx.beginPath();
        ctx.moveTo(p, yrad + p);
        ctx.lineTo(p, exports.CARDH - yrad - p);
        ctx.quadraticCurveTo(0, exports.CARDH, xrad + p, exports.CARDH - p);
        ctx.lineTo(exports.CARDW - xrad - p, exports.CARDH - p);
        ctx.quadraticCurveTo(exports.CARDW, exports.CARDH, exports.CARDW - p, exports.CARDH - yrad - p);
        ctx.lineTo(exports.CARDW - p, yrad + p);
        ctx.quadraticCurveTo(exports.CARDW, 0, exports.CARDW - xrad - p, p);
        ctx.lineTo(xrad + p, p);
        ctx.quadraticCurveTo(0, 0, p, yrad + p);
    };

    exports.drawshape = (ctx) => {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.fill();
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.stroke();
    };

    exports.draw_shape = (ctx) => {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.fill();
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.stroke();
    };

    exports.fillType = {
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
    const baseColorsPlusBlack = [
        exports.COLOR.BLUE,
        exports.COLOR.GREEN,
        exports.COLOR.YELLOW,
        exports.COLOR.RED,
        exports.COLOR.PURPLE,
        exports.COLOR.BLACK,
    ];
    const baseColorsMinusPurple = [
        exports.COLOR.BLUE,
        exports.COLOR.GREEN,
        exports.COLOR.YELLOW,
        exports.COLOR.RED,
    ];

    // Specify between solid color and gradients, along with additional args in
    // the case of gradients
    const FillSpec = function FillSpec(fillType, args = null) {
        this.fillType = fillType;
        this.args = args;
    };

    const solidFillSpec = new FillSpec(exports.fillType.SOLID);
    const multiBkgFillSpec = new FillSpec(
        exports.fillType.LINEAR_GRADIENT,
        [0, 0, 0, exports.CARDH],
    );
    const multiNumberFillSpec = new FillSpec(
        exports.fillType.LINEAR_GRADIENT,
        [0, 14, 0, 110],
    );
    const multiSymbolFillSpec = new FillSpec(
        exports.fillType.RADIAL_GRADIENT,
        [75, 150, 25, 75, 150, 75],
    );

    exports.CARD_AREA = {
        BACKGROUND: 'background',
        NUMBER: 'number',
        SYMBOL: 'symbol',
    };

    // Bundles fill specs together for all the card attributes (background, number,
    // symbol)
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

    // Generates a vertical gradient that is evenly distributed between its
    // component colors
    const evenLinearGradient = (ctx, colors, args) => {
        const grad = ctx.createLinearGradient(...args);
        const nColors = colors.length;
        for (let i = 0; i < nColors; ++i) {
            grad.addColorStop(i / (nColors - 1), colors[i].hexCode);
        }
        return grad;
    };

    // Generates a radial gradient that is evenly distributed between its
    // component colors
    const evenRadialGradient = (ctx, colors, args) => {
        const grad = ctx.createRadialGradient(...args);
        const nColors = colors.length;
        for (let i = 0; i < nColors; ++i) {
            grad.addColorStop(i / (nColors - 1), colors[i].hexCode);
        }
        return grad;
    };

    // Pair each suit name with the color(s) that correspond(s) to it
    const Suit = function Suit(name, abbreviation, fillColors, cardFillSpec, shape, clueColors) {
        this.name = name;
        this.abbreviation = abbreviation;
        this.fillColors = fillColors;
        this.cardFillSpec = cardFillSpec;
        this.shape = shape;
        this.clueColors = clueColors;
    };

    // Returns the style (color, gradient, etc.) for a given card area
    // (bkg, number, symbol)
    Suit.prototype.style = function style(ctx, cardArea) {
        const fillSpec = this.cardFillSpec.get(cardArea);
        const fillType = fillSpec.fillType;
        const colors = this.fillColors;

        if (fillType === exports.fillType.SOLID) {
            // "colors" in this case should be a single color, not an array
            return colors.hexCode;
        } else if (fillType === exports.fillType.LINEAR_GRADIENT) {
            return evenLinearGradient(ctx, colors, fillSpec.args);
        } else if (fillType === exports.fillType.RADIAL_GRADIENT) {
            return evenRadialGradient(ctx, colors, fillSpec.args);
        }

        return null;
    };

    // It probably isn't design-necessary to define this list of suits, but it
    // will only hurt if we have a lot of instances of suits that vary in
    // property between variants
    exports.SUIT = {
        BLUE: new Suit(
            'Blue',
            'B',
            exports.COLOR.BLUE,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [exports.COLOR.BLUE],
        ),
        GREEN: new Suit(
            'Green',
            'G',
            exports.COLOR.GREEN,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
            [exports.COLOR.GREEN],
        ),
        YELLOW: new Suit(
            'Yellow',
            'Y',
            exports.COLOR.YELLOW,
            basicCardFillSpec,
            exports.SHAPE.STAR,
            [exports.COLOR.YELLOW],
        ),
        RED: new Suit(
            'Red',
            'R',
            exports.COLOR.RED,
            basicCardFillSpec,
            exports.SHAPE.HEART,
            [exports.COLOR.RED],
        ),
        PURPLE: new Suit(
            'Purple',
            'P',
            exports.COLOR.PURPLE,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [exports.COLOR.PURPLE],
        ),
        BLACK: new Suit(
            'Black',
            'K',
            exports.COLOR.BLACK,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.BLACK],
        ),
        // Green for mixed variant, which has different properties than green
        // for original variants
        MGREEN: new Suit(
            'Green',
            'G',
            exports.COLOR.GREEN,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [
                exports.COLOR.BLUE,
                exports.COLOR.YELLOW,
            ],
        ),
        MAGENTA: new Suit(
            'Magenta',
            'M',
            exports.COLOR.MAGENTA,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
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
            exports.SHAPE.STAR,
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
            exports.SHAPE.HEART,
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
            exports.SHAPE.CRESCENT,
            [
                exports.COLOR.YELLOW,
                exports.COLOR.BLACK,
            ],
        ),
        BURGUNDY: new Suit(
            'Burgundy',
            'B',
            exports.COLOR.BURGUNDY,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [
                exports.COLOR.RED,
                exports.COLOR.BLACK,
            ],
        ),
        TEAL: new Suit(
            'Teal',
            'T',
            exports.COLOR.TEAL,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
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
            exports.SHAPE.CLUB,
            [
                exports.COLOR.GREEN,
                exports.COLOR.YELLOW,
            ],
        ),
        // Orange with a star pattern, for MM variant
        SORANGE: new Suit(
            'Orange',
            'O',
            exports.COLOR.ORANGE,
            basicCardFillSpec,
            exports.SHAPE.STAR,
            [
                exports.COLOR.YELLOW,
                exports.COLOR.RED,
            ],
        ),
        CARDINAL: new Suit(
            'Cardinal',
            'C',
            exports.COLOR.CARDINAL,
            basicCardFillSpec,
            exports.SHAPE.HEART,
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
            exports.SHAPE.CRESCENT,
            [
                exports.COLOR.BLUE,
                exports.COLOR.PURPLE,
            ],
        ),
        // Color ordering not guaranteed to be the same as declaration order
        // Recommend not to access these values for the multi suit, but rather use
        // special cases e.g. `if (suit === SUIT.MULTI, color_match = true)`
        MULTI: new Suit(
            'Rainbow',
            'M',
            baseColors,
            multiCardFillSpec,
            exports.SHAPE.RAINBOW,
            Object.values(exports.COLOR),
        ),
        WHITE: new Suit(
            'White',
            'W',
            exports.COLOR.WHITE,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [exports.COLOR.WHITE],
        ),
        // Gray suit represents cards of unknown suit. It must not be included in variants.
        GRAY: new Suit(
            'Gray',
            '',
            exports.COLOR.GRAY,
            basicCardFillSpec,
            null,
            [],
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
        this.clueColors = clueColors;
        // We draw the text below the suits for confusing variants
        this.showSuitNames = showSuitNames;
        this.offsetCardIndicators = suits.some(s => s !== exports.SUIT.MULTI && s.clueColors.length > 1);
        this.maxScore = suits.length * 5;
    };

    exports.VARIANT = {
        NONE: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
            ],
            baseColors,
        ),
        BLACKSUIT: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
                exports.SUIT.BLACK,
            ],
            baseColorsPlusBlack,
        ),
        BLACKONE: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
                exports.SUIT.BLACK,
            ],
            baseColorsPlusBlack,
        ),
        RAINBOW: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
                exports.SUIT.MULTI,
            ],
            baseColors,
        ),
        MIXED: new Variant(
            [
                exports.SUIT.MGREEN, // Blue + Yellow
                exports.SUIT.MAGENTA, // Blue + Red
                exports.SUIT.NAVY, // Blue + Black
                exports.SUIT.ORANGE, // Yellow + Red
                exports.SUIT.TAN, // Yellow + Black
                exports.SUIT.BURGUNDY, // Red + Black
            ],
            [
                exports.COLOR.BLUE,
                exports.COLOR.YELLOW,
                exports.COLOR.RED,
                exports.COLOR.BLACK,
            ],
            true,
        ),
        MM: new Variant(
            [
                exports.SUIT.TEAL, // Blue + Green
                exports.SUIT.LIME, // Green + Yellow
                exports.SUIT.SORANGE, // Yellow + Red
                exports.SUIT.CARDINAL, // Red + Purple
                exports.SUIT.INDIGO, // Purple + Blue
                exports.SUIT.MULTI,
            ],
            baseColors,
            true,
        ),
        WHITEMULTI: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.WHITE,
                exports.SUIT.MULTI,
            ],
            baseColorsMinusPurple,
        ),
        CRAZY: new Variant(
            [
                exports.SUIT.MGREEN, // Blue + Yellow
                exports.SUIT.MAGENTA, // Blue + Red
                exports.SUIT.ORANGE, // Yellow + Red
                exports.SUIT.WHITE,
                exports.SUIT.MULTI,
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

    // This is the mapping that the server uses
    exports.VARIANT_INTEGER_MAPPING = [
        exports.VARIANT.NONE,
        exports.VARIANT.BLACKSUIT,
        exports.VARIANT.BLACKONE,
        exports.VARIANT.RAINBOW,
        exports.VARIANT.MIXED,
        exports.VARIANT.MM,
        exports.VARIANT.WHITEMULTI,
        exports.VARIANT.CRAZY,
    ];

    // This only freezes one layer deep; to do any better, we should likely
    // involve a library like immutablejs. But probably not worth bothering with.
    for (const property of Object.keys(exports)) {
        Object.freeze(property);
    }
}(typeof exports === 'undefined' ? (this.constants = {}) : exports));
