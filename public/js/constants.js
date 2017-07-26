(function (exports) {
exports.CARDW = 286;
exports.CARDH = 406;

var Color = function Color(name, abbreviation, hex_code, index) {
    this.name = name;
    this.abbreviation = abbreviation;
    this.hex_code = hex_code;
    this.index = index;
    };

exports.COLOR = Object.freeze({
    BLUE: new Color("Blue", "B", "#0044cc", 0),
    GREEN: new Color("Green", "G", "#00cc00", 1),
    YELLOW: new Color("Yellow", "Y", "#ccaa22", 2),
    RED: new Color("Red", "R", "#aa0000", 3),
    PURPLE: new Color("Purple", "P", "#6600cc", 4),
    BLACK: new Color("Black", "K", "#111111", null),
    GRAY: new Color("Gray", "G", "#cccccc", null),
    MAGENTA: new Color("Magenta", "M", "#cc00cc", null),
    NAVY: new Color("Navy", "N", "", null),
    ORANGE: new Color("Orange", "O", "#ff9900", null),
    TAN: new Color("Tan", "T", "#999900", null),
    BURGUNDY: new Color("Burgundy", "B", "#660016", null),
    TEAL: new Color("Teal", "T", "#00b3b3", null),
    LIME: new Color("Lime", "L", "#80c000", null),
    CARDINAL: new Color("Cardinal", "C", "#810735", null),
    INDIGO: new Color("Indigo", "I", "#1a0082", null),
});

exports.SHAPE = Object.freeze({
    DIAMOND: "diamond",
    CLUB: "club",
    STAR: "star",
    HEART: "heart",
    CRESCENT: "crescent",
    SPADE: "spade",
    RAINBOW: "rainbow",
});

exports.PATHFUNC = new Map();
exports.PATHFUNC.set(
    exports.SHAPE.DIAMOND,
    function draw_diamond(ctx) {
        ctx.beginPath();
        ctx.moveTo(75, 0);
        ctx.quadraticCurveTo(110, 60, 150, 100);
        ctx.quadraticCurveTo(110, 140, 75, 200);
        ctx.quadraticCurveTo(40, 140, 0, 100);
        ctx.quadraticCurveTo(40, 60, 75, 0);
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.CLUB,
    function draw_club(ctx) {
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 4.712, true);
        ctx.arc(75, 50, 35, 1, 2.1416, true);
        ctx.arc(40, 110, 35, 4.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.STAR,
    function draw_star(ctx) {
        ctx.translate(75, 100);
        ctx.beginPath();
        ctx.moveTo(0, -75);
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -30);
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -75);
        }
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.HEART,
    function draw_heart(ctx) {
        ctx.beginPath();
        ctx.moveTo(75, 65);
        ctx.bezierCurveTo(75, 57, 70, 45, 50, 45);
        ctx.bezierCurveTo(20, 45, 20, 82, 20, 82);
        ctx.bezierCurveTo(20, 100, 40, 122, 75, 155);
        ctx.bezierCurveTo(110, 122, 130, 100, 130, 82);
        ctx.bezierCurveTo(130, 82, 130, 45, 100, 45);
        ctx.bezierCurveTo(85, 45, 75, 57, 75, 65);
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.CRESCENT,
    function draw_crescent(ctx) {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 3, 4.3, true);
        ctx.arc(48, 83, 52, 5, 2.5, false);
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.SPADE,
    function draw_spade(ctx) {
        ctx.beginPath();
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 5.712, true);
        ctx.lineTo(75, 0);
        ctx.arc(40, 110, 35, 3.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    }
);
exports.PATHFUNC.set(
    exports.SHAPE.RAINBOW,
    function draw_rainbow(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, 140);
        ctx.arc(75, 140, 75, Math.PI, 0, false);
        ctx.lineTo(125, 140);
        ctx.arc(75, 140, 25, 0, Math.PI, true);
        ctx.lineTo(0, 140);
    }
);
Object.freeze(exports.PATHFUNC);

//TODO: these obviously belong somewhere else
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
Object.freeze(exports.backpath);

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
Object.freeze(exports.backpath);
exports.drawshape = function(ctx) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.fill();
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.stroke();
};
Object.freeze(exports.drawshape);

exports.draw_shape = function draw_shape(ctx) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.fill();
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.stroke();
};
Object.freeze(exports.draw_shape);

exports.FILL_TYPE = Object.freeze({
    SOLID: "solid",
    LINEAR_GRADIENT: "linear_gradient",
    RADIAL_GRADIENT: "radial_gradient",
});

var base_colors = Object.freeze([
    exports.COLOR.BLUE,
    exports.COLOR.GREEN,
    exports.COLOR.YELLOW,
    exports.COLOR.RED,
    exports.COLOR.PURPLE,
]);

// Specify between solid color and gradients, along with additional args in the
// case of gradients
var FillSpec = function FillSpec(fill_type, args) {
    this.fill_type = fill_type;
    this.args = args;
};

var solid_fill_spec = Object.freeze(new FillSpec(exports.FILL_TYPE.SOLID));
var multi_bkg_fill_spec = Object.freeze(new FillSpec(
    exports.FILL_TYPE.LINEAR_GRADIENT,
    [0, 0, 0, exports.CARDH]
));
var multi_number_fill_spec = Object.freeze(new FillSpec(
    exports.FILL_TYPE.LINEAR_GRADIENT,
    [0, 14, 0, 110]
));
var multi_symbol_fill_spec = Object.freeze(new FillSpec(
    exports.FILL_TYPE.RADIAL_GRADIENT,
    [75, 150, 25, 75, 150, 75]
));

exports.CARD_AREA = {
    BACKGROUND: "background", 
    NUMBER: "number",
    SYMBOL: "symbol",
};

// Bundles fill specs together for all the card attributes (background, number,
// symbol)
var BuildCardFillSpec = function BuildCardFillSpec(
    background_fill_spec,
    number_fill_spec,
    symbol_fill_spec
) {
    return new Map([
        [exports.CARD_AREA.BACKGROUND, background_fill_spec],
        [exports.CARD_AREA.NUMBER, number_fill_spec],
        [exports.CARD_AREA.SYMBOL, symbol_fill_spec],
    ]);
};
var basic_card_fill_spec = Object.freeze(BuildCardFillSpec(
    solid_fill_spec,
    solid_fill_spec,
    solid_fill_spec
));
var multi_card_fill_spec = Object.freeze(BuildCardFillSpec(
    multi_bkg_fill_spec,
    multi_number_fill_spec,
    multi_symbol_fill_spec
));

// Generates a vertical gradient that is evenly distributed between its
// component colors
var even_linear_gradient = function even_linear_gradient(ctx, colors, args) {
    let grad = ctx.createLinearGradient(...args);
    let n_colors = colors.length;
    for (let i = 0; i < n_colors; ++i) {
        grad.addColorStop(i/(n_colors-1), colors[i].hex_code);
    }
    return grad;
};

// Generates a radial gradient that is evenly distributed between its
// component colors
var even_radial_gradient = function even_radial_gradient(ctx, colors, args) {
    let grad = ctx.createRadialGradient(...args);
    let n_colors = colors.length;
    for (let i = 0; i < n_colors; ++i) {
        grad.addColorStop(i/(n_colors-1), colors[i].hex_code);
    }
    return grad;
};

// Pair each suit name with the color(s) that correspond(s) to it
var Suit = function Suit(name, abbreviation, fill_colors, card_fill_spec, shape, clue_colors, index) {
    this.name = name;
    this.abbreviation = abbreviation;
    this.fill_colors = fill_colors;
    this.card_fill_spec = card_fill_spec;
    this.shape = shape;
    this.clue_colors = clue_colors;
    // for compatibility with existing card naming scheme
    this.index = index;
};

// Returns the style (color, gradient, etc.) for a given card area (bkg, number, symbol)
Suit.prototype.style = function(ctx, card_area) {
    let fill_spec = this.card_fill_spec.get(card_area);
    let fill_type = fill_spec.fill_type;
    let colors = this.fill_colors;

    if (fill_type === exports.FILL_TYPE.SOLID) {
        // colors in this case should be a single color, not an array
        return colors.hex_code;
    }
    else if (fill_type === exports.FILL_TYPE.LINEAR_GRADIENT) {
        return even_linear_gradient(ctx, colors, fill_spec.args);
    }
    else { //Radial gradient
        return even_radial_gradient(ctx, colors, fill_spec.args);
    }
};

// It probably isn't design-necessary to define this list of suits, but it
// will only hurt if we have a lot of instances of suits that vary in property
// between variants
exports.SUIT = Object.freeze({
    BLUE: new Suit(
        "Blue",
        "B",
        exports.COLOR.BLUE,
        basic_card_fill_spec,
        exports.SHAPE.DIAMOND,
        [exports.COLOR.BLUE]
    ),
    GREEN: new Suit(
        "Green",
        "G",
        exports.COLOR.GREEN,
        basic_card_fill_spec,
        exports.SHAPE.CLUB,
        [exports.COLOR.GREEN]
    ),
    YELLOW: new Suit(
        "Yellow",
        "Y",
        exports.COLOR.YELLOW,
        basic_card_fill_spec,
        exports.SHAPE.STAR,
        [exports.COLOR.YELLOW]
    ),
    RED: new Suit(
        "Red",
        "R",
        exports.COLOR.RED,
        basic_card_fill_spec,
        exports.SHAPE.HEART,
        [exports.COLOR.RED]
    ),
    PURPLE: new Suit(
        "Purple",
        "P",
        exports.COLOR.PURPLE,
        basic_card_fill_spec,
        exports.SHAPE.CRESCENT,
        [exports.COLOR.PURPLE]
    ),
    BLACK: new Suit(
        "Black",
        "K",
        exports.COLOR.BLACK,
        basic_card_fill_spec,
        exports.SHAPE.SPADE,
        []
    ),
    // Green for mixed variant, which has different properties than green
    // for original variants
    MGREEN: new Suit(
        "Green",
        "G",
        exports.COLOR.GREEN,
        basic_card_fill_spec,
        exports.SHAPE.DIAMOND,
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW
        ]
    ),
    MAGENTA: new Suit(
        "Magenta",
        "M",
        exports.COLOR.MAGENTA,
        basic_card_fill_spec,
        exports.SHAPE.CLUB,
        [
            exports.COLOR.BLUE,
            exports.COLOR.RED
        ]
    ),
    NAVY: new Suit(
        "Indigo",
        "I",
        exports.COLOR.INDIGO,
        basic_card_fill_spec,
        exports.SHAPE.STAR,
        [
            exports.COLOR.BLUE,
            exports.COLOR.BLACK
        ]
    ),
    ORANGE: new Suit(
        "Orange",
        "O",
        exports.COLOR.ORANGE,
        basic_card_fill_spec,
        exports.SHAPE.HEART,
        [
            exports.COLOR.YELLOW,
            exports.COLOR.RED
        ]
    ),
    TAN: new Suit(
        "Tan",
        "T",
        exports.COLOR.TAN,
        basic_card_fill_spec,
        exports.SHAPE.CRESCENT,
        [
            exports.COLOR.YELLOW,
            exports.COLOR.BLACK
        ]
    ),
    BURGUNDY: new Suit(
        "Burgundy",
        "B",
        exports.COLOR.BURGUNDY,
        basic_card_fill_spec,
        exports.SHAPE.SPADE,
        [
            exports.COLOR.RED,
            exports.COLOR.BLACK
        ]
    ),
    TEAL: new Suit(
        "Teal",
        "T",
        exports.COLOR.TEAL,
        basic_card_fill_spec,
        exports.SHAPE.DIAMOND,
        [
            exports.COLOR.BLUE,
            exports.COLOR.GREEN
        ]
    ),
    LIME: new Suit(
        "Lime",
        "L",
        exports.COLOR.LIME,
        basic_card_fill_spec,
        exports.SHAPE.CLUB,
        [
            exports.COLOR.GREEN,
            exports.COLOR.YELLOW
        ]
    ),
    // Orange with a star pattern, for MM variant
    SORANGE: new Suit(
        "Orange",
        "O",
        exports.COLOR.ORANGE,
        basic_card_fill_spec,
        exports.SHAPE.STAR,
        [
            exports.COLOR.YELLOW,
            exports.COLOR.RED
        ]
    ),
    CARDINAL: new Suit(
        "Cardinal",
        "C",
        exports.COLOR.CARDINAL,
        basic_card_fill_spec,
        exports.SHAPE.HEART,
        [
            exports.COLOR.RED,
            exports.COLOR.PURPLE
        ]
    ),
    INDIGO: new Suit(
        "Indigo",
        "I",
        exports.COLOR.INDIGO,
        basic_card_fill_spec,
        exports.SHAPE.CRESCENT,
        [
            exports.COLOR.BLUE,
            exports.COLOR.PURPLE
        ]
    ),
    // Color ordering not guaranteed to be the same as declaration order
    // Recommend not to access these values for the multi suit, but rather use
    // special cases e.g. `if (suit === SUIT.MULTI, color_match = true)`
    MULTI: new Suit(
        "Multi",
        "M",
        base_colors,
        multi_card_fill_spec,
        exports.SHAPE.RAINBOW,
        Object.values(exports.COLOR)
    ),
    // Gray suit is for replays
    GRAY: new Suit(
        "Gray",
        "",
        exports.COLOR.GRAY,
        basic_card_fill_spec,
        null,
        []
    )
});

exports.ACT = Object.freeze({
    CLUE:     0,//"clue",
    PLAY:     1,//"play",
    DISCARD:  2,//"discard",
    DECKPLAY: 3,//"deckplay",
});

exports.CLUE_TYPE = Object.freeze({
    RANK:  0,//"rank",
    COLOR: 1,//"color",
});

var Variant = function Variant(suits, clue_colors) {
    this.suits = suits;
    this.clue_colors = clue_colors;
    };

exports.VARIANT = Object.freeze({
    NONE: new Variant (
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
        ],
        base_colors
    ),
    BLACKSUIT: new Variant (
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.BLACK,
        ],
        base_colors
    ),
    BLACKONE: new Variant (
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.BLACK,
        ],
        base_colors
    ),
    RAINBOW: new Variant (
        [
            exports.SUIT.BLUE,
            exports.SUIT.GREEN,
            exports.SUIT.YELLOW,
            exports.SUIT.RED,
            exports.SUIT.PURPLE,
            exports.SUIT.MULTI,
        ],
        base_colors
    ),
    MIXED: new Variant (
        [
            exports.SUIT.MGREEN,
            exports.SUIT.MAGENTA,
            exports.SUIT.NAVY,
            exports.SUIT.ORANGE,
            exports.SUIT.TAN,
            exports.SUIT.BURGUNDY,
        ],
        [
            exports.COLOR.BLUE,
            exports.COLOR.YELLOW,
            exports.COLOR.RED,
            exports.COLOR.BLACK,
        ]
    ),
    MM: new Variant (
        [
            exports.SUIT.TEAL,
            exports.SUIT.LIME,
            exports.SUIT.SORANGE,
            exports.SUIT.BURGUNDY,
            exports.SUIT.INDIGO,
            exports.SUIT.MULTI,
        ],
        base_colors
    ),
});

// This is the mapping that the server uses
exports.VARIANT_INTEGER_MAPPING = [
    exports.VARIANT.NONE,
    exports.VARIANT.BLACKSUIT,
    exports.VARIANT.BLACKONE,
    exports.VARIANT.RAINBOW,
    exports.VARIANT.MIXED,
    exports.VARIANT.MM,
];
}(typeof exports === 'undefined' ? (this.constants = {}) : exports));
