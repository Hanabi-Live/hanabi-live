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
            const w = 70;
            const h = 80;

            // Expected bounding box requires these offsets
            const offsetX = 75 - w;
            const offsetY = 100 - h;
            const points = [
                [1, 0],
                [2, 1],
                [1, 2],
                [0, 1],
            ]
                .map(point => [point[0] * w + offsetX, point[1] * h + offsetY]);
            const curveX = 1.46;
            const curveY = 0.6;
            const interps = [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 0],
            ]
                .map(v => [
                    [curveX, 2 - curveX][v[0]] * w + offsetX,
                    [curveY, 2 - curveY][v[1]] * h + offsetY,
                ]);

            ctx.beginPath();
            ctx.moveTo(...points[0]);
            ctx.quadraticCurveTo(...interps[0], ...points[1]);
            ctx.quadraticCurveTo(...interps[1], ...points[2]);
            ctx.quadraticCurveTo(...interps[2], ...points[3]);
            ctx.quadraticCurveTo(...interps[3], ...points[0]);
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
        TODO: these functions obviously belong somewhere else
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

    // Specify between solid color and gradients,
    // along with additional args in the case of gradients
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
        const { fillType } = fillSpec;
        const colors = this.fillColors;

        if (fillType === exports.fillType.SOLID) {
            // "colors" in this case should be a single color, not an array
            return colors.hexCode;
        }
        if (fillType === exports.fillType.LINEAR_GRADIENT) {
            return evenLinearGradient(ctx, colors, fillSpec.args);
        }
        if (fillType === exports.fillType.RADIAL_GRADIENT) {
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

        ORANGE: new Suit(
            'Orange',
            'O',
            exports.COLOR.ORANGE,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.ORANGE],
        ),

        BLACK: new Suit(
            'Black',
            'K',
            exports.COLOR.BLACK,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.BLACK],
        ),

        // Green for the dual-color variants
        // (in no-variant, it is a single color, but in the dual-color variants,
        // it is composed of two different colors)
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

        MPURPLE: new Suit(
            'Purple',
            'P',
            exports.COLOR.PURPLE,
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

        MORANGE: new Suit(
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

        MAHOGANY: new Suit(
            'Mahogany',
            'M',
            exports.COLOR.MAHOGANY,
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
        // Recommend not to access these values for the rainbow suit, but rather use
        // special cases e.g. `if (suit === SUIT.RAINBOW, color_match = true)`
        RAINBOW: new Suit(
            'Rainbow',
            'M',
            baseColors,
            multiCardFillSpec,
            exports.SHAPE.RAINBOW,
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

        WHITE2: new Suit(
            'White',
            'W',
            exports.COLOR.WHITE,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.WHITE],
        ),

        WHITE3: new Suit(
            'White',
            'W',
            exports.COLOR.WHITE,
            basicCardFillSpec,
            exports.SHAPE.STAR,
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

        LBLUE: new Suit(
            'Sky',
            'S',
            exports.COLOR.LBLUE,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [exports.COLOR.BLUE],
        ),

        LBLUE2: new Suit(
            'Sky',
            'S',
            exports.COLOR.LBLUE,
            basicCardFillSpec,
            exports.SHAPE.HEART,
            [exports.COLOR.BLUE],
        ),

        DBLUE: new Suit(
            'Navy',
            'N',
            exports.COLOR.DBLUE,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
            [exports.COLOR.BLUE],
        ),

        DBLUE2: new Suit(
            'Navy',
            'N',
            exports.COLOR.DBLUE,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [exports.COLOR.BLUE],
        ),

        LGREEN: new Suit(
            'Lime',
            'L',
            exports.COLOR.LGREEN,
            basicCardFillSpec,
            exports.SHAPE.STAR,
            [exports.COLOR.GREEN],
        ),

        DGREEN: new Suit(
            'Forest',
            'F',
            exports.COLOR.DGREEN,
            basicCardFillSpec,
            exports.SHAPE.HEART,
            [exports.COLOR.GREEN],
        ),

        LRED: new Suit(
            'Tomato',
            'T',
            exports.COLOR.LRED,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [exports.COLOR.RED],
        ),

        LRED2: new Suit(
            'Tomato',
            'T',
            exports.COLOR.LRED,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [exports.COLOR.RED],
        ),

        DRED: new Suit(
            'Mahogany',
            'B',
            exports.COLOR.DRED,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.RED],
        ),

        DRED2: new Suit(
            'Mahogany',
            'B',
            exports.COLOR.DRED,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
            [exports.COLOR.RED],
        ),

        BLUE1: new Suit(
            'Sky',
            'S',
            exports.COLOR.BLUE1,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [exports.COLOR.BLUE],
        ),

        BLUE2: new Suit(
            'Berry',
            'B',
            exports.COLOR.BLUE,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
            [exports.COLOR.BLUE],
        ),

        BLUE3: new Suit(
            'Navy',
            'N',
            exports.COLOR.BLUE3,
            basicCardFillSpec,
            exports.SHAPE.STAR,
            [exports.COLOR.BLUE],
        ),

        RED1: new Suit(
            'Tomato',
            'T',
            exports.COLOR.RED1,
            basicCardFillSpec,
            exports.SHAPE.HEART,
            [exports.COLOR.RED],
        ),

        RED2: new Suit(
            'Ruby',
            'R',
            exports.COLOR.RED,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [exports.COLOR.RED],
        ),

        RED3: new Suit(
            'Mahogany',
            'M',
            exports.COLOR.RED3,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
            [exports.COLOR.RED],
        ),

        CB_BLUE: new Suit(
            'Blue',
            'B',
            exports.COLOR.BLUE,
            basicCardFillSpec,
            exports.SHAPE.DIAMOND,
            [],
        ),

        CB_GREEN: new Suit(
            'Green',
            'G',
            exports.COLOR.GREEN,
            basicCardFillSpec,
            exports.SHAPE.CLUB,
            [],
        ),

        CB_YELLOW: new Suit(
            'Yellow',
            'Y',
            exports.COLOR.YELLOW,
            basicCardFillSpec,
            exports.SHAPE.STAR,
            [],
        ),

        CB_RED: new Suit(
            'Red',
            'R',
            exports.COLOR.RED,
            basicCardFillSpec,
            exports.SHAPE.HEART,
            [],
        ),

        CB_PURPLE: new Suit(
            'Purple',
            'P',
            exports.COLOR.PURPLE,
            basicCardFillSpec,
            exports.SHAPE.CRESCENT,
            [],
        ),

        CB_ORANGE: new Suit(
            'Orange',
            'O',
            exports.COLOR.ORANGE,
            basicCardFillSpec,
            exports.SHAPE.SPADE,
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

    const Variant = function Variant(suits, clueColors, showSuitNames, name, nameShort) {
        this.suits = suits;
        this.ranks = [1, 2, 3, 4, 5];
        this.clueColors = clueColors;
        this.showSuitNames = showSuitNames; // We draw the text below the suits for confusing variants
        this.name = name;
        this.nameShort = nameShort;
        this.offsetCardIndicators = suits.some(s => s !== exports.SUIT.RAINBOW && s.clueColors.length > 1);
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
            false,
            'None',
            'No Variant',
        ),

        ORANGE: new Variant(
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
            'Orange Suit',
            'Orange',
        ),

        BLACK: new Variant(
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
            'Black Suit (one of each)',
            'Black (1oE)',
        ),

        RAINBOW: new Variant(
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
            'Rainbow Suit (all colors)',
            'Rainbow',
        ),

        DUAL: new Variant(
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
            'Dual-color Suits',
            'Dual-color',
        ),

        DUALRAINBOW: new Variant(
            [
                exports.SUIT.TEAL, // Blue + Green
                exports.SUIT.LIME, // Green + Yellow
                exports.SUIT.SORANGE, // Yellow + Red
                exports.SUIT.CARDINAL, // Red + Purple
                exports.SUIT.INDIGO, // Purple + Blue
                exports.SUIT.RAINBOW,
            ],
            baseColors,
            true,
            'Dual-color & Rainbow Suits',
            'Dual & Rainbow',
        ),

        WHITERAINBOW: new Variant(
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
            'White & Rainbow Suits',
            'White & Rainbow',
        ),

        CRAZY: new Variant(
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
            'Wild & Crazy',
            'Wild & Crazy',
        ),

        AMBIGUOUS: new Variant(
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
            'Ambiguous Suits',
            'Ambiguous',
        ),

        BLUERED: new Variant(
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
            'Blue & Red Suits',
            'Blue & Red',
        ),

        COLORBLIND: new Variant(
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
            'Color Blind',
            'Color Blind',
        ),

        RAINBOW1OE: new Variant(
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
            'Rainbow Suit (one of each)',
            'Rainbow (1oE)',
        ),

        RAINBOW1OEBLACK: new Variant(
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
            'Rainbow & Black Suits (one of each)',
            'Rainbow & Black (1oE)',
        ),

        WHITE: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
                exports.SUIT.WHITE2,
            ],
            baseColors,
            false,
            'White Suit',
            'White',
        ),

        RAINBOWMULTIFIVES: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.RAINBOW,
            ],
            baseColors4,
            false,
            'Rainbow Suit & Multi-fives',
            'Rainbow & Multi-fives',
        ),

        FOURSUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
            ],
            baseColors4,
            false,
            'Four Suits',
            'Four Suits',
        ),

        RAINBOWFIVESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.RAINBOW,
            ],
            baseColors4,
            false,
            'Rainbow Suit (with 5 suits)',
            'Rainbow (5 suits)',
        ),

        RAINBOWFOURSUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RAINBOW,
            ],
            baseColors3,
            false,
            'Rainbow Suit (with 4 suits)',
            'Rainbow (4 suits)',
        ),

        THREESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
            ],
            baseColors3,
            false,
            'Three Suits',
            'Three Suits',
        ),

        RAINBOWTHREESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.RAINBOW,
            ],
            baseColors3,
            false,
            'Rainbow Suit (with 3 suits)',
            'Rainbow (3 suits)',
        ),

        AFRICANAMERICAN: new Variant(
            [
                exports.SUIT.LRED2,
                exports.SUIT.DRED2,
                exports.SUIT.WHITE3,
                exports.SUIT.LBLUE2,
                exports.SUIT.DBLUE2,
                exports.SUIT.BLACK,
            ],
            [
                exports.COLOR.BLUE,
                exports.COLOR.RED,
                exports.COLOR.BLACK,
            ],
            true,
            'African American',
            'African American',
        ),

        BLACKFIVESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.BLACK,
            ],
            baseColors4plusBlack,
            false,
            'Black Suit (with 5 suits)',
            'Black (5 suits)',
        ),

        WHITEFIVESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.WHITE,
            ],
            baseColors4,
            false,
            'White Suit (with 5 suits)',
            'White (5 suits)',
        ),

        RAINBOW1OEFIVESUITS: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.RAINBOW1OE,
            ],
            baseColors4,
            false,
            'Rainbow (1oE) (with 5 suits)',
            'Rainbow (1oE) (5 suits)',
        ),

        UPORDOWN: new Variant(
            [
                exports.SUIT.BLUE,
                exports.SUIT.GREEN,
                exports.SUIT.YELLOW,
                exports.SUIT.RED,
                exports.SUIT.PURPLE,
            ],
            baseColors,
            false,
            'Up or Down',
            'Up or Down',
        ),

        UPORDOWNRAINBOW: new Variant(
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
            'Up or Down & Rainbow Suit',
            'Up or Down & Rainbow',
        ),

    };

    // This is the mapping that the server uses
    exports.VARIANT_INTEGER_MAPPING = [
        exports.VARIANT.NONE,
        exports.VARIANT.ORANGE,
        exports.VARIANT.BLACK,
        exports.VARIANT.RAINBOW,
        exports.VARIANT.DUAL,
        exports.VARIANT.DUALRAINBOW,
        exports.VARIANT.WHITERAINBOW,
        exports.VARIANT.CRAZY,
        exports.VARIANT.AMBIGUOUS,
        exports.VARIANT.BLUERED,
        exports.VARIANT.COLORBLIND,
        exports.VARIANT.RAINBOW1OE,
        exports.VARIANT.RAINBOW1OEBLACK,
        exports.VARIANT.WHITE,
        exports.VARIANT.RAINBOWMULTIFIVES,
        exports.VARIANT.FOURSUITS,
        exports.VARIANT.RAINBOWFIVESUITS,
        exports.VARIANT.RAINBOWFOURSUITS,
        exports.VARIANT.THREESUITS,
        exports.VARIANT.RAINBOWTHREESUITS,
        exports.VARIANT.AFRICANAMERICAN,
        exports.VARIANT.BLACKFIVESUITS,
        exports.VARIANT.WHITEFIVESUITS,
        exports.VARIANT.RAINBOW1OEFIVESUITS,
        exports.VARIANT.UPORDOWN,
        exports.VARIANT.UPORDOWNRAINBOW,
    ];

    exports.INDICATOR = {
        POSITIVE: '#ffffff',
        NEGATIVE: '#ff7777',
        REPLAY_LEADER: '#ffdf00',
    };

    const CharacterAssignment = function CharacterAssignment(name, description, emoji) {
        this.name = name;
        this.description = description;
        this.emoji = emoji;
    };
    exports.CHARACTER_ASSIGNMENTS = [
        // Clue restriction characters (giving)
        new CharacterAssignment(
            'Fuming',
            'Can only clue numbers and [random color]',
            '🌋',
        ),
        new CharacterAssignment(
            'Dumbfounded',
            'Can only clue colors and [random number]',
            '🤯',
        ),
        new CharacterAssignment(
            'Inept',
            'Cannot give any clues that touch [random suit] cards',
            '🤔',
        ),
        new CharacterAssignment(
            'Awkward',
            'Cannot give any clues that touch [random number]s',
            '😬',
        ),
        new CharacterAssignment(
            'Conservative',
            'Can only give clues that touch a single card',
            '🕇',
        ),
        new CharacterAssignment(
            'Greedy',
            'Can only give clues that touch 2+ cards',
            '🤑',
        ),
        new CharacterAssignment(
            'Picky',
            'Can only clue odd numbers or odd colors',
            '🤢',
        ),
        new CharacterAssignment(
            'Spiteful',
            'Cannot clue the player to their left',
            '😈',
        ),
        new CharacterAssignment(
            'Insolent',
            'Cannot clue the player to their right',
            '😏',
        ),
        new CharacterAssignment(
            'Vindictive',
            'Must clue if they received a clue since their last turn',
            '🗡️',
        ),
        new CharacterAssignment(
            'Miser',
            'Can only clue if there are 4 or more clues available',
            '💰',
        ),
        new CharacterAssignment(
            'Compulsive',
            'Can only clue if it touches the newest or oldest card in someone\'s hand',
            '📺',
        ),
        new CharacterAssignment(
            'Mood Swings',
            'Clues given must alternate between color and number',
            '👧',
        ),
        new CharacterAssignment(
            'Insistent',
            'Must continue to clue cards until one of them is played or discarded',
            '😣',
        ),

        // Clue restriction characters (receiving)
        new CharacterAssignment(
            'Vulnerable',
            'Cannot receive a number 2 or number 5 clue',
            '🛡️',
        ),
        new CharacterAssignment(
            'Color-Blind',
            'Cannot receive a color clue',
            '👓',
        ),

        // Play restriction characters
        new CharacterAssignment(
            'Follower',
            'Cannot play a card unless two cards of the same rank have already been played',
            '👁️',
        ),
        new CharacterAssignment(
            'Impulsive',
            'Must play slot 1 if it has been clued',
            '💉',
        ),
        new CharacterAssignment(
            'Indolent',
            'Cannot play a card if they played on the last round',
            '💺',
        ),
        new CharacterAssignment(
            'Hesitant',
            'Cannot play cards from slot 1',
            '👴🏻',
        ),
        new CharacterAssignment(
            'Gambler',
            'Must play if they didn\'t play last turn; forced misplays do not cost a strike',
            '🎲',
        ),

        // Discard restriction characters
        new CharacterAssignment(
            'Anxious',
            'Cannot discard if there is an even number of clues available (including 0)',
            '😰',
        ),
        new CharacterAssignment(
            'Traumatized',
            'Cannot discard if there is an odd number of clues available',
            '😨',
        ),
        new CharacterAssignment(
            'Wasteful',
            'Cannot discard if there are 2 or more clues available',
            '🗑️',
        ),

        // Extra turn characters
        new CharacterAssignment(
            'Genius',
            'Must clue both a number and a color (uses two clues)',
            '🧠',
        ),
        new CharacterAssignment(
            'Synesthetic',
            'Gives number and color clues at the same time',
            '🎨',
        ),
        new CharacterAssignment(
            'Panicky',
            'When discarding, discards twice if 4 clues or less',
            '😳',
        ),

        // Other
        new CharacterAssignment(
            'Contrarian',
            'Play order inverts after taking a turn',
            '🙅',
        ),
        new CharacterAssignment(
            'Stubborn',
            'Must perform a different action type than the player that came before them',
            '😠',
        ),
        /*
        new CharacterAssignment(
            'Forgetful',
            'Hand is shuffled after discarding (but before drawing)',
            '🔀',
        ),
        */
        new CharacterAssignment(
            'Blind Spot',
            'Cannot see the cards of the player to their left',
            '🚗',
        ),
        new CharacterAssignment(
            'Oblivious',
            'Cannot see the cards of the player to their right',
            '🚂',
        ),
    ];

    // This only freezes one layer deep; to do any better, we should likely
    // involve a library like immutablejs. But probably not worth bothering with.
    for (const property of Object.keys(exports)) {
        Object.freeze(property);
    }
}(typeof exports === 'undefined' ? (this.constants = {}) : exports));
