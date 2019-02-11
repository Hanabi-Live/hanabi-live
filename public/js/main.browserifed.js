(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
   Copyright 2013 Niklas Voss

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

const separator = ' ';
const DefaultJSONProtocol = {
    unpack: (data) => {
        const name = data.split(separator)[0];
        return [name, data.substring(name.length + 1, data.length)];
    },
    unmarshal: data => JSON.parse(data),
    marshalAndPack: (name, data) => name + separator + JSON.stringify(data),
};

const Connection = function Connection(addr, debug) {
    this.ws = new WebSocket(addr);
    this.callbacks = {};
    this.debug = debug;
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onerror = this.onError.bind(this);
};
Connection.prototype = {
    constructor: Connection,
    protocol: DefaultJSONProtocol,
    setProtocol: function setProtocol(protocol) {
        this.protocol = protocol;
    },
    enableBinary: function enableBinary() {
        this.ws.binaryType = 'arraybuffer';
    },
    onClose: function onClose(evt) {
        if (this.callbacks.close) {
            this.callbacks.close(evt);
        }
    },
    onMessage: function onMessage(evt) {
        const data = this.protocol.unpack(evt.data);
        const command = data[0];
        if (this.callbacks[command]) {
            const obj = this.protocol.unmarshal(data[1]);
            if (this.debug) {
                console.log(`%cReceived ${command}:`, 'color: blue;');
                console.log(obj);
            }
            this.callbacks[command](obj);
        } else if (this.debug) {
            console.error('Recieved WebSocket message with no callback:', command, JSON.parse(data[1]));
        }
    },
    onOpen: function onOpen(evt) {
        if (this.callbacks.open) {
            this.callbacks.open(evt);
        }
    },
    on: function on(name, callback) {
        this.callbacks[name] = callback;
    },
    emit: function emit(name, data) {
        this.ws.send(this.protocol.marshalAndPack(name, data));
    },

    // Added extra handlers beyond what the vanilla Golem code provides
    onError: function onError(evt) {
        if (this.callbacks.socketError) {
            this.callbacks.socketError(evt);
        }
    },
    close: function close() {
        this.ws.close();
    },
};
exports.Connection = Connection;

},{}],2:[function(require,module,exports){
/*
    Users can chat in the lobby, in the pregame, and in a game
*/

// Imports
const globals = require('./globals');

$(document).ready(() => {
    const input1 = $('#lobby-chat-input');
    input1.on('keypress', send('lobby', input1));
    const input2 = $('#lobby-chat-pregame-input');
    input2.on('keypress', send('game', input2));
    const input3 = $('#game-chat-input');
    input3.on('keypress', send('game', input3));
});

const send = (room, input) => (event) => {
    if (event.key !== 'Enter') {
        return;
    }
    if (!input.val()) {
        return;
    }

    // Clear the chat box
    const msg = input.val();
    input.val('');

    globals.conn.send('chat', {
        msg,
        room,
    });
};

exports.add = (data) => {
    let chat;
    if (data.room === 'lobby') {
        chat = $('#lobby-chat-text');
    } else if ($('#lobby-chat-pregame-text').is(':visible')) {
        chat = $('#lobby-chat-pregame-text');
    } else {
        chat = $('#game-chat-text');
    }

    // Convert any Discord emotes
    data.msg = fillEmotes(data.msg);

    // Get the hours and minutes from the time
    const datetime = new Intl.DateTimeFormat(
        undefined,
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        },
    ).format(new Date(data.datetime));

    let line = `<span>[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
        line += `${$('<a>').html(data.msg).html()}`;
    } else {
        line += `<strong>${$('<a>').html(data.msg).html()}</strong>`;
    }
    line += '</span><br />';

    chat.finish();
    chat.append(line);
    chat.animate({
        scrollTop: chat[0].scrollHeight,
    }, globals.fadeTime);
};

const fillEmotes = (message) => {
    let filledMessed = message;
    while (true) {
        const match = filledMessed.match(/&lt;:(.+?):(\d+?)&gt;/);
        if (!match) {
            break;
        }
        const emoteTag = `<img src="https://cdn.discordapp.com/emojis/${match[2]}.png" title="${match[1]}" height=28 />`;
        filledMessed = filledMessed.replace(match[0], emoteTag);
    }
    return filledMessed;
};

},{"./globals":36}],3:[function(require,module,exports){
/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

exports.CARDW = 286;
exports.CARDH = 406;

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

exports.INDICATOR = {
    POSITIVE: '#ffffff',
    NEGATIVE: '#ff7777',
    REPLAY_LEADER: '#ffdf00',
};

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
        'Play order inverts after taking a turn + 2 turn end game',
        '🙅',
    ),
    'Stubborn': new Character(
        'Must perform a different action type than the player that came before them',
        '😠',
    ),
    /*
    'Forgetful': new Character(
        'Hand is shuffled after discarding (but before drawing)',
        '🔀',
    ),
    */
    'Blind Spot': new Character(
        'Cannot see the cards of the player to their left',
        '🚗',
    ),
    'Oblivious': new Character(
        'Cannot see the cards of the player to their right',
        '🚂',
    ),
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
};

// This only freezes one layer deep; to do any better, we should likely
// involve a library like immutablejs. But probably not worth bothering with.
for (const property of Object.keys(exports)) {
    Object.freeze(property);
}

},{}],4:[function(require,module,exports){
/*
    In-game chat
*/

// Imports
const globals = require('../globals');

$(document).ready(() => {
    initDraggableDiv(document.getElementById('game-chat-modal'));
    initResizableDiv('.resizable');

    $('#game-chat-modal-header-close').click(() => {
        hide();
    });
});

exports.toggle = () => {
    const modal = $('#game-chat-modal');
    if (modal.is(':visible')) {
        hide();
    } else {
        show();
    }
};

const show = () => {
    const modal = $('#game-chat-modal');
    modal.fadeIn(globals.fadeTime);

    // Check to see if there are any uncurrently unread chat messages
    if (globals.chatUnread !== 0) {
        // If the user is opening the chat, then we assume that all of the chat messages are read
        globals.chatUnread = 0;
        globals.conn.send('chatRead'); // We need to notify the server that we have read everything
        globals.ui.updateChatLabel(); // Reset the "Chat" UI button back to normal
    }

    // If there is a stored size / position for the chat box, set that
    let putChatInDefaultPosition = true;
    const width = localStorage.getItem('chatWindowWidth');
    const height = localStorage.getItem('chatWindowHeight');
    const top = localStorage.getItem('chatWindowTop');
    const left = localStorage.getItem('chatWindowLeft');
    if (
        width !== null && width !== ''
        && height !== null && height !== ''
        && top !== null && top !== ''
        && left !== null && left !== ''
    ) {
        putChatInDefaultPosition = false;
        modal.css('width', width);
        modal.css('height', height);
        modal.css('top', top);
        modal.css('left', left);
    }

    // Just in case, reset the size and position if the stored location puts the chat box offscreen
    if (modal.is(':offscreen')) {
        putChatInDefaultPosition = true;
    }

    if (putChatInDefaultPosition) {
        modal.css('width', '20%');
        modal.css('height', '50%');
        modal.css('top', '1%');
        modal.css('left', '79%');
    }

    // Scroll to the bottom of the chat
    const chat = document.getElementById('game-chat-text');
    chat.scrollTop = chat.scrollHeight;

    $('#game-chat-input').focus();
};
exports.show = show;

const hide = () => {
    $('#game-chat-modal').fadeOut(globals.fadeTime);
};
exports.hide = hide;

/*
    Make draggable div
    https://www.w3schools.com/howto/howto_js_draggable.asp
*/

function initDraggableDiv(element) {
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;
    if (document.getElementById(`${element.id}-header`)) {
        // If present, the header is where you move the div from
        document.getElementById(`${element.id}-header`).onmousedown = dragMouseDown;
    } else {
        // Otherwise, move the div from anywhere inside the div
        element.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;

        // Call a function whenever the cursor moves
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        // Record the current position
        const oldTop = element.style.top;
        const oldLeft = element.style.left;

        // Set the element's new position
        element.style.top = `${element.offsetTop - pos2}px`;
        element.style.left = `${element.offsetLeft - pos1}px`;

        // Move if back if it is offscreen
        if ($('#game-chat-modal').is(':offscreen')) {
            element.style.top = oldTop;
            element.style.left = oldLeft;
        }
    }

    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;

        // Store the size and location of the div
        localStorage.setItem('chatWindowWidth', element.style.width);
        localStorage.setItem('chatWindowHeight', element.style.height);
        localStorage.setItem('chatWindowTop', element.style.top);
        localStorage.setItem('chatWindowLeft', element.style.left);
    }
}

/*
    Make resizable div by Hung Nguyen
    https://codepen.io/ZeroX-DG/pen/vjdoYe
*/

/* eslint-disable */
function initResizableDiv(div) {
    const element = document.querySelector(div);
    const resizers = document.querySelectorAll(`${div} .resizer`);
    const minimumSize = 20;
    let originalWidth = 0;
    let originalHeight = 0;
    let originalX = 0;
    let originalY = 0;
    let originalMouseX = 0;
    let originalMouseY = 0;
    for (let i = 0; i < resizers.length; i++) {
        const currentResizer = resizers[i];
        currentResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            originalWidth = parseFloat(getComputedStyle(element, null)
                .getPropertyValue('width')
                .replace('px', ''));
            originalHeight = parseFloat(getComputedStyle(element, null)
                .getPropertyValue('height')
                .replace('px', ''));
            const rect = element.getBoundingClientRect();
            originalX = rect.left;
            originalY = rect.top;
            originalMouseX = e.pageX;
            originalMouseY = e.pageY;
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        });

        function resize(e) {
            if (currentResizer.classList.contains('bottom-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight + (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                }
            } else if (currentResizer.classList.contains('bottom-left')) {
                const height = originalHeight + (e.pageY - originalMouseY);
                const width = originalWidth - (e.pageX - originalMouseX);
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                }
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                    element.style.left = `${originalX + (e.pageX - originalMouseX)}px`;
                }
            } else if (currentResizer.classList.contains('top-right')) {
                const width = originalWidth + (e.pageX - originalMouseX);
                const height = originalHeight - (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                    element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
                }
            } else {
                const width = originalWidth - (e.pageX - originalMouseX);
                const height = originalHeight - (e.pageY - originalMouseY);
                if (width > minimumSize) {
                    element.style.width = `${width}px`;
                    element.style.left = `${originalX + (e.pageX - originalMouseX)}px`;
                }
                if (height > minimumSize) {
                    element.style.height = `${height}px`;
                    element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
                }
            }
        }

        function stopResize() {
            window.removeEventListener('mousemove', resize);

            // Store the size and location of the div
            localStorage.setItem('chatWindowWidth', element.style.width);
            localStorage.setItem('chatWindowHeight', element.style.height);
            localStorage.setItem('chatWindowTop', element.style.top);
            localStorage.setItem('chatWindowLeft', element.style.left);
        }
    }
}
/* eslint-enable */

},{"../globals":36}],5:[function(require,module,exports){
/*
    WebSocket command handlers for in-game events
*/

// Imports
const globals = require('../globals');

exports.init = () => {
    globals.conn.on('init', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('init', data);
        }
    });

    globals.conn.on('advanced', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('advanced', data);
        }
    });

    globals.conn.on('connected', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('connected', data);
        }
    });

    globals.conn.on('notifyList', (data) => {
        if (globals.currentScreen === 'game') {
            // When the server has a bunch of notify actions to send,
            // it will send them all in one array
            for (const action of data) {
                globals.ui.handleMessage('notify', action);
            }
        }
    });

    globals.conn.on('notify', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('notify', data);
        }
    });

    globals.conn.on('action', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('action', data);
        }
    });

    globals.conn.on('spectators', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('spectators', data);
        }
    });

    globals.conn.on('clock', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('clock', data);
        }
    });

    globals.conn.on('note', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('note', data);
        }
    });

    globals.conn.on('notes', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('notes', data);
        }
    });

    globals.conn.on('replayLeader', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayLeader', data);
        }
    });

    globals.conn.on('replayTurn', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayTurn', data);
        }
    });

    globals.conn.on('replayIndicator', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayIndicator', data);
        }
    });

    globals.conn.on('replayMorph', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayMorph', data);
        }
    });

    globals.conn.on('replaySound', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replaySound', data);
        }
    });

    globals.conn.on('boot', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('boot', data);
        }
    });
};

},{"../globals":36}],6:[function(require,module,exports){
/*
    The Hanabi game UI
*/

exports.chat = require('./chat');
exports.commands = require('./commands');
exports.sounds = require('./sounds');
exports.tooltips = require('./tooltips');

// Imports
const globals = require('../globals');
const misc = require('../misc');
const ui = require('./ui/ui');

$(document).ready(() => {
    // Disable the right-click context menu while in a game
    $('body').on('contextmenu', '#game', () => false);
});

exports.show = () => {
    globals.currentScreen = 'game';

    $('#page-wrapper').hide(); // We can't fade this out as it will overlap
    $('#game').fadeIn(globals.fadeTime);

    // Clear the in-game chat box of any previous content
    $('#game-chat-text').html('');

    globals.ui = new ui(globals, exports); // eslint-disable-line new-cap
    globals.chatUnread = 0;
    globals.conn.send('hello');
};

exports.hide = () => {
    globals.currentScreen = 'lobby';

    globals.ui.destroy();
    globals.ui = null;

    $('#game').hide(); // We can't fade this out as it will overlap
    $('#page-wrapper').fadeIn(globals.fadeTime);

    // Make sure that there are not any game-related modals showing
    $('#game-chat-modal').hide();

    // Make sure that there are not any game-related tooltips showing
    misc.closeAllTooltips();

    // Scroll to the bottom of the chat
    const chat = document.getElementById('lobby-chat-text');
    chat.scrollTop = chat.scrollHeight;
};

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.game = exports;

},{"../globals":36,"../misc":49,"./chat":4,"./commands":5,"./sounds":7,"./tooltips":8,"./ui/ui":35}],7:[function(require,module,exports){
/*
    In-game sounds
*/

// Imports
const globals = require('../globals');

$(document).ready(() => {
    preload();
});

exports.play = (file) => {
    const path = `/public/sounds/${file}.mp3`;
    const audio = new Audio(path);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Audio playback was successful; do nothing
        }).catch((error) => {
            // Audio playback failed
            // This is most likely due to the user not having interacted with the page yet
            // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
            console.error(`Failed to play "${path}":`, error);
        });
    }
};

const preload = () => {
    if (!globals.settings.sendTurnSound) {
        return;
    }

    const soundFiles = [
        'blind1',
        'blind2',
        'blind3',
        'blind4',
        'fail1',
        'fail2',
        'finished_fail',
        'finished_success',
        'sad',
        'tone',
        'turn_other',
        'turn_us',
        // Don't preload shared replay sound effects, as they are used more rarely
    ];
    for (const file of soundFiles) {
        const audio = new Audio(`public/sounds/${file}.mp3`);
        audio.load();
    }
};

},{"../globals":36}],8:[function(require,module,exports){
/*
    In-game tooltips (for notes, etc.)
*/

// Constants
const maxPlayers = 6;
const maxCardsInADeck = 60;

$(document).ready(() => {
    const tooltipThemes = [
        'tooltipster-shadow',
        'tooltipster-shadow-big',
    ];
    const tooltipOptions = {
        animation: 'grow',
        contentAsHTML: true,
        delay: 0,
        interactive: true, // So that users can update their notes
        theme: tooltipThemes,
        trigger: 'custom',
        updateAnimation: null,
    };

    // Some tooltips are defined in "main.tmpl"
    $('#tooltip-deck').tooltipster(tooltipOptions);
    $('#tooltip-spectators').tooltipster(tooltipOptions);
    $('#tooltip-leader').tooltipster(tooltipOptions);

    // Dynamically create the player tooltips
    for (let i = 0; i < maxPlayers; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        const newThemes = tooltipThemes.slice();
        newThemes.push('align-center');
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

        $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
        $(`#tooltip-character-assignment-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
    }

    // Dynamically create the card note tooltips
    for (let i = 0; i < maxCardsInADeck; i++) { // Matches card.order
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }
});

},{}],9:[function(require,module,exports){
// Imports
const globals = require('./globals');
const FitText = require('./fitText');

const Button = function Button(config) {
    Kinetic.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    const background = new Kinetic.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });

    this.add(background);

    if (config.text) {
        const text = new FitText({
            name: 'text',
            x: 0,
            y: 0.275 * h,
            width: w,
            height: 0.5 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            align: 'center',
            text: config.text,
        });

        this.setText = newText => text.setText(newText);
        this.setFill = newFill => text.setFill(newFill);

        this.add(text);
    } else if (config.image) {
        const img = new Kinetic.Image({
            name: 'image',
            x: 0.2 * w,
            y: 0.2 * h,
            width: 0.6 * w,
            height: 0.6 * h,
            listening: false,
            image: globals.ImageLoader.get(config.image),
        });

        this.add(img);
    }

    this.enabled = true;
    this.pressed = false;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().draw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().draw();

            background.off('mouseup');
            background.off('mouseout');
        };

        background.on('mouseout', () => {
            resetButton();
        });
        background.on('mouseup', () => {
            resetButton();
        });
    });
};

Kinetic.Util.extend(Button, Kinetic.Group);

Button.prototype.setEnabled = function setEnabled(enabled) {
    this.enabled = enabled;

    this.get('.text')[0].setFill(enabled ? 'white' : '#444444');

    this.get('.background')[0].setListening(enabled);

    this.getLayer().draw();
};

Button.prototype.getEnabled = function getEnabled() {
    return this.enabled;
};

Button.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = Button;

},{"./fitText":20,"./globals":21}],10:[function(require,module,exports){
const ButtonGroup = function ButtonGroup(config) {
    Kinetic.Node.call(this, config);

    this.list = [];
};

Kinetic.Util.extend(ButtonGroup, Kinetic.Node);

ButtonGroup.prototype.add = function add(button) {
    const self = this;

    this.list.push(button);

    button.on('click tap', function buttonClick() {
        this.setPressed(true);

        for (let i = 0; i < self.list.length; i++) {
            if (self.list[i] !== this && self.list[i].pressed) {
                self.list[i].setPressed(false);
            }
        }

        self.fire('change');
    });
};

ButtonGroup.prototype.getPressed = function getPressed() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.list[i].pressed) {
            return this.list[i];
        }
    }

    return null;
};

ButtonGroup.prototype.clearPressed = function clearPressed() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.list[i].pressed) {
            this.list[i].setPressed(false);
        }
    }
};

module.exports = ButtonGroup;

},{}],11:[function(require,module,exports){
/*
    The HanabiCard object, which represts a single card
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const cardDraw = require('./cardDraw');
const notes = require('./notes');
const replay = require('./replay');

// Constants
const {
    CARDH,
    CARDW,
    CLUE_TYPE,
    INDICATOR,
    SUIT,
} = constants;

const HanabiCard = function HanabiCard(config) {
    const self = this;

    const winH = globals.stage.getHeight();

    config.width = CARDW;
    config.height = CARDH;
    config.x = CARDW / 2;
    config.y = CARDH / 2;
    config.offset = {
        x: CARDW / 2,
        y: CARDH / 2,
    };

    Kinetic.Group.call(this, config);

    this.bare = new Kinetic.Image({
        width: config.width,
        height: config.height,
    });

    this.doRotations = function doRotations(inverted = false) {
        this.setRotation(inverted ? 180 : 0);

        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? config.width : 0);
        this.bare.setY(inverted ? config.height : 0);
    };

    this.bare.setDrawFunc(function setDrawFunc(context) {
        cardDraw.scaleCardImage(
            context,
            self.barename,
            this.getWidth(),
            this.getHeight(),
            this.getAbsoluteTransform(),
        );
    });
    this.add(this.bare);

    this.trueSuit = config.suit || undefined;
    this.trueRank = config.rank || undefined;
    this.suitKnown = function suitKnown() {
        return this.trueSuit !== undefined;
    };
    this.rankKnown = function rankKnown() {
        return this.trueRank !== undefined;
    };
    this.identityKnown = function identityKnown() {
        return this.suitKnown() && this.rankKnown();
    };
    this.order = config.order;
    // Possible suits and ranks (based on clues given) are tracked separately from knowledge of
    // the true suit and rank
    this.possibleSuits = config.suits;
    this.possibleRanks = config.ranks;

    this.rankPips = new Kinetic.Group({
        x: 0,
        y: Math.floor(CARDH * 0.85),
        width: CARDW,
        height: Math.floor(CARDH * 0.15),
        visible: !this.rankKnown(),
    });
    this.suitPips = new Kinetic.Group({
        x: 0,
        y: 0,
        width: Math.floor(CARDW),
        height: Math.floor(CARDH),
        visible: !this.suitKnown(),
    });
    this.add(this.rankPips);
    this.add(this.suitPips);

    const cardPresentKnowledge = globals.learnedCards[this.order];
    if (cardPresentKnowledge.rank) {
        this.rankPips.visible(false);
    }
    if (cardPresentKnowledge.suit) {
        this.suitPips.visible(false);
    }
    if (globals.replay) {
        this.rankPips.visible(false);
        this.suitPips.visible(false);
    }

    for (const i of config.ranks) {
        const rankPip = new Kinetic.Rect({
            x: Math.floor(CARDW * (i * 0.19 - 0.14)),
            y: 0,
            width: Math.floor(CARDW * 0.15),
            height: Math.floor(CARDH * 0.10),
            fill: 'black',
            stroke: 'black',
            name: i.toString(),
            listening: false,
        });
        if (!globals.learnedCards[this.order].possibleRanks.includes(i)) {
            rankPip.setOpacity(0.3);
        }
        this.rankPips.add(rankPip);
    }

    const { suits } = config;
    const nSuits = suits.length;
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        let fill = suit.fillColors.hexCode;
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
            fill = undefined;
        }

        const suitPip = new Kinetic.Shape({
            x: Math.floor(CARDW * 0.5),
            y: Math.floor(CARDH * 0.5),

            // Scale numbers are magic
            scale: {
                x: 0.4,
                y: 0.4,
            },

            // Transform polar to cartesian coordinates
            // The magic number added to the offset is needed to center things properly;
            // We don't know why it's needed;
            // perhaps something to do with the shape functions
            offset: {
                x: Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25), // eslint-disable-line
                y: Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3), // eslint-disable-line
            },
            fill,
            stroke: 'black',
            name: suit.name,
            listening: false,
            /* eslint-disable no-loop-func */
            drawFunc: (ctx) => {
                cardDraw.drawSuitShape(suit, i)(ctx);
                ctx.closePath();
                ctx.fillStrokeShape(suitPip);
            },
            /* eslint-enable no-loop-func */
        });

        // Gradient numbers are magic
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
            suitPip.fillRadialGradientColorStops([
                0.3, suit.fillColors[0].hexCode,
                0.425, suit.fillColors[1].hexCode,
                0.65, suit.fillColors[2].hexCode,
                0.875, suit.fillColors[3].hexCode,
                1, suit.fillColors[4].hexCode,
            ]);
            suitPip.fillRadialGradientStartPoint({
                x: 75,
                y: 140,
            });
            suitPip.fillRadialGradientEndPoint({
                x: 75,
                y: 140,
            });
            suitPip.fillRadialGradientStartRadius(0);
            suitPip.fillRadialGradientEndRadius(Math.floor(CARDW * 0.25));
        }
        suitPip.rotation(0);

        // Reduce opactity of eliminated suits and outline remaining suits
        if (!globals.learnedCards[this.order].possibleSuits.includes(suit)) {
            suitPip.setOpacity(0.4);
        } else {
            suitPip.setStrokeWidth(5);
        }

        this.suitPips.add(suitPip);
    }

    this.barename = undefined;
    this.showOnlyLearned = false;

    this.setBareImage();

    this.cluedBorder = new Kinetic.Rect({
        x: 3,
        y: 3,
        width: config.width - 6,
        height: config.height - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffdf00',
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);

    this.isClued = function isClued() {
        return this.cluedBorder.visible();
    };
    this.isDiscarded = false;
    this.turnDiscarded = null;
    this.isPlayed = false;
    this.turnPlayed = null;

    this.indicatorArrow = new Kinetic.Text({
        x: config.width * 1.01,
        y: config.height * 0.18,
        width: config.width,
        height: 0.5 * config.height,
        fontSize: 0.2 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '⬆',
        rotation: 180,
        fill: '#ffffff',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
        listening: false,
    });
    this.add(this.indicatorArrow);

    // Define the note indicator emoji (this used to be a white square)
    const noteX = 0.78;
    const noteY = 0.06;
    this.noteGiven = new Kinetic.Text({
        x: noteX * config.width,
        // If the cards have triangles on the corners that show the color composition,
        // the note emoji will overlap
        // Thus, we move it downwards if this is the case
        y: (globals.variant.offsetCardIndicators ? noteY + 0.1 : noteY) * config.height,
        fontSize: 0.1 * config.height,
        fontFamily: 'Verdana',
        align: 'center',
        text: '📝',
        rotation: 180,
        fill: '#ffffff',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
        listening: false,
    });
    this.noteGiven.setScale({
        x: -1,
        y: -1,
    });
    this.noteGiven.rotated = false;
    // (we might rotate it later to indicate to spectators that the note was updated)
    this.add(this.noteGiven);
    if (notes.get(this.order)) {
        this.noteGiven.show();
    }

    /*
        Define event handlers
        Multiple handlers may set activeHover
    */

    this.on('mousemove', function cardMouseMove() {
        // Don't do anything if there is not a note on this card
        if (!self.noteGiven.visible()) {
            return;
        }

        // If we are spectating and there is an new note, mark it as seen
        if (self.noteGiven.rotated) {
            self.noteGiven.rotated = false;
            self.noteGiven.rotate(-15);
            globals.layers.card.batchDraw();
        }

        // Don't open any more note tooltips if the user is currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        globals.activeHover = this;
        notes.show(self); // We supply the card as the argument
    });

    this.on('mouseout', () => {
        // Don't close the tooltip if we are currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        const tooltip = $(`#tooltip-card-${self.order}`);
        tooltip.tooltipster('close');
    });

    this.on('mousemove tap', () => {
        globals.elements.clueLog.showMatches(self);
        globals.layers.UI.draw();
    });

    this.on('mouseout', () => {
        globals.elements.clueLog.showMatches(null);
        globals.layers.UI.draw();
    });

    this.on('click tap', this.click);

    // Hide clue arrows ahead of user dragging their card
    if (config.holder === globals.playerUs && !globals.replay && !globals.spectating) {
        this.on('mousedown', (event) => {
            if (
                event.evt.which !== 1 // Dragging uses left click
                || globals.inReplay
                || !this.indicatorArrow.isVisible()
            ) {
                return;
            }

            globals.lobby.ui.showClueMatch(-1);
            // Do not prevent default since there can be more than one mousedown event
        });
    }

    /*
        Empathy feature
    */

    // Click on a teammate's card to have the card show as it would to that teammate
    // (or, in a replay, show your own card as it appeared at that moment in time)
    // Pips visibility state is tracked so it can be restored for your own hand during a game
    const toggleHolderViewOnCard = (c, enabled, togglePips) => {
        const toggledPips = [0, 0];
        if (c.rankPips.visible() !== enabled && togglePips[0] === 1) {
            c.rankPips.setVisible(enabled);
            toggledPips[0] = 1;
        }
        if (c.suitPips.visible() !== enabled && togglePips[1] === 1) {
            c.suitPips.setVisible(enabled);
            toggledPips[1] = 1;
        }
        c.showOnlyLearned = enabled;
        c.setBareImage();
        return toggledPips;
    };

    // Dynamically adjusted known cards, to be restored by event
    const toggledHolderViewCards = [];
    const endHolderViewOnCard = function endHolderViewOnCard(toggledPips) {
        const cardsToReset = toggledHolderViewCards.splice(0, toggledHolderViewCards.length);
        cardsToReset.map(
            (card, index) => toggleHolderViewOnCard(card, false, toggledPips[index]),
        );
        globals.layers.card.batchDraw();
    };
    const beginHolderViewOnCard = function beginHolderViewOnCard(cards) {
        if (toggledHolderViewCards.length > 0) {
            return undefined; // Handle race conditions with stop
        }

        toggledHolderViewCards.splice(0, 0, ...cards);
        const toggledPips = cards.map(c => toggleHolderViewOnCard(c, true, [1, 1]));
        globals.layers.card.batchDraw();
        return toggledPips;
    };
    if (config.holder !== globals.playerUs || globals.inReplay || globals.spectating) {
        const mouseButton = 1; // Left-click
        let toggledPips = [];
        this.on('mousedown', (event) => {
            if (event.evt.which !== mouseButton) {
                return;
            }

            // Disable Empathy if the card is tweening
            const child = this.parent; // This is the LayoutChild
            if (child.tween && child.tween.isPlaying()) {
                return;
            }

            // Disable Empathy if the card is played or discarded
            // (clicking on a played/discarded card goes to the turn that it was played/discarded)
            if (this.isPlayed || this.isDiscarded) {
                return;
            }

            globals.activeHover = this;
            const cards = this.parent.parent.children.map(c => c.children[0]);
            toggledPips = beginHolderViewOnCard(cards);
        });
        this.on('mouseup mouseout', (event) => {
            if (event.type === 'mouseup' && event.evt.which !== mouseButton) {
                return;
            }
            endHolderViewOnCard(toggledPips);
        });
    }
};

Kinetic.Util.extend(HanabiCard, Kinetic.Group);

HanabiCard.prototype.setBareImage = function setBareImage() {
    this.barename = imageName(this);
};

HanabiCard.prototype.setIndicator = function setIndicator(visible, type = INDICATOR.POSITIVE) {
    this.indicatorArrow.setStroke('#000000');
    this.indicatorArrow.setFill(type);
    this.indicatorArrow.setVisible(visible);
    this.getLayer().batchDraw();
};

HanabiCard.prototype.applyClue = function applyClue(clue, positive) {
    if (clue.type === CLUE_TYPE.RANK) {
        const clueRank = clue.value;
        const findPipElement = rank => this.rankPips.find(`.${rank}`);
        let removed;
        if (globals.variant.name.startsWith('Multi-Fives')) {
            removed = filterInPlace(
                this.possibleRanks,
                rank => (rank === clueRank || rank === 5) === positive,
            );
        } else {
            removed = filterInPlace(
                this.possibleRanks,
                rank => (rank === clueRank) === positive,
            );
        }
        removed.forEach(rank => findPipElement(rank).hide());
        // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
        // display a non-grey card face
        if (this.possibleRanks.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
            [this.trueRank] = this.possibleRanks;
            findPipElement(this.trueRank).hide();
            this.rankPips.hide();
            globals.learnedCards[this.order].rank = this.trueRank;
        }
        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleRanks,
            s => this.possibleRanks.includes(s),
        );
    } else if (clue.type === CLUE_TYPE.COLOR) {
        const clueColor = clue.value;
        const findPipElement = suit => this.suitPips.find(`.${suit.name}`);
        const removed = filterInPlace(
            this.possibleSuits,
            suit => suit.clueColors.includes(clueColor) === positive,
        );
        removed.forEach(suit => findPipElement(suit).hide());
        // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
        // display a non-grey card face
        if (this.possibleSuits.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
            [this.trueSuit] = this.possibleSuits;
            findPipElement(this.trueSuit).hide();
            this.suitPips.hide();
            globals.learnedCards[this.order].suit = this.trueSuit;
        }
        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleSuits,
            s => this.possibleSuits.includes(s),
        );
    } else {
        console.error('Clue type invalid.');
    }
};

HanabiCard.prototype.hideClues = function hideClues() {
    this.cluedBorder.hide();
};

HanabiCard.prototype.isInPlayerHand = function isInPlayerHand() {
    return globals.elements.playerHands.indexOf(this.parent.parent) !== -1;
};

HanabiCard.prototype.click = function click(event) {
    if (event.evt.which === 1) { // Left-click
        this.clickLeft();
    } else if (event.evt.which === 3) { // Right-click
        this.clickRight();
    }
};

HanabiCard.prototype.clickLeft = function clickLeft() {
    // The "Empathy" feature is handled elsewhere in this file
    if (this.isPlayed) {
        // Clicking on played cards goes to the turn that they were played
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turnPlayed + 1, true);
    } else if (this.isDiscarded) {
        // Clicking on discarded cards goes to the turn that they were discarded
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turnDiscarded + 1, true);
    }
};

HanabiCard.prototype.clickRight = function clickRight() {
    // Ctrl + shift + alt + right-click is a card morph
    if (window.event.ctrlKey && window.event.shiftKey && window.event.altKey) {
        this.clickMorph();
        return;
    }

    // Right-click for a leader in a shared replay is an arrow
    if (
        globals.sharedReplay
        && globals.sharedReplayLeader === globals.lobby.username
        && globals.useSharedTurns
    ) {
        this.clickArrow();
        return;
    }

    // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered
    // (this must be above the other note code because of the modifiers)
    if (window.event.ctrlKey && window.event.shiftKey) {
        const note = notes.vars.lastNote;
        notes.set(this.order, note);
        notes.update(this);
        notes.show(this);
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (window.event.shiftKey) {
        const note = 'f';
        notes.set(this.order, note);
        notes.update(this);
        notes.show(this);
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (window.event.altKey) {
        const note = 'cm';
        notes.set(this.order, note);
        notes.update(this);
        notes.show(this);
        return;
    }

    // Ctrl + right-click is a local arrow
    // (we don't want this functionality in shared replays because
    // it could be misleading as to who the real replay leader is)
    if (window.event.ctrlKey && globals.sharedReplay === false) {
        this.clickArrowLocal();
        return;
    }

    // A normal right-click is edit a note
    notes.openEditTooltip(this);
};

HanabiCard.prototype.clickArrow = function clickArrow() {
    // In a shared replay, the leader right-clicks a card to draw on arrow on it to attention to it
    // (and it is shown to all of the players in the review)
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.ARROW,
        order: this.order,
    });

    // Draw the indicator for the user manually so that
    // we don't have to wait for the client to server round-trip
    globals.lobby.ui.handleReplayIndicator({
        order: this.order,
    });
};

HanabiCard.prototype.clickArrowLocal = function clickArrowLocal() {
    // Even if they are not a leader in a shared replay,
    // a user might still want to draw an arrow on a card for demonstration purposes
    globals.lobby.ui.handleReplayIndicator({
        order: this.order,
    });
};

// Morphing cards allows for creation of hypothetical situations
HanabiCard.prototype.clickMorph = function clickMorph() {
    // Only allow this feature in replays
    if (!globals.replay) {
        return;
    }

    const card = prompt('What card do you want to morph it into?\n(e.g. "b1", "k2", "m3", "11", "65")');
    if (card === null || card.length !== 2) {
        return;
    }
    const suitLetter = card[0];
    let suit;
    if (suitLetter === 'b' || suitLetter === '1') {
        suit = 0;
    } else if (suitLetter === 'g' || suitLetter === '2') {
        suit = 1;
    } else if (suitLetter === 'y' || suitLetter === '3') {
        suit = 2;
    } else if (suitLetter === 'r' || suitLetter === '4') {
        suit = 3;
    } else if (suitLetter === 'p' || suitLetter === '5') {
        suit = 4;
    } else if (suitLetter === 'k' || suitLetter === 'm' || suitLetter === '6') {
        suit = 5;
    } else {
        return;
    }
    const rank = parseInt(card[1], 10);
    if (Number.isNaN(rank)) {
        return;
    }

    // Tell the server that we are doing a hypothetical
    if (globals.sharedReplayLeader === globals.lobby.username) {
        globals.lobby.conn.send('replayAction', {
            type: constants.REPLAY_ACTION_TYPE.MORPH,
            order: this.order,
            suit,
            rank,
        });
    }

    // Send the reveal message manually so that
    // we don't have to wait for the client to server round-trip
    const revealMsg = {
        type: 'reveal',
        which: {
            order: this.order,
            rank,
            suit,
        },
    };
    globals.lobby.ui.handleNotify(revealMsg);
};


module.exports = HanabiCard;

/*
    Misc. functions
*/

const imageName = (card) => {
    let prefix = 'Card';

    const learnedCard = globals.learnedCards[card.order];

    const rank = (!card.showOnlyLearned && card.trueRank);
    const empathyPastRankUncertain = card.showOnlyLearned && card.possibleRanks.length > 1;

    const suit = (!card.showOnlyLearned && card.trueSuit);
    const empathyPastSuitUncertain = card.showOnlyLearned && card.possibleSuits.length > 1;

    let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
    if (empathyPastSuitUncertain) {
        suitToShow = SUIT.GRAY;
    }

    // For whatever reason, Card-Gray is never created, so use NoPip-Gray
    if (suitToShow === SUIT.GRAY) {
        prefix = 'NoPip';
    }

    let name = `${prefix}-${suitToShow.name}-`;
    if (empathyPastRankUncertain) {
        name += '6';
    } else {
        name += rank || learnedCard.rank || '6';
    }
    return name;
};

const filterInPlace = function filterInPlace(values, predicate) {
    const removed = [];
    let i = values.length - 1;
    while (i >= 0) {
        if (!predicate(values[i], i)) {
            removed.unshift(values.splice(i, 1)[0]);
        }
        i -= 1;
    }
    return removed;
};

},{"../../constants":3,"./cardDraw":13,"./globals":21,"./notes":29,"./replay":31}],12:[function(require,module,exports){
// Imports
const globals = require('./globals');
const constants = require('../../constants');
const LayoutChild = require('./layoutChild');
const misc = require('../../misc');
const replay = require('./replay');

const CardDeck = function CardDeck(config) {
    Kinetic.Group.call(this, config);

    this.cardback = new Kinetic.Image({
        x: 0,
        y: 0,
        width: this.getWidth(),
        height: this.getHeight(),
        image: globals.cardImages[config.cardback],
    });
    this.add(this.cardback);

    this.cardback.on('dragend.play', function dragendPlay() {
        const pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        if (globals.lobby.ui.overPlayArea(pos)) {
            globals.postAnimationLayout = () => {
                this.doLayout();
                globals.postAnimationLayout = null;
            };

            this.setDraggable(false);
            globals.elements.deckPlayAvailableLabel.setVisible(false);

            globals.lobby.conn.send('action', {
                type: constants.ACT.DECKPLAY,
            });

            globals.lobby.ui.stopAction();

            globals.savedAction = null;
        } else {
            // The card was dragged to an invalid location,
            // so animate the card back to where it was
            new Kinetic.Tween({
                node: this,
                duration: 0.5,
                x: 0,
                y: 0,
                runonce: true,
                onFinish: () => {
                    globals.layers.UI.draw();
                },
            }).play();
        }
    });

    this.cardback.on('click', replay.promptTurn);

    this.count = new Kinetic.Text({
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        x: 0,
        y: 0.3 * this.getHeight(),
        width: this.getWidth(),
        height: 0.4 * this.getHeight(),
        fontSize: 0.4 * this.getHeight(),
        fontFamily: 'Verdana',
        fontStyle: 'bold',
        text: '0',
        listening: false,
    });
    this.add(this.count);

    // If the user hovers over the deck, show a tooltip that shows extra game options, if any
    this.initTooltip();
    this.on('mousemove', function mouseMove() {
        if (globals.elements.deckPlayAvailableLabel.isVisible()) {
            // Disable the tooltip if the user might be dragging the deck
            return;
        }

        const tooltip = $('#tooltip-deck');
        globals.activeHover = this;
        const tooltipX = this.getWidth() / 2 + this.attrs.x;
        tooltip.css('left', tooltipX);
        tooltip.css('top', this.attrs.y);
        tooltip.tooltipster('open');
    });
    this.on('mouseout', () => {
        $('#tooltip-deck').tooltipster('close');
    });
};

Kinetic.Util.extend(CardDeck, Kinetic.Group);

CardDeck.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);

    if (child instanceof LayoutChild) {
        if (globals.animateFast) {
            child.remove();
            return;
        }

        child.tween = new Kinetic.Tween({
            node: child,
            x: 0,
            y: 0,
            scaleX: 0.01,
            scaleY: 0.01,
            rotation: 0,
            duration: 0.5,
            runonce: true,
        }).play();

        child.tween.onFinish = () => {
            if (child.parent === self) {
                child.remove();
            }
        };
    }
};

CardDeck.prototype.setCardBack = function setCardBack(cardback) {
    this.cardback.setImage(globals.ImageLoader.get(cardback));
};

CardDeck.prototype.setCount = function setCount(count) {
    this.count.setText(count.toString());

    this.cardback.setVisible(count > 0);
};

CardDeck.prototype.doLayout = function doLayout() {
    this.cardback.setPosition({
        x: 0,
        y: 0,
    });
};

// The deck tooltip shows the custom options for this game, if any
CardDeck.prototype.initTooltip = function initTooltip() {
    if (
        globals.variant.name === 'No Variant'
        && !globals.timed
        && !globals.deckPlays
        && !globals.emptyClues
        && globals.characterAssignments.length === 0
    ) {
        return;
    }

    let content = '<strong>Game Options:</strong>';
    content += '<ul class="game-tooltips-ul">';
    if (globals.variant.name !== 'No Variant') {
        content += `<li>Variant: ${globals.variant.name}</li>`;
    }
    if (globals.timed) {
        content += '<li>Timed: ';
        content += misc.timerFormatter(globals.baseTime * 1000);
        content += ' + ';
        content += misc.timerFormatter(globals.timePerTurn * 1000);
        content += '</li>';
    }
    if (globals.deckPlays) {
        content += '<li>Bottom-Deck Blind Plays</li>';
    }
    if (globals.emptyClues) {
        content += '<li>Empty Clues</li>';
    }
    if (globals.characterAssignments.length > 0) {
        content += '<li>Detrimental Characters</li>';
    }
    content += '</ul>';
    $('#tooltip-deck').tooltipster('instance').content(content);
};

module.exports = CardDeck;

},{"../../constants":3,"../../misc":49,"./globals":21,"./layoutChild":24,"./replay":31}],13:[function(require,module,exports){
/*
    Functions having to do with drawing the cards
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');

// Constants
const {
    CARD_AREA,
    CARDH,
    CARDW,
    COLOR,
    SUIT,
} = constants;
const xrad = CARDW * 0.08;
const yrad = CARDH * 0.08;

// Variables
let scaleCardImages = {};

exports.init = () => {
    scaleCardImages = {};
};

exports.buildCards = () => {
    // The gray suit represents cards of unknown suit
    const suits = globals.variant.suits.concat(SUIT.GRAY);
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Rank 0 is the stack base
        // Rank 1-5 are the normal cards
        // Rank 6 is a card of unknown rank
        // Rank 7 is a "START" card (in the "Up or Down" variants)
        for (let rank = 0; rank <= 7; rank++) {
            const cvs = document.createElement('canvas');
            cvs.width = CARDW;
            cvs.height = CARDH;

            const ctx = cvs.getContext('2d');

            if (rank > 0) {
                drawCardTexture(ctx);
            }

            drawCardBase(ctx, suit, rank);

            ctx.shadowBlur = 10;
            ctx.fillStyle = suit.style(ctx, CARD_AREA.NUMBER);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            if (rank !== 0 && rank !== 6) {
                let textYPos;
                let indexLabel;
                let rankString = rank.toString();
                if (rank === 7) {
                    // "START" cards are represented by rank 7
                    rankString = 'S';
                }
                let fontSize;
                if (globals.lobby.settings.showColorblindUI) {
                    fontSize = 68;
                    textYPos = 83;
                    indexLabel = suit.abbreviation + rankString;
                } else {
                    fontSize = 96;
                    textYPos = 110;
                    indexLabel = rankString;
                }

                ctx.font = `bold ${fontSize}pt Arial`;

                // Draw index on top left
                drawCardIndex(ctx, textYPos, indexLabel);

                // 'Index' cards are used to draw cards of learned but not yet known rank
                globals.cardImages[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs);

                // Draw index on bottom right
                ctx.save();
                ctx.translate(CARDW, CARDH);
                ctx.rotate(Math.PI);
                drawCardIndex(ctx, textYPos, indexLabel);
                ctx.restore();
            }

            ctx.fillStyle = suit.style(ctx, CARD_AREA.SYMBOL);

            ctx.lineWidth = 5;

            // Make the special corners on cards for the mixed variant
            if (suit.clueColors !== null && suit.clueColors.length === 2) {
                drawMixedCardHelper(ctx, suit.clueColors);
            }

            // 'NoPip' cards are used for
            //   cards of known rank before suit learned
            //   cards of unknown rank
            // Entirely unknown cards (Gray 6) have a custom image defined separately
            if (rank > 0 && (rank < 6 || suit !== SUIT.GRAY)) {
                globals.cardImages[`NoPip-${suit.name}-${rank}`] = cloneCanvas(cvs);
            }

            if (suit !== SUIT.GRAY) {
                drawSuitPips(ctx, rank, suit, i);
            }

            // Gray Card images would be identical to NoPip images
            if (suit !== SUIT.GRAY) {
                globals.cardImages[`Card-${suit.name}-${rank}`] = cvs;
            }
        }
    }

    globals.cardImages['NoPip-Gray-6'] = makeUnknownCardImage();
    globals.cardImages['deck-back'] = makeDeckBack();
};

const cloneCanvas = (oldCanvas) => {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;
    const context = newCanvas.getContext('2d');
    context.drawImage(oldCanvas, 0, 0);
    return newCanvas;
};

const drawSuitPips = (ctx, rank, suit, i) => {
    const pathFunc = drawSuitShape(suit, i);
    const scale = 0.4;

    // The middle for cards 2 or 4
    if (rank === 1 || rank === 3) {
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Top and bottom for cards 2, 3, 4, 5
    if (rank > 1 && rank <= 5) {
        const symbolYPos = globals.lobby.settings.showColorblindUI ? 85 : 120;
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(0, symbolYPos);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Left and right for cards 4 and 5
    if (rank === 4 || rank === 5) {
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(90, 0);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Size, position, and alpha adjustment for the central icon on stack base and 5
    if (rank === 0 || rank === 5) {
        ctx.globalAlpha = 1.0;
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale * 3 / 2, scale * 3 / 2);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = globals.lobby.settings.showColorblindUI ? 0.4 : 0.1;
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale * 3, scale * 3);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }
};

const makeDeckBack = () => {
    const cvs = makeUnknownCardImage();
    const ctx = cvs.getContext('2d');

    const nSuits = globals.variant.suits.length;
    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];

        ctx.resetTransform();
        ctx.scale(0.4, 0.4);

        let x = Math.floor(CARDW * 1.25);
        let y = Math.floor(CARDH * 1.25);

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        x -= 1.05 * Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25); // eslint-disable-line
        y -= 1.05 * Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3); // eslint-disable-line
        ctx.translate(x, y);

        drawSuitShape(suit, i)(ctx);
        drawShape(ctx);
    }
    ctx.save();
    return cvs;
};

const drawCardBase = (ctx, suit, rank) => {
    // Draw the background
    ctx.fillStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
    ctx.strokeStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
    if (ctx.fillStyle === COLOR.WHITE.hexCode) {
        ctx.strokeStyle = COLOR.BLACK.hexCode;
    }

    backPath(ctx, 4);

    ctx.save();
    // Draw the borders (on visible cards) and the color fill
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    // The borders should be more opaque for the stack base
    if (rank === 0) {
        ctx.globalAlpha = 1.0;
    }
    ctx.stroke();

    ctx.restore();
};

const backPath = (ctx, p) => {
    ctx.beginPath();
    ctx.moveTo(p, yrad + p);
    ctx.lineTo(p, CARDH - yrad - p);
    ctx.quadraticCurveTo(0, CARDH, xrad + p, CARDH - p);
    ctx.lineTo(CARDW - xrad - p, CARDH - p);
    ctx.quadraticCurveTo(CARDW, CARDH, CARDW - p, CARDH - yrad - p);
    ctx.lineTo(CARDW - p, yrad + p);
    ctx.quadraticCurveTo(CARDW, 0, CARDW - xrad - p, p);
    ctx.lineTo(xrad + p, p);
    ctx.quadraticCurveTo(0, 0, p, yrad + p);
};

const drawShape = (ctx) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.stroke();
};

const drawCardIndex = (ctx, textYPos, indexLabel) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fillText(indexLabel, 19, textYPos);
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.strokeText(indexLabel, 19, textYPos);
};

const drawMixedCardHelper = (ctx, clueColors) => {
    const [clueColor1, clueColor2] = clueColors;

    ctx.save();

    ctx.lineWidth = 1;

    const triangleSize = 50;
    const borderSize = 8;

    // Draw the first half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARDW - borderSize - triangleSize, borderSize); // Move left
    ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move down and right diagonally
    ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARDW - borderSize, borderSize + triangleSize); // Move down
    ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move up and left diagonally
    ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, CARDH - borderSize - triangleSize); // Move up
    ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
    // Move right and down diagonally
    ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, CARDH - borderSize); // Move right
    ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
    // Move left and up diagonally
    ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    ctx.restore();
};

const makeUnknownCardImage = () => {
    const cvs = document.createElement('canvas');
    cvs.width = CARDW;
    cvs.height = CARDH;

    const ctx = cvs.getContext('2d');

    drawCardTexture(ctx);

    ctx.fillStyle = 'black';

    backPath(ctx, 4);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#444444';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';

    ctx.translate(CARDW / 2, CARDH / 2);

    return cvs;
};

// Draw texture lines on card
const drawCardTexture = (ctx) => {
    backPath(ctx, 4, xrad, yrad);

    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'black';

    for (let x = 0; x < CARDW; x += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CARDH);
        ctx.stroke();
    }

    for (let y = 0; y < CARDH; y += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARDW, y);
        ctx.stroke();
    }

    ctx.restore();
};

const shapeFunctions = [
    // Diamond
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

    // Club
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

    // Star
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

    // Heart
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

    // Crescent
    (ctx) => {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 3, 4.3, true);
        ctx.arc(48, 83, 52, 5, 2.5, false);
    },

    // Spade
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

    // Rainbow
    (ctx) => {
        ctx.beginPath();
        ctx.moveTo(0, 140);
        ctx.arc(75, 140, 75, Math.PI, 0, false);
        ctx.lineTo(125, 140);
        ctx.arc(75, 140, 25, 0, Math.PI, true);
        ctx.lineTo(0, 140);
    },
];

const drawSuitShape = (suit, i) => {
    // Suit shapes go in order from left to right, with the exception of rainbow suits,
    // which are always given a rainbow symbol
    if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
        // The final shape function in the array is the rainbow
        i = shapeFunctions.length - 1;
    }
    return shapeFunctions[i];
};
exports.drawSuitShape = drawSuitShape;

exports.scaleCardImage = (context, name, width, height, am) => {
    let src = globals.cardImages[name];

    if (!src) {
        console.error(`The image "${name}" was not generated.`);
        return;
    }

    const dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
    const dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

    if (dw < 1 || dh < 1) {
        return;
    }

    let sw = width;
    let sh = height;
    let steps = 0;

    if (!scaleCardImages[name]) {
        scaleCardImages[name] = [];
    }

    // Scaling the card down in steps of half in each dimension presumably improves the scaling?
    while (dw < sw / 2) {
        let scaleCanvas = scaleCardImages[name][steps];
        sw = Math.floor(sw / 2);
        sh = Math.floor(sh / 2);

        if (!scaleCanvas) {
            scaleCanvas = document.createElement('canvas');
            scaleCanvas.width = sw;
            scaleCanvas.height = sh;

            const scaleContext = scaleCanvas.getContext('2d');

            scaleContext.drawImage(src, 0, 0, sw, sh);

            scaleCardImages[name][steps] = scaleCanvas;
        }

        src = scaleCanvas;

        steps += 1;
    }

    context.drawImage(src, 0, 0, width, height);
};

},{"../../constants":3,"./globals":21}],14:[function(require,module,exports){
/*
    CardLayout is an object that represents a player's hand (or a discard pile)
    It is composed of LayoutChild objects
*/

// Imports
const globals = require('./globals');

const CardLayout = function CardLayout(config) {
    Kinetic.Group.call(this, config);

    this.align = (config.align || 'left');
    this.reverse = (config.reverse || false);
    this.invertCards = (config.invertCards || false);
};

Kinetic.Util.extend(CardLayout, Kinetic.Group);

CardLayout.prototype.add = function add(child) {
    child.children.forEach((c) => {
        if (c.doRotations) {
            c.doRotations(this.invertCards);
        }
    });
    const pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardLayout.prototype._setChildrenIndices = function _setChildrenIndices() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

CardLayout.prototype.doLayout = function doLayout() {
    let uw = 0;
    let dist = 0;
    let x = 0;

    const lw = this.getWidth();
    const lh = this.getHeight();

    const n = this.children.length;

    for (let i = 0; i < n; i++) {
        const node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        const scale = lh / node.getHeight();

        uw += scale * node.getWidth();
    }

    if (n > 1) {
        dist = (lw - uw) / (n - 1);
    }

    if (dist > 10) {
        dist = 10;
    }

    uw += dist * (n - 1);

    if (this.align === 'center' && uw < lw) {
        x = (lw - uw) / 2;
    }

    if (this.reverse) {
        x = lw - x;
    }

    const storedPostAnimationLayout = globals.postAnimationLayout;

    for (let i = 0; i < n; i++) {
        const node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        const scale = lh / node.getHeight();

        if (node.tween) {
            node.tween.destroy();
        }

        if (!node.isDragging()) {
            if (globals.animateFast) {
                node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
            } else {
                // Animate the card leaving the deck
                node.tween = new Kinetic.Tween({
                    node,
                    duration: 0.5,
                    x: x - (this.reverse ? scale * node.getWidth() : 0),
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    runonce: true,
                    onFinish: storedPostAnimationLayout,
                }).play();
            }
        }

        x += (scale * node.getWidth() + dist) * (this.reverse ? -1 : 1);
    }
};

module.exports = CardLayout;

},{"./globals":21}],15:[function(require,module,exports){
/*
    CardStack is an object that represents a play stack
    It is composed of LayoutChild objects
*/

// Imports
const globals = require('./globals');

const CardStack = function CardStack(config) {
    Kinetic.Group.call(this, config);
};

Kinetic.Util.extend(CardStack, Kinetic.Group);

CardStack.prototype.add = function add(child) {
    child.children.forEach((c) => {
        if (c.doRotations) {
            c.doRotations(false);
        }
    });
    const pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardStack.prototype._setChildrenIndices = function _setChildrenIndices() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
};

CardStack.prototype.doLayout = function doLayout() {
    const self = this;

    const lh = this.getHeight();

    const hideUnder = () => {
        const n = self.children.length;
        for (let i = 0; i < n; i++) {
            const node = self.children[i];

            if (!node.tween) {
                continue;
            }

            if (node.tween.isPlaying()) {
                return;
            }
        }
        for (let i = 0; i < n - 1; i++) {
            self.children[i].setVisible(false);
        }
        if (n > 0) {
            self.children[n - 1].setVisible(true);
        }
    };

    for (let i = 0; i < this.children.length; i++) {
        const node = this.children[i]; // This is a LayoutChild

        const scale = lh / node.getHeight();

        if (node.tween) {
            node.tween.destroy();
        }

        if (globals.animateFast) {
            node.setX(0);
            node.setY(0);
            node.setScaleX(scale);
            node.setScaleY(scale);
            node.setRotation(0);
            hideUnder();
        } else {
            // Animate the card leaving the hand to the play stacks / discard pile
            node.tween = new Kinetic.Tween({
                node,
                duration: 0.8,
                x: 0,
                y: 0,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                runonce: true,
                onFinish: hideUnder,
            }).play();
        }
    }
};

module.exports = CardStack;

},{"./globals":21}],16:[function(require,module,exports){
// Imports
const globals = require('./globals');
const FitText = require('./fitText');
const replay = require('./replay');

const HanabiClueEntry = function HanabiClueEntry(config) {
    Kinetic.Group.call(this, config);

    const w = config.width;
    const h = config.height;

    const background = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: 'white',
        opacity: 0.1,
        listening: true,
    });
    this.background = background;

    this.add(background);

    const giver = new FitText({
        x: 0.05 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.giver,
        listening: false,
    });
    this.add(giver);

    const target = new FitText({
        x: 0.4 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.target,
        listening: false,
    });
    this.add(target);

    const name = new Kinetic.Text({
        x: 0.75 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: 'center',
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.clueName,
        listening: false,
    });
    this.add(name);

    const negativeMarker = new Kinetic.Text({
        x: 0.88 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: 'center',
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: '✘',
        listening: false,
        visible: false,
    });

    this.negativeMarker = negativeMarker;
    this.add(negativeMarker);

    this.list = config.list;
    this.neglist = config.neglist;

    // Add a mouseover highlighting effect
    background.on('mouseover tap', () => {
        globals.elements.clueLog.showMatches(null);

        background.setOpacity(0.4);
        background.getLayer().batchDraw();
    });
    background.on('mouseout', () => {
        // Fix the bug where the mouseout can happen after the clue has been destroyed
        if (background.getLayer() === null) {
            return;
        }

        background.setOpacity(0.1);
        background.getLayer().batchDraw();
    });

    // Store the turn that the clue occured inside this object for later
    this.turn = config.turn;

    // Click an entry in the clue log to go to that turn in the replay
    background.on('click', () => {
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turn + 1, true);
    });
};

Kinetic.Util.extend(HanabiClueEntry, Kinetic.Group);

HanabiClueEntry.prototype.checkValid = (c) => {
    if (!globals.deck[c]) {
        return false;
    }

    if (!globals.deck[c].parent) {
        return false;
    }

    return globals.deck[c].isInPlayerHand();
};

// Returns number of expirations, either 0 or 1 depending on whether it expired
HanabiClueEntry.prototype.checkExpiry = function checkExpiry() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.checkValid(this.list[i])) {
            return 0;
        }
    }

    for (let i = 0; i < this.neglist.length; i++) {
        if (this.checkValid(this.neglist[i])) {
            return 0;
        }
    }

    this.off('mouseover tap');
    this.off('mouseout');

    this.remove();
    return 1;
};

HanabiClueEntry.prototype.showMatch = function showMatch(target) {
    this.background.setOpacity(0.1);
    this.background.setFill('white');
    this.negativeMarker.setVisible(false);

    for (let i = 0; i < this.list.length; i++) {
        if (globals.deck[this.list[i]] === target) {
            this.background.setOpacity(0.4);
        }
    }

    for (let i = 0; i < this.neglist.length; i++) {
        if (globals.deck[this.neglist[i]] === target) {
            this.background.setOpacity(0.4);
            this.background.setFill('#ff7777');
            if (globals.lobby.settings.showColorblindUI) {
                this.negativeMarker.setVisible(true);
            }
        }
    }
};

module.exports = HanabiClueEntry;

},{"./fitText":20,"./globals":21,"./replay":31}],17:[function(require,module,exports){
// Imports
const globals = require('./globals');

const HanabiClueLog = function HanabiClueLog(config) {
    Kinetic.Group.call(this, config);
};

Kinetic.Util.extend(HanabiClueLog, Kinetic.Group);

HanabiClueLog.prototype.add = function add(child) {
    Kinetic.Group.prototype.add.call(this, child);
    this.doLayout();
};

HanabiClueLog.prototype._setChildrenIndices = function _setChildrenIndices() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

HanabiClueLog.prototype.doLayout = function doLayout() {
    let y = 0;

    for (let i = 0; i < this.children.length; i++) {
        const node = this.children[i];

        node.setY(y);

        y += node.getHeight() + 0.001 * globals.stage.getHeight();
    }
};

HanabiClueLog.prototype.checkExpiry = function checkExpiry() {
    const maxLength = 31;
    const childrenToRemove = this.children.length - maxLength;
    if (childrenToRemove < 1) {
        return;
    }
    let childrenRemoved = 0;
    for (let i = 0; i < this.children.length; i++) {
        childrenRemoved += this.children[i].checkExpiry();
        if (childrenRemoved >= childrenToRemove) {
            break;
        }
    }

    this.doLayout();
};

HanabiClueLog.prototype.showMatches = function showMatches(target) {
    for (let i = 0; i < this.children.length; i++) {
        this.children[i].showMatch(target);
    }
};

HanabiClueLog.prototype.clear = function clear() {
    for (let i = this.children.length - 1; i >= 0; i--) {
        this.children[i].remove();
    }
};

module.exports = HanabiClueLog;

},{"./globals":21}],18:[function(require,module,exports){
// Imports
const Button = require('./button');

const ClueRecipientButton = function ClueRecipientButton(config) {
    Button.call(this, config);
    this.targetIndex = config.targetIndex;
};

Kinetic.Util.extend(ClueRecipientButton, Button);

module.exports = ClueRecipientButton;

},{"./button":9}],19:[function(require,module,exports){
// Imports
const globals = require('./globals');

const ColorButton = function ColorButton(config) {
    Kinetic.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    const background = new Kinetic.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });

    this.add(background);

    const color = new Kinetic.Rect({
        x: 0.1 * w,
        y: 0.1 * h,
        width: 0.8 * w,
        height: 0.8 * h,
        listening: false,
        cornerRadius: 0.12 * 0.8 * h,
        fill: config.color,
        opacity: 0.9,
    });

    this.add(color);

    const text = new Kinetic.Text({
        x: 0,
        y: 0.2 * h,
        width: w,
        height: 0.6 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        text: config.text,
        visible: globals.lobby.settings.showColorblindUI,
    });

    this.add(text);

    this.pressed = false;

    this.clue = config.clue;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().draw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().draw();

            background.off('mouseup');
            background.off('mouseout');
        };

        background.on('mouseout', () => {
            resetButton();
        });
        background.on('mouseup', () => {
            resetButton();
        });
    });
};

Kinetic.Util.extend(ColorButton, Kinetic.Group);

ColorButton.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = ColorButton;

},{"./globals":21}],20:[function(require,module,exports){
const FitText = function FitText(config) {
    Kinetic.Text.call(this, config);

    this.origFontSize = this.getFontSize();
    this.needsResize = true;

    this.setDrawFunc(function setDrawFunc(context) {
        if (this.needsResize) {
            this.resize();
        }
        Kinetic.Text.prototype._sceneFunc.call(this, context);
    });
};

Kinetic.Util.extend(FitText, Kinetic.Text);

FitText.prototype.resize = function resize() {
    this.setFontSize(this.origFontSize);

    while (
        this._getTextSize(this.getText()).width > this.getWidth()
        && this.getFontSize() > 5
    ) {
        this.setFontSize(this.getFontSize() * 0.9);
    }

    this.needsResize = false;
};

FitText.prototype.setText = function setText(text) {
    Kinetic.Text.prototype.setText.call(this, text);

    this.needsResize = true;
};

module.exports = FitText;

},{}],21:[function(require,module,exports){
// This object contains global variables for the "ui.js" file
const globals = {};
// (they are initialized in the "globalsInit.js" file)
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals2 = globals;

},{}],22:[function(require,module,exports){
// Imports
const globals = require('./globals');

// Configuration
const debug = true;

// We modify the individual properties instead of replacing the entire globals object
// If we did that, the references in the other files would point to the outdated version
module.exports = () => {
    globals.debug = debug;

    // Objects sent upon UI initialization
    globals.lobby = null;
    globals.game = null;

    // Game settings
    // (sent in the "init" message)
    globals.playerNames = [];
    globals.variant = null;
    globals.playerUs = -1;
    globals.spectating = false;
    globals.replay = false;
    globals.sharedReplay = false;

    // Optional game settings
    // (sent in the "init" message)
    globals.timed = false;
    globals.baseTime = null;
    globals.timePerTurn = null;
    globals.deckPlays = false;
    globals.emptyClues = false;
    globals.characterAssignments = [];
    // This is the "Detrimental Character Assignments" for each player, if enabled
    // (it is either an empty array or an array of integers)
    globals.characterMetadata = [];
    // This is extra information about each player's "Detrimental Character Assignments",
    // if enabled (it is either an empty array or an array of integers)

    // Game state variables
    globals.ready = false;
    globals.deck = [];
    globals.deckSize = 0;
    globals.turn = 0;
    globals.score = 0;
    globals.clues = 0;
    globals.spectators = [];

    // Efficiency variables
    globals.cardsGotten = 0;
    globals.cluesSpentPlusStrikes = 0;

    // Replay variables
    globals.inReplay = false; // Whether or not the replay controls are currently showing
    globals.replayLog = [];
    globals.replayPos = 0;
    globals.replayTurn = 0;
    globals.replayMax = 0;
    // In replays, we can show information about a card that was not known at the time,
    // but is known now; these are cards we have "learned"
    globals.learnedCards = [];

    // Shared replay variables
    globals.sharedReplayLeader = ''; // Equal to the username of the leader
    globals.sharedReplayTurn = -1;
    globals.useSharedTurns = true;

    // UI elements
    globals.ImageLoader = null;
    globals.stage = null;
    globals.layers = {
        UI: null,
        timer: null,
        overtop: null, // A layer drawn overtop everything else
    };
    globals.elements = {
        // The main screen
        stageFade: null,
        playerHands: [],
        messagePrompt: null, // The truncated action log
        chatButton: null,
        drawDeck: null,
        deckPlayAvailableLabel: null,

        // The right-most column of the main screen
        clueLog: null,
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        strikes: [],

        // The clue UI
        clueTargetButtonGroup: null,
        clueButtonGroup: null,
        rankClueButtons: null,
        suitClueButtons: null,
        giveClueButton: null,

        // The replay screen
        replayArea: null,
        replayShuttleShared: null,

        // Other screens
        msgLogGroup: null, // The full action log

        // Other optional elements
        timer1: null,
        timer2: null,
    };
    globals.activeHover = null; // The element that the mouse cursor is currently over
    globals.cardImages = {};

    // Pre-play feature
    globals.ourTurn = false;
    globals.queuedAction = null;

    // Miscellaneous
    globals.animateFast = true;
    globals.savedAction = null; // Used to save new actions when in an in-game replay
    globals.postAnimationLayout = null;
    // A function called after an action from the server moves cards
    globals.lastAction = null; // Used when rebuilding the game state
    globals.accidentalClueTimer = Date.now();
    // Used to prevent giving an accidental clue after clicking the "Exit Replay" button
    globals.chatUnread = 0;
};

},{"./globals":21}],23:[function(require,module,exports){
/*
    Functions for handling all of the keyboard shortcuts
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const notes = require('./notes');
const replay = require('./replay');

// Constants
const { ACT } = constants;

// Variables
const hotkeyMap = {};

exports.init = () => {
    /*
        Build mappings of hotkeys to functions
    */

    hotkeyMap.replay = {
        'ArrowLeft': replay.back,
        'ArrowRight': replay.forward,

        '[': replay.backRound,
        ']': replay.forwardRound,

        'Home': replay.backFull,
        'End': replay.forwardFull,
    };

    hotkeyMap.clue = {};

    // Add "Tab" for player selection
    hotkeyMap.clue.Tab = () => {
        globals.elements.clueTargetButtonGroup.selectNextTarget();
    };

    // Add "1", "2", "3", "4", and "5" (for number clues)
    for (let i = 0; i < globals.elements.rankClueButtons.length; i++) {
        // The button for "1" is at array index 0, etc.
        hotkeyMap.clue[i + 1] = click(globals.elements.rankClueButtons[i]);
    }

    // Add "q", "w", "e", "r", "t", and "y" (for color clues)
    // (we use qwert since they are conveniently next to 12345,
    // and also because the clue colors can change between different variants)
    const clueKeyRow = ['q', 'w', 'e', 'r', 't', 'y'];
    for (let i = 0; i < globals.elements.suitClueButtons.length && i < clueKeyRow.length; i++) {
        hotkeyMap.clue[clueKeyRow[i]] = click(globals.elements.suitClueButtons[i]);
    }

    // (the hotkey for giving a clue is enabled separately in the "keydown()" function)

    hotkeyMap.play = {
        'a': play, // The main play hotkey
        '+': play, // For numpad users
    };
    hotkeyMap.discard = {
        'd': discard, // The main discard hotkey
        '-': discard, // For numpad users
    };

    // Enable all of the keyboard hotkeys
    $(document).keydown(keydown);
};

exports.destroy = () => {
    $(document).unbind('keydown', keydown);
};

const keydown = (event) => {
    // Disable hotkeys if we not currently in a game
    // (this should not be possible, as the handler gets unregistered upon going back to the lobby,
    // but double check just in case)
    if (globals.lobby.currentScreen !== 'game') {
        return;
    }

    // Disable keyboard hotkeys if we are editing a note
    if (notes.vars.editing !== null) {
        return;
    }

    // Disable keyboard hotkeys if we are typing in the in-game chat
    if ($('#game-chat-input').is(':focus')) {
        return;
    }

    // Give a clue
    if (event.ctrlKey && event.key === 'Enter') { // Ctrl + Enter
        globals.lobby.ui.giveClue();
        return;
    }

    // Don't interfere with other kinds of hotkeys
    if (event.ctrlKey || event.altKey) {
        return;
    }

    // Delete the note from the card that we are currently hovering-over, if any
    if (
        event.key === 'Delete'
        && globals.activeHover !== null
        && typeof globals.activeHover.order !== 'undefined'
    ) {
        // Note that "activeHover" will remain set even if we move the mouse away from the card,
        // so this means that if the mouse is not hovering over ANY card, then the note that will be
        // deleted will be from the last tooltip shown
        notes.set(globals.activeHover.order, '');
        notes.update(globals.activeHover);
        return;
    }

    // Send a sound
    if (event.key === 'Z') { // Shift + z
        // This is used for fun in shared replays
        sharedReplaySendSound('buzz');
        return;
    }
    if (event.key === 'X') { // Shift + x
        // This is used for fun in shared replays
        sharedReplaySendSound('god');
        return;
    }
    if (event.key === 'C') { // Shift + c
        // This is used as a sound test
        globals.game.sounds.play('turn_us');
        return;
    }

    // Don't interfere with other kinds of hotkeys
    if (event.shiftKey) {
        return;
    }

    // Check for keyboard hotkeys
    let hotkeyFunction;
    if (globals.elements.replayArea.visible()) {
        hotkeyFunction = hotkeyMap.replay[event.key];
    } else if (globals.savedAction !== null) { // We can take an action
        if (globals.savedAction.canClue) {
            hotkeyFunction = hotkeyMap.clue[event.key];
        }
        if (globals.savedAction.canDiscard) {
            hotkeyFunction = hotkeyFunction || hotkeyMap.discard[event.key];
        }
        hotkeyFunction = hotkeyFunction || hotkeyMap.play[event.key];
    }

    if (hotkeyFunction !== undefined) {
        event.preventDefault();
        hotkeyFunction();
    }
};

const sharedReplaySendSound = (sound) => {
    // Only enable sound effects in a shared replay
    if (!globals.replay || !globals.sharedReplay) {
        return;
    }

    // Only enable sound effects for shared replay leaders
    if (globals.sharedReplayLeader !== globals.lobby.username) {
        return;
    }

    // Send it
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.SOUND,
        sound,
    });

    // Play the sound effect manually so that
    // we don't have to wait for the client to server round-trip
    globals.game.sounds.play(sound);
};

/*
    Helper functions
*/

const play = () => {
    action(true);
};
const discard = () => {
    action(false);
};

// If intendedPlay is true, it plays a card
// If intendedPlay is false, it discards a card
const action = (intendedPlay = true) => {
    const cardOrder = promptOwnHandOrder(intendedPlay ? 'play' : 'discard');

    if (cardOrder === null) {
        return;
    }
    if (cardOrder === 'deck' && !(intendedPlay && globals.savedAction.canBlindPlayDeck)) {
        return;
    }

    const data = {};
    if (cardOrder === 'deck') {
        data.type = ACT.DECKPLAY;
    } else {
        data.type = intendedPlay ? ACT.PLAY : ACT.DISCARD;
        data.target = cardOrder;
    }

    globals.lobby.conn.send('action', data);
    globals.lobby.ui.stopAction();
    globals.savedAction = null;
};

// Keyboard actions for playing and discarding cards
const promptOwnHandOrder = (actionString) => {
    const playerCards = globals.elements.playerHands[globals.playerUs].children;
    const maxSlotIndex = playerCards.length;
    const msg = `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${actionString}.`;
    const response = window.prompt(msg);

    if (/^deck$/i.test(response)) {
        return 'deck';
    }

    if (!/^\d+$/.test(response)) {
        return null;
    }

    const numResponse = parseInt(response, 10);
    if (numResponse < 1 || numResponse > maxSlotIndex) {
        return null;
    }

    return playerCards[maxSlotIndex - numResponse].children[0].order;
};

const click = elem => () => {
    elem.dispatchEvent(new MouseEvent('click'));
};

/*
    Speedrun hotkeys
*/

/*

if (globals.lobby.settings.speedrunHotkeys) {
    // Play cards (ACT.PLAY)
    if (event.key === '1') {
        speedrunAction(ACT.PLAY, getOrderFromSlot(1));
    } else if (event.key === '2') {
        speedrunAction(ACT.PLAY, getOrderFromSlot(2));
    } else if (event.key === '3') {
        speedrunAction(ACT.PLAY, getOrderFromSlot(3));
    } else if (event.key === '4') {
        speedrunAction(ACT.PLAY, getOrderFromSlot(4));
    } else if (event.key === '5') {
        speedrunAction(ACT.PLAY, getOrderFromSlot(5));
    }

    // Discard cards (ACT.DISCARD)
    if (event.key === 'q') {
        speedrunAction(ACT.DISCARD, getOrderFromSlot(1));
    } else if (event.key === 'w') {
        speedrunAction(ACT.DISCARD, getOrderFromSlot(2));
    } else if (event.key === 'e') {
        speedrunAction(ACT.DISCARD, getOrderFromSlot(3));
    } else if (event.key === 'r') {
        speedrunAction(ACT.DISCARD, getOrderFromSlot(4));
    } else if (event.key === 't') {
        speedrunAction(ACT.DISCARD, getOrderFromSlot(5));
    }

    // Check for a clue recipient
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    if (!target) {
        return;
    }
    const who = target.targetIndex;

    // Give a number clue
    if (event.key === '!') { // Shift + 1
        speedrunAction(ACT.CLUE, who, {
            type: 0,
            value: 1,
        });
    } else if (event.key === '@') { // Shift + 2
        speedrunAction(ACT.CLUE, who, {
            type: 0,
            value: 2,
        });
    } else if (event.key === '#') { // Shift + 3
        speedrunAction(ACT.CLUE, who, {
            type: 0,
            value: 3,
        });
    } else if (event.key === '$') { // Shift + 4
        speedrunAction(ACT.CLUE, who, {
            type: 0,
            value: 4,
        });
    } else if (event.key === '%') { // Shift + 5
        speedrunAction(ACT.CLUE, who, {
            type: 0,
            value: 5,
        });
    }

    // Give a color clue
    if (event.key === 'Q') { // Shift + q
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 0,
        });
    } else if (event.key === 'W') { // Shift + w
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 1,
        });
    } else if (event.key === 'E') { // Shift + e
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 2,
        });
    } else if (event.key === 'R') { // Shift + r
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 3,
        });
    } else if (event.key === 'T') { // Shift + t
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 4,
        });
    } else if (event.key === 'Y') { // Shift + y
        speedrunAction(ACT.CLUE, who, {
            type: 1,
            value: 5,
        });
    }

    return;
}

// Speedrun hotkey helper functions
const getOrderFromSlot = (slot) => {
    const playerCards = globals.elements.playerHands[globals.playerUs].children;
    const maxSlotIndex = playerCards.length;
    return playerCards[maxSlotIndex - slot].children[0].order;
};
const speedrunAction = (type, target, clue = null) => {
    if (clue !== null && !globals.lobby.ui.showClueMatch(target, clue)) {
        return;
    }
    const action = {
        type: 'action',
        data: {
            type,
            target,
            clue,
        },
    };
    globals.lobby.ui.endTurn(action);
};

*/

},{"../../constants":3,"./globals":21,"./notes":29,"./replay":31}],24:[function(require,module,exports){
const LayoutChild = function LayoutChild(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on('widthChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setWidth(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });

    child.on('heightChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setHeight(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });
};

module.exports = LayoutChild;

},{}],25:[function(require,module,exports){
const Loader = function Loader(cb) {
    this.cb = cb;

    this.filemap = {};

    const basic = [
        'x',
        'replay',
        'replay-back',
        'replay-back-full',
        'replay-forward',
        'replay-forward-full',
        'trashcan',
    ];

    for (let i = 0; i < basic.length; i++) {
        this.filemap[basic[i]] = `public/img/${basic[i]}.png`;
    }

    this.filemap.background = 'public/img/background.jpg';
};

Loader.prototype.addImage = function addImage(name, ext) {
    this.filemap[name] = `public/img/${name}.${ext}`;
};

Loader.prototype.addAlias = function addAlias(name, alias, ext) {
    this.filemap[name] = `public/img/${alias}.${ext}`;
};

Loader.prototype.start = function start() {
    const self = this;

    const total = Object.keys(self.filemap).length;

    this.map = {};
    this.numLoaded = 0;

    for (const name of Object.keys(this.filemap)) {
        const img = new Image();

        this.map[name] = img;

        img.onload = () => {
            self.numLoaded += 1;

            self.progress(self.numLoaded, total);

            if (self.numLoaded === total) {
                self.cb();
            }
        };

        img.src = self.filemap[name];
    }

    self.progress(0, total);
};

Loader.prototype.progress = function progress(done, total) {
    if (this.progressCallback) {
        this.progressCallback(done, total);
    }
};

Loader.prototype.get = function get(name) {
    return this.map[name];
};

module.exports = Loader;

},{}],26:[function(require,module,exports){
// Imports
const globals = require('./globals');
const MultiFitText = require('./multiFitText');

const HanabiMsgLog = function HanabiMsgLog(config) {
    const baseConfig = {
        x: 0.2 * globals.stage.getWidth(),
        y: 0.02 * globals.stage.getHeight(),
        width: 0.4 * globals.stage.getWidth(),
        height: 0.96 * globals.stage.getHeight(),
        clipX: 0,
        clipY: 0,
        clipWidth: 0.4 * globals.stage.getWidth(),
        clipHeight: 0.96 * globals.stage.getHeight(),
        visible: false,
        listening: false,
    };

    $.extend(baseConfig, config);
    Kinetic.Group.call(this, baseConfig);

    const rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: 0.4 * globals.stage.getWidth(),
        height: 0.96 * globals.stage.getHeight(),
        fill: 'black',
        opacity: 0.9,
        cornerRadius: 0.01 * globals.stage.getWidth(),
    });

    Kinetic.Group.prototype.add.call(this, rect);

    const textoptions = {
        fontSize: 0.025 * globals.stage.getHeight(),
        fontFamily: 'Verdana',
        fill: 'white',
        x: 0.04 * globals.stage.getWidth(),
        y: 0.01 * globals.stage.getHeight(),
        width: 0.35 * globals.stage.getWidth(),
        height: 0.94 * globals.stage.getHeight(),
        maxLines: 38,
    };

    this.logtext = new MultiFitText(textoptions);
    Kinetic.Group.prototype.add.call(this, this.logtext);

    const numbersoptions = {
        fontSize: 0.025 * globals.stage.getHeight(),
        fontFamily: 'Verdana',
        fill: 'lightgrey',
        x: 0.01 * globals.stage.getWidth(),
        y: 0.01 * globals.stage.getHeight(),
        width: 0.03 * globals.stage.getWidth(),
        height: 0.94 * globals.stage.getHeight(),
        maxLines: 38,
    };
    this.lognumbers = new MultiFitText(numbersoptions);
    Kinetic.Group.prototype.add.call(this, this.lognumbers);

    this.playerLogs = [];
    this.playerLogNumbers = [];
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i] = new MultiFitText(textoptions);
        this.playerLogs[i].hide();
        Kinetic.Group.prototype.add.call(this, this.playerLogs[i]);

        this.playerLogNumbers[i] = new MultiFitText(numbersoptions);
        this.playerLogNumbers[i].hide();
        Kinetic.Group.prototype.add.call(this, this.playerLogNumbers[i]);
    }
};

Kinetic.Util.extend(HanabiMsgLog, Kinetic.Group);

HanabiMsgLog.prototype.addMessage = function addMessage(msg) {
    const appendLine = (log, numbers, line) => {
        log.setMultiText(line);
        numbers.setMultiText(globals.deckSize.toString());
    };

    appendLine(this.logtext, this.lognumbers, msg);
    for (let i = 0; i < globals.playerNames.length; i++) {
        if (msg.startsWith(globals.playerNames[i])) {
            appendLine(this.playerLogs[i], this.playerLogNumbers[i], msg);
            break;
        }
    }
};

HanabiMsgLog.prototype.showPlayerActions = function showPlayerActions(playerName) {
    let playerIDX;
    for (let i = 0; i < globals.playerNames.length; i++) {
        if (globals.playerNames[i] === playerName) {
            playerIDX = i;
        }
    }
    this.logtext.hide();
    this.lognumbers.hide();
    this.playerLogs[playerIDX].show();
    this.playerLogNumbers[playerIDX].show();

    this.show();

    globals.elements.stageFade.show();
    globals.layers.overtop.draw();

    const thislog = this;
    globals.elements.stageFade.on('click tap', () => {
        globals.elements.stageFade.off('click tap');
        thislog.playerLogs[playerIDX].hide();
        thislog.playerLogNumbers[playerIDX].hide();

        thislog.logtext.show();
        thislog.lognumbers.show();
        thislog.hide();
        globals.elements.stageFade.hide();
        globals.layers.overtop.draw();
    });
};

HanabiMsgLog.prototype.refreshText = function refreshText() {
    this.logtext.refreshText();
    this.lognumbers.refreshText();
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i].refreshText();
        this.playerLogNumbers[i].refreshText();
    }
};

HanabiMsgLog.prototype.reset = function reset() {
    this.logtext.reset();
    this.lognumbers.reset();
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i].reset();
        this.playerLogNumbers[i].reset();
    }
};

module.exports = HanabiMsgLog;

},{"./globals":21,"./multiFitText":27}],27:[function(require,module,exports){
// Imports
const globals = require('./globals');
const FitText = require('./fitText');

const MultiFitText = function MultiFitText(config) {
    Kinetic.Group.call(this, config);
    this.maxLines = config.maxLines;
    this.smallHistory = [];
    for (let i = 0; i < this.maxLines; i++) {
        const newConfig = $.extend({}, config);

        newConfig.height = config.height / this.maxLines;
        newConfig.x = 0;
        newConfig.y = i * newConfig.height;

        const childText = new FitText(newConfig);
        Kinetic.Group.prototype.add.call(this, childText);
    }
};
Kinetic.Util.extend(MultiFitText, Kinetic.Group);

MultiFitText.prototype.setMultiText = function setMultiText(text) {
    if (this.smallHistory.length >= this.maxLines) {
        this.smallHistory.shift();
    }
    this.smallHistory.push(text);

    // Performance optimization: setText on the children is slow,
    // so don't actually do it until its time to display things
    // We also have to call refreshText after any time we manipulate replay position
    if (!globals.inReplay || !globals.animateFast) {
        this.refreshText();
    }
};

MultiFitText.prototype.refreshText = function refreshText() {
    for (let i = 0; i < this.children.length; i++) {
        let msg = this.smallHistory[i];
        if (!msg) {
            msg = '';
        }
        this.children[i].setText(msg);
    }
};

MultiFitText.prototype.reset = function reset() {
    this.smallHistory = [];
    for (let i = 0; i < this.children.length; i++) {
        this.children[i].setText('');
    }
};

module.exports = MultiFitText;

},{"./fitText":20,"./globals":21}],28:[function(require,module,exports){
// Imports
const globals = require('./globals');
const constants = require('../../constants');

const HanabiNameFrame = function HanabiNameFrame(config) {
    Kinetic.Group.call(this, config);

    this.name = new Kinetic.Text({
        x: config.width / 2,
        y: 0,
        height: config.height,
        align: 'center',
        fontFamily: 'Verdana',
        fontSize: config.height,
        text: config.name,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0.9,
    });

    let w = this.name.getWidth();

    while (w > 0.65 * config.width && this.name.getFontSize() > 5) {
        this.name.setFontSize(this.name.getFontSize() * 0.9);

        w = this.name.getWidth();
    }

    this.name.setOffsetX(w / 2);
    const nameTextObject = this.name;

    // Left-click on the name frame to see a log of only their actions
    // Right-click on the name frame to pass the replay leader to them
    this.name.on('click tap', (event) => {
        const username = nameTextObject.getText();
        if (event.evt.which === 1) { // Left-click
            globals.elements.msgLogGroup.showPlayerActions(username);
        } else if (event.evt.which === 3) { // Right-click
            this.giveLeader(username);
        }
    });
    this.add(this.name);

    w *= 1.4;

    this.leftline = new Kinetic.Line({
        points: [
            0,
            0,
            0,
            config.height / 2,
            config.width / 2 - w / 2,
            config.height / 2,
        ],
        stroke: '#d8d5ef',
        strokeWidth: 1,
        lineJoin: 'round',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0,
    });

    this.add(this.leftline);

    this.rightline = new Kinetic.Line({
        points: [
            config.width / 2 + w / 2,
            config.height / 2,
            config.width,
            config.height / 2,
            config.width,
            0,
        ],
        stroke: '#d8d5ef',
        strokeWidth: 1,
        lineJoin: 'round',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0,
    });

    this.add(this.rightline);

    // Draw the tooltips on the player names that show the time
    this.playerNum = config.playerNum;
    this.on('mousemove', function mouseMove() {
        if (globals.replay) {
            return;
        }

        globals.activeHover = this;

        const tooltipX = this.getWidth() / 2 + this.attrs.x;
        const tooltip = $(`#tooltip-player-${this.playerNum}`);
        tooltip.css('left', tooltipX);
        tooltip.css('top', this.attrs.y);
        tooltip.tooltipster('open');
    });
    this.on('mouseout', () => {
        if (globals.replay) {
            return;
        }

        const tooltip = $(`#tooltip-player-${this.playerNum}`);
        tooltip.tooltipster('close');
    });
};

Kinetic.Util.extend(HanabiNameFrame, Kinetic.Group);

// Transfer leadership of the shared replay to another player
HanabiNameFrame.prototype.giveLeader = function giveLeader(username) {
    // Only proceed if we are in a shared replay
    if (!globals.sharedReplay) {
        return;
    }

    // Only proceed if we are the replay leader
    if (globals.sharedReplayLeader !== globals.lobby.username) {
        return;
    }

    // Only proceed if we chose someone else
    if (username === globals.lobby.username) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.LEADER_TRANSFER,
        name: username,
    });
};

HanabiNameFrame.prototype.setActive = function setActive(active) {
    this.leftline.setStrokeWidth(active ? 3 : 1);
    this.rightline.setStrokeWidth(active ? 3 : 1);

    this.name.setShadowOpacity(active ? 0.6 : 0);
    this.leftline.setShadowOpacity(active ? 0.6 : 0);
    this.rightline.setShadowOpacity(active ? 0.6 : 0);

    this.name.setFontStyle(active ? 'bold' : 'normal');
};

HanabiNameFrame.prototype.setConnected = function setConnected(connected) {
    const color = connected ? '#d8d5ef' : '#e8233d';

    this.leftline.setStroke(color);
    this.rightline.setStroke(color);
    this.name.setFill(color);
};

module.exports = HanabiNameFrame;

},{"../../constants":3,"./globals":21}],29:[function(require,module,exports){
/*
    Users can right-click cards to record information on them
*/

// Imports
const globals = require('./globals');

// Variables
let notes; // An array containing all of the player's notes, indexed by card order
// Some variables must be in an object so that they are passed as a reference between files
const vars = {};
exports.vars = vars;

exports.init = () => {
    notes = [];

    // Used to keep track of which card the user is editing;
    // users can only update one note at a time to prevent bugs
    // Equal to the card order number or null
    vars.editing = null;
    // Equal to true if something happened when the note box happens to be open
    vars.actionOccured = false;
    vars.lastNote = ''; // Equal to the last note entered
};

const get = (order) => {
    const note = notes[order];
    if (typeof note === 'undefined') {
        return null;
    }
    return note;
};
exports.get = get;

const set = (order, note, send = true) => {
    if (note === '') {
        note = undefined;
    }
    notes[order] = note;
    vars.lastNote = note;

    // Send the note to the server
    if (send && !globals.replay && !globals.spectating) {
        globals.lobby.conn.send('note', {
            order,
            note,
        });
    }
};
exports.set = set;

const show = (card) => {
    const tooltip = $(`#tooltip-card-${card.order}`);
    const tooltipInstance = tooltip.tooltipster('instance');

    // Do nothing if the tooltip is already open
    if (tooltip.tooltipster('status').open) {
        return;
    }

    // We want the tooltip to appear above the card by default
    const pos = card.getAbsolutePosition();
    let posX = pos.x;
    let posY = pos.y - (card.getHeight() * card.parent.scale().y / 2);
    tooltipInstance.option('side', 'top');

    // Flip the tooltip if it is too close to the top of the screen
    if (posY < 200) {
        // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
        posY = pos.y + (card.getHeight() * card.parent.scale().y / 2);
        tooltipInstance.option('side', 'bottom');
    }

    // If there is an clue arrow showing, it will overlap with the tooltip arrow,
    // so move it over to the right a little bit
    if (card.indicatorArrow.visible()) {
        posX = pos.x + ((card.getWidth() * card.parent.scale().x / 2) / 2.5);
    }

    // Update the tooltip and open it
    tooltip.css('left', posX);
    tooltip.css('top', posY);
    const note = get(card.order) || '';
    tooltipInstance.content(note);
    tooltip.tooltipster('open');
};
exports.show = show;

exports.openEditTooltip = (card) => {
    // Don't edit any notes in shared replays
    if (globals.sharedReplay) {
        return;
    }

    // Close any existing note tooltips
    if (vars.editing !== null) {
        const tooltip = $(`#tooltip-card-${vars.editing}`);
        tooltip.tooltipster('close');
    }

    show(card);

    vars.editing = card.order;
    let note = get(card.order);
    if (note === null) {
        note = '';
    }
    const tooltip = $(`#tooltip-card-${card.order}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    tooltipInstance.content(`<input id="tooltip-card-${card.order}-input" type="text" value="${note}"/>`);

    $(`#tooltip-card-${card.order}-input`).on('keydown', (keyEvent) => {
        keyEvent.stopPropagation();
        if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
            return;
        }

        vars.editing = null;

        if (keyEvent.key === 'Escape') {
            note = get(card.order);
            if (note === null) {
                note = '';
            }
        } else if (keyEvent.key === 'Enter') {
            note = $(`#tooltip-card-${card.order}-input`).val();

            // Strip any HTML elements
            // (to be thorough, the server will also perform this validation)
            note = stripHTMLtags(note);

            set(card.order, note);

            // Check to see if an event happened while we were editing this note
            if (vars.actionOccured) {
                vars.actionOccured = false;
                tooltip.tooltipster('close');
            }
        }

        update(card);
    });

    // Automatically highlight all of the existing text when a note input box is focused
    $(`#tooltip-card-${card.order}-input`).focus(function tooltipCardInputFocus() {
        $(this).select();
    });

    // Automatically focus the new text input box
    $(`#tooltip-card-${card.order}-input`).focus();
};

const update = (card) => {
    // Update the tooltip and the card
    const tooltip = $(`#tooltip-card-${card.order}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    const note = get(card.order) || '';
    tooltipInstance.content(note);
    card.noteGiven.setVisible(note.length > 0);
    if (note.length === 0) {
        tooltip.tooltipster('close');
    }
    globals.layers.UI.draw();
    globals.layers.card.draw();
};
exports.update = update;

/*
    Misc. functions
*/

const stripHTMLtags = (input) => {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || '';
};

},{"./globals":21}],30:[function(require,module,exports){
const NumberButton = function NumberButton(config) {
    Kinetic.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    const background = new Kinetic.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });

    this.add(background);

    const text = new Kinetic.Text({
        x: 0,
        y: 0.275 * h, // 0.25 is too high for some reason
        width: w,
        height: 0.5 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        text: config.number.toString(),
    });

    this.add(text);

    this.pressed = false;

    this.clue = config.clue;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().draw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().draw();

            background.off('mouseup');
            background.off('mouseout');
        };

        background.on('mouseout', () => {
            resetButton();
        });
        background.on('mouseup', () => {
            resetButton();
        });
    });
};

Kinetic.Util.extend(NumberButton, Kinetic.Group);

NumberButton.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = NumberButton;

},{}],31:[function(require,module,exports){
/*
    Functions for progressing forward and backward through time
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const timer = require('./timer');

/*
    Main replay functions
*/

const enter = () => {
    if (globals.inReplay) {
        return;
    }

    globals.inReplay = true;
    globals.replayPos = globals.replayLog.length;
    globals.replayTurn = globals.replayMax;
    adjustShuttles();
    globals.lobby.ui.stopAction();
    globals.elements.replayArea.show();
    for (let i = 0; i < globals.deck.length; i++) {
        globals.deck[i].setBareImage();
    }
    globals.layers.UI.draw();
    globals.layers.card.draw();
};
exports.enter = enter;

const exit = () => {
    if (!globals.inReplay) {
        return;
    }

    goto(globals.replayMax, true);
    globals.inReplay = false;
    globals.elements.replayArea.hide();

    if (globals.savedAction) {
        globals.lobby.ui.handleAction(globals.savedAction);
    }
    for (let i = 0; i < globals.deck.length; i++) {
        globals.deck[i].setBareImage();
    }
    globals.layers.UI.draw();
    globals.layers.card.draw();
};
exports.exit = exit;

const goto = (target, fast) => {
    let rewind = false;

    if (target < 0) {
        target = 0;
    }
    if (target > globals.replayMax) {
        target = globals.replayMax;
    }

    if (target < globals.replayTurn) {
        rewind = true;
        globals.cardsGotten = 0;
        globals.cluesSpentPlusStrikes = 0;
    }

    if (globals.replayTurn === target) {
        return; // We are already there, nothing to do
    }

    if (
        globals.sharedReplay
        && globals.sharedReplayLeader === globals.lobby.username
        && globals.useSharedTurns
    ) {
        shareCurrentTurn(target);
    }

    globals.replayTurn = target;

    adjustShuttles();
    if (fast) {
        globals.animateFast = true;
    }

    if (rewind) {
        globals.lobby.ui.reset();
        globals.replayPos = 0;
    }

    // Iterate over the replay and stop at the current turn or at the end, whichever comes first
    while (true) {
        const msg = globals.replayLog[globals.replayPos];
        globals.replayPos += 1;

        // Stop at the end of the replay
        if (!msg) {
            break;
        }

        // Rebuild all notifies; this will correctly position cards and text
        globals.lobby.ui.handleNotify(msg.data);

        // Stop if you're at the current turn
        if (msg.data.type === 'turn' && msg.data.num === globals.replayTurn) {
            break;
        }
    }

    globals.animateFast = false;
    globals.elements.msgLogGroup.refreshText();
    globals.elements.messagePrompt.refreshText();
    globals.layers.card.draw();
    globals.layers.UI.draw();
};
exports.goto = goto;

/*
    The 4 replay button functions
*/

exports.backFull = () => {
    checkDisableSharedTurns();
    goto(0, true);
};

exports.back = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - 1, true);
};

exports.forward = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + 1);
};

exports.forwardFull = () => {
    checkDisableSharedTurns();
    goto(globals.replayMax, true);
};

/*
    Extra replay functions
*/

exports.backRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - globals.playerNames.length, true);
};

exports.forwardRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + globals.playerNames.length);
};


/*
    The "Exit Replay" button
*/

exports.exitButton = () => {
    if (globals.replay) {
        globals.lobby.conn.send('gameUnattend');

        timer.stop();
        globals.game.hide();
    } else {
        // Mark the time that the user clicked the "Exit Replay" button
        // (so that we can avoid an accidental "Give Clue" double-click)
        globals.accidentalClueTimer = Date.now();

        exit();
    }
};

/*
    The replay shuttle
*/

exports.barClick = function barClick(event) {
    const rectX = event.evt.x - this.getAbsolutePosition().x;
    const w = this.getWidth();
    const step = w / globals.replayMax;
    const newTurn = Math.floor((rectX + step / 2) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
};

exports.barDrag = function barDrag(pos) {
    const min = this.getParent().getAbsolutePosition().x;
    const w = this.getParent().getWidth() - this.getWidth();
    let shuttleX = pos.x - min;
    const shuttleY = this.getAbsolutePosition().y;
    if (shuttleX < 0) {
        shuttleX = 0;
    }
    if (shuttleX > w) {
        shuttleX = w;
    }
    const step = w / globals.replayMax;
    const newTurn = Math.floor((shuttleX + step / 2) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
    shuttleX = newTurn * step;
    return {
        x: min + shuttleX,
        y: shuttleY,
    };
};

const positionReplayShuttle = (shuttle, turn) => {
    const w = shuttle.getParent().getWidth() - shuttle.getWidth();
    shuttle.setX(turn * w / globals.replayMax);
};

const adjustShuttles = () => {
    positionReplayShuttle(globals.elements.replayShuttle, globals.replayTurn);
    positionReplayShuttle(globals.elements.replayShuttleShared, globals.sharedReplayTurn);
};
exports.adjustShuttles = adjustShuttles;

/*
    Right-clicking the deck
*/

exports.promptTurn = (event) => {
    // Do nothing if this is not a right-click
    if (event.evt.which !== 3) {
        return;
    }

    let turn = window.prompt('Which turn do you want to go to?');
    if (Number.isNaN(turn)) {
        return;
    }
    turn -= 1;
    // We need to decrement the turn because
    // the turn shown to the user is always one greater than the real turn

    if (globals.replay) {
        checkDisableSharedTurns();
    } else {
        enter(true);
    }
    goto(turn, true);
};

/*
    The "Toggle Shared Turns" button
*/

exports.toggleSharedTurns = () => {
    globals.useSharedTurns = !globals.useSharedTurns;
    globals.elements.replayShuttleShared.setVisible(!globals.useSharedTurns);
    if (globals.useSharedTurns) {
        if (globals.sharedReplayLeader === globals.lobby.username) {
            shareCurrentTurn(globals.replayTurn);
        } else {
            goto(globals.sharedReplayTurn);
        }
    }
};

// Navigating as a follower in a shared replay disables replay actions
const checkDisableSharedTurns = () => {
    if (
        globals.replay
        && globals.sharedReplay
        && globals.sharedReplayLeader !== globals.lobby.username
        && globals.useSharedTurns
    ) {
        // Replay actions currently enabled, so disable them
        globals.elements.toggleSharedTurnButton.dispatchEvent(new MouseEvent('click'));
    }
};
exports.checkDisableSharedTurns = checkDisableSharedTurns;

const shareCurrentTurn = (target) => {
    if (globals.sharedReplayTurn === target) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.TURN,
        turn: target,
    });
    globals.sharedReplayTurn = target;
    adjustShuttles();
};

},{"../../constants":3,"./globals":21,"./timer":33}],32:[function(require,module,exports){
/*
    Functions for the stats on the middle-right-hand side
*/

// Imports
const globals = require('./globals');

exports.updatePace = () => {
    const adjustedScorePlusDeck = globals.score + globals.deckSize - globals.maxScore;

    // Formula derived by Libster;
    // the number of discards that can happen while still getting the maximum number of
    // points (this is represented to the user as "Pace" on the user interface)
    const endGameThreshold1 = adjustedScorePlusDeck + globals.playerNames.length;

    // Formula derived by Florrat;
    // a strategical estimate of "End-Game" that tries to account for the number of players
    const endGameThreshold2 = adjustedScorePlusDeck + Math.floor(globals.playerNames.length / 2);

    // Formula derived by Hyphen-ated;
    // a more conservative estimate of "End-Game" that does not account for
    // the number of players
    const endGameThreshold3 = adjustedScorePlusDeck;

    // Update the pace
    // (part of the efficiency statistics on the right-hand side of the screen)
    // If there are no cards left in the deck, pace is meaningless
    const label = globals.elements.paceNumberLabel;
    if (globals.deckSize === 0) {
        label.setText('-');
        label.setFill('#d8d5ef'); // White
    } else {
        let paceText = endGameThreshold1.toString();
        if (endGameThreshold1 > 0) {
            paceText = `+${endGameThreshold1}`;
        }
        label.setText(paceText);

        // Color the pace label depending on how "risky" it would be to discard
        // (approximately)
        if (endGameThreshold1 <= 0) {
            // No more discards can occur in order to get a maximum score
            label.setFill('#df1c2d'); // Red
        } else if (endGameThreshold2 < 0) {
            // It would probably be risky to discard
            label.setFill('#ef8c1d'); // Orange
        } else if (endGameThreshold3 < 0) {
            // It might be risky to discard
            label.setFill('#efef1d'); // Yellow
        } else {
            // We are not even close to the "End-Game", so give it the default color
            label.setFill('#d8d5ef'); // White
        }
    }
};

exports.updateEfficiency = (cardsGottenDelta) => {
    globals.cardsGotten += cardsGottenDelta;
    const efficiency = (globals.cardsGotten / globals.cluesSpentPlusStrikes).toFixed(2);
    // Round it to 2 decimal places

    /*
        Calculate the minimum amount of efficiency needed in order to win this variant
        First, calculate the starting pace with the following formula:
            total cards in the deck -
            ((number of cards in a player's hand - 1) * number of players) -
            (5 * number of suits)
        https://github.com/Zamiell/hanabi-conventions/blob/master/other-conventions/Efficiency.md
    */
    let totalCardsInTheDeck = 0;
    for (const suit of globals.variant.suits) {
        totalCardsInTheDeck += 10;
        if (suit.oneOfEach) {
            totalCardsInTheDeck -= 5;
        } else if (globals.variant.name.startsWith('Up or Down')) {
            totalCardsInTheDeck -= 1;
        }
    }
    const numberOfPlayers = globals.playerNames.length;
    let cardsInHand = 5;
    if (numberOfPlayers === 4 || numberOfPlayers === 5) {
        cardsInHand = 4;
    } else if (numberOfPlayers === 6) {
        cardsInHand = 3;
    }
    let startingPace = totalCardsInTheDeck;
    startingPace -= (cardsInHand - 1) * numberOfPlayers;
    startingPace -= 5 * globals.variant.suits.length;

    /*
        Second, use the pace to calculate the minimum efficiency required to win the game
        with the following formula:
            (5 * number of suits) /
            (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
        https://github.com/Zamiell/hanabi-conventions/blob/master/other-conventions/Efficiency.md
    */
    const minEfficiencyNumerator = 5 * globals.variant.suits.length;
    let unusableClues = 1;
    if (numberOfPlayers >= 5) {
        unusableClues = 2;
    }
    let discardsPerClue = 1;
    if (globals.variant.name.startsWith('Clue Starved')) {
        discardsPerClue = 2;
    }
    const minEfficiencyDenominator = 8 + Math.floor(
        (startingPace + globals.variant.suits.length - unusableClues) / discardsPerClue,
    );
    const minEfficiency = (minEfficiencyNumerator / minEfficiencyDenominator).toFixed(2);
    // Round it to 2 decimal places

    if (globals.cluesSpentPlusStrikes === 0) {
        // First, handle the case in which 0 clues have been given
        globals.elements.efficiencyNumberLabel.setText(`- / ${minEfficiency}`);
    } else {
        globals.elements.efficiencyNumberLabel.setText(`${efficiency} / ${minEfficiency}`);
    }
};

},{"./globals":21}],33:[function(require,module,exports){
/*
    Functions for timed games
    (and the timer that ticks up in untimed games)
*/

// Imports
const globals = require('./globals');

// Variables
let timerID;
let playerTimes;
let activeIndex;
let lastTimerUpdateTimeMS;

exports.init = () => {
    timerID = null;
    playerTimes = null;
    activeIndex = null;
    lastTimerUpdateTimeMS = null;
};

// Has the following data:
/*
    {
        // A list of the times for each player
        times: [
            100,
            200,
        ],
        // The index of the active player
        active: 0,
    }
*/
exports.update = (data) => {
    stop();

    // We don't need to update the timers if they are not showing
    if (
        globals.elements.timer1 === null
        || globals.elements.timer2 === null
    ) {
        return;
    }

    // Record the data
    playerTimes = data.times;
    activeIndex = data.active;

    // Mark the time that we updated the local player times
    lastTimerUpdateTimeMS = new Date().getTime();

    // Update onscreen time displays
    if (!globals.spectating) {
        // The visibilty of this timer does not change during a game
        let time = playerTimes[globals.playerUs];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }
        globals.elements.timer1.setText(millisecondsToTimeDisplay(time));
    }

    const ourTurn = activeIndex === globals.playerUs && !globals.spectating;
    if (!ourTurn) {
        // Update the UI with the value of the timer for the active player
        let time = playerTimes[activeIndex];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }
        globals.elements.timer2.setText(millisecondsToTimeDisplay(time));
    }

    const shoudShowTimer2 = !ourTurn && activeIndex !== -1;
    globals.elements.timer2.setVisible(shoudShowTimer2);
    globals.layers.timer.draw();

    // Update the timer tooltips for each player
    for (let i = 0; i < playerTimes.length; i++) {
        setTickingDownTimeTooltip(i);
    }

    // The server will send an active value of -1 when the game is over
    if (activeIndex === -1) {
        return;
    }

    // Start the local timer for the active player
    const activeTimerUIText = (ourTurn ? globals.elements.timer1 : globals.elements.timer2);
    timerID = window.setInterval(() => {
        setTickingDownTime(activeTimerUIText);
        setTickingDownTimeTooltip(activeIndex);
    }, 1000);
};

const stop = () => {
    if (timerID !== null) {
        window.clearInterval(timerID);
        timerID = null;
    }
};
exports.stop = stop;

function setTickingDownTime(text) {
    // Compute elapsed time since last timer update
    const now = new Date().getTime();
    const timeElapsed = now - lastTimerUpdateTimeMS;
    lastTimerUpdateTimeMS = now;
    if (timeElapsed < 0) {
        return;
    }

    // Update the time in local array to approximate server times
    playerTimes[activeIndex] -= timeElapsed;
    if (globals.timed && playerTimes[activeIndex] < 0) {
        // Don't let the timer go into negative values, or else it will mess up the display
        // (but in non-timed games, we want this to happen)
        playerTimes[activeIndex] = 0;
    }

    let millisecondsLeft = playerTimes[activeIndex];
    if (!globals.timed) {
        // Invert it to show how much time each player is taking
        millisecondsLeft *= -1;
    }
    const displayString = millisecondsToTimeDisplay(millisecondsLeft);

    // Update display
    text.setText(displayString);
    text.getLayer().batchDraw();

    // Play a sound to indicate that the current player is almost out of time
    // Do not play it more frequently than about once per second
    if (
        globals.timed
        && globals.lobby.settings.sendTimerSound
        && millisecondsLeft > 0 // Between 0 and 10 seconds
        && millisecondsLeft <= 10000
        && timeElapsed > 900
        && timeElapsed < 1100
        && !globals.lobby.errorOccured
    ) {
        globals.game.sounds.play('tone');
    }
}

function setTickingDownTimeTooltip(i) {
    let time = playerTimes[i];
    if (!globals.timed) {
        // Invert it to show how much time each player is taking
        time *= -1;
    }

    let content = 'Time ';
    if (globals.timed) {
        content += 'remaining';
    } else {
        content += 'taken';
    }
    content += ':<br /><strong>';
    content += millisecondsToTimeDisplay(time);
    content += '</strong>';
    $(`#tooltip-player-${i}`).tooltipster('instance').content(content);
}

/*
    The UI timer object
*/

const TimerDisplay = function TimerDisplay(config) {
    Kinetic.Group.call(this, config);

    const rectangle = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: 'black',
        cornerRadius: config.cornerRadius,
        opacity: 0.2,
        listening: false,
    });
    this.add(rectangle);

    const label = new Kinetic.Text({
        x: 0,
        y: 6 * config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.labelFontSize || config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: config.label,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(label);

    const text = new Kinetic.Text({
        x: 0,
        y: config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: '??:??',
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(text);

    this.setText = s => text.setText(s);
};
Kinetic.Util.extend(TimerDisplay, Kinetic.Group);
exports.TimerDisplay = TimerDisplay;

/*
    Misc. functions
*/

const millisecondsToTimeDisplay = (milliseconds) => {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
};
const pad2 = (num) => {
    if (num < 10) {
        return `0${num}`;
    }
    return `${num}`;
};

},{"./globals":21}],34:[function(require,module,exports){
// Imports
const Button = require('./button');

// A simple two-state button with text for each state
const ToggleButton = function ToggleButton(config) {
    Button.call(this, config);
    let toggleState = false;

    const toggle = () => {
        toggleState = !toggleState;
        this.setText(toggleState ? config.alternateText : config.text);
        if (this.getLayer()) {
            this.getLayer().batchDraw();
        }
    };

    this.on('click tap', toggle);

    if (config.initialState) {
        toggle();
    }
};

Kinetic.Util.extend(ToggleButton, Button);

module.exports = ToggleButton;

},{"./button":9}],35:[function(require,module,exports){
// Imports
const Button = require('./button');
const ButtonGroup = require('./buttonGroup');
const CardDeck = require('./cardDeck');
const cardDraw = require('./cardDraw');
const CardStack = require('./cardStack');
const CardLayout = require('./cardLayout');
const ClueRecipientButton = require('./clueRecipientButton');
const ColorButton = require('./colorButton');
const constants = require('../../constants');
const FitText = require('./fitText');
const globals = require('./globals');
const globalsInit = require('./globalsInit');
const HanabiCard = require('./card');
const HanabiClueEntry = require('./clueEntry');
const HanabiClueLog = require('./clueLog');
const HanabiNameFrame = require('./nameFrame');
const HanabiMsgLog = require('./msgLog');
const LayoutChild = require('./layoutChild');
const Loader = require('./loader');
const keyboard = require('./keyboard');
const MultiFitText = require('./multiFitText');
const NumberButton = require('./numberButton');
const notes = require('./notes');
const replay = require('./replay');
const stats = require('./stats');
const ToggleButton = require('./toggleButton');
const timer = require('./timer');

function HanabiUI(lobby, game) {
    // Since the "HanabiUI" object is being reinstantiated,
    // we need to explicitly reinitialize all varaibles (or else they will retain their old values)
    globalsInit();
    cardDraw.init();
    // (the keyboard functions can only be initialized once the clue buttons are drawn)
    notes.init();
    timer.init();

    globals.lobby = lobby;
    globals.game = game;

    // Eventually, we should refactor everything out of "ui.js" and remove all "ui" references
    // (this is how the code worked pre-Browserify)
    const ui = this;

    const {
        ACT,
        CARDW,
        CHARACTERS,
        CLUE_TYPE,
        INDICATOR,
        SUIT,
    } = constants;

    /*
        Misc. UI objects
    */

    const Clue = function Clue(type, value) {
        this.type = type;
        this.value = value;
    };

    // Convert a clue to the format used by the server, which is identical but for the color value;
    // on the client it is a rich object and on the server it is a simple integer mapping
    const clueToMsgClue = (clue, variant) => {
        const {
            type: clueType,
            value: clueValue,
        } = clue;
        let msgClueValue;
        if (clueType === CLUE_TYPE.COLOR) {
            const clueColor = clueValue;
            msgClueValue = variant.clueColors.findIndex(color => color === clueColor);
        } else if (clueType === CLUE_TYPE.RANK) {
            msgClueValue = clueValue;
        }
        return {
            type: clueType,
            value: msgClueValue,
        };
    };
    const msgClueToClue = (msgClue, variant) => {
        const {
            type: clueType,
            value: msgClueValue,
        } = msgClue;
        let clueValue;
        if (clueType === CLUE_TYPE.COLOR) {
            clueValue = variant.clueColors[msgClueValue];
        } else if (clueType === CLUE_TYPE.RANK) {
            clueValue = msgClueValue;
        }
        return new Clue(clueType, clueValue);
    };
    const msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit];

    globals.ImageLoader = new Loader(() => {
        cardDraw.buildCards();
        ui.buildUI();
        keyboard.init(); // Keyboard hotkeys can only be initialized once the clue buttons are drawn
        globals.lobby.conn.send('ready');
        globals.ready = true;
    });

    this.showClueMatch = (target, clue) => {
        // Hide all of the existing arrows on the cards
        for (let i = 0; i < globals.deck.length; i++) {
            if (i === target) {
                continue;
            }

            globals.deck[i].setIndicator(false);
        }
        globals.layers.card.batchDraw();

        // We supply this function with an argument of "-1" if we just want to
        // clear the existing arrows and nothing else
        if (target < 0) {
            return false;
        }

        let match = false;
        for (let i = 0; i < globals.elements.playerHands[target].children.length; i++) {
            const child = globals.elements.playerHands[target].children[i];
            const card = child.children[0];

            let touched = false;
            let color;
            if (clue.type === CLUE_TYPE.RANK) {
                if (
                    clue.value === card.trueRank
                    || (globals.variant.name.startsWith('Multi-Fives') && card.trueRank === 5)
                ) {
                    touched = true;
                    color = INDICATOR.POSITIVE;
                }
            } else if (clue.type === CLUE_TYPE.COLOR) {
                const clueColor = clue.value;
                if (
                    card.trueSuit === SUIT.RAINBOW
                    || card.trueSuit === SUIT.RAINBOW1OE
                    || card.trueSuit.clueColors.includes(clueColor)
                ) {
                    touched = true;
                    color = clueColor.hexCode;
                }
            }

            if (touched) {
                match = true;
                card.setIndicator(true, color);
            } else {
                card.setIndicator(false);
            }
        }

        globals.layers.card.batchDraw();

        return match;
    };

    const sizeStage = (stage) => {
        let ww = window.innerWidth;
        let wh = window.innerHeight;

        if (ww < 640) {
            ww = 640;
        }
        if (wh < 360) {
            wh = 360;
        }

        const ratio = 1.777;

        let cw;
        let ch;
        if (ww < wh * ratio) {
            cw = ww;
            ch = ww / ratio;
        } else {
            ch = wh;
            cw = wh * ratio;
        }

        cw = Math.floor(cw);
        ch = Math.floor(ch);

        if (cw > 0.98 * ww) {
            cw = ww;
        }
        if (ch > 0.98 * wh) {
            ch = wh;
        }

        stage.setWidth(cw);
        stage.setHeight(ch);
    };

    globals.stage = new Kinetic.Stage({
        container: 'game',
    });

    sizeStage(globals.stage);

    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    const bgLayer = new Kinetic.Layer();
    globals.layers.card = new Kinetic.Layer();
    globals.layers.UI = new Kinetic.Layer();
    globals.layers.overtop = new Kinetic.Layer();
    const textLayer = new Kinetic.Layer({
        listening: false,
    });
    globals.layers.timer = new Kinetic.Layer({
        listening: false,
    });
    let drawDeckRect;

    let cluesTextLabel;
    let cluesNumberLabel;
    let scoreTextLabel;
    let scoreNumberLabel;
    let turnTextLabel;
    let turnNumberLabel;

    let spectatorsLabel;
    let spectatorsNumLabel;
    let sharedReplayLeaderLabel;
    let sharedReplayLeaderLabelPulse;
    const nameFrames = [];
    const playStacks = new Map();
    const discardStacks = new Map();
    let playArea;
    let discardArea;
    let clueLogRect;
    let clueArea;
    let noClueLabel;
    let noClueBox;
    let noDiscardLabel;
    let noDoubleDiscardLabel;
    let scoreArea;
    let replayBar;
    let replayButton;
    let replayExitButton;
    let lobbyButton;

    this.overPlayArea = pos => (
        pos.x >= playArea.getX()
        && pos.y >= playArea.getY()
        && pos.x <= playArea.getX() + playArea.getWidth()
        && pos.y <= playArea.getY() + playArea.getHeight()
    );

    this.buildUI = function buildUI() {
        let x;
        let y;
        let width;
        let height;
        let yOffset;
        let rect;
        let button;

        const layers = globals.stage.getLayers();

        for (let i = 0; i < layers.length; i++) {
            layers[i].remove();
        }

        const background = new Kinetic.Image({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            image: globals.ImageLoader.get('background'),
        });

        bgLayer.add(background);

        /*
            Draw the discard area
        */

        // This is the invisible rectangle that players drag cards to in order to discard them
        discardArea = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.2 * winW,
            height: 0.4 * winH,
        });

        // The red border that surrounds the discard pile when the team is at 8 clues
        noDiscardLabel = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            stroke: '#df1c2d',
            strokeWidth: 0.005 * winW,
            cornerRadius: 0.01 * winW,
            visible: false,
        });
        globals.layers.UI.add(noDiscardLabel);

        // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
        noDoubleDiscardLabel = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            stroke: 'yellow',
            strokeWidth: 0.004 * winW,
            cornerRadius: 0.01 * winW,
            visible: false,
            opacity: 0.75,
        });
        globals.layers.UI.add(noDoubleDiscardLabel);

        // The faded rectange around the trash can
        rect = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });
        bgLayer.add(rect);

        // The icon over the discard pile
        const img = new Kinetic.Image({
            x: 0.82 * winW,
            y: 0.62 * winH,
            width: 0.15 * winW,
            height: 0.35 * winH,
            opacity: 0.2,
            image: globals.ImageLoader.get('trashcan'),
        });
        bgLayer.add(img);

        /*
            The action log
        */

        const actionLogValues = {
            x: 0.2,
            y: 0.235,
            w: 0.4,
            h: 0.098,
        };
        if (globals.lobby.settings.showBGAUI) {
            actionLogValues.x = 0.01;
            actionLogValues.y = 0.01;
            actionLogValues.h = 0.25;
        }
        const actionLog = new Kinetic.Group({
            x: actionLogValues.x * winW,
            y: actionLogValues.y * winH,
        });
        globals.layers.UI.add(actionLog);

        // The faded rectange around the action log
        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: actionLogValues.w * winW,
            height: actionLogValues.h * winH,
            fill: 'black',
            opacity: 0.3,
            cornerRadius: 0.01 * winH,
            listening: true,
        });
        actionLog.add(rect);

        // Clicking on the action log
        rect.on('click tap', () => {
            globals.elements.msgLogGroup.show();
            globals.elements.stageFade.show();

            globals.layers.overtop.draw();

            globals.elements.stageFade.on('click tap', () => {
                globals.elements.stageFade.off('click tap');

                globals.elements.msgLogGroup.hide();
                globals.elements.stageFade.hide();

                globals.layers.overtop.draw();
            });
        });

        // The action log
        let maxLines = 3;
        if (globals.lobby.settings.showBGAUI) {
            maxLines = 8;
        }
        globals.elements.messagePrompt = new MultiFitText({
            align: 'center',
            fontSize: 0.028 * winH,
            fontFamily: 'Verdana',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            listening: false,
            x: 0.01 * winW,
            y: 0.003 * winH,
            width: (actionLogValues.w - 0.02) * winW,
            height: (actionLogValues.h - 0.003) * winH,
            maxLines,
        });
        actionLog.add(globals.elements.messagePrompt);

        // The dark overlay that appears when you click on the action log (or a player's name)
        globals.elements.stageFade = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            opacity: 0.3,
            fill: 'black',
            visible: false,
        });
        globals.layers.overtop.add(globals.elements.stageFade);

        // The full action log (that appears when you click on the action log)
        globals.elements.msgLogGroup = new HanabiMsgLog();
        globals.layers.overtop.add(globals.elements.msgLogGroup);

        // The rectangle that holds the turn, score, and clue count
        const scoreAreaValues = {
            x: 0.66,
            y: 0.81,
        };
        if (globals.lobby.settings.showBGAUI) {
            scoreAreaValues.x = 0.168;
            scoreAreaValues.y = 0.81;
        }
        scoreArea = new Kinetic.Group({
            x: scoreAreaValues.x * winW,
            y: scoreAreaValues.y * winH,
        });
        globals.layers.UI.add(scoreArea);

        // The faded rectangle around the score area
        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.13 * winW,
            height: 0.18 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });
        scoreArea.add(rect);

        const basicTextLabel = new Kinetic.Text({
            x: 0.01 * winW,
            y: 0.01 * winH,
            width: 0.11 * winW,
            height: 0.03 * winH,
            fontSize: 0.026 * winH,
            fontFamily: 'Verdana',
            align: 'left',
            text: 'Placeholder text',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });

        const basicNumberLabel = basicTextLabel.clone().setText('0').setWidth(0.03 * winW).align('right');

        turnTextLabel = basicTextLabel.clone({
            text: 'Turn',
            x: 0.03 * winW,
            y: 0.01 * winH,
        });
        scoreArea.add(turnTextLabel);

        turnNumberLabel = basicNumberLabel.clone({
            text: '1',
            x: 0.07 * winW,
            y: 0.01 * winH,
        });
        scoreArea.add(turnNumberLabel);

        scoreTextLabel = basicTextLabel.clone({
            text: 'Score',
            x: 0.03 * winW,
            y: 0.045 * winH,
        });
        scoreArea.add(scoreTextLabel);

        scoreNumberLabel = basicNumberLabel.clone({
            text: '0',
            x: 0.07 * winW,
            y: 0.045 * winH,
        });
        scoreArea.add(scoreNumberLabel);

        cluesTextLabel = basicTextLabel.clone({
            text: 'Clues',
            x: 0.03 * winW,
            y: 0.08 * winH,
        });
        scoreArea.add(cluesTextLabel);

        cluesNumberLabel = basicNumberLabel.clone({
            text: '8',
            x: 0.07 * winW,
            y: 0.08 * winH,
        });
        scoreArea.add(cluesNumberLabel);

        // Draw the 3 strike (bomb) black squares
        for (let i = 0; i < 3; i++) {
            const square = new Kinetic.Rect({
                x: (0.01 + 0.04 * i) * winW,
                y: 0.115 * winH,
                width: 0.03 * winW,
                height: 0.053 * winH,
                fill: 'black',
                opacity: 0.6,
                cornerRadius: 0.003 * winW,
            });
            scoreArea.add(square);
        }

        /*
            The "eyes" symbol to show that one or more people are spectating the game
        */

        const spectatorsLabelValues = {
            x: 0.623,
            y: 0.9,
        };
        if (globals.lobby.settings.showBGAUI) {
            spectatorsLabelValues.x = 0.01;
            spectatorsLabelValues.y = 0.72;
        }
        spectatorsLabel = new Kinetic.Text({
            x: spectatorsLabelValues.x * winW,
            y: spectatorsLabelValues.y * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            fontSize: 0.03 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: '👀',
            fill: 'yellow',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
        });
        globals.layers.UI.add(spectatorsLabel);

        // Tooltip for the eyes
        spectatorsLabel.on('mousemove', function spectatorsLabelMouseMove() {
            globals.activeHover = this;

            const tooltipX = this.attrs.x + this.getWidth() / 2;
            $('#tooltip-spectators').css('left', tooltipX);
            $('#tooltip-spectators').css('top', this.attrs.y);
            $('#tooltip-spectators').tooltipster('open');
        });
        spectatorsLabel.on('mouseout', () => {
            $('#tooltip-spectators').tooltipster('close');
        });

        spectatorsNumLabel = new Kinetic.Text({
            x: (spectatorsLabelValues.x - 0.04) * winW,
            y: (spectatorsLabelValues.y + 0.034) * winH,
            width: 0.11 * winW,
            height: 0.03 * winH,
            fontSize: 0.03 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: '0',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
        });
        globals.layers.UI.add(spectatorsNumLabel);

        // Shared replay leader indicator
        const sharedReplayLeaderLabelValues = {
            x: 0.623,
            y: 0.85,
        };
        if (globals.lobby.settings.showBGAUI) {
            sharedReplayLeaderLabelValues.x = spectatorsLabelValues.x + 0.03;
            sharedReplayLeaderLabelValues.y = spectatorsLabelValues.y;
        }
        sharedReplayLeaderLabel = new Kinetic.Text({
            x: sharedReplayLeaderLabelValues.x * winW,
            y: sharedReplayLeaderLabelValues.y * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            fontSize: 0.03 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: '👑',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
        });
        globals.layers.UI.add(sharedReplayLeaderLabel);

        // Add an animation to alert everyone when shared replay leadership has been transfered
        sharedReplayLeaderLabelPulse = new Kinetic.Tween({
            node: sharedReplayLeaderLabel,
            scaleX: 2,
            scaleY: 2,
            offsetX: 12,
            offsetY: 10,
            duration: 0.5,
            easing: Kinetic.Easings.EaseInOut,
            onFinish: () => {
                sharedReplayLeaderLabelPulse.reverse();
            },
        });
        sharedReplayLeaderLabelPulse.anim.addLayer(globals.layers.UI);

        // Tooltip for the crown
        sharedReplayLeaderLabel.on('mousemove', function sharedReplayLeaderLabelMouseMove() {
            globals.activeHover = this;

            const tooltipX = this.attrs.x + this.getWidth() / 2;
            $('#tooltip-leader').css('left', tooltipX);
            $('#tooltip-leader').css('top', this.attrs.y);
            $('#tooltip-leader').tooltipster('open');
        });
        sharedReplayLeaderLabel.on('mouseout', () => {
            $('#tooltip-leader').tooltipster('close');
        });

        // The user can right-click on the crown to pass the replay leader to an arbitrary person
        sharedReplayLeaderLabel.on('click', (event) => {
            // Do nothing if this is not a right-click
            if (event.evt.which !== 3) {
                return;
            }

            // Do nothing if we are not the shared replay leader
            if (globals.sharedReplayLeader !== globals.lobby.username) {
                return;
            }

            let msg = 'What is the number of the person that you want to pass the replay leader to?\n\n';
            msg += globals.spectators.map((name, i) => `${i + 1} - ${name}\n`).join('');
            let target = window.prompt(msg);
            if (Number.isNaN(target)) {
                return;
            }
            target -= 1;
            target = globals.spectators[target];

            // Only proceed if we chose someone else
            if (target === globals.lobby.username) {
                return;
            }

            globals.lobby.conn.send('replayAction', {
                type: constants.REPLAY_ACTION_TYPE.LEADER_TRANSFER,
                name: target,
            });
        });

        /*
            End of spectator / shared replay stuff
        */

        /*
            Draw the clue log
        */

        const clueLogValues = {
            x: 0.8,
            y: 0.01,
            w: 0.19,
            h: 0.51,
        };
        clueLogRect = new Kinetic.Rect({
            x: clueLogValues.x * winW,
            y: clueLogValues.y * winH,
            width: clueLogValues.w * winW,
            height: clueLogValues.h * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });
        bgLayer.add(clueLogRect);

        const spacing = 0.01;
        globals.elements.clueLog = new HanabiClueLog({
            x: (clueLogValues.x + spacing) * winW,
            y: (clueLogValues.y + spacing) * winH,
            width: (clueLogValues.w - spacing * 2) * winW,
            height: (clueLogValues.h - spacing * 2) * winH,
        });
        globals.layers.UI.add(globals.elements.clueLog);

        /*
            Statistics shown on the right-hand side of the screen (at the bottom of the clue log)
        */

        rect = new Kinetic.Rect({
            x: clueLogValues.x * winW,
            y: 0.53 * winH,
            width: clueLogValues.w * winW,
            height: 0.06 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });
        bgLayer.add(rect);

        const paceTextLabel = basicTextLabel.clone({
            text: 'Pace',
            x: 0.825 * winW,
            y: 0.54 * winH,
            fontSize: 0.02 * winH,
        });
        globals.layers.UI.add(paceTextLabel);

        globals.elements.paceNumberLabel = basicNumberLabel.clone({
            text: '-',
            x: 0.9 * winW,
            y: 0.54 * winH,
            fontSize: 0.02 * winH,
            align: 'left',
        });
        globals.layers.UI.add(globals.elements.paceNumberLabel);

        const efficiencyTextLabel = basicTextLabel.clone({
            text: 'Efficiency',
            x: 0.825 * winW,
            y: 0.56 * winH,
            fontSize: 0.02 * winH,
        });
        globals.layers.UI.add(efficiencyTextLabel);

        globals.elements.efficiencyNumberLabel = basicNumberLabel.clone({
            text: '-',
            x: 0.9 * winW,
            y: 0.56 * winH,
            width: 0.08 * winW,
            fontSize: 0.02 * winH,
            align: 'left',
        });
        globals.layers.UI.add(globals.elements.efficiencyNumberLabel);

        /*
            Draw the stacks and the discard pile
        */

        let pileback;
        if (globals.variant.suits.length === 6 || globals.variant.showSuitNames) {
            y = 0.04;
            width = 0.06;
            height = 0.151;
            yOffset = 0.019;
        } else { // 4 or 5 stacks
            y = 0.05;
            width = 0.075;
            height = 0.189;
            yOffset = 0;
        }

        // TODO: move blocks like this into their own functions
        const playStackValues = {
            x: 0.183,
            y: 0.345 + yOffset,
            spacing: 0.015,
        };
        if (globals.variant.showSuitNames) {
            playStackValues.y -= 0.018;
        }
        if (globals.lobby.settings.showBGAUI) {
            playStackValues.x = actionLogValues.x;
            playStackValues.y = actionLogValues.y + actionLogValues.h + 0.02;
            playStackValues.spacing = 0.006;
        }
        if (
            globals.variant.suits.length === 4
            || (globals.variant.suits.length === 5 && globals.variant.showSuitNames)
        ) {
            // If there are only 4 stacks, they will be left-aligned instead of centered
            // So, center them by moving them to the right a little bit
            playStackValues.x += ((width + playStackValues.spacing) / 2);
        } else if (globals.variant.suits.length === 3) {
            // If there are only 3 stacks, they will be left-aligned instead of centered
            // So, center them by moving them to the right a little bit
            playStackValues.x += ((width + playStackValues.spacing) / 2) * 2;
        }
        this.suitLabelTexts = [];
        {
            let i = 0;
            for (const suit of globals.variant.suits) {
                const playStackX = playStackValues.x + (width + playStackValues.spacing) * i;

                pileback = new Kinetic.Image({
                    x: playStackX * winW,
                    y: playStackValues.y * winH,
                    width: width * winW,
                    height: height * winH,
                    image: globals.cardImages[`Card-${suit.name}-0`],
                });

                bgLayer.add(pileback);

                const thisSuitPlayStack = new CardStack({
                    x: playStackX * winW,
                    y: playStackValues.y * winH,
                    width: width * winW,
                    height: height * winH,
                });
                playStacks.set(suit, thisSuitPlayStack);
                globals.layers.card.add(thisSuitPlayStack);

                const thisSuitDiscardStack = new CardLayout({
                    x: 0.81 * winW,
                    y: (0.61 + y * i) * winH,
                    width: 0.17 * winW,
                    height: 0.17 * winH,
                });
                discardStacks.set(suit, thisSuitDiscardStack);
                globals.layers.card.add(thisSuitDiscardStack);

                // Draw the suit name next to each suit
                // (a text description of the suit)
                if (globals.variant.showSuitNames) {
                    let text = suit.name;
                    if (
                        globals.lobby.settings.showColorblindUI
                        && suit.clueColors.length > 1
                        && suit !== SUIT.RAINBOW
                        && suit !== SUIT.RAINBOW1OE
                    ) {
                        const colorList = suit.clueColors.map(c => c.abbreviation).join('/');
                        text += ` [${colorList}]`;
                    }
                    if (globals.variant.name.startsWith('Up or Down')) {
                        text = '';
                    }

                    const suitLabelText = new FitText({
                        x: (playStackValues.x - 0.01 + (width + playStackValues.spacing) * i) * winW, // eslint-disable-line
                        y: (playStackValues.y + 0.155) * winH,
                        width: 0.08 * winW,
                        height: 0.051 * winH,
                        fontSize: 0.02 * winH,
                        fontFamily: 'Verdana',
                        align: 'center',
                        text,
                        fill: '#d8d5ef',
                    });
                    textLayer.add(suitLabelText);
                    this.suitLabelTexts.push(suitLabelText);
                }

                i += 1;
            }
        }

        // This is the invisible rectangle that players drag cards to in order to play them
        // Make it a little big bigger than the stacks
        const overlap = 0.03;
        const playAreaValues = {
            x: 0.183,
            y: 0.345,
            w: 0.435,
            h: 0.189,
        };
        if (globals.lobby.settings.showBGAUI) {
            playAreaValues.x = 0.01;
            playAreaValues.y = 0.279;
            playAreaValues.w = 0.4;
        }
        playArea = new Kinetic.Rect({
            x: (playAreaValues.x - overlap) * winW,
            y: (playAreaValues.y - overlap) * winH,
            width: (playAreaValues.w + overlap * 2) * winW,
            height: (playAreaValues.h + overlap * 2) * winH,
        });

        /*
            Draw the deck
        */

        // This is the faded rectangle that is hidden until all of the deck has been depleted
        drawDeckRect = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.006 * winW,
        });
        bgLayer.add(drawDeckRect);

        // We also want to be able to right-click the deck if all the cards are drawn
        drawDeckRect.on('click', replay.promptTurn);

        globals.elements.drawDeck = new CardDeck({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            cardback: 'deck-back',
            suits: globals.variant.suits,
        });
        globals.layers.card.add(globals.elements.drawDeck);

        globals.elements.deckPlayAvailableLabel = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            stroke: 'yellow',
            cornerRadius: 6,
            strokeWidth: 10,
            visible: false,
        });
        globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);

        /* eslint-disable object-curly-newline */

        const handPos = {
            2: [
                { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
                { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0 },
            ],
            3: [
                { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
                { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78 },
                { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78 },
            ],
            4: [
                { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
                { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78 },
                { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0 },
                { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78 },
            ],
            5: [
                { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
                { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90 },
                { x: 0.025, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
                { x: 0.445, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
                { x: 0.77, y: 0.22, w: 0.301, h: 0.18, rot: 90 },
            ],
        };

        const handPosBGA = {
            2: [],
            3: [],
            4: [],
            5: [],
        };

        const handPosBGAValues = {
            x: 0.44,
            y: 0.04,
            w: 0.34,
            h: 0.16,
            spacing: 0.24,
        };
        for (let i = 2; i <= 5; i++) {
            let handX = handPosBGAValues.x;
            let handY = handPosBGAValues.y;
            let handW = handPosBGAValues.w;
            let handSpacing = handPosBGAValues.spacing;
            if (i >= 4) {
                // The hands only have 4 cards instead of 5,
                // so we need to slightly reposition the hands horizontally
                handX += 0.03;
                handW -= 0.07;
            }
            if (i === 5) {
                handY -= 0.03;
                handSpacing -= 0.042;
            }

            for (let j = 0; j < i; j++) {
                handPosBGA[i].push({
                    x: handX,
                    y: handY + (handSpacing * j),
                    w: handW,
                    h: handPosBGAValues.h,
                    rot: 0,
                });
            }
        }

        // Set the hand positions for 4-player and 5-player
        // (with 4 cards in the hand)
        const handPosBGAValues4 = {
            x: 0.47,
            y: handPosBGAValues.y,
            w: 0.27,
            h: handPosBGAValues.h,
            rot: handPosBGAValues.rot,
            spacing: handPosBGAValues.spacing,
        };
        for (let j = 0; j < 4; j++) {
            handPosBGA[4].push({
                x: handPosBGAValues4.x,
                y: handPosBGAValues4.y + (handPosBGAValues4.spacing * j),
                w: handPosBGAValues4.w,
                h: handPosBGAValues4.h,
                rot: handPosBGAValues4.rot,
            });
        }

        // This is the position for the white shade that shows where the new side of the hand is
        // (there is no shade on the Board Game Arena mode)
        const shadePos = {
            2: [
                { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
                { x: 0.185, y: 0.002, w: 0.43, h: 0.205, rot: 0 },
            ],
            3: [
                { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
                { x: 0.005, y: 0.718, w: 0.42, h: 0.205, rot: -78 },
                { x: 0.708, y: -0.008, w: 0.42, h: 0.205, rot: 78 },
            ],
            4: [
                { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
                { x: 0.01, y: 0.708, w: 0.35, h: 0.205, rot: -78 },
                { x: 0.225, y: 0.002, w: 0.35, h: 0.205, rot: 0 },
                { x: 0.718, y: 0.087, w: 0.35, h: 0.205, rot: 78 },
            ],
            5: [
                { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
                { x: 0.026, y: 0.775, w: 0.311, h: 0.196, rot: -90 },
                { x: 0.02, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
                { x: 0.44, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
                { x: 0.774, y: 0.215, w: 0.311, h: 0.196, rot: 90 },
            ],
        };

        const namePosValues = {
            h: 0.02,
        };
        const namePos = {
            2: [
                { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
                { x: 0.18, y: 0.21, w: 0.44, h: namePosValues.h },
            ],
            3: [
                { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
                { x: 0.01, y: 0.765, w: 0.12, h: namePosValues.h },
                { x: 0.67, y: 0.765, w: 0.12, h: namePosValues.h },
            ],
            4: [
                { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
                { x: 0.01, y: 0.74, w: 0.13, h: namePosValues.h },
                { x: 0.22, y: 0.21, w: 0.36, h: namePosValues.h },
                { x: 0.66, y: 0.74, w: 0.13, h: namePosValues.h },
            ],
            5: [
                { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
                { x: 0.025, y: 0.775, w: 0.116, h: namePosValues.h },
                { x: 0.015, y: 0.199, w: 0.36, h: namePosValues.h },
                { x: 0.435, y: 0.199, w: 0.36, h: namePosValues.h },
                { x: 0.659, y: 0.775, w: 0.116, h: namePosValues.h },
            ],
        };

        const namePosBGAMod = {
            x: -0.01,
            y: 0.17,
            w: 0.02,
        };
        const namePosBGA = {
            2: [],
            3: [],
            4: [],
            5: [],
        };
        for (let i = 2; i <= 5; i++) {
            for (let j = 0; j < i; j++) {
                namePosBGA[i].push({
                    x: handPosBGA[i][j].x + namePosBGAMod.x,
                    y: handPosBGA[i][j].y + namePosBGAMod.y,
                    w: handPosBGA[i][j].w + namePosBGAMod.w,
                    h: namePosValues.h,
                });
            }
        }

        /* eslint-enable object-curly-newline */

        const nump = globals.playerNames.length;

        const isHandReversed = (j) => {
            // By default, the hand is not reversed
            let reverse = false;

            if (j === 0) {
                // Reverse the ordering of the cards for our own hand
                // (for our hand, the oldest card is the first card, which should be on the right)
                reverse = true;
            }
            if (globals.lobby.settings.showBGAUI) {
                // If Board Game Arena mode is on, then we need to reverse every hand
                reverse = true;
            }
            if (globals.lobby.settings.reverseHands) {
                // If the "Reverse hand direction" option is turned on,
                // then we need to flip the direction of every hand
                reverse = !reverse;
            }

            return reverse;
        };

        // Draw the hands
        for (let i = 0; i < nump; i++) {
            let j = i - globals.playerUs;

            if (j < 0) {
                j += nump;
            }

            let playerHandPos = handPos;
            if (globals.lobby.settings.showBGAUI) {
                playerHandPos = handPosBGA;
            }

            let invertCards = false;
            if (i !== globals.playerUs) {
                // We want to flip the cards for other players
                invertCards = true;
            }
            if (globals.lobby.settings.showBGAUI) {
                // On the BGA layout, all the hands should not be flipped
                invertCards = false;
            }

            globals.elements.playerHands[i] = new CardLayout({
                x: playerHandPos[nump][j].x * winW,
                y: playerHandPos[nump][j].y * winH,
                width: playerHandPos[nump][j].w * winW,
                height: playerHandPos[nump][j].h * winH,
                rotationDeg: playerHandPos[nump][j].rot,
                align: 'center',
                reverse: isHandReversed(j),
                invertCards,
            });
            globals.layers.card.add(globals.elements.playerHands[i]);

            // Draw the faded shade that shows where the "new" side of the hand is
            // (but don't bother drawing it in Board Game Arena mode since
            // all the hands face the same way)
            if (!globals.lobby.settings.showBGAUI) {
                rect = new Kinetic.Rect({
                    x: shadePos[nump][j].x * winW,
                    y: shadePos[nump][j].y * winH,
                    width: shadePos[nump][j].w * winW,
                    height: shadePos[nump][j].h * winH,
                    rotationDeg: shadePos[nump][j].rot,
                    cornerRadius: 0.01 * shadePos[nump][j].w * winW,
                    opacity: 0.4,
                    fillLinearGradientStartPoint: {
                        x: 0,
                        y: 0,
                    },
                    fillLinearGradientEndPoint: {
                        x: shadePos[nump][j].w * winW,
                        y: 0,
                    },
                    fillLinearGradientColorStops: [
                        0,
                        'rgba(0,0,0,0)',
                        0.9,
                        'white',
                    ],
                });

                if (isHandReversed(j)) {
                    rect.setFillLinearGradientColorStops([
                        1,
                        'rgba(0,0,0,0)',
                        0.1,
                        'white',
                    ]);
                }

                bgLayer.add(rect);
            }

            let playerNamePos = namePos;
            if (globals.lobby.settings.showBGAUI) {
                playerNamePos = namePosBGA;
            }
            nameFrames[i] = new HanabiNameFrame({
                x: playerNamePos[nump][j].x * winW,
                y: playerNamePos[nump][j].y * winH,
                width: playerNamePos[nump][j].w * winW,
                height: playerNamePos[nump][j].h * winH,
                name: globals.playerNames[i],
                playerNum: i,
            });
            globals.layers.UI.add(nameFrames[i]);

            // Draw the "Detrimental Character Assignments" icon and tooltip
            if (globals.characterAssignments.length > 0) {
                const width2 = 0.03 * winW;
                const height2 = 0.03 * winH;
                const charIcon = new Kinetic.Text({
                    width: width2,
                    height: height2,
                    x: playerNamePos[nump][j].x * winW - width2 / 2,
                    y: playerNamePos[nump][j].y * winH - height2 / 2,
                    fontSize: 0.03 * winH,
                    fontFamily: 'Verdana',
                    align: 'center',
                    text: CHARACTERS[globals.characterAssignments[i]].emoji,
                    fill: 'yellow',
                    shadowColor: 'black',
                    shadowBlur: 10,
                    shadowOffset: {
                        x: 0,
                        y: 0,
                    },
                    shadowOpacity: 0.9,
                });
                globals.layers.UI.add(charIcon);

                /* eslint-disable no-loop-func */
                charIcon.on('mousemove', function charIconMouseMove() {
                    globals.activeHover = this;

                    const tooltipX = this.getWidth() / 2 + this.attrs.x;
                    const tooltip = $(`#tooltip-character-assignment-${i}`);
                    tooltip.css('left', tooltipX);
                    tooltip.css('top', this.attrs.y);

                    const character = CHARACTERS[globals.characterAssignments[i]];
                    const metadata = globals.characterMetadata[i];
                    let content = `<b>${character.name}</b>:<br />${character.description}`;
                    if (content.includes('[random color]')) {
                        // Replace "[random color]" with the selected color
                        content = content.replace('[random color]', globals.variant.clueColors[metadata].name.toLowerCase());
                    } else if (content.includes('[random number]')) {
                        // Replace "[random number]" with the selected number
                        content = content.replace('[random number]', metadata);
                    } else if (content.includes('[random suit]')) {
                        // Replace "[random suit]" with the selected suit name
                        content = content.replace('[random suit]', globals.variant.suits[metadata].name);
                    }
                    tooltip.tooltipster('instance').content(content);

                    tooltip.tooltipster('open');
                });
                /* eslint-enable no-loop-func */
                charIcon.on('mouseout', () => {
                    const tooltip = $(`#tooltip-character-assignment-${i}`);
                    tooltip.tooltipster('close');
                });
            }
        }

        /*
            Draw the clue area
        */

        const clueAreaValues = {
            x: 0.1,
            y: 0.54,
            w: 0.55, // The width of all of the vanilla cards is 0.435
            h: 0.27,
        };
        if (globals.lobby.settings.showBGAUI) {
            clueAreaValues.x = playStackValues.x - 0.102;
            clueAreaValues.y = playStackValues.y + 0.22;
        }
        clueArea = new Kinetic.Group({
            x: clueAreaValues.x * winW,
            y: clueAreaValues.y * winH,
            width: clueAreaValues.w * winW,
            height: clueAreaValues.h * winH,
        });

        globals.elements.clueTargetButtonGroup = new ButtonGroup();

        globals.elements.clueTargetButtonGroup.selectNextTarget = function selectNextTarget() {
            let newSelectionIndex = 0;
            for (let i = 0; i < this.list.length; i++) {
                if (this.list[i].pressed) {
                    newSelectionIndex = (i + 1) % this.list.length;
                    break;
                }
            }

            this.list[newSelectionIndex].dispatchEvent(new MouseEvent('click'));
        };

        globals.elements.clueButtonGroup = new ButtonGroup();

        // Store each button inside an array for later
        // (so that we can press them with keyboard hotkeys)
        globals.elements.rankClueButtons = [];
        globals.elements.suitClueButtons = [];

        // Player buttons
        x = 0.26 * winW - (nump - 2) * 0.044 * winW;
        for (let i = 0; i < nump - 1; i++) {
            const j = (globals.playerUs + i + 1) % nump;

            button = new ClueRecipientButton({
                x,
                y: 0,
                width: 0.08 * winW,
                height: 0.025 * winH,
                text: globals.playerNames[j],
                targetIndex: j,
            });

            clueArea.add(button);
            globals.elements.clueTargetButtonGroup.add(button);

            x += 0.0875 * winW;
        }

        // Rank buttons / number buttons
        let numRanks = 5;
        if (globals.variant.name.startsWith('Multi-Fives')) {
            numRanks = 4;
        }
        for (let i = 1; i <= numRanks; i++) {
            x = 0.134 + ((5 - numRanks) * 0.025);
            button = new NumberButton({
                // x: (0.183 + (i - 1) * 0.049) * winW,
                x: (x + i * 0.049) * winW,
                y: 0.027 * winH,
                width: 0.04 * winW,
                height: 0.071 * winH,
                number: i,
                clue: new Clue(CLUE_TYPE.RANK, i),
            });

            // Add it to the button array (for keyboard hotkeys)
            globals.elements.rankClueButtons.push(button);

            clueArea.add(button);

            globals.elements.clueButtonGroup.add(button);
        }

        // Color buttons
        x = 0.158 + ((6 - globals.variant.clueColors.length) * 0.025);
        {
            let i = 0;
            for (const color of globals.variant.clueColors) {
                button = new ColorButton({
                    x: (x + i * 0.049) * winW,
                    y: 0.1 * winH,
                    width: 0.04 * winW,
                    height: 0.071 * winH,
                    color: color.hexCode,
                    text: color.abbreviation,
                    clue: new Clue(CLUE_TYPE.COLOR, color),
                });

                clueArea.add(button);

                // Add it to the button array (for keyboard hotkeys)
                globals.elements.suitClueButtons.push(button);

                globals.elements.clueButtonGroup.add(button);
                i += 1;
            }
        }

        // The "Give Clue" button
        globals.elements.giveClueButton = new Button({
            x: 0.183 * winW,
            y: 0.172 * winH,
            width: 0.236 * winW,
            height: 0.051 * winH,
            text: 'Give Clue',
        });
        clueArea.add(globals.elements.giveClueButton);
        globals.elements.giveClueButton.on('click tap', this.giveClue);

        clueArea.hide();
        globals.layers.UI.add(clueArea);

        // The "No Clues" box
        const noClueBoxValues = {
            x: 0.275,
            y: 0.56,
        };
        if (globals.lobby.settings.showBGAUI) {
            noClueBoxValues.x = clueAreaValues.x + 0.178;
            noClueBoxValues.y = clueAreaValues.y;
        }
        noClueBox = new Kinetic.Rect({
            x: noClueBoxValues.x * winW,
            y: noClueBoxValues.y * winH,
            width: 0.25 * winW,
            height: 0.15 * winH,
            cornerRadius: 0.01 * winW,
            fill: 'black',
            opacity: 0.5,
            visible: false,
        });
        globals.layers.UI.add(noClueBox);

        const noClueLabelValues = {
            x: noClueBoxValues.x - 0.125,
            y: noClueBoxValues.y + 0.025,
        };
        noClueLabel = new Kinetic.Text({
            x: noClueLabelValues.x * winW,
            y: noClueLabelValues.y * winH,
            width: 0.5 * winW,
            height: 0.19 * winH,
            fontFamily: 'Verdana',
            fontSize: 0.08 * winH,
            strokeWidth: 1,
            text: 'No Clues',
            align: 'center',
            fill: '#df2c4d',
            stroke: 'black',
            visible: false,
        });
        globals.layers.UI.add(noClueLabel);

        /*
            Draw the timer
        */

        // We don't want the timer to show in replays
        if (!globals.replay && (globals.timed || globals.lobby.settings.showTimerInUntimed)) {
            const timerValues = {
                x1: 0.155,
                x2: 0.565,
                y1: 0.592,
                y2: 0.592,
            };
            if (globals.lobby.settings.showBGAUI) {
                timerValues.x1 = 0.31;
                timerValues.x2 = 0.31;
                timerValues.y1 = 0.77;
                timerValues.y2 = 0.885;
            }

            globals.elements.timer1 = new timer.TimerDisplay({
                x: timerValues.x1 * winW,
                y: timerValues.y1 * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
                cornerRadius: 0.005 * winH,
                spaceH: 0.01 * winH,
                label: 'You',
                visible: !globals.spectating,
            });
            globals.layers.timer.add(globals.elements.timer1);

            globals.elements.timer2 = new timer.TimerDisplay({
                x: timerValues.x2 * winW,
                y: timerValues.y2 * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
                labelFontSize: 0.02 * winH,
                cornerRadius: 0.005 * winH,
                spaceH: 0.01 * winH,
                label: 'Current\nPlayer',
                visible: false,
            });
            globals.layers.timer.add(globals.elements.timer2);
        }

        // Just in case, stop the previous timer, if any
        timer.stop();

        /*
            Draw the replay area
        */

        const replayAreaValues = {
            x: 0.15,
            y: 0.51,
            w: 0.5,
        };
        if (globals.lobby.settings.showBGAUI) {
            replayAreaValues.x = 0.01;
            replayAreaValues.y = 0.49;
            replayAreaValues.w = 0.4;
        }
        globals.elements.replayArea = new Kinetic.Group({
            x: replayAreaValues.x * winW,
            y: replayAreaValues.y * winH,
            width: replayAreaValues.w * winW,
            height: 0.27 * winH,
        });

        replayBar = new Kinetic.Rect({
            x: 0,
            y: 0.0425 * winH,
            width: replayAreaValues.w * winW,
            height: 0.01 * winH,
            fill: 'black',
            cornerRadius: 0.005 * winH,
            listening: false,
        });
        globals.elements.replayArea.add(replayBar);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: replayAreaValues.w * winW,
            height: 0.05 * winH,
            opacity: 0,
        });
        rect.on('click', replay.barClick);
        globals.elements.replayArea.add(rect);

        globals.elements.replayShuttle = new Kinetic.Rect({
            x: 0,
            y: 0.0325 * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            fill: '#0000cc',
            cornerRadius: 0.01 * winW,
            draggable: true,
            dragBoundFunc: replay.barDrag,
        });
        globals.elements.replayShuttle.on('dragend', () => {
            globals.layers.card.draw();
            globals.layers.UI.draw();
        });
        globals.elements.replayArea.add(globals.elements.replayShuttle);

        globals.elements.replayShuttleShared = new Kinetic.Rect({
            x: 0,
            y: 0.0325 * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            cornerRadius: 0.01 * winW,
            fill: '#d1d1d1',
            visible: !globals.useSharedTurns,
        });
        globals.elements.replayShuttleShared.on('click tap', () => {
            replay.goto(globals.sharedReplayTurn, true);
        });
        globals.elements.replayArea.add(globals.elements.replayShuttleShared);

        replay.adjustShuttles();

        const replayButtonValues = {
            x: 0.1,
            y: 0.07,
            spacing: 0.08,
        };
        if (globals.lobby.settings.showBGAUI) {
            replayButtonValues.x = 0.05;
        }

        // Go back to the beginning (the left-most button)
        button = new Button({
            x: replayButtonValues.x * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'replay-back-full',
        });
        button.on('click tap', replay.backFull);
        globals.elements.replayArea.add(button);

        // Go back one turn (the second left-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'replay-back',
        });
        button.on('click tap', replay.back);
        globals.elements.replayArea.add(button);

        // Go forward one turn (the second right-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing * 2) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'replay-forward',
        });
        button.on('click tap', replay.forward);
        globals.elements.replayArea.add(button);

        // Go forward to the end (the right-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing * 3) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'replay-forward-full',
        });
        button.on('click tap', replay.forwardFull);
        globals.elements.replayArea.add(button);

        // The "Exit Replay" button
        replayExitButton = new Button({
            x: (replayButtonValues.x + 0.05) * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Exit Replay',
            visible: !globals.replay && !globals.sharedReplay,
        });
        replayExitButton.on('click tap', replay.exitButton);
        globals.elements.replayArea.add(replayExitButton);

        // The "Pause Shared Turns"  / "Use Shared Turns" button
        globals.elements.toggleSharedTurnButton = new ToggleButton({
            x: (replayButtonValues.x + 0.05) * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Pause Shared Turns',
            alternateText: 'Use Shared Turns',
            initialState: !globals.useSharedTurns,
            visible: false,
        });
        globals.elements.toggleSharedTurnButton.on('click tap', replay.toggleSharedTurns);
        globals.elements.replayArea.add(globals.elements.toggleSharedTurnButton);

        globals.elements.replayArea.hide();
        globals.layers.UI.add(globals.elements.replayArea);

        replayButton = new Button({
            x: 0.01 * winW,
            y: 0.8 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            image: 'replay',
            visible: false,
        });
        replayButton.on('click tap', () => {
            if (globals.inReplay) {
                replay.exit();
            } else {
                replay.enter();
            }
        });

        globals.layers.UI.add(replayButton);

        // The chat button is not necessary in non-shared replays
        if (!globals.replay || globals.sharedReplay) {
            globals.elements.chatButton = new Button({
                x: 0.01 * winW,
                y: 0.87 * winH,
                width: 0.06 * winW,
                height: 0.06 * winH,
                text: 'Chat',
            });
            globals.layers.UI.add(globals.elements.chatButton);
            globals.elements.chatButton.on('click tap', () => {
                globals.game.chat.toggle();
            });
        }

        lobbyButton = new Button({
            x: 0.01 * winW,
            y: 0.94 * winH,
            width: 0.06 * winW,
            height: 0.05 * winH,
            text: 'Lobby',
        });
        globals.layers.UI.add(lobbyButton);

        lobbyButton.on('click tap', () => {
            lobbyButton.off('click tap');
            globals.lobby.conn.send('gameUnattend');

            timer.stop();
            globals.game.hide();
        });

        if (globals.inReplay) {
            globals.elements.replayArea.show();
        }

        globals.stage.add(bgLayer);
        globals.stage.add(textLayer);
        globals.stage.add(globals.layers.UI);
        globals.stage.add(globals.layers.timer);
        globals.stage.add(globals.layers.card);
        globals.stage.add(globals.layers.overtop);
    };

    this.giveClue = () => {
        if (!globals.elements.giveClueButton.getEnabled()) {
            return;
        }

        // Prevent the user from accidentally giving a clue in certain situations
        if (Date.now() - globals.accidentalClueTimer < 1000) {
            return;
        }

        const target = globals.elements.clueTargetButtonGroup.getPressed();
        if (!target) {
            return;
        }
        const clueButton = globals.elements.clueButtonGroup.getPressed();
        if (!clueButton) {
            return;
        }

        // Erase the arrows
        globals.lobby.ui.showClueMatch(target.targetIndex, {});

        // Set the clue timer to prevent multiple clicks
        globals.accidentalClueTimer = Date.now();

        // Send the message to the server
        const action = {
            type: 'action',
            data: {
                type: ACT.CLUE,
                target: target.targetIndex,
                clue: clueToMsgClue(clueButton.clue, globals.variant),
            },
        };
        ui.endTurn(action);
    };

    this.reset = function reset() {
        globals.elements.messagePrompt.setMultiText('');
        globals.elements.msgLogGroup.reset();

        const { suits } = globals.variant;

        for (const suit of suits) {
            playStacks.get(suit).removeChildren();
            discardStacks.get(suit).removeChildren();
        }

        for (let i = 0; i < globals.playerNames.length; i++) {
            globals.elements.playerHands[i].removeChildren();
        }

        globals.deck = [];
        globals.postAnimationLayout = null;

        globals.elements.clueLog.clear();
        globals.elements.messagePrompt.reset();

        // This should always be overridden before it gets displayed
        globals.elements.drawDeck.setCount(0);

        for (let i = 0; i < globals.elements.strikes.length; i++) {
            globals.elements.strikes[i].remove();
        }
        globals.elements.strikes = [];

        globals.animateFast = true;
    };

    this.saveReplay = function saveReplay(msg) {
        const msgData = msg.data;

        globals.replayLog.push(msg);

        if (msgData.type === 'turn') {
            globals.replayMax = msgData.num;
        }
        if (msgData.type === 'gameOver') {
            globals.replayMax += 1;
        }

        if (!globals.replay && globals.replayMax > 0) {
            replayButton.show();
        }

        if (globals.inReplay) {
            replay.adjustShuttles();
            globals.layers.UI.draw();
        }
    };

    this.replayAdvanced = function replayAdvanced() {
        globals.animateFast = false;

        if (globals.inReplay) {
            replay.goto(0);
        }

        globals.layers.card.draw();
        globals.layers.UI.draw();
        // We need to re-draw the UI or else the action text will not appear
    };

    this.showConnected = function showConnected(list) {
        if (!globals.ready) {
            return;
        }

        for (let i = 0; i < list.length; i++) {
            nameFrames[i].setConnected(list[i]);
        }

        globals.layers.UI.draw();
    };

    function showLoading() {
        const loadinglayer = new Kinetic.Layer();

        const loadinglabel = new Kinetic.Text({
            fill: '#d8d5ef',
            stroke: '#747278',
            strokeWidth: 1,
            text: 'Loading...',
            align: 'center',
            x: 0,
            y: 0.7 * winH,
            width: winW,
            height: 0.05 * winH,
            fontFamily: 'Arial',
            fontStyle: 'bold',
            fontSize: 0.05 * winH,
        });

        loadinglayer.add(loadinglabel);

        const progresslabel = new Kinetic.Text({
            fill: '#d8d5ef',
            stroke: '#747278',
            strokeWidth: 1,
            text: '0 / 0',
            align: 'center',
            x: 0,
            y: 0.8 * winH,
            width: winW,
            height: 0.05 * winH,
            fontFamily: 'Arial',
            fontStyle: 'bold',
            fontSize: 0.05 * winH,
        });

        loadinglayer.add(progresslabel);

        globals.ImageLoader.progressCallback = (done, total) => {
            progresslabel.setText(`${done}/${total}`);
            loadinglayer.draw();
        };

        globals.stage.add(loadinglayer);
    }

    showLoading();

    this.handleNotify = function handleNotify(data) {
        // If an action in the game happens,
        // mark to make the tooltip go away after the user has finished entering their note
        if (notes.vars.editing !== null) {
            notes.vars.actionOccured = true;
        }

        // Automatically disable any tooltips once an action in the game happens
        if (globals.activeHover) {
            globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            globals.activeHover = null;
        }

        const { type } = data;
        if (type === 'text') {
            this.setMessage(data);
        } else if (type === 'draw') {
            if (data.suit === -1) {
                delete data.suit;
            }
            if (data.rank === -1) {
                delete data.rank;
            }
            const suit = msgSuitToSuit(data.suit, globals.variant);
            if (!globals.learnedCards[data.order]) {
                globals.learnedCards[data.order] = {
                    possibleSuits: globals.variant.suits.slice(),
                    possibleRanks: globals.variant.ranks.slice(),
                };
            }
            globals.deck[data.order] = new HanabiCard({
                suit,
                rank: data.rank,
                order: data.order,
                suits: globals.variant.suits.slice(),
                ranks: globals.variant.ranks.slice(),
                holder: data.who,
            });

            const child = new LayoutChild();
            child.add(globals.deck[data.order]);

            const pos = globals.elements.drawDeck.cardback.getAbsolutePosition();

            child.setAbsolutePosition(pos);
            child.setRotation(-globals.elements.playerHands[data.who].getRotation());

            const scale = globals.elements.drawDeck.cardback.getWidth() / CARDW;
            child.setScale({
                x: scale,
                y: scale,
            });

            globals.elements.playerHands[data.who].add(child);
            globals.elements.playerHands[data.who].moveToTop();

            // Adding speedrun code; make all cards in our hand draggable from the get-go
            // (except for cards we have already played or discarded)
            if (
                globals.lobby.settings.speedrunPreplay
                && data.who === globals.playerUs
                && !globals.replay
                && !globals.spectating
                && !globals.learnedCards[data.order].revealed
            ) {
                child.setDraggable(true);
                child.on('dragend.play', dragendPlay);
            }
        } else if (type === 'drawSize') {
            globals.deckSize = data.size;
            globals.elements.drawDeck.setCount(data.size);
        } else if (type === 'play' || type === 'discard') {
            // Local variables
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            const card = globals.deck[data.which.order];
            const child = card.parent; // This is the LayoutChild

            // Hide all of the existing arrows on the cards
            globals.lobby.ui.showClueMatch(-1);

            const learnedCard = globals.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            card.showOnlyLearned = false;
            card.trueSuit = suit;
            card.trueRank = data.which.rank;

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            card.suitPips.hide();
            card.rankPips.hide();
            child.remove();
            child.setAbsolutePosition(pos);

            globals.elements.clueLog.checkExpiry();

            if (type === 'play') {
                card.isPlayed = true;
                card.turnPlayed = globals.turn - 1;

                playStacks.get(suit).add(child);
                playStacks.get(suit).moveToTop();

                if (!card.isClued()) {
                    stats.updateEfficiency(1);
                }
            } else if (type === 'discard') {
                card.isDiscarded = true;
                card.turnDiscarded = globals.turn - 1;

                discardStacks.get(suit).add(child);
                for (const discardStack of discardStacks) {
                    if (discardStack[1]) {
                        discardStack[1].moveToTop();
                    }
                }

                let finished = false;
                do {
                    const n = child.getZIndex();

                    if (!n) {
                        break;
                    }

                    if (data.which.rank < child.parent.children[n - 1].children[0].trueRank) {
                        child.moveDown();
                    } else {
                        finished = true;
                    }
                } while (!finished);

                if (card.isClued()) {
                    stats.updateEfficiency(-1);
                }
            }

            // Reveal the card and get rid of the yellow border, if present
            // (this code must be after the efficiency code above)
            card.setBareImage();
            card.hideClues();
        } else if (type === 'reveal') {
            /*
                Has the following data:
                {
                    type: 'reveal',
                    which: {
                        order: 5,
                        rank: 2,
                        suit: 1,
                    },
                }
            */
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            const card = globals.deck[data.which.order];

            const learnedCard = globals.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            card.showOnlyLearned = false;
            card.trueSuit = suit;
            card.trueRank = data.which.rank;
            card.setBareImage();

            card.hideClues();
            card.suitPips.hide();
            card.rankPips.hide();

            if (!globals.animateFast) {
                globals.layers.card.draw();
            }
        } else if (type === 'clue') {
            globals.cluesSpentPlusStrikes += 1;
            stats.updateEfficiency(0);

            const clue = msgClueToClue(data.clue, globals.variant);
            globals.lobby.ui.showClueMatch(-1);

            for (let i = 0; i < data.list.length; i++) {
                const card = globals.deck[data.list[i]];
                if (!card.isClued()) {
                    stats.updateEfficiency(1);
                } else {
                    stats.updateEfficiency(0);
                }
                let color;
                if (clue.type === 0) {
                    // Number (rank) clues
                    color = INDICATOR.POSITIVE;
                } else {
                    // Color clues
                    color = clue.value.hexCode;
                }
                card.setIndicator(true, color);
                card.cluedBorder.show();
                card.applyClue(clue, true);
                card.setBareImage();
            }

            const neglist = [];

            for (let i = 0; i < globals.elements.playerHands[data.target].children.length; i++) {
                const child = globals.elements.playerHands[data.target].children[i];

                const card = child.children[0];
                const { order } = card;

                if (data.list.indexOf(order) < 0) {
                    neglist.push(order);
                    card.applyClue(clue, false);
                    card.setBareImage();
                }
            }

            let clueName;
            if (data.clue.type === CLUE_TYPE.RANK) {
                clueName = clue.value.toString();
            } else {
                clueName = clue.value.name;
            }

            const entry = new HanabiClueEntry({
                width: globals.elements.clueLog.getWidth(),
                height: 0.017 * winH,
                giver: globals.playerNames[data.giver],
                target: globals.playerNames[data.target],
                clueName,
                list: data.list,
                neglist,
                turn: data.turn,
            });

            globals.elements.clueLog.add(entry);

            globals.elements.clueLog.checkExpiry();
        } else if (type === 'status') {
            // Update internal state variables
            globals.clues = data.clues;
            if (globals.variant.name.startsWith('Clue Starved')) {
                // In "Clue Starved" variants, 1 clue is represented on the server by 2
                // Thus, in order to get the "real" clue count, we have to divide by 2
                globals.clues /= 2;
            }
            globals.score = data.score;
            globals.maxScore = data.maxScore;

            // Update the number of clues in the bottom-right hand corner of the screen
            cluesNumberLabel.setText(globals.clues.toString());
            if (globals.clues < 1 || globals.clues === 8) {
                cluesNumberLabel.setFill('#df1c2d'); // Red
            } else if (globals.clues >= 1 && globals.clues < 2) {
                cluesNumberLabel.setFill('#ef8c1d'); // Orange
            } else if (globals.clues >= 2 && globals.clues < 3) {
                cluesNumberLabel.setFill('#efef1d'); // Yellow
            } else {
                cluesNumberLabel.setFill('#d8d5ef'); // White
            }

            if (globals.clues === 8) {
                // Show the red border around the discard pile
                // (to reinforce the fact that being at 8 clues is a special situation)
                noDiscardLabel.show();
                noDoubleDiscardLabel.hide();
            } else if (data.doubleDiscard) {
                // Show a yellow border around the discard pile
                // (to reinforce that this is a "Double Discard" situation)
                noDiscardLabel.hide();
                noDoubleDiscardLabel.show();
            } else {
                noDiscardLabel.hide();
                noDoubleDiscardLabel.hide();
            }

            // Update the score (in the bottom-right-hand corner)
            scoreNumberLabel.setText(globals.score);

            // Update the stats on the middle-left-hand side of the screen
            stats.updatePace();
            stats.updateEfficiency(0);

            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }
        } else if (type === 'stackDirections') {
            // Update the stack directions (only in "Up or Down" variants)
            if (globals.variant.name.startsWith('Up or Down')) {
                for (let i = 0; i < data.directions.length; i++) {
                    const direction = data.directions[i];
                    let text;
                    if (direction === 0) {
                        text = ''; // Undecided
                    } else if (direction === 1) {
                        text = 'Up';
                    } else if (direction === 2) {
                        text = 'Down';
                    } else if (direction === 3) {
                        text = 'Finished';
                    } else {
                        text = 'Unknown';
                    }
                    this.suitLabelTexts[i].setText(text);
                    textLayer.draw();
                }
            }
        } else if (type === 'strike') {
            globals.cluesSpentPlusStrikes += 1;
            stats.updateEfficiency(0);

            const x = new Kinetic.Image({
                x: (0.015 + 0.04 * (data.num - 1)) * winW,
                y: 0.125 * winH,
                width: 0.02 * winW,
                height: 0.036 * winH,
                image: globals.ImageLoader.get('x'),
                opacity: 0,
            });

            // We also record the turn that the strike happened
            x.turn = globals.turn;

            // Click on the x to go to the turn that the strike happened
            x.on('click', function squareClick() {
                if (globals.replay) {
                    replay.checkDisableSharedTurns();
                } else {
                    replay.enter();
                }
                replay.goto(this.turn + 1, true);
            });

            scoreArea.add(x);
            globals.elements.strikes[data.num - 1] = x;

            if (globals.animateFast) {
                x.setOpacity(1.0);
            } else {
                new Kinetic.Tween({
                    node: x,
                    opacity: 1.0,
                    duration: globals.animateFast ? 0.001 : 1.0,
                    runonce: true,
                }).play();
            }
        } else if (type === 'turn') {
            // Store the current turn in memory
            globals.turn = data.num;

            // Keep track of whether or not it is our turn (speedrun)
            globals.ourTurn = (data.who === globals.playerUs);
            if (!globals.ourTurn) {
                // Adding this here to avoid bugs with pre-moves
                clueArea.hide();
            }

            for (let i = 0; i < globals.playerNames.length; i++) {
                nameFrames[i].setActive(data.who === i);
            }

            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }

            turnNumberLabel.setText(`${globals.turn + 1}`);

            if (globals.queuedAction !== null && globals.ourTurn) {
                setTimeout(() => {
                    ui.sendMsg(globals.queuedAction);
                    ui.stopAction();

                    globals.queuedAction = null;
                }, 250);
            }
        } else if (type === 'gameOver') {
            for (let i = 0; i < globals.playerNames.length; i++) {
                nameFrames[i].off('mousemove');
            }

            if (globals.elements.timer1) {
                globals.elements.timer1.hide();
            }

            globals.layers.timer.draw();
            timer.stop();

            // If the game just finished for the players,
            // start the process of transforming it into a shared replay
            if (!globals.replay) {
                globals.replay = true;
                globals.replayTurn = globals.replayMax;
                globals.sharedReplayTurn = globals.replayTurn;
                replayButton.hide();
                // Hide the in-game replay button in the bottom-left-hand corner
            }

            // We could be in the middle of an in-game replay when the game ends,
            // so don't jerk them out of the in-game replay
            if (!globals.inReplay) {
                replay.enter();
            }

            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }
        } else if (type === 'reorder') {
            const hand = globals.elements.playerHands[data.target];
            // TODO: Throw an error if hand and note.hand dont have the same numbers in them

            // Get the LayoutChild objects in the hand and
            // put them in the right order in a temporary array
            const newChildOrder = [];
            const handSize = hand.children.length;
            for (let i = 0; i < handSize; i++) {
                const order = data.handOrder[i];
                const child = globals.deck[order].parent;
                newChildOrder.push(child);

                // Take them out of the hand itself
                child.remove();
            }

            // Put them back into the hand in the new order
            for (let i = 0; i < handSize; i++) {
                const child = newChildOrder[i];
                hand.add(child);
            }
        } else if (type === 'boot') {
            timer.stop();
            globals.game.hide();
        }
    };

    this.handleSpectators = (data) => {
        if (!spectatorsLabel) {
            // Sometimes we can get here without the spectators label being initiated yet
            return;
        }

        // Remember the current list of spectators
        globals.spectators = data.names;

        const shouldShowLabel = data.names.length > 0;
        spectatorsLabel.setVisible(shouldShowLabel);
        spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectatorsNumLabel.setText(data.names.length);

            // Build the string that shows all the names
            const nameEntries = data.names.map(name => `<li>${name}</li>`).join('');
            let content = '<strong>';
            if (globals.replay) {
                content += 'Shared Replay Viewers';
            } else {
                content += 'Spectators';
            }
            content += `:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
            $('#tooltip-spectators').tooltipster('instance').content(content);
        } else {
            $('#tooltip-spectators').tooltipster('close');
        }

        // We might also need to update the content of replay leader icon
        if (globals.sharedReplay) {
            let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
            if (!globals.spectators.includes(globals.sharedReplayLeader)) {
                // Check to see if the leader is away
                content += ' (away)';
            }
            $('#tooltip-leader').tooltipster('instance').content(content);
        }

        globals.layers.UI.batchDraw();
    };

    /*
        Recieved by the client when spectating a game
        Has the following data:
        {
            order: 16,
            note: '<strong>Zamiel:</strong> note1<br /><strong>Duneaught:</strong> note2<br />',
        }
    */
    this.handleNote = (data) => {
        // Set the note
        // (which is the combined notes from all of the players, formatted by the server)
        notes.set(data.order, data.notes, false);

        // Draw (or hide) the note indicator
        const card = globals.deck[data.order];
        if (!card) {
            return;
        }

        // Show or hide the note indicator
        if (data.notes.length > 0) {
            card.noteGiven.show();
            if (!card.noteGiven.rotated) {
                card.noteGiven.rotate(15);
                card.noteGiven.rotated = true;
            }
        } else {
            card.noteGiven.hide();
        }

        globals.layers.card.batchDraw();
    };

    /*
        Recieved by the client when:
        - joining a replay (will get all notes)
        - joining a shared replay (will get all notes)
        - joining an existing game as a spectator (will get all notes)
        - reconnecting an existing game as a player (will only get your own notes)

        Has the following data:
        {
            notes: [
                null,
                null,
                null,
                zamiel: 'g1\nsankala: g1/g2',
            ],
        }
    */
    this.handleNotes = (data) => {
        for (let order = 0; order < data.notes.length; order++) {
            const note = data.notes[order];

            // Set the note
            notes.set(order, note, false);

            // The following code is mosly copied from the "handleNote" function
            // Draw (or hide) the note indicator
            const card = globals.deck[order];
            if (!card) {
                continue;
            }
            if (note !== null && note !== '') {
                card.note = note;
            }
            if (note !== null && note !== '') {
                card.noteGiven.show();
                if (globals.spectating && !card.noteGiven.rotated) {
                    card.noteGiven.rotate(15);
                    card.noteGiven.rotated = true;
                }
            }
        }

        globals.layers.card.batchDraw();
    };

    this.handleReplayLeader = function handleReplayLeader(data) {
        // We might be entering this function after a game just ended
        globals.sharedReplay = true;
        replayExitButton.hide();

        // Update the stored replay leader
        globals.sharedReplayLeader = data.name;

        // Update the UI
        sharedReplayLeaderLabel.show();
        let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
        if (!globals.spectators.includes(globals.sharedReplayLeader)) {
            // Check to see if the leader is away
            content += ' (away)';
        }
        $('#tooltip-leader').tooltipster('instance').content(content);

        sharedReplayLeaderLabelPulse.play();

        globals.elements.toggleSharedTurnButton.show();
        globals.layers.UI.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(data) {
        globals.sharedReplayTurn = data.turn;
        replay.adjustShuttles();
        if (globals.useSharedTurns) {
            replay.goto(globals.sharedReplayTurn);
        } else {
            globals.elements.replayShuttleShared.getLayer().batchDraw();
        }
    };

    this.handleReplayIndicator = (data) => {
        // Ensure that the card exists as a sanity-check
        const indicated = globals.deck[data.order];
        if (!indicated) {
            return;
        }

        // Either show or hide the arrow (if it is already visible)
        const visible = !(
            indicated.indicatorArrow.visible()
            && indicated.indicatorArrow.getFill() === INDICATOR.REPLAY_LEADER
        );
        // (if the arrow is showing but is a different kind of arrow,
        // then just overwrite the existing arrow)
        globals.lobby.ui.showClueMatch(-1);
        indicated.setIndicator(visible, INDICATOR.REPLAY_LEADER);
    };

    this.stopAction = () => {
        clueArea.hide();

        noClueLabel.hide();
        noClueBox.hide();
        noDiscardLabel.hide();
        noDoubleDiscardLabel.hide();

        globals.lobby.ui.showClueMatch(-1);
        globals.elements.clueTargetButtonGroup.off('change');
        globals.elements.clueButtonGroup.off('change');

        // Make all of the cards in our hand not draggable
        // (but we need to keep them draggable if the pre-play setting is enabled)
        if (!globals.lobby.settings.speedrunPreplay) {
            const ourHand = globals.elements.playerHands[globals.playerUs];
            for (let i = 0; i < ourHand.children.length; i++) {
                const child = ourHand.children[i];
                child.off('dragend.play');
                child.setDraggable(false);
            }
        }

        globals.elements.drawDeck.cardback.setDraggable(false);
        globals.elements.deckPlayAvailableLabel.setVisible(false);
    };

    this.endTurn = function endTurn(action) {
        if (globals.ourTurn) {
            ui.sendMsg(action);
            ui.stopAction();
            globals.savedAction = null;
        } else {
            globals.queuedAction = action;
        }
    };

    this.handleAction = function handleAction(data) {
        globals.savedAction = data;

        if (globals.inReplay) {
            return;
        }

        if (data.canClue) {
            // Show the clue UI
            clueArea.show();
        } else {
            noClueLabel.show();
            noClueBox.show();
            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }
        }

        // We have to redraw the UI layer to avoid a bug with the clue UI
        globals.layers.UI.draw();

        if (globals.playerNames.length === 2) {
            // Default the clue recipient button to the only other player available
            globals.elements.clueTargetButtonGroup.list[0].setPressed(true);
        }

        globals.elements.playerHands[globals.playerUs].moveToTop();

        // Set our hand to being draggable
        // (this is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable)
        if (!globals.lobby.settings.speedrunPreplay) {
            const ourHand = globals.elements.playerHands[globals.playerUs];
            for (let i = 0; i < ourHand.children.length; i++) {
                const child = ourHand.children[i];
                child.setDraggable(true);
                child.on('dragend.play', dragendPlay);
            }
        }

        if (globals.deckPlays) {
            globals.elements.drawDeck.cardback.setDraggable(data.canBlindPlayDeck);
            globals.elements.deckPlayAvailableLabel.setVisible(data.canBlindPlayDeck);

            // Ensure the deck is above other cards and UI elements
            if (data.canBlindPlayDeck) {
                globals.elements.drawDeck.moveToTop();
            }
        }

        const checkClueLegal = () => {
            const target = globals.elements.clueTargetButtonGroup.getPressed();
            const clueButton = globals.elements.clueButtonGroup.getPressed();

            if (!target || !clueButton) {
                globals.elements.giveClueButton.setEnabled(false);
                return;
            }

            const who = target.targetIndex;
            const match = globals.lobby.ui.showClueMatch(who, clueButton.clue);

            // By default, only enable the "Give Clue" button if the clue "touched"
            // one or more cards in the hand
            const enabled = match
                // Make an exception if they have the optional setting for "Empty Clues" turned on
                || globals.emptyClues
                // Make an exception for the "Color Blind" variants (color clues touch no cards)
                || (globals.variant.name.startsWith('Color Blind')
                    && clueButton.clue.type === CLUE_TYPE.COLOR)
                // Make an exception for certain characters
                || (globals.characterAssignments[globals.playerUs] === 'Blind Spot'
                    && who === (globals.playerUs + 1) % globals.playerNames.length)
                || (globals.characterAssignments[globals.playerUs] === 'Oblivious'
                    && who === (globals.playerUs - 1 + globals.playerNames.length)
                    % globals.playerNames.length);

            globals.elements.giveClueButton.setEnabled(enabled);
        };

        globals.elements.clueTargetButtonGroup.on('change', checkClueLegal);
        globals.elements.clueButtonGroup.on('change', checkClueLegal);
    };

    const dragendPlay = function dragendPlay() {
        const pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        // Figure out if it currently our turn
        if (ui.overPlayArea(pos)) {
            const action = {
                type: 'action',
                data: {
                    type: ACT.PLAY,
                    target: this.children[0].order,
                },
            };
            ui.endTurn(action);
            if (globals.ourTurn) {
                this.setDraggable(false);
            }
        } else if (
            pos.x >= discardArea.getX()
            && pos.y >= discardArea.getY()
            && pos.x <= discardArea.getX() + discardArea.getWidth()
            && pos.y <= discardArea.getY() + discardArea.getHeight()
            && ui.currentClues !== 8
        ) {
            const action = {
                type: 'action',
                data: {
                    type: ACT.DISCARD,
                    target: this.children[0].order,
                },
            };
            ui.endTurn(action);
            if (globals.ourTurn) {
                this.setDraggable(false);
            }
        } else {
            globals.elements.playerHands[globals.playerUs].doLayout();
        }
    };

    this.setMessage = (msg) => {
        globals.elements.msgLogGroup.addMessage(msg.text);

        globals.elements.messagePrompt.setMultiText(msg.text);
        if (!globals.animateFast) {
            globals.layers.UI.draw();
            globals.layers.overtop.draw();
        }
    };

    this.destroy = function destroy() {
        keyboard.destroy();
        timer.stop();
        globals.stage.destroy();
        // window.removeEventListener('resize', resizeCanvas, false);
    };
}

/*
    End of Hanabi UI
*/

HanabiUI.prototype.handleMessage = function handleMessage(msgType, msgData) {
    const msg = {};
    msg.type = msgType;
    msg.data = msgData;

    if (msgType === 'init') {
        // Game settings
        globals.playerNames = msgData.names;
        globals.variant = constants.VARIANTS[msgData.variant];
        globals.playerUs = msgData.seat;
        globals.spectating = msgData.spectating;
        globals.replay = msgData.replay;
        globals.sharedReplay = msgData.sharedReplay;

        // Optional settings
        globals.timed = msgData.timed;
        globals.baseTime = msgData.baseTime;
        globals.timePerTurn = msgData.timePerTurn;
        globals.deckPlays = msgData.deckPlays;
        globals.emptyClues = msgData.emptyClues;
        globals.characterAssignments = msgData.characterAssignments;
        globals.characterMetadata = msgData.characterMetadata;

        globals.inReplay = globals.replay;
        if (globals.replay) {
            globals.replayTurn = -1;
        }

        // Begin to load all of the card images
        globals.ImageLoader.start();
    } else if (msgType === 'advanced') {
        this.replayAdvanced();
    } else if (msgType === 'connected') {
        this.showConnected(msgData.list);
    } else if (msgType === 'notify') {
        this.saveReplay(msg);

        if (!globals.inReplay || msgData.type === 'reveal' || msgData.type === 'boot') {
            this.handleNotify(msgData);
        }
    } else if (msgType === 'action') {
        globals.lastAction = msgData;
        this.handleAction.call(this, msgData);

        if (globals.animateFast) {
            return;
        }

        if (globals.lobby.settings.sendTurnNotify) {
            globals.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        // This is used to update the names of the people currently spectating the game
        this.handleSpectators.call(this, msgData);
    } else if (msgType === 'clock') {
        // Update the clocks to show how much time people are taking
        // or how much time people have left
        timer.update(msgData);
    } else if (msgType === 'note') {
        // This is used for spectators
        this.handleNote.call(this, msgData);
    } else if (msgType === 'notes') {
        // This is a list of all of your notes, sent upon reconnecting to a game
        this.handleNotes.call(this, msgData);
    } else if (msgType === 'replayLeader') {
        // This is used in shared replays
        this.handleReplayLeader.call(this, msgData);
    } else if (msgType === 'replayTurn') {
        // This is used in shared replays
        this.handleReplayTurn.call(this, msgData);
    } else if (msgType === 'replayIndicator') {
        // This is used in shared replays
        if (globals.sharedReplayLeader === globals.lobby.username) {
            // We don't have to draw any arrows;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        this.handleReplayIndicator.call(this, msgData);
    } else if (msgType === 'replayMorph') {
        // This is used in shared replays to make hypothetical game states
        if (globals.sharedReplayLeader === globals.lobby.username) {
            // We don't have to reveal anything;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        const revealMsg = {
            type: 'reveal',
            which: {
                order: msgData.order,
                rank: msgData.rank,
                suit: msgData.suit,
            },
        };
        this.handleNotify(revealMsg);
    } else if (msgType === 'replaySound') {
        // This is used in shared replays to make fun sounds
        if (globals.sharedReplayLeader === globals.lobby.username) {
            // We don't have to play anything;
            // we already did it manually after sending the "replayAction" message
            return;
        }

        globals.game.sounds.play(msgData.sound);
    }
};

HanabiUI.prototype.sendMsg = function sendMsg(msg) {
    const { type } = msg;
    const { data } = msg;
    globals.lobby.conn.send(type, data);
};

HanabiUI.prototype.updateChatLabel = function updateChatLabel() {
    let text = 'Chat';
    if (globals.lobby.chatUnread > 0) {
        text += ` (${globals.lobby.chatUnread})`;
    }
    globals.elements.chatButton.setText(text);
    globals.layers.UI.draw();
};

HanabiUI.prototype.toggleChat = function toggleChat() {
    globals.game.chat.toggle();
};

// Expose the globals to functions in the "game" directory
HanabiUI.prototype.globals = globals;

module.exports = HanabiUI;

},{"../../constants":3,"./button":9,"./buttonGroup":10,"./card":11,"./cardDeck":12,"./cardDraw":13,"./cardLayout":14,"./cardStack":15,"./clueEntry":16,"./clueLog":17,"./clueRecipientButton":18,"./colorButton":19,"./fitText":20,"./globals":21,"./globalsInit":22,"./keyboard":23,"./layoutChild":24,"./loader":25,"./msgLog":26,"./multiFitText":27,"./nameFrame":28,"./notes":29,"./numberButton":30,"./replay":31,"./stats":32,"./timer":33,"./toggleButton":34}],36:[function(require,module,exports){
// Configuration
const debug = true;
const fadeTime = 350;

// Exported global variables
const globals = {
    debug,
    fadeTime,
    browserIsFirefox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,

    username: null,
    password: null,

    conn: null, // The websocket connection (set in "websocket.js")

    userList: {}, // Set upon login
    tableList: {}, // Set upon login
    historyList: {}, // Set upon login
    historyDetailList: [], // Set upon clicking the "History Details" button
    historyClicked: false,
    // Used to keep track of whether the user clicked on the "Show More History" button
    totalGames: 0, // Set upon login
    randomName: '', // Set upon login

    // The lobby settings found in the gear sub-menu
    settings: {
        sendTurnNotify: false,
        sendTurnSound: true, // We want sounds by default
        sendTimerSound: true, // We want sounds by default
        sendChatNotify: false,
        sendChatSound: false,
        showBGAUI: false,
        showColorblindUI: false,
        showTimerInUntimed: false,
        reverseHands: false,
        speedrunPreplay: false,
        speedrunHotkeys: false,
    },

    gameID: null,
    game: {}, // Equal to the data for the "game" command
    init: {}, // Equal to the data for the "init" command
    state: { // Variables that represent the current game state
        activeIndex: 0,
        deck: [],
    },

    currentScreen: 'login',
    errorOccured: false,

    /*
    app: null, // This is the canvas container initialized in "game/init.js"
    resources: null, // This contains the loaded graphics, initialized in "game/init.js"
    ui: null, // This contains UI variables and objects, initialized in "game/init.js"
    */
    ui: null, // This contains the HanabiUI object (legacy)

    chatUnread: 0, // Used to keep track of how many in-game chat messages are currently unread
};
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals = globals;

},{}],37:[function(require,module,exports){
/*
    The "Create Game" nav button
*/

// Imports
const globals = require('../globals');
const constants = require('../constants');
const misc = require('../misc');

$(document).ready(() => {
    // Populate the variant dropdown in the "Create Game" tooltip
    for (const variant of Object.keys(constants.VARIANTS)) {
        const option = new Option(variant, variant);
        $('#create-game-variant').append($(option));
    }

    // Make the extra time fields appear and disappear depending on whether the checkbox is checked
    $('#create-game-timed').change(() => {
        if ($('#create-game-timed').prop('checked')) {
            $('#create-game-timed-label').removeClass('col-3');
            $('#create-game-timed-label').addClass('col-2');
            $('#create-game-timed-option-1').show();
            $('#create-game-timed-option-2').show();
            $('#create-game-timed-option-3').show();
            $('#create-game-timed-option-4').show();
        } else {
            $('#create-game-timed-label').addClass('col-3');
            $('#create-game-timed-label').removeClass('col-2');
            $('#create-game-timed-option-1').hide();
            $('#create-game-timed-option-2').hide();
            $('#create-game-timed-option-3').hide();
            $('#create-game-timed-option-4').hide();
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });

    $('#create-game-tooltip').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#create-game-submit').click();
        }
    });

    $('#create-game-submit').on('click', submit);
});

const submit = (event) => {
    event.preventDefault();

    const name = $('#create-game-name').val();

    const variant = $('#create-game-variant').val();
    localStorage.setItem('createTableVariant', variant);

    const timed = document.getElementById('create-game-timed').checked;
    localStorage.setItem('createTableTimed', timed);

    const baseTimeMinutes = $('#base-time-minutes').val();
    localStorage.setItem('baseTimeMinutes', baseTimeMinutes);

    const timePerTurnSeconds = $('#time-per-turn-seconds').val();
    localStorage.setItem('timePerTurnSeconds', timePerTurnSeconds);

    const deckPlays = document.getElementById('create-game-deck-plays').checked;
    localStorage.setItem('createTableDeckPlays', deckPlays);

    const emptyClues = document.getElementById('create-game-empty-clues').checked;
    localStorage.setItem('createTableEmptyClues', emptyClues);

    const characterAssignments = document.getElementById('create-game-character-assignments').checked;
    localStorage.setItem('createTableCharacterAssignments', characterAssignments);

    let password = $('#create-game-password').val();
    localStorage.setItem('createTablePassword', password);
    if (password !== '') {
        password = hex_sha256(`Hanabi game password ${password}`);
    }

    const alertWaiters = document.getElementById('create-game-alert-waiters').checked;
    localStorage.setItem('createTableAlertWaiters', alertWaiters);

    globals.conn.send('gameCreate', {
        name,
        variant,
        timed,
        baseTime: Math.round(baseTimeMinutes * 60), // The server expects this in seconds
        timePerTurn: parseInt(timePerTurnSeconds, 10), // The server expects this in seconds
        deckPlays,
        emptyClues,
        characterAssignments,
        password,
        alertWaiters,
    });

    misc.closeAllTooltips();
};

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
exports.ready = () => {
    // Fill in the "Name" box
    $('#create-game-name').val(globals.randomName);

    // Get a new random name from the server for the next time we click the button
    globals.conn.send('getName');

    if (globals.username.startsWith('test')) {
        $('#create-game-name').val('test game');
    }

    // Fill in the "Variant" dropdown
    let variant = localStorage.getItem('createTableVariant');
    if (typeof variant !== 'string') {
        variant = 'No Variant';
    }
    $('#create-game-variant').val(variant);

    // Fill in the "Timed" checkbox
    let timed;
    try {
        timed = JSON.parse(localStorage.getItem('createTableTimed'));
    } catch (err) {
        timed = false;
    }
    if (typeof timed !== 'boolean') {
        timed = false;
    }
    $('#create-game-timed').prop('checked', timed);
    $('#create-game-timed').change();

    // Fill in the "Base Time" box
    let baseTimeMinutes = localStorage.getItem('baseTimeMinutes');
    // (we don't want to do "JSON.parse()" here because it may not be a whole number)
    if (baseTimeMinutes === null || baseTimeMinutes < 0) {
        baseTimeMinutes = 2;
    }
    $('#base-time-minutes').val(baseTimeMinutes);

    // Fill in the "Time Per Turn" box
    let timePerTurnSeconds;
    try {
        timePerTurnSeconds = JSON.parse(localStorage.getItem('timePerTurnSeconds'));
    } catch (err) {
        timePerTurnSeconds = 20;
    }
    if (typeof timePerTurnSeconds !== 'number' || timePerTurnSeconds < 0) {
        timePerTurnSeconds = 20;
    }
    $('#time-per-turn-seconds').val(timePerTurnSeconds);

    // Fill in the "Allow Bottom-Deck Blind Plays" checkbox
    let deckPlays;
    try {
        deckPlays = JSON.parse(localStorage.getItem('createTableDeckPlays'));
    } catch (err) {
        deckPlays = false;
    }
    if (typeof deckPlays !== 'boolean') {
        deckPlays = false;
    }
    $('#create-game-deck-plays').prop('checked', deckPlays);

    // Fill in the "Allow Empty Clues" checkbox
    let emptyClues;
    try {
        emptyClues = JSON.parse(localStorage.getItem('createTableEmptyClues'));
    } catch (err) {
        emptyClues = false;
    }
    if (typeof emptyClues !== 'boolean') {
        emptyClues = false;
    }
    $('#create-game-empty-clues').prop('checked', emptyClues);

    // Fill in the "Detrimental Character Assignments" checkbox
    let characterAssignments;
    try {
        characterAssignments = JSON.parse(localStorage.getItem('createTableCharacterAssignments'));
    } catch (err) {
        characterAssignments = false;
    }
    if (typeof characterAssignments !== 'boolean') {
        characterAssignments = false;
    }
    $('#create-game-character-assignments').prop('checked', characterAssignments);

    // Fill in the "Password" box
    const password = localStorage.getItem('createTablePassword');
    $('#create-game-password').val(password);

    // Fill in the "Alert people" box
    let alertWaiters;
    try {
        alertWaiters = JSON.parse(localStorage.getItem('createTableAlertWaiters'));
    } catch (err) {
        alertWaiters = false;
    }
    if (typeof alertWaiters !== 'boolean') {
        alertWaiters = false;
    }
    $('#create-game-alert-waiters').prop('checked', alertWaiters);

    // Focus the "Name" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the above code)
    setTimeout(() => {
        $('#create-game-name').focus();
    }, 1);
};

},{"../constants":3,"../globals":36,"../misc":49}],38:[function(require,module,exports){
/*
    The screens that show past games and other scores
*/

// Imports
const globals = require('../globals');
const constants = require('../constants');
const lobby = require('./main');

$(document).ready(() => {
    $('#lobby-history-show-more').on('click', (event) => {
        event.preventDefault();
        globals.historyClicked = true;
        globals.conn.send('historyGet', {
            offset: Object.keys(globals.historyList).length,
            amount: 10,
        });
    });
});

exports.show = () => {
    $('#lobby-history').show();
    $('#lobby-top-half').hide();
    $('#lobby-separator').hide();
    $('#lobby-bottom-half').hide();
    lobby.nav.show('history');
    lobby.history.draw();
};

exports.hide = () => {
    $('#lobby-history').hide();
    $('#lobby-history-details').hide();
    $('#lobby-top-half').show();
    $('#lobby-separator').show();
    $('#lobby-bottom-half').show();
    lobby.nav.show('games');
};

exports.draw = () => {
    const tbody = $('#lobby-history-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Handle if the user has no history
    const ids = Object.keys(globals.historyList).map(i => parseInt(i, 10));
    // JavaScript keys come as strings, so we need to convert them to integers

    if (ids.length === 0) {
        $('#lobby-history-no').show();
        $('#lobby-history').addClass('align-center-v');
        $('#lobby-history-table-container').hide();
        return;
    }
    $('#lobby-history-no').hide();
    $('#lobby-history').removeClass('align-center-v');
    $('#lobby-history-table-container').show();

    // Sort the game IDs in reverse order (so that the most recent ones are near the top)
    ids.sort();
    ids.reverse();

    // Add all of the history
    for (let i = 0; i < ids.length; i++) {
        const gameData = globals.historyList[ids[i]];
        const { maxScore } = constants.VARIANTS[gameData.variant];

        const row = $('<tr>');

        // Column 1 - Game ID
        $('<td>').html(`#${ids[i]}`).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(gameData.numPlayers).appendTo(row);

        // Column 3 - Score
        $('<td>').html(`${gameData.score}/${maxScore}`).appendTo(row);

        // Column 4 - Variant
        $('<td>').html(gameData.variant).appendTo(row);

        // Column 5 - Time Completed
        const timeCompleted = dateTimeFormatter.format(new Date(gameData.datetime));
        $('<td>').html(timeCompleted).appendTo(row);

        // Column 6 - Watch Replay
        const watchReplayButton = makeReplayButton(ids[i], 'Watch Replay', 'replayCreate', false);
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 7 - Share Replay
        const shareReplayButton = makeReplayButton(ids[i], 'Share Replay', 'sharedReplayCreate', true);
        $('<td>').html(shareReplayButton).appendTo(row);

        // Column 8 - Other Scores
        const otherScoresButton = makeHistoryDetailsButton(ids[i], gameData.numSimilar);
        $('<td>').html(otherScoresButton).appendTo(row);

        // Column 9 - Other Players
        $('<td>').html(gameData.otherPlayerNames).appendTo(row);

        row.appendTo(tbody);
    }

    // Don't show the "Show More History" if we don't have 10 games played
    // (there is a small bug here where if a user has exactly 10 games played
    // then the button will erroneously show and not do anything when clicked)
    if (ids.length < 10) {
        $('#lobby-history-show-more').hide();
    } else {
        $('#lobby-history-show-more').show();
    }
};

const makeReplayButton = (id, text, msgType, returnsToLobby) => {
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    if (text === 'Watch Replay') {
        text = '<i class="fas fa-eye lobby-button-icon"></i>';
    } else if (text === 'Share Replay') {
        text = '<i class="fas fa-users lobby-button-icon"></i>';
    }
    button.html(text);
    button.addClass('history-table');
    button.addClass('enter-history-game');
    button.attr('id', `replay-${id}`);

    button.on('click', (event) => {
        event.preventDefault();
        globals.gameID = id;
        globals.conn.send(msgType, {
            gameID: globals.gameID,
        });
        if (returnsToLobby) {
            lobby.history.hide();
        }
    });

    return button;
};

const makeHistoryDetailsButton = (id, gameCount) => {
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    button.html(`<i class="fas fa-chart-bar lobby-button-icon"></i>&nbsp; ${gameCount - 1}`);
    if (gameCount - 1 === 0) {
        button.addClass('disabled');
    }
    button.attr('id', `history-details-${id}`);

    button.on('click', (event) => {
        event.preventDefault();
        globals.gameID = id;
        globals.conn.send('historyDetails', {
            gameID: globals.gameID,
        });
        lobby.history.showDetails();
    });

    return button;
};

exports.showDetails = () => {
    $('#lobby-history').hide();
    $('#lobby-history-details').show();
    lobby.nav.show('history-details');

    // The server will send us messages to populate this array momentarily
    globals.historyDetailList = [];
};

exports.hideDetails = () => {
    $('#lobby-history').show();
    $('#lobby-history-details').hide();
    lobby.nav.show('history');
};

// This function is called once for each new history element received from the server
// The last message is not marked, so each iteration redraws all historyDetailList items
exports.drawDetails = () => {
    const tbody = $('#lobby-history-details-table-tbody');

    if (!globals.historyDetailList.length) {
        tbody.text('Loading...');
        return;
    }

    // Clear all of the existing rows
    tbody.html('');

    // The game played by the user will also include its variant
    const variant = globals.historyDetailList
        .filter(g => g.id in globals.historyList)
        .map(g => globals.historyList[g.id].variant)
        .map(v => constants.VARIANTS[v])[0];

    // The game played by the user might not have been sent by the server yet
    if (variant === undefined) {
        // If not, the variant is not known yet, so defer drawing
        return;
    }

    // Add all of the games
    for (let i = 0; i < globals.historyDetailList.length; i++) {
        const gameData = globals.historyDetailList[i];

        const row = $('<tr>');

        // Column 1 - Game ID
        let id = `#${gameData.id}`;
        if (gameData.you) {
            id = `<strong>${id}</strong>`;
        }
        $('<td>').html(id).appendTo(row);

        // Column 2 - Score
        let score = `${gameData.score}/${variant.maxScore}`;
        if (gameData.you) {
            score = `<strong>${score}</strong>`;
        }
        $('<td>').html(score).appendTo(row);

        // Column 3 - Time Completed
        let dateTime = dateTimeFormatter.format(new Date(gameData.datetime));
        if (gameData.you) {
            dateTime = `<strong>${dateTime}</strong>`;
        }
        $('<td>').html(dateTime).appendTo(row);

        // Column 4 - Watch Replay
        const watchReplayButton = makeReplayButton(gameData.id, 'Watch Replay', 'replayCreate', false);
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 5 - Share Replay
        const shareReplayButton = makeReplayButton(gameData.id, 'Share Replay', 'sharedReplayCreate', false);
        $('<td>').html(shareReplayButton).appendTo(row);

        // Column 6 - Other Players
        let otherPlayers = gameData.otherPlayerNames;
        if (gameData.you) {
            otherPlayers = `<strong>${globals.username}, ${otherPlayers}</strong>`;
        }
        $('<td>').html(otherPlayers).appendTo(row);

        row.appendTo(tbody);
    }
};

const dateTimeFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    },
);

},{"../constants":3,"../globals":36,"./main":41}],39:[function(require,module,exports){
/*
    Lobby keyboard shortcuts
*/

// Imports
const globals = require('../globals');

$(document).keydown((event) => {
    if (globals.currentScreen !== 'lobby') {
        return;
    }

    if (event.altKey && event.key === 'c') { // Alt + c
        // Click the "Create Game" button
        $('#nav-buttons-games-create-game').click();
    } else if (event.altKey && event.key === 'h') { // Alt + h
        // Click the "Show History" button
        $('#nav-buttons-games-history').click();
    } else if (event.altKey && event.key === 'o') { // Alt + o
        // Click the "Sign Out" button
        $('#nav-buttons-games-sign-out').click();
    } else if (event.altKey && event.key === 's') { // Alt + s
        // Click on the "Start Game" button
        $('#nav-buttons-game-start').click();
    } else if (event.altKey && event.key === 'l') { // Alt + l
        // Click on the "Leave Game" button
        $('#nav-buttons-pregame-leave').click();
    } else if (event.altKey && event.key === 'r') { // Alt + r
        // Click on the "Return to Lobby" button
        // (either at the "game" screen or the "history" screen or the "scores" screen)
        if ($('#nav-buttons-pregame-unattend').is(':visible')) {
            $('#nav-buttons-pregame-unattend').click();
        } else if ($('#nav-buttons-history-return').is(':visible')) {
            $('#nav-buttons-history-return').click();
        } else if ($('#nav-buttons-history-details-return').is(':visible')) {
            $('#nav-buttons-history-details-return').click();
        }
    } else if (event.altKey && event.key === 'w') { // Alt + w
        // Click on the "Watch Replay by ID" button
        $('a.nav-buttons-history-by-id[data-replayType="replayCreate"]').click();
    } else if (event.altKey && event.key === 'e') { // Alt + e
        // Click on the "Share Replay by ID" button
        $('a.nav-buttons-history-by-id[data-replayType="sharedReplayCreate"]').click();
    }
});

},{"../globals":36}],40:[function(require,module,exports){
/*
    The initial login page
*/

// Imports
const globals = require('../globals');
const websocket = require('../websocket');
const lobby = require('./main');

$(document).ready(() => {
    $('#login-button').click((event) => {
        event.preventDefault();
        $('#login-form').submit();
    });
    $('#login-form').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#login-form').submit();
        }
    });
    $('#login-form').submit(submit);

    // Make the tooltip for the Discord icon at the bottom of the screen
    let discordContent = 'Discord is a voice and text chat application that you can run in a';
    discordContent += 'browser.<br />If the server is down, you can probably find out why in the';
    discordContent += 'Hanabi server / chat room.';
    $('#title-discord').tooltipster({
        theme: 'tooltipster-shadow',
        delay: 0,
        content: discordContent,
        contentAsHTML: true,
    });

    // Check to see if we have accepted the Firefox warning
    // (cookies are strings, so we cannot check for equality)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
        $('#sign-in').hide();
        $('#firefox-warning').show();
    }
    $('#firefox-warning-button').click(() => {
        localStorage.setItem('acceptedFirefoxWarning', 'true');
        $('#firefox-warning').hide();
        $('#sign-in').show();
    });

    automaticLogin();
});

const submit = (event) => {
    // By default, the form will reload the page, so stop this from happening
    event.preventDefault();

    const username = $('#login-username').val();
    const passwordPlaintext = $('#login-password').val();

    if (!username) {
        formError('You must provide a username.');
        return;
    }
    if (!passwordPlaintext) {
        formError('You must provide a password.');
        return;
    }

    // We salt the password with a prefix of "Hanabi password "
    // and then hash it with SHA256 before sending it to the server
    const password = hex_sha256(`Hanabi password ${passwordPlaintext}`);

    localStorage.setItem('hanabiuser', username);
    localStorage.setItem('hanabipass', password);

    globals.username = username;
    globals.password = password;

    send();
};

const formError = (msg) => {
    // For some reason this has to be invoked asycnronously in order to work properly
    setTimeout(() => {
        $('#login-ajax').hide();
        $('#login-button').removeClass('disabled');
        $('#login-alert').html(msg);
        $('#login-alert').fadeIn(globals.fadeTime);
    }, 0);
};

const send = () => {
    $('#login-button').addClass('disabled');
    $('#login-explanation').hide();
    $('#login-ajax').show();

    // Send a login request to the server; if successful, we will get a cookie back
    let url = `${window.location.protocol}//${window.location.hostname}`;
    if (window.location.port !== '') {
        url += `:${window.location.port}`;
    }
    url += '/login';
    const postData = {
        username: globals.username,
        password: globals.password,
    };
    const request = $.ajax({
        url,
        type: 'POST',
        data: postData,
    });
    console.log(`Sent a login request to: ${url}`);

    request.done(() => {
        // We successfully got a cookie; attempt to establish a WebSocket connection
        websocket.set();
    });
    request.fail((jqXHR) => {
        formError(`Login failed: ${getAjaxError(jqXHR)}`);
    });
};

const getAjaxError = (jqXHR) => {
    if (jqXHR.readyState === 0) {
        return 'A network error occured. The server might be down!';
    }
    if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }
    return jqXHR.responseText;
};

const automaticLogin = () => {
    // Don't automatically login if they are on Firefox and have not confirmed the warning dialog
    // (cookies are strings, so we cannot check for equality)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
        return;
    }

    // Automatically sign in to the WebSocket server if we have cached credentials
    globals.username = localStorage.getItem('hanabiuser');
    globals.password = localStorage.getItem('hanabipass');
    if (globals.username) {
        $('#login-username').val(globals.username);
        $('#login-password').focus();
    }

    if (!globals.username || !globals.password) {
        return;
    }
    console.log('Automatically logging in from cookie credentials.');
    send();
};

exports.hide = (firstTimeUser) => {
    // Hide the login screen
    $('#login').hide();

    if (firstTimeUser) {
        $('#tutorial').fadeIn(globals.fadeTime);
        return;
    }

    // Show the lobby
    globals.currentScreen = 'lobby';
    $('#lobby').show();
    $('#lobby-history').hide();
    // We can't hide this element by default in "index.html" or else the "No game history" text
    // will not be centered
    lobby.nav.show('games');
    lobby.users.draw();
    lobby.tables.draw();
    $('#lobby-chat-input').focus();
};

},{"../globals":36,"../websocket":52,"./main":41}],41:[function(require,module,exports){
/*
    The lobby is composed of all of the UI elements that don't have to do with the game itself
*/

exports.createGame = require('./createGame');
exports.history = require('./history');
exports.keyboard = require('./keyboard');
exports.login = require('./login');
exports.nav = require('./nav');
exports.pregame = require('./pregame');
exports.settings = require('./settings');
exports.tables = require('./tables');
require('./tutorial');
exports.users = require('./users');

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.lobby = exports;

},{"./createGame":37,"./history":38,"./keyboard":39,"./login":40,"./nav":42,"./pregame":43,"./settings":44,"./tables":45,"./tutorial":46,"./users":47}],42:[function(require,module,exports){
/*
    The navigation bar at the top of the lobby
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');
const modals = require('../modals');
const lobby = require('./main');

$(document).ready(() => {
    // Initialize all of the navigation tooltips using Tooltipster
    initTooltips();

    // The "Create Game" button
    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', lobby.createGame.ready);

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', (event) => {
        event.preventDefault();
        lobby.history.show();
    });

    // The "Help" button
    // (this is just a simple link)

    // The "Resources" button
    // (initialized in the "initTooltips()" function)

    // The "Settings" button
    // (initialized in the "initTooltips()" function)

    // The "Sign Out" button
    $('#nav-buttons-games-sign-out').on('click', (event) => {
        event.preventDefault();
        localStorage.removeItem('hanabiuser');
        localStorage.removeItem('hanabipass');
        window.location.reload();
    });

    // The "Start Game" button
    $('#nav-buttons-pregame-start').on('click', (event) => {
        event.preventDefault();
        if ($('#nav-buttons-pregame-start').hasClass('disabled')) {
            return;
        }
        globals.conn.send('gameStart');
    });

    // The "Return to Lobby" button (from the "Pregame" screen)
    $('#nav-buttons-pregame-unattend').on('click', (event) => {
        event.preventDefault();
        lobby.pregame.hide();
        globals.conn.send('gameUnattend');
    });

    // The "Leave Game" button
    $('#nav-buttons-pregame-leave').on('click', (event) => {
        event.preventDefault();
        globals.conn.send('gameLeave');
    });

    // "Watch Replay by ID" and "Share Replay by ID" buttons
    $('.nav-buttons-history-by-id').on('click', (event) => {
        event.preventDefault();
        const subtype = event.currentTarget.getAttribute('data-display');
        const replayID = window.prompt(`What is the ID of the game you want to ${subtype}?`);
        if (replayID === null) {
            // The user clicked the "cancel" button, so do nothing else
            return;
        }

        globals.conn.send(event.currentTarget.getAttribute('data-replayType'), {
            gameID: parseInt(replayID, 10),
        });
    });

    // The "Return to Lobby" button (from the "History" screen)
    $('#nav-buttons-history-return').on('click', (event) => {
        event.preventDefault();
        lobby.history.hide();
    });

    // The "Return to History" button (from the "History Details" screen)
    $('#nav-buttons-history-details-return').on('click', (event) => {
        event.preventDefault();
        lobby.history.hideDetails();
    });
});

const initTooltips = () => {
    const tooltips = [
        'create-game',
        'resources',
        'settings',
    ];

    const tooltipsterOptions = {
        theme: 'tooltipster-shadow',
        trigger: 'click',
        interactive: true,
        delay: 0,
        /*
            The "create-game" tooltip is too large for very small resolutions and will wrap off the
            screen. We can use a Tooltipster plugin to automatically create a scroll bar for it.
            https://github.com/louisameline/tooltipster-scrollableTip
        */
        plugins: ['sideTip', 'scrollableTip'],
        functionBefore: () => {
            $('#lobby').fadeTo(globals.fadeTime, 0.4);
        },
    };

    const tooltipsterClose = () => {
        /*
            We want to fade in the background as soon as we start the tooltip closing animation,
            so we have to hook to the "close" event. Furthermore, we don't want to fade in the
            background if we click from one tooltip to the other, so we have to check to see how
            many tooltips are open. If one tooltip is open, then it is the one currently closing.
            If two tooltips are open, then we are clicking from one to the next.
        */
        let tooltipsOpen = 0;
        for (const tooltip of tooltips) {
            if ($(`#nav-buttons-games-${tooltip}`).tooltipster('status').open) {
                tooltipsOpen += 1;
            }
        }
        if (tooltipsOpen <= 1) {
            $('#lobby').fadeTo(globals.fadeTime, 1);
        }
    };

    // Map the escape key to close all tooltips / modals
    $(document).keydown((event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            misc.closeAllTooltips();
            modals.closeAll();
        }
    });

    // The "close" event will not fire if we initialize this on the tooltip class for some reason,
    // so we initialize all 3 individually
    for (const tooltip of tooltips) {
        $(`#nav-buttons-games-${tooltip}`)
            .tooltipster(tooltipsterOptions)
            .tooltipster('instance')
            .on('close', tooltipsterClose);
    }
};

exports.show = (target) => {
    const navTypes = [
        'games',
        'pregame',
        'history',
        'history-details',
    ];
    for (const navType of navTypes) {
        $(`#nav-buttons-${navType}`).hide();
    }
    if (target !== 'nothing') {
        $(`#nav-buttons-${target}`).show();
    }
};

},{"../globals":36,"../misc":49,"../modals":50,"./main":41}],43:[function(require,module,exports){
/*
   The lobby area that shows all of the players in the current unstarted game
*/

// Imports
const globals = require('../globals');
const constants = require('../constants');
const misc = require('../misc');
const lobby = require('./main');

exports.show = () => {
    // Replace the list of current games with a list of the current players
    $('#lobby-pregame').show();
    $('#lobby-games').hide();

    // Add an extra chat box
    $('#lobby-chat-container').removeClass('col-8');
    $('#lobby-chat-container').addClass('col-4');
    $('#lobby-chat-pregame-container').show();

    // Clear the pregame chat box of any previous content
    $('#lobby-chat-pregame-text').html('');

    // Scroll to the bottom of both chat boxes
    const chat1 = document.getElementById('lobby-chat-text');
    chat1.scrollTop = chat1.scrollHeight;
    const chat2 = document.getElementById('lobby-chat-pregame-text');
    chat2.scrollTop = chat2.scrollHeight;

    // Adjust the top navigation bar
    lobby.nav.show('pregame');
    $('#nav-buttons-pregame-start').addClass('disabled');
    // (the server will send us a "tableReady" message momentarily if
    // we need to enable the "Start Game" button)
};

exports.hide = () => {
    // Replace the list of current players with a list of the current games
    $('#lobby-pregame').hide();
    $('#lobby-games').show();

    // Remove the extra chat box
    $('#lobby-chat-container').addClass('col-8');
    $('#lobby-chat-container').removeClass('col-4');
    $('#lobby-chat-pregame-container').hide();

    // Adjust the navigation bar
    lobby.nav.show('games');
};

exports.draw = () => {
    // Update the "Start Game" button
    $('#nav-buttons-game-start').addClass('disabled');

    // Update the information on the left-hand side of the screen
    $('#lobby-pregame-name').text(globals.game.name);
    $('#lobby-pregame-variant').text(globals.game.variant);

    const optionsTitle = $('#lobby-pregame-options-title');
    optionsTitle.text('Options:');
    const options = $('#lobby-pregame-options');
    options.text('');
    if (globals.game.timed) {
        let text = 'Timed (';
        text += misc.timerFormatter(globals.game.baseTime);
        text += ' + ';
        text += misc.timerFormatter(globals.game.timePerTurn);
        text += ')';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.deckPlays) {
        const text = 'Bottom-deck Blind Plays';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.emptyClues) {
        const text = 'Empty Clues';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.characterAssignments) {
        const text = 'Character Assignments';
        $('<li>').html(text).appendTo(options);
    }
    if (globals.game.password) {
        const text = 'Password-protected';
        $('<li>').html(text).appendTo(options);
    }
    if (options.text() === '') {
        optionsTitle.text('');
    }

    // Draw the player boxes
    const numPlayers = globals.game.players.length;
    for (let i = 0; i <= 5; i++) {
        const div = $(`#lobby-pregame-player-${(i + 1)}`);

        const player = globals.game.players[i];
        if (!player) {
            div.html('');
            div.hide();
            continue;
        }

        div.show();

        let html = `
            <p class="margin0 padding0p5">
                <strong>${player.name}</strong>
            </p>
        `;

        // There is not enough room to draw the full box for 6 players
        if (numPlayers === 6) {
            div.removeClass('col-2');
            div.addClass('lobby-pregame-col');
        } else {
            div.addClass('col-2');
            div.removeClass('lobby-pregame-col');
        }

        // Calculate some stats
        const averageScore = Math.round(player.stats.averageScore * 100) / 100;
        // (round it to 2 decimal places)
        let strikeoutRate = player.stats.strikeoutRate * 100;
        // (turn it into a percent)
        strikeoutRate = Math.round(strikeoutRate * 100) / 100;
        // (round it to 2 decimal places)
        const maxScore = 5 * constants.VARIANTS[globals.game.variant].suits.length;

        html += `
            <div class="row">
                <div class="col-10">
                    Total games:
                </div>
                <div class="col-2 align-right padding0">
                    ${player.stats.numPlayedAll}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    ...of this variant:
                </div>
                <div class="col-2 align-right padding0">
                    ${player.stats.numPlayed}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    Average score:
                </div>
                <div class="col-2 align-right padding0">
                    ${averageScore}
                </div>
            </div>
            <div class="row">
                <div class="col-10">
                    Strikeout rate:
                </div>
                <div class="col-2 align-right padding0">
                    ${strikeoutRate}%
                </div>
            </div>
        `;
        if (numPlayers > 1) {
            html += `
                <div class="row">
                    <div class="col-10">
                        ${numPlayers}-player best score:
                    </div>
                    <div class="col-2 align-right padding0">
                        ${player.stats.bestScores[numPlayers - 2].score}
                    </div>
                </div>
            `;
        }
        html += `
            <div class="row">
                <div class="col-10">
                    ${numPlayers === 1 ? 'B' : 'Other b'}est scores:
                </div>
                <div class="col-2 align-right padding0">
                    <i id="lobby-pregame-player-${i + 1}-scores-icon" class="fas fa-chart-area green" data-tooltip-content="#lobby-pregame-player-${i + 1}-tooltip"></i>
                </div>
            </div>
            <div class="hidden">
                <div id="lobby-pregame-player-${i + 1}-tooltip" class="lobby-pregame-tooltip">
        `;
        for (let j = 2; j <= 6; j++) {
            html += '<div class="row">';
            html += `<div class="col-6">${j}-player:</div>`;
            const bestScoreObject = player.stats.bestScores[j - 2];
            const bestScore = bestScoreObject.score;
            const bestScoreMod = bestScoreObject.modifier;
            html += '<div class="col-6">';
            if (bestScore === maxScore) {
                html += '<strong>';
            }
            html += ` ${bestScore} / ${maxScore}`;
            if (bestScore === maxScore) {
                html += '</strong> &nbsp; ';
                if (bestScoreMod === 0) {
                    html += '<i class="fas fa-check score-modifier green"></i>';
                } else {
                    html += '<i class="fas fa-times score-modifier red"></i>';
                }
            }
            html += '</div></div>';
        }
        html += `
                </div>
            </div>
        `;
        if (!player.present) {
            html += '<p class="lobby-pregame-player-away"><strong>AWAY</strong></p>';
        }

        div.html(html);

        // Initialize the tooltip
        $(`#lobby-pregame-player-${i + 1}-scores-icon`).tooltipster({
            animation: 'grow',
            contentAsHTML: true,
            delay: 0,
            theme: [
                'tooltipster-shadow',
                'tooltipster-shadow-big',
            ],
        });
    }
};

},{"../constants":3,"../globals":36,"../misc":49,"./main":41}],44:[function(require,module,exports){
/*
    The "Settings" nav button
*/

// Imports
const globals = require('../globals');
const notifications = require('../notifications');

// Element 0 is the HTML ID
// Element 1 is the cookie key
const settingsList = [
    [
        // Show desktop notifications when it reaches your turn
        'send-turn-notification',
        'sendTurnNotify',
    ],
    [
        // Play sounds when a move is made
        'send-turn-sound',
        'sendTurnSound',
    ],
    [
        // Play ticking sounds when timers are below 5 seconds
        'send-timer-sound',
        'sendTimerSound',
    ],
    [
        // Enable Board Game Arena mode (hands grouped together)
        'show-bga-ui',
        'showBGAUI',
    ],
    [
        // Enable colorblind mode
        'show-colorblind-ui',
        'showColorblindUI',
    ],
    [
        // Show turn timers in untimed games
        'show-timer-in-untimed',
        'showTimerInUntimed',
    ],
    [
        // Reverse hand direction (new cards go on the right)
        'reverse-hands',
        'reverseHands',
    ],
    [
        // Enable pre-playing cards
        'speedrun-preplay',
        'speedrunPreplay',
    ],
    [
        // Enable speedrun keyboard hotkeys
        'speedrun-hotkeys',
        'speedrunHotkeys',
    ],
];

$(document).ready(() => {
    for (let i = 0; i < settingsList.length; i++) {
        const htmlID = settingsList[i][0];
        const cookieKey = settingsList[i][1];

        // Get this setting from local storage
        let cookieValue = localStorage.getItem(cookieKey);

        if (typeof cookieValue === 'undefined' || typeof cookieValue !== 'string') {
            // If the cookie doesn't exist (or it is corrupt), write a default value
            cookieValue = globals.settings[cookieKey];
            localStorage.setItem(cookieKey, cookieValue);
            console.log(`Wrote a brand new "${cookieKey}" cookie of: ${cookieValue}`);
        } else {
            // Convert it from a string to a boolean
            // (all values in cookies are strings)
            cookieValue = (cookieValue === 'true');

            // Write the value of the cookie to our local variable
            globals.settings[cookieKey] = cookieValue;
        }
        $(`#${htmlID}`).attr('checked', cookieValue);

        $(`#${htmlID}`).change(changeSetting);
    }
});

function changeSetting() {
    // Find the local variable name that is associated with this HTML ID
    for (let j = 0; j < settingsList.length; j++) {
        const thisHtmlID = settingsList[j][0];
        const thisCookieKey = settingsList[j][1];
        if (thisHtmlID === $(this).attr('id')) {
            const checked = $(this).is(':checked');

            // Write the new value to our local variable
            globals.settings[thisCookieKey] = checked;

            // Also store the new value in localstorage
            localStorage.setItem(thisCookieKey, checked);

            console.log(`Wrote a "${thisCookieKey}" cookie of: ${checked}`);
            break;
        }
    }

    if (globals.settings.sendTurnNotify) {
        notifications.test();
    }
}

},{"../globals":36,"../notifications":51}],45:[function(require,module,exports){
/*
   The lobby area that shows all of the current tables
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');
const modals = require('../modals');
const lobby = require('./main');

exports.draw = () => {
    const tbody = $('#lobby-games-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    if (Object.keys(globals.tableList).length === 0) {
        $('#lobby-games-no').show();
        $('#lobby-games').addClass('align-center-v');
        $('#lobby-games-table-container').hide();
        return;
    }
    $('#lobby-games-no').hide();
    $('#lobby-games').removeClass('align-center-v');
    $('#lobby-games-table-container').show();

    // Add all of the games
    for (const table of Object.values(globals.tableList)) {
        const row = $('<tr>');

        // Column 1 - Name
        $('<td>').html(table.name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(table.numPlayers).appendTo(row);

        // Column 3 - Variant
        $('<td>').html(table.variant).appendTo(row);

        // Column 4 - Timed
        let timed = 'No';
        if (table.timed) {
            timed = `${misc.timerFormatter(table.baseTime)} + ${misc.timerFormatter(table.timePerTurn)}`;
        }
        $('<td>').html(timed).appendTo(row);

        // Column 5 - Status
        let status;
        if (table.sharedReplay) {
            status = 'Shared Replay';
        } else if (table.running && table.joined) {
            if (table.ourTurn) {
                status = '<strong>Your Turn</strong>';
            } else {
                status = 'Waiting';
            }
        } else if (table.running) {
            status = 'Running';
        } else {
            status = 'Not Started';
        }
        if (status !== 'Not Started') {
            status += ` (${table.progress}%)`;
        }
        $('<td>').html(status).appendTo(row);

        // Column 6 - Action
        const button = $('<button>').attr('type', 'button').addClass('button small margin0');
        if (table.sharedReplay || (!table.joined && table.running)) {
            button.html('<i class="fas fa-eye lobby-button-icon"></i>');
            button.attr('id', `spectate-${table.id}`);
            button.on('click', tableSpectateButton(table));
        } else if (!table.joined) {
            button.html('<i class="fas fa-sign-in-alt lobby-button-icon"></i>');
            button.attr('id', `join-${table.id}`);
            if (table.numPlayers >= 6) {
                button.addClass('disabled');
            }
            button.on('click', tableJoinButton(table));
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>');
            button.attr('id', `resume-${table.id}`);
            button.on('click', tableReattendButton(table));
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Abandon
        let button2 = 'n/a';
        if (table.joined && (table.owned || table.running) && !table.sharedReplay) {
            button2 = $('<button>').attr('type', 'button').addClass('button small margin0');
            button2.html('<i class="fas fa-times lobby-button-icon"></i>');
            button2.attr('id', `abandon-${table.id}`);
            button2.on('click', tableAbandonButton(table));
        }
        $('<td>').html(button2).appendTo(row);

        // Column 8 - Players
        $('<td>').html(table.players).appendTo(row);

        // Column 9 - Spectators
        $('<td>').html(table.spectators).appendTo(row);

        row.appendTo(tbody);
    }
};

const tableSpectateButton = table => (event) => {
    event.preventDefault();
    globals.gameID = table.id;
    globals.conn.send('gameSpectate', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableJoinButton = table => (event) => {
    event.preventDefault();

    if (table.password) {
        modals.passwordShow(table.id);
        return;
    }

    globals.gameID = table.id;
    globals.conn.send('gameJoin', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableReattendButton = table => (event) => {
    event.preventDefault();
    globals.gameID = table.id;
    globals.conn.send('gameReattend', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableAbandonButton = table => (event) => {
    event.preventDefault();

    if (table.running) {
        if (!window.confirm('Are you sure? This will cancel the game for all players.')) {
            return;
        }
    }

    globals.gameID = null;
    globals.conn.send('gameAbandon', {
        gameID: table.id,
    });
};

},{"../globals":36,"../misc":49,"../modals":50,"./main":41}],46:[function(require,module,exports){
/*
    A short tutorial is shown to brand-new users
*/

// Imports
const globals = require('../globals');
const login = require('./login');

$(document).ready(() => {
    $('#tutorial-yes').on('click', () => {
        $('#tutorial-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-no').on('click', () => {
        $('#tutorial').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-2-yes').on('click', () => {
        $('#tutorial-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-2-no').on('click', () => {
        $('#tutorial-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-2-2').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-2-1-ok').on('click', () => {
        $('#tutorial-2-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-2-2-ok').on('click', () => {
        $('#tutorial-2-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-3-yes').on('click', () => {
        $('#tutorial-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-3-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-3-no').on('click', () => {
        $('#tutorial-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-3-1-ok').on('click', () => {
        $('#tutorial-3-1').fadeOut(globals.fadeTime, () => {
            $('#tutorial-5').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-casual').on('click', () => {
        $('#tutorial-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-1').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-4-expert').on('click', () => {
        $('#tutorial-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-2').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-1-lobby').on('click', () => {
        $('#tutorial-4-1').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-4-2-ok').on('click', () => {
        $('#tutorial-4-2').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-3').fadeIn(globals.fadeTime);
        });
    });
    $('#tutorial-4-2-lobby').on('click', () => {
        $('#tutorial-4-2').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });

    $('#tutorial-4-3-ok').on('click', () => {
        $('#tutorial-4-3').fadeOut(globals.fadeTime, () => {
            $('#tutorial-4-4').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-4-4-ok').on('click', () => {
        $('#tutorial-4-4').fadeOut(globals.fadeTime, () => {
            $('#tutorial-5').fadeIn(globals.fadeTime);
        });
    });

    $('#tutorial-5-lobby').on('click', () => {
        $('#tutorial-5').fadeOut(globals.fadeTime, () => {
            login.hide(false);
        });
    });
});

},{"../globals":36,"./login":40}],47:[function(require,module,exports){
/*
   The lobby area that shows all of the current logged-in users
*/

// Imports
const globals = require('../globals');

exports.draw = () => {
    $('#lobby-users-num').text(Object.keys(globals.userList).length);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const user of Object.values(globals.userList)) {
        const row = $('<tr>');

        let { name } = user;
        name = `<a href="/scores/${name}" target="_blank" rel="noopener noreferrer">${name}</a>`;
        if (user.name === globals.username) {
            name = `<strong>${name}</strong>`;
        }
        $('<td>').html(name).appendTo(row);

        const { status } = user;
        $('<td>').html(status).appendTo(row);

        row.appendTo(tbody);
    }
};

},{"../globals":36}],48:[function(require,module,exports){
/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports
// (allowing the client code to be split up into multiple files)
require('./game/main');
require('./lobby/main');
require('./modals');

},{"./game/main":6,"./lobby/main":41,"./modals":50}],49:[function(require,module,exports){
/*
    A collection of miscellaneous functions
*/

$(document).ready(() => {
    // Detect if an element is off screen
    // e.g. if ($('#asdf').is(':offscreen'))
    jQuery.expr.filters.offscreen = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 1 // Above the top
            || rect.bottom > window.innerHeight - 5 // Below the bottom
            || rect.left < 1 // Left of the left edge
            || rect.right > window.innerWidth - 5; // Right of the right edge
        // We modify the top/left by 1 and the bottom/right by 5
        // to prevent scroll bars from appearing
    };
});

exports.closeAllTooltips = () => {
    // From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

exports.timerFormatter = (milliseconds) => {
    if (!milliseconds) {
        milliseconds = 0;
    }
    const time = new Date();
    time.setHours(0, 0, 0, milliseconds);
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${secondsFormatted}`;
};

},{}],50:[function(require,module,exports){
/*
    Modals (boxes that hover overtop the UI)
*/

// Imports
const globals = require('./globals');
const misc = require('./misc');
const lobby = require('./lobby/main');
const game = require('./game/main');

// The list of all of the modals
const modals = [
    'password',
    // "warning" and "error" are intentionally omitted, as they are handled separately
];

// Initialize the modals
$(document).ready(() => {
    // All modals
    for (const modal of modals) {
        $(`#${modal}-modal-cancel`).click(closeAll);
    }

    // Password
    $('#password-modal-password').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#password-modal-submit').click();
        }
    });
    $('#password-modal-submit').click(passwordSubmit);

    // Warning
    $('#warning-modal-button').click(() => {
        $('#warning-modal').fadeOut(globals.fadeTime);
        if ($('#lobby').is(':visible')) {
            $('#lobby').fadeTo(globals.fadeTime, 1);
        }
        if ($('#game').is(':visible')) {
            $('#game').fadeTo(globals.fadeTime, 1);
        }
    });

    // Error
    $('#error-modal-button').click(() => {
        window.location.reload();
    });
});

exports.passwordShow = (gameID) => {
    $('#lobby').fadeTo(globals.fadeTime, 0.25);
    misc.closeAllTooltips();

    $('#password-modal-id').val(gameID);
    $('#password-modal').fadeIn(globals.fadeTime);
    $('#password-modal-password').focus();
};

const passwordSubmit = (event) => {
    event.preventDefault();
    $('#password-modal').fadeOut(globals.fadeTime);
    $('#lobby').fadeTo(globals.fadeTime, 1);
    const gameID = parseInt($('#password-modal-id').val(), 10); // The server expects this as a number
    const passwordPlaintext = $('#password-modal-password').val();
    const password = hex_sha256(`Hanabi game password ${passwordPlaintext}`);
    globals.conn.send('gameJoin', {
        gameID,
        password,
    });
};

exports.warningShow = (msg) => {
    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(globals.fadeTime, 0.25);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(globals.fadeTime, 0.25);
    }
    misc.closeAllTooltips();
    game.chat.hide();

    $('#warning-modal-description').html(msg);
    $('#warning-modal').fadeIn(globals.fadeTime);
};

exports.errorShow = (msg) => {
    // Do nothing if we are already showing the error modal
    if (globals.errorOccured) {
        return;
    }
    globals.errorOccured = true;

    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(globals.fadeTime, 0.1);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(globals.fadeTime, 0.1);
    }
    misc.closeAllTooltips();
    game.chat.hide();

    // Clear out the top navigation buttons
    lobby.nav.show('nothing');

    $('#error-modal-description').html(msg);
    $('#error-modal').fadeIn(globals.fadeTime);
};

const closeAll = () => {
    for (const modal of modals) {
        $(`#${modal}-modal`).fadeOut(globals.fadeTime);
    }
    $('#lobby').fadeTo(globals.fadeTime, 1);
};
exports.closeAll = closeAll;

},{"./game/main":6,"./globals":36,"./lobby/main":41,"./misc":49}],51:[function(require,module,exports){
/*
    The site has the ability to send (optional) notifications
*/

exports.test = () => {
    if (!('Notification' in window)) {
        return;
    }
    if (Notification.permission !== 'default') {
        return;
    }

    Notification.requestPermission();
};

exports.send = (msg, tag) => {
    if (!('Notification' in window)) {
        return;
    }
    if (Notification.permission !== 'granted') {
        return;
    }

    new Notification(`Hanabi: ${msg}`, { /* eslint-disable-line no-new */
        tag,
    });
};

},{}],52:[function(require,module,exports){
/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

// Imports
const golem = require('../lib/golem');
const globals = require('./globals');
const modals = require('./modals');
const chat = require('./chat');
const lobby = require('./lobby/main');
const game = require('./game/main');

exports.set = () => {
    // Connect to the WebSocket server
    let websocketURL = 'ws';
    if (window.location.protocol === 'https:') {
        websocketURL += 's';
    }
    websocketURL += '://';
    websocketURL += window.location.hostname;
    if (window.location.port !== '') {
        websocketURL += ':';
        websocketURL += window.location.port;
    }
    websocketURL += '/ws';
    console.log('Connecting to websocket URL:', websocketURL);
    globals.conn = new golem.Connection(websocketURL, true);
    // This will automatically use the cookie that we recieved earlier from the POST
    // If the second argument is true, debugging is turned on

    // Define event handlers
    globals.conn.on('open', () => {
        // We will show the lobby upon recieving the "hello" command from the server
        console.log('WebSocket connection established.');
    });
    globals.conn.on('close', () => {
        console.log('WebSocket connection disconnected / closed.');
        modals.errorShow('Disconnected from the server. Either your Internet hiccuped or the server restarted.');
    });
    globals.conn.on('socketError', (event) => {
        // "socketError" is defined in "golem.js" as mapping to the WebSocket "onerror" event
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            lobby.login.formError('Failed to connect to the WebSocket server. The server might be down!');
        }
    });

    // All of the normal commands/messages that we expect from the server are defined in the
    // "initCommands()" function
    initCommands();

    globals.conn.send = (command, data) => {
        if (typeof data === 'undefined') {
            data = {};
        }
        if (globals.debug) {
            console.log(`%cSent ${command}:`, 'color: green;');
            console.log(data);
        }
        globals.conn.emit(command, data);
    };

    // Send any client errors to the server for tracking purposes
    window.onerror = (message, url, lineno, colno) => {
        // We don't want to report errors if someone is doing local development
        if (window.location.hostname === 'localhost') {
            return;
        }

        try {
            globals.conn.emit('clientError', {
                message,
                url,
                lineno,
                colno,
            });
        } catch (err) {
            console.error('Failed to transmit the error to the server:', err);
        }
    };
};

// This is all of the normal commands/messages that we expect to receive from the server
const initCommands = () => {
    globals.conn.on('hello', (data) => {
        globals.username = data.username;
        globals.totalGames = data.totalGames;
        $('#nav-buttons-history-game-count').html(globals.totalGames);
        lobby.login.hide(data.firstTimeUser);
    });

    globals.conn.on('user', (data) => {
        globals.userList[data.id] = data;
        lobby.users.draw();
    });

    globals.conn.on('userLeft', (data) => {
        delete globals.userList[data.id];
        lobby.users.draw();
    });

    globals.conn.on('table', (data) => {
        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        data.baseTime *= 1000;
        data.timePerTurn *= 1000;

        globals.tableList[data.id] = data;
        lobby.tables.draw();
    });

    globals.conn.on('tableGone', (data) => {
        delete globals.tableList[data.id];
        lobby.tables.draw();
    });

    globals.conn.on('chat', (data) => {
        chat.add(data, true);
        if (
            data.room === 'game'
            && globals.ui !== null
            && !$('#game-chat-modal').is(':visible')
        ) {
            if (globals.ui.globals.spectating && !globals.ui.globals.sharedReplay) {
                // Pop up the chat window every time for spectators
                globals.ui.toggleChat();
            } else {
                // Do not pop up the chat window by default;
                // instead, change the "Chat" button to say "Chat (1)"
                globals.chatUnread += 1;
                globals.ui.updateChatLabel();
            }
        }
    });

    // The "chatList" command is sent upon initial connection
    // to give the client a list of past lobby chat messages
    // It is also sent upon connecting to a game to give a list of past in-game chat messages
    globals.conn.on('chatList', (data) => {
        for (const line of data.list) {
            chat.add(line);
        }
        if (
            // If the UI is open, we assume that this is a list of in-game chat messages
            globals.ui !== null
            && !$('#game-chat-modal').is(':visible')
        ) {
            globals.chatUnread += data.unread;
            globals.ui.updateChatLabel();
        }
    });

    globals.conn.on('joined', (data) => {
        // We joined a new game, so transition between screens
        globals.gameID = data.gameID;
        lobby.tables.draw();
        lobby.pregame.show();
    });

    globals.conn.on('left', () => {
        // We left a table, so transition between screens
        globals.gameID = null;
        lobby.tables.draw();
        lobby.pregame.hide();
    });

    globals.conn.on('game', (data) => {
        globals.game = data;

        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        globals.game.baseTime *= 1000;
        globals.game.timePerTurn *= 1000;

        lobby.pregame.draw();
    });

    globals.conn.on('tableReady', (data) => {
        if (data.ready) {
            $('#nav-buttons-pregame-start').removeClass('disabled');
        } else {
            $('#nav-buttons-pregame-start').addClass('disabled');
        }
    });

    globals.conn.on('gameStart', (data) => {
        if (!data.replay) {
            lobby.pregame.hide();
        }
        game.show(data.replay);
    });

    globals.conn.on('gameHistory', (dataArray) => {
        // data will be an array of all of the games that we have previously played
        for (const data of dataArray) {
            globals.historyList[data.id] = data;

            if (data.incrementNumGames) {
                globals.totalGames += 1;
                $('#nav-buttons-history-game-count').html(globals.totalGames);
            }
        }

        // The server sent us more games because
        // we clicked on the "Show More History" button
        if (globals.historyClicked) {
            globals.historyClicked = false;
            lobby.history.draw();
        }
    });

    globals.conn.on('historyDetail', (data) => {
        globals.historyDetailList.push(data);
        lobby.history.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.settings.sendTurnSound) {
            game.sounds.play(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('warning', (data) => {
        // Log the warning message
        console.warn(data.warning);

        // Show the warning modal
        modals.warningShow(data.warning);
    });

    globals.conn.on('error', (data) => {
        // Log the error message
        console.error(data.error);

        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }

        modals.errorShow(data.error);
    });

    // There are yet more command handlers for events that happen in-game
    // These will only have an effect if the current screen is equal to "game"
    game.commands.init();
};

},{"../lib/golem":1,"./chat":2,"./game/main":6,"./globals":36,"./lobby/main":41,"./modals":50}]},{},[48]);
