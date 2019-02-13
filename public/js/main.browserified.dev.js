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

// Variables
let chatLineNum = 1;

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

exports.add = (data, fast) => {
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

    let line = `<span id="chat-line-${chatLineNum}" class="${fast ? '' : 'hidden'}">[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
        line += data.msg;
    } else {
        line += data.msg;
    }
    line += '</span><br />';

    // Find out if we should automatically scroll down after adding the new line of chat
    // https://stackoverflow.com/questions/6271237/detecting-when-user-scrolls-to-bottom-of-div-with-jquery
    // If we are already scrolled to the bottom, then it is ok to automatically scroll
    let autoScroll = false;
    if (chat.scrollTop() + Math.ceil(chat.innerHeight()) >= chat[0].scrollHeight) {
        autoScroll = true;
    }

    // Add the new line and fade it in
    chat.append(line);
    $(`#chat-line-${chatLineNum}`).fadeIn(globals.fadeTime);
    chatLineNum += 1;

    // Automatically scroll down
    if (autoScroll) {
        chat.animate({
            scrollTop: chat[0].scrollHeight,
        }, (fast ? 0 : 500));
    }
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

},{"./globals":41}],3:[function(require,module,exports){
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

},{"../globals":41}],5:[function(require,module,exports){
/*
    The Hanabi game UI
*/

exports.chat = require('./chat');
exports.websocket = require('./websocket');
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

},{"../globals":41,"../misc":54,"./chat":4,"./sounds":6,"./tooltips":7,"./ui/ui":38,"./websocket":40}],6:[function(require,module,exports){
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

},{"../globals":41}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
/*
    This function draws the UI when going into a game for the first time
*/

// Imports
const globals = require('./globals');
const Button = require('./button');
const ButtonGroup = require('./buttonGroup');
const CardDeck = require('./cardDeck');
const CardStack = require('./cardStack');
const CardLayout = require('./cardLayout');
const Clue = require('./clue');
const ClueRecipientButton = require('./clueRecipientButton');
const ColorButton = require('./colorButton');
const constants = require('../../constants');
const FitText = require('./fitText');
const HanabiClueLog = require('./clueLog');
const HanabiNameFrame = require('./nameFrame');
const HanabiMsgLog = require('./msgLog');
const MultiFitText = require('./multiFitText');
const NumberButton = require('./numberButton');
const replay = require('./replay');
const timer = require('./timer');
const ToggleButton = require('./toggleButton');

module.exports = () => {
    let x;
    let y;
    let width;
    let height;
    let yOffset;
    let rect; // We reuse this to draw many squares / rectangles
    let button; // We reuse this to draw many buttons

    // Constants
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    // Just in case, delete all existing layers
    const layers = globals.stage.getLayers();
    for (let i = 0; i < layers.length; i++) {
        layers[i].remove();
    }

    // Define the layers
    // (they are added to the stage later on at the end of the buildUI function)
    globals.layers.background = new Kinetic.Layer();
    globals.layers.card = new Kinetic.Layer();
    globals.layers.UI = new Kinetic.Layer();
    globals.layers.overtop = new Kinetic.Layer();
    globals.layers.text = new Kinetic.Layer({
        listening: false,
    });
    globals.layers.timer = new Kinetic.Layer({
        listening: false,
    });

    const background = new Kinetic.Image({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        image: globals.ImageLoader.get('background'),
    });

    globals.layers.background.add(background);

    /*
        Draw the discard area
    */

    // This is the invisible rectangle that players drag cards to in order to discard them
    globals.elements.discardArea = new Kinetic.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.2 * winW,
        height: 0.4 * winH,
    });
    globals.elements.discardArea.isOver = pos => (
        pos.x >= globals.elements.discardArea.getX()
        && pos.y >= globals.elements.discardArea.getY()
        && pos.x <= globals.elements.discardArea.getX() + globals.elements.discardArea.getWidth()
        && pos.y <= globals.elements.discardArea.getY() + globals.elements.discardArea.getHeight()
    );

    // The red border that surrounds the discard pile when the team is at 8 clues
    globals.elements.noDiscardLabel = new Kinetic.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        stroke: '#df1c2d',
        strokeWidth: 0.005 * winW,
        cornerRadius: 0.01 * winW,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.noDiscardLabel);

    // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
    globals.elements.noDoubleDiscardLabel = new Kinetic.Rect({
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
    globals.layers.UI.add(globals.elements.noDoubleDiscardLabel);

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
    globals.layers.background.add(rect);

    // The icon over the discard pile
    const img = new Kinetic.Image({
        x: 0.82 * winW,
        y: 0.62 * winH,
        width: 0.15 * winW,
        height: 0.35 * winH,
        opacity: 0.2,
        image: globals.ImageLoader.get('trashcan'),
    });
    globals.layers.background.add(img);

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
    globals.elements.scoreArea = new Kinetic.Group({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
    });
    globals.layers.UI.add(globals.elements.scoreArea);

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
    globals.elements.scoreArea.add(rect);

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

    const turnTextLabel = basicTextLabel.clone({
        text: 'Turn',
        x: 0.03 * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(turnTextLabel);

    globals.elements.turnNumberLabel = basicNumberLabel.clone({
        text: '1',
        x: 0.07 * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.turnNumberLabel);

    const scoreTextLabel = basicTextLabel.clone({
        text: 'Score',
        x: 0.03 * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(scoreTextLabel);

    globals.elements.scoreNumberLabel = basicNumberLabel.clone({
        text: '0',
        x: 0.07 * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.scoreNumberLabel);

    const cluesTextLabel = basicTextLabel.clone({
        text: 'Clues',
        x: 0.03 * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(cluesTextLabel);

    globals.elements.cluesNumberLabel = basicNumberLabel.clone({
        text: '8',
        x: 0.07 * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.cluesNumberLabel);

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
        globals.elements.scoreArea.add(square);
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
    globals.elements.spectatorsLabel = new Kinetic.Text({
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
    globals.layers.UI.add(globals.elements.spectatorsLabel);

    // Tooltip for the eyes
    globals.elements.spectatorsLabel.on('mousemove', function spectatorsLabelMouseMove() {
        globals.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-spectators').css('left', tooltipX);
        $('#tooltip-spectators').css('top', this.attrs.y);
        $('#tooltip-spectators').tooltipster('open');
    });
    globals.elements.spectatorsLabel.on('mouseout', () => {
        $('#tooltip-spectators').tooltipster('close');
    });

    globals.elements.spectatorsNumLabel = new Kinetic.Text({
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
    globals.layers.UI.add(globals.elements.spectatorsNumLabel);

    // Shared replay leader indicator
    const sharedReplayLeaderLabelValues = {
        x: 0.623,
        y: 0.85,
    };
    if (globals.lobby.settings.showBGAUI) {
        sharedReplayLeaderLabelValues.x = spectatorsLabelValues.x + 0.03;
        sharedReplayLeaderLabelValues.y = spectatorsLabelValues.y;
    }
    globals.elements.sharedReplayLeaderLabel = new Kinetic.Text({
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
    globals.layers.UI.add(globals.elements.sharedReplayLeaderLabel);

    // Add an animation to alert everyone when shared replay leadership has been transfered
    globals.elements.sharedReplayLeaderLabelPulse = new Kinetic.Tween({
        node: globals.elements.sharedReplayLeaderLabel,
        scaleX: 2,
        scaleY: 2,
        offsetX: 12,
        offsetY: 10,
        duration: 0.5,
        easing: Kinetic.Easings.EaseInOut,
        onFinish: () => {
            globals.elements.sharedReplayLeaderLabelPulse.reverse();
        },
    });
    globals.elements.sharedReplayLeaderLabelPulse.anim.addLayer(globals.layers.UI);

    // Tooltip for the crown
    globals.elements.sharedReplayLeaderLabel.on('mousemove', function sharedReplayLeaderLabelMouseMove() {
        globals.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-leader').css('left', tooltipX);
        $('#tooltip-leader').css('top', this.attrs.y);
        $('#tooltip-leader').tooltipster('open');
    });
    globals.elements.sharedReplayLeaderLabel.on('mouseout', () => {
        $('#tooltip-leader').tooltipster('close');
    });

    // The user can right-click on the crown to pass the replay leader to an arbitrary person
    globals.elements.sharedReplayLeaderLabel.on('click', (event) => {
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
    const clueLogRect = new Kinetic.Rect({
        x: clueLogValues.x * winW,
        y: clueLogValues.y * winH,
        width: clueLogValues.w * winW,
        height: clueLogValues.h * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(clueLogRect);

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
    globals.layers.background.add(rect);

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

            globals.layers.background.add(pileback);

            const thisSuitPlayStack = new CardStack({
                x: playStackX * winW,
                y: playStackValues.y * winH,
                width: width * winW,
                height: height * winH,
            });
            globals.elements.playStacks.set(suit, thisSuitPlayStack);
            globals.layers.card.add(thisSuitPlayStack);

            const thisSuitDiscardStack = new CardLayout({
                x: 0.81 * winW,
                y: (0.61 + y * i) * winH,
                width: 0.17 * winW,
                height: 0.17 * winH,
            });
            globals.elements.discardStacks.set(suit, thisSuitDiscardStack);
            globals.layers.card.add(thisSuitDiscardStack);

            // Draw the suit name next to each suit
            // (a text description of the suit)
            if (globals.variant.showSuitNames) {
                let text = suit.name;
                if (
                    globals.lobby.settings.showColorblindUI
                    && suit.clueColors.length > 1
                    && suit !== constants.SUIT.RAINBOW
                    && suit !== constants.SUIT.RAINBOW1OE
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
                text.add(suitLabelText);
                globals.elements.suitLabelTexts.push(suitLabelText);
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
    globals.elements.playArea = new Kinetic.Rect({
        x: (playAreaValues.x - overlap) * winW,
        y: (playAreaValues.y - overlap) * winH,
        width: (playAreaValues.w + overlap * 2) * winW,
        height: (playAreaValues.h + overlap * 2) * winH,
    });
    globals.elements.playArea.isOver = pos => (
        pos.x >= globals.elements.playArea.getX()
        && pos.y >= globals.elements.playArea.getY()
        && pos.x <= globals.elements.playArea.getX() + globals.elements.playArea.getWidth()
        && pos.y <= globals.elements.playArea.getY() + globals.elements.playArea.getHeight()
    );

    /*
        Draw the deck
    */

    // This is the faded rectangle that is hidden until all of the deck has been depleted
    const drawDeckRect = new Kinetic.Rect({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.006 * winW,
    });
    globals.layers.background.add(drawDeckRect);

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

            globals.layers.background.add(rect);
        }

        let playerNamePos = namePos;
        if (globals.lobby.settings.showBGAUI) {
            playerNamePos = namePosBGA;
        }
        globals.elements.nameFrames[i] = new HanabiNameFrame({
            x: playerNamePos[nump][j].x * winW,
            y: playerNamePos[nump][j].y * winH,
            width: playerNamePos[nump][j].w * winW,
            height: playerNamePos[nump][j].h * winH,
            name: globals.playerNames[i],
            playerNum: i,
        });
        globals.layers.UI.add(globals.elements.nameFrames[i]);

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
                text: constants.CHARACTERS[globals.characterAssignments[i]].emoji,
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

                const character = constants.CHARACTERS[globals.characterAssignments[i]];
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
    globals.elements.clueArea = new Kinetic.Group({
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

        globals.elements.clueArea.add(button);
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
            clue: new Clue(constants.CLUE_TYPE.RANK, i),
        });

        // Add it to the button array (for keyboard hotkeys)
        globals.elements.rankClueButtons.push(button);

        globals.elements.clueArea.add(button);

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
                clue: new Clue(constants.CLUE_TYPE.COLOR, color),
            });

            globals.elements.clueArea.add(button);

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
    globals.elements.clueArea.add(globals.elements.giveClueButton);
    globals.elements.giveClueButton.on('click tap', globals.lobby.ui.giveClue);

    globals.elements.clueArea.hide();
    globals.layers.UI.add(globals.elements.clueArea);

    // The "No Clues" box
    const noClueBoxValues = {
        x: 0.275,
        y: 0.56,
    };
    if (globals.lobby.settings.showBGAUI) {
        noClueBoxValues.x = clueAreaValues.x + 0.178;
        noClueBoxValues.y = clueAreaValues.y;
    }
    globals.elements.noClueBox = new Kinetic.Rect({
        x: noClueBoxValues.x * winW,
        y: noClueBoxValues.y * winH,
        width: 0.25 * winW,
        height: 0.15 * winH,
        cornerRadius: 0.01 * winW,
        fill: 'black',
        opacity: 0.5,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.noClueBox);

    const noClueLabelValues = {
        x: noClueBoxValues.x - 0.125,
        y: noClueBoxValues.y + 0.025,
    };
    globals.elements.noClueLabel = new Kinetic.Text({
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
    globals.layers.UI.add(globals.elements.noClueLabel);

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

    const replayBar = new Kinetic.Rect({
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
    globals.elements.replayExitButton = new Button({
        x: (replayButtonValues.x + 0.05) * winW,
        y: 0.17 * winH,
        width: 0.2 * winW,
        height: 0.06 * winH,
        text: 'Exit Replay',
        visible: !globals.replay && !globals.sharedReplay,
    });
    globals.elements.replayExitButton.on('click tap', replay.exitButton);
    globals.elements.replayArea.add(globals.elements.replayExitButton);

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

    globals.elements.replayButton = new Button({
        x: 0.01 * winW,
        y: 0.8 * winH,
        width: 0.06 * winW,
        height: 0.06 * winH,
        image: 'replay',
        visible: false,
    });
    globals.elements.replayButton.on('click tap', () => {
        if (globals.inReplay) {
            replay.exit();
        } else {
            replay.enter();
        }
    });

    globals.layers.UI.add(globals.elements.replayButton);

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

    const lobbyButton = new Button({
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

    globals.stage.add(globals.layers.background);
    globals.stage.add(globals.layers.text);
    globals.stage.add(globals.layers.UI);
    globals.stage.add(globals.layers.timer);
    globals.stage.add(globals.layers.card);
    globals.stage.add(globals.layers.overtop);
};

},{"../../constants":3,"./button":9,"./buttonGroup":10,"./cardDeck":12,"./cardLayout":14,"./cardStack":15,"./clue":16,"./clueLog":18,"./clueRecipientButton":19,"./colorButton":20,"./fitText":22,"./globals":23,"./msgLog":28,"./multiFitText":29,"./nameFrame":30,"./numberButton":33,"./replay":34,"./timer":36,"./toggleButton":37}],9:[function(require,module,exports){
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

},{"./fitText":22,"./globals":23}],10:[function(require,module,exports){
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

    this.tweening = false;

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

    this.holder = config.holder;

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
    this.on('mousedown', this.clickSpeedrun);

    // Hide clue arrows ahead of user dragging their card
    if (this.holder === globals.playerUs && !globals.replay && !globals.spectating) {
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
    if (this.holder !== globals.playerUs || globals.inReplay || globals.spectating) {
        const mouseButton = 1; // Left-click
        let toggledPips = [];
        this.on('mousedown', (event) => {
            if (event.evt.which !== mouseButton) {
                return;
            }

            // Disable Empathy if the card is tweening
            if (this.tweening) {
                return;
            }

            // Disable Empathy if the card is played or discarded
            // (clicking on a played/discarded card goes to the turn that it was played/discarded)
            if (this.isPlayed || this.isDiscarded) {
                return;
            }

            // Empathy in speedruns uses Ctrl
            if (globals.speedrun && !window.event.ctrlKey) {
                return;
            }

            // Disable Empathy if any modifiers are being held down
            if (!globals.speedrun && window.event.ctrlKey) {
                return;
            }
            if (window.event.shiftKey || window.event.altKey) {
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

HanabiCard.prototype.toggleSharedReplayIndicator = function setSharedReplayIndicator() {
    // Either show or hide the arrow (if it is already visible)
    const visible = !(
        this.indicatorArrow.visible()
        && this.indicatorArrow.getFill() === constants.INDICATOR.REPLAY_LEADER
    );
    // (if the arrow is showing but is a different kind of arrow,
    // then just overwrite the existing arrow)
    globals.lobby.ui.showClueMatch(-1);
    this.setIndicator(visible, constants.INDICATOR.REPLAY_LEADER);
};

HanabiCard.prototype.click = function click(event) {
    // Disable all click events if the card is tweening
    if (this.tweening) {
        return;
    }

    // Speedrunning overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if we are in a solo or shared replay)
    if (globals.speedrun && !globals.replay) {
        return;
    }

    if (event.evt.which === 1) { // Left-click
        this.clickLeft();
    } else if (event.evt.which === 3) { // Right-click
        this.clickRight();
    }
};

HanabiCard.prototype.clickLeft = function clickLeft() {
    // The "Empathy" feature is handled above, so we don't have to worry about it here
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
        this.setNote(notes.vars.lastNote);
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (window.event.shiftKey) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (window.event.altKey) {
        this.setNote('cm');
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

    // Draw the indicator manually so that we don't have to wait for the client to server round-trip
    this.toggleSharedReplayIndicator();
};

HanabiCard.prototype.clickArrowLocal = function clickArrowLocal() {
    // Even if they are not a leader in a shared replay,
    // a user might still want to draw an arrow on a card for demonstration purposes
    this.toggleSharedReplayIndicator();
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
};

HanabiCard.prototype.clickSpeedrun = function clickSpeedrun(event) {
    // Speedrunning overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if we are in a solo or shared replay)
    if (!globals.speedrun || globals.replay) {
        return;
    }

    // Do nothing if we accidentally click on a played/discarded card
    if (this.isPlayed || this.isDiscarded) {
        return;
    }

    if (event.evt.which === 1) { // Left-click
        this.clickSpeedrunLeft();
    } else if (event.evt.which === 3) { // Right-click
        this.clickSpeedrunRight();
    }
};

HanabiCard.prototype.clickSpeedrunLeft = function clickSpeedrunLeft() {
    // Left-clicking on cards in our own hand is a play action
    if (this.holder === globals.playerUs) {
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.PLAY,
                target: this.order,
            },
        });
        return;
    }

    // Left-clicking on cards in other people's hands is a color clue action
    // (but if we are holding Ctrl, then we are using Empathy)
    if (window.event.ctrlKey) {
        return;
    }
    if (globals.clues !== 0) {
        const color = this.trueSuit.clueColors[0];
        const colors = globals.variant.clueColors;
        const value = colors.findIndex(variantClueColor => variantClueColor === color);
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.CLUE,
                target: this.holder,
                clue: {
                    type: constants.CLUE_TYPE.COLOR,
                    value,
                },
            },
        });
    }
};

HanabiCard.prototype.clickSpeedrunRight = function clickSpeedrunRight() {
    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (window.event.shiftKey) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (window.event.altKey) {
        this.setNote('cm');
        return;
    }

    // Right-clicking on cards in our own hand is a discard action
    if (this.holder === globals.playerUs) {
        // Prevent discarding while at 8 clues
        if (globals.clues === 8) {
            return;
        }
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.DISCARD,
                target: this.order,
            },
        });
        return;
    }

    // Right-clicking on cards in other people's hands is a number clue action
    if (globals.clues !== 0) {
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.CLUE,
                target: this.holder,
                clue: {
                    type: constants.CLUE_TYPE.RANK,
                    value: this.trueRank,
                },
            },
        });
    }
};

HanabiCard.prototype.setNote = function setNote(note) {
    notes.set(this.order, note);
    notes.update(this);
    notes.show(this);
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

const filterInPlace = (values, predicate) => {
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

},{"../../constants":3,"./cardDraw":13,"./globals":23,"./notes":31,"./replay":34}],12:[function(require,module,exports){
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

        if (globals.elements.playArea.isOver(pos)) {
            // We need to remove the card from the screen once the animation is finished
            // (otherwise, the card will be stuck in the in-game replay)
            globals.postAnimationLayout = () => {
                this.parent.doLayout();
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
            // The deck was dragged to an invalid location,
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
    Kinetic.Group.prototype.add.call(this, child);

    if (!(child instanceof LayoutChild)) {
        return;
    }

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
        if (child.parent === this) {
            child.remove();
        }
    };
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

},{"../../constants":3,"../../misc":54,"./globals":23,"./layoutChild":26,"./replay":34}],13:[function(require,module,exports){
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

},{"../../constants":3,"./globals":23}],14:[function(require,module,exports){
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

        if (globals.animateFast) {
            node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
            node.setY(0);
            node.setScaleX(scale);
            node.setScaleY(scale);
            node.setRotation(0);
            node.checkSetDraggable();
        } else {
            // Animate the card leaving the deck
            const card = node.children[0];
            card.tweening = true;
            node.tween = new Kinetic.Tween({
                node,
                duration: 0.5,
                x: x - (this.reverse ? scale * node.getWidth() : 0),
                y: 0,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                runonce: true,
                onFinish: () => {
                    card.tweening = false;
                    node.checkSetDraggable();
                    if (storedPostAnimationLayout !== null) {
                        storedPostAnimationLayout();
                    }
                },
            }).play();
        }

        x += (scale * node.getWidth() + dist) * (this.reverse ? -1 : 1);
    }
};

module.exports = CardLayout;

},{"./globals":23}],15:[function(require,module,exports){
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
    const lh = this.getHeight();

    const hideUnder = () => {
        const n = this.children.length;
        for (let i = 0; i < n; i++) {
            const node = this.children[i];

            if (!node.tween) {
                continue;
            }

            if (node.tween !== null) {
                return;
            }
        }
        for (let i = 0; i < n - 1; i++) {
            this.children[i].setVisible(false);
        }
        if (n > 0) {
            this.children[n - 1].setVisible(true);
        }
    };

    for (let i = 0; i < this.children.length; i++) {
        const node = this.children[i]; // This is a LayoutChild

        const scale = lh / node.getHeight();

        if (globals.animateFast) {
            node.setX(0);
            node.setY(0);
            node.setScaleX(scale);
            node.setScaleY(scale);
            node.setRotation(0);
            hideUnder();
        } else {
            // Animate the card leaving the hand to the play stacks
            const card = node.children[0];
            card.tweening = true;
            node.tween = new Kinetic.Tween({
                node,
                duration: 0.8,
                x: 0,
                y: 0,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                runonce: true,
                onFinish: () => {
                    card.tweening = false;
                    node.checkSetDraggable();
                    hideUnder();
                },
            }).play();
        }
    }
};

module.exports = CardStack;

},{"./globals":23}],16:[function(require,module,exports){
module.exports = function Clue(type, value) {
    this.type = type;
    this.value = value;
};

},{}],17:[function(require,module,exports){
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

},{"./fitText":22,"./globals":23,"./replay":34}],18:[function(require,module,exports){
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

},{"./globals":23}],19:[function(require,module,exports){
// Imports
const Button = require('./button');

const ClueRecipientButton = function ClueRecipientButton(config) {
    Button.call(this, config);
    this.targetIndex = config.targetIndex;
};

Kinetic.Util.extend(ClueRecipientButton, Button);

module.exports = ClueRecipientButton;

},{"./button":9}],20:[function(require,module,exports){
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

},{"./globals":23}],21:[function(require,module,exports){
/*
    These are helper functions that convert objects
*/

// Imports
const constants = require('../../constants');
const Clue = require('./clue');

// Convert a clue to the format used by the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
exports.clueToMsgClue = (clue, variant) => {
    const {
        type: clueType,
        value: clueValue,
    } = clue;
    let msgClueValue;
    if (clueType === constants.CLUE_TYPE.COLOR) {
        const clueColor = clueValue;
        msgClueValue = variant.clueColors.findIndex(color => color === clueColor);
    } else if (clueType === constants.CLUE_TYPE.RANK) {
        msgClueValue = clueValue;
    }
    return {
        type: clueType,
        value: msgClueValue,
    };
};

exports.msgClueToClue = (msgClue, variant) => {
    const {
        type: clueType,
        value: msgClueValue,
    } = msgClue;
    let clueValue;
    if (clueType === constants.CLUE_TYPE.COLOR) {
        clueValue = variant.clueColors[msgClueValue];
    } else if (clueType === constants.CLUE_TYPE.RANK) {
        clueValue = msgClueValue;
    }
    return new Clue(clueType, clueValue);
};

exports.msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit];

},{"../../constants":3,"./clue":16}],22:[function(require,module,exports){
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

},{}],23:[function(require,module,exports){
// This object contains global variables for the "ui.js" file
const globals = {};
// (they are initialized in the "globalsInit.js" file)
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals2 = globals;

},{}],24:[function(require,module,exports){
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
    globals.replay = false; // True if a solo or shared replay
    globals.sharedReplay = false;

    // Optional game settings
    // (sent in the "init" message in "websocket.js")
    globals.timed = false;
    globals.baseTime = null;
    globals.timePerTurn = null;
    globals.speedrun = false;
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
        background: null,
        card: null,
        UI: null,
        overtop: null, // A layer drawn overtop everything else
        text: null,
        timer: null,
    };
    globals.elements = {
        // The main screen
        stageFade: null,
        playArea: null,
        playStacks: new Map(),
        suitLabelTexts: [],
        discardArea: null,
        discardStacks: new Map(),
        playerHands: [],
        nameFrames: [],
        messagePrompt: null, // The truncated action log
        replayButton: null,
        chatButton: null,
        drawDeck: null,
        deckPlayAvailableLabel: null,

        // Extra elements on the right-hand side + the bottom
        clueLog: null,
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        noDiscardLabel: null,
        noDoubleDiscardLabel: null,
        scoreArea: null,
        turnNumberLabel: null,
        scoreNumberLabel: null,
        cluesNumberLabel: null,
        strikes: [],
        spectatorsLabel: null,
        spectatorsNumLabel: null,
        sharedReplayLeaderLabel: null,
        sharedReplayLeaderLabelPulse: null,

        // The clue UI
        clueArea: null,
        clueTargetButtonGroup: null,
        clueButtonGroup: null,
        rankClueButtons: null,
        suitClueButtons: null,
        giveClueButton: null,
        noClueBox: null,
        noClueLabel: null,

        // The replay screen
        replayArea: null,
        replayShuttleShared: null,
        replayExitButton: null,

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

},{"./globals":23}],25:[function(require,module,exports){
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

},{"../../constants":3,"./globals":23,"./notes":31,"./replay":34}],26:[function(require,module,exports){
// Imports
const globals = require('./globals');
const constants = require('../../constants');

const LayoutChild = function LayoutChild(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function add(child) {
    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on('widthChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        this.setWidth(event.newVal);
        if (this.parent) {
            this.parent.doLayout();
        }
    });

    child.on('heightChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        this.setHeight(event.newVal);
        if (this.parent) {
            this.parent.doLayout();
        }
    });
};

// The card sliding animation is finished, so make the card draggable
LayoutChild.prototype.checkSetDraggable = function checkSetDraggable() {
    // Cards should only be draggable in specific circumstances
    const card = this.children[0];
    if (
        // If it is not our turn, then the card does not need to be draggable yet
        // (unless we have the "Enable pre-playing cards" feature enabled)
        (!globals.ourTurn && !globals.lobby.settings.speedrunPreplay)
        || globals.speedrun // Cards should never be draggable while speedrunning
        || card.holder !== globals.playerUs // Only our cards should be draggable
        || card.isPlayed // Cards on the stacks should not be draggable
        || card.isDiscarded // Cards in the discard pile should not be draggable
        || globals.replay // Cards should not be draggable in solo or shared replays
        || globals.spectating // Cards should not be draggable if we are spectating an ongoing game
        // Cards should not be draggable if they are currently playing an animation
        // (this function will be called again upon the completion of the animation)
        || card.tweening
    ) {
        this.setDraggable(false);
        this.off('dragend.play');
        return;
    }

    this.setDraggable(true);
    this.on('dragend.play', this.dragendPlay);
};

LayoutChild.prototype.dragendPlay = function dragendPlay() {
    const pos = this.getAbsolutePosition();

    pos.x += this.getWidth() * this.getScaleX() / 2;
    pos.y += this.getHeight() * this.getScaleY() / 2;

    let draggedTo = null;
    if (globals.elements.playArea.isOver(pos)) {
        draggedTo = 'playArea';
    } else if (globals.elements.discardArea.isOver(pos) && globals.clues !== 8) {
        draggedTo = 'discardArea';
    }
    if (draggedTo === null) {
        // The card was dragged to an invalid location; tween it back to the hand
        globals.elements.playerHands[globals.playerUs].doLayout();
        return;
    }

    globals.lobby.ui.endTurn({
        type: 'action',
        data: {
            type: (draggedTo === 'playArea' ? constants.ACT.PLAY : constants.ACT.DISCARD),
            target: this.children[0].order,
        },
    });
    this.setDraggable(false);

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.off('dragend.play');
};

module.exports = LayoutChild;

},{"../../constants":3,"./globals":23}],27:[function(require,module,exports){
const Loader = function Loader(finishedCallback) {
    this.finishedCallback = finishedCallback;

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
    const total = Object.keys(this.filemap).length;

    this.map = {};
    this.numLoaded = 0;

    for (const name of Object.keys(this.filemap)) {
        const img = new Image();

        this.map[name] = img;

        img.onload = () => {
            this.numLoaded += 1;

            this.progress(this.numLoaded, total);

            if (this.numLoaded === total) {
                this.finishedCallback();
            }
        };

        img.src = this.filemap[name];
    }

    this.progress(0, total);
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

},{}],28:[function(require,module,exports){
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

},{"./globals":23,"./multiFitText":29}],29:[function(require,module,exports){
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

},{"./fitText":22,"./globals":23}],30:[function(require,module,exports){
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

},{"../../constants":3,"./globals":23}],31:[function(require,module,exports){
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

},{"./globals":23}],32:[function(require,module,exports){
/*
    "notify" WebSocket commands communicate a change in the game state
*/

// Imports
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const HanabiCard = require('./card');
const HanabiClueEntry = require('./clueEntry');
const LayoutChild = require('./layoutChild');
const replay = require('./replay');
const stats = require('./stats');
const timer = require('./timer');

// Define a command handler map
const commands = {};

commands.clue = (data) => {
    globals.cluesSpentPlusStrikes += 1;
    stats.updateEfficiency(0);

    const clue = convert.msgClueToClue(data.clue, globals.variant);
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
            color = constants.INDICATOR.POSITIVE;
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
    if (data.clue.type === constants.CLUE_TYPE.RANK) {
        clueName = clue.value.toString();
    } else {
        clueName = clue.value.name;
    }

    const entry = new HanabiClueEntry({
        width: globals.elements.clueLog.getWidth(),
        height: 0.017 * globals.stage.getHeight(),
        giver: globals.playerNames[data.giver],
        target: globals.playerNames[data.target],
        clueName,
        list: data.list,
        neglist,
        turn: data.turn,
    });

    globals.elements.clueLog.add(entry);

    globals.elements.clueLog.checkExpiry();
};

// At the end of a game, the server sends a list that reveals what the entire deck is
commands.deckOrder = () => {
    // TODO
};

commands.discard = (data) => {
    revealCard(data);

    // Local variables
    const suit = convert.msgSuitToSuit(data.which.suit, globals.variant);
    const card = globals.deck[data.which.order];
    const child = card.parent; // This is the LayoutChild

    card.isDiscarded = true;
    card.turnDiscarded = globals.turn - 1;

    globals.elements.discardStacks.get(suit).add(child);

    // Make sure that the card is on top of the play stacks ??? TODO CHECK TO SEE IF THIS IS TRUE
    for (const discardStack of globals.elements.discardStacks) {
        if (discardStack[1]) {
            discardStack[1].moveToTop();
        }
    }

    // Put the discard pile in order from 1 to 5
    // (this is commented out so that we can instead see the order in which things are discarded)
    /*
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
    */

    if (card.isClued()) {
        stats.updateEfficiency(-1);
        card.hideClues(); // This must be after the efficiency update
    }
};

// A player just drew a card from the deck
commands.draw = (data) => {
    if (data.suit === -1) {
        delete data.suit;
    }
    if (data.rank === -1) {
        delete data.rank;
    }
    const suit = convert.msgSuitToSuit(data.suit, globals.variant);
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

    const scale = globals.elements.drawDeck.cardback.getWidth() / constants.CARDW;
    child.setScale({
        x: scale,
        y: scale,
    });

    globals.elements.playerHands[data.who].add(child);
    globals.elements.playerHands[data.who].moveToTop();
};

// After a card is drawn, the server tells us how many cards are left in the deck
commands.drawSize = (data) => {
    globals.deckSize = data.size;
    globals.elements.drawDeck.setCount(data.size);
};

commands.gameOver = () => {
    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.nameFrames[i].off('mousemove');
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
        globals.elements.replayButton.hide();
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
};

// A new line of text has appeared in the action log
commands.text = (data) => {
    globals.elements.msgLogGroup.addMessage(data.text);

    globals.elements.messagePrompt.setMultiText(data.text);
    if (!globals.animateFast) {
        globals.layers.UI.draw();
        globals.layers.overtop.draw();
    }
};

commands.play = (data) => {
    revealCard(data);

    // Local variables
    const suit = convert.msgSuitToSuit(data.which.suit, globals.variant);
    const card = globals.deck[data.which.order];
    const child = card.parent; // This is the LayoutChild

    card.isPlayed = true;
    card.turnPlayed = globals.turn - 1;

    globals.elements.playStacks.get(suit).add(child);
    globals.elements.playStacks.get(suit).moveToTop();

    if (card.isClued()) {
        card.hideClues();
    } else {
        stats.updateEfficiency(1);
    }
};

commands.reorder = (data) => {
    const hand = globals.elements.playerHands[data.target];

    // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
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
};

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
commands.reveal = (data) => {
    // Local variables
    const suit = convert.msgSuitToSuit(data.which.suit, globals.variant);
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
};

commands.stackDirections = (data) => {
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
            globals.elements.suitLabelTexts[i].setText(text);
            globals.layers.text.draw();
        }
    }
};

commands.status = (data) => {
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
    globals.elements.cluesNumberLabel.setText(globals.clues.toString());
    if (globals.clues < 1 || globals.clues === 8) {
        globals.elements.cluesNumberLabel.setFill('#df1c2d'); // Red
    } else if (globals.clues >= 1 && globals.clues < 2) {
        globals.elements.cluesNumberLabel.setFill('#ef8c1d'); // Orange
    } else if (globals.clues >= 2 && globals.clues < 3) {
        globals.elements.cluesNumberLabel.setFill('#efef1d'); // Yellow
    } else {
        globals.elements.cluesNumberLabel.setFill('#d8d5ef'); // White
    }

    if (globals.clues === 8) {
        // Show the red border around the discard pile
        // (to reinforce the fact that being at 8 clues is a special situation)
        globals.elements.noDiscardLabel.show();
        globals.elements.noDoubleDiscardLabel.hide();
    } else if (data.doubleDiscard) {
        // Show a yellow border around the discard pile
        // (to reinforce that this is a "Double Discard" situation)
        globals.elements.noDiscardLabel.hide();
        globals.elements.noDoubleDiscardLabel.show();
    } else {
        globals.elements.noDiscardLabel.hide();
        globals.elements.noDoubleDiscardLabel.hide();
    }

    // Update the score (in the bottom-right-hand corner)
    globals.elements.scoreNumberLabel.setText(globals.score);

    // Update the stats on the middle-left-hand side of the screen
    stats.updatePace();
    stats.updateEfficiency(0);

    if (!globals.animateFast) {
        globals.layers.UI.draw();
    }
};

commands.strike = (data) => {
    globals.cluesSpentPlusStrikes += 1;
    stats.updateEfficiency(0);

    const x = new Kinetic.Image({
        x: (0.015 + 0.04 * (data.num - 1)) * globals.stage.getWidth(),
        y: 0.125 * globals.stage.getHeight(),
        width: 0.02 * globals.stage.getWidth(),
        height: 0.036 * globals.stage.getHeight(),
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

    globals.elements.scoreArea.add(x);
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
};

commands.turn = (data) => {
    // Store the current turn in memory
    globals.turn = data.num;

    // Keep track of whether or not it is our turn (speedrun)
    globals.ourTurn = (data.who === globals.playerUs);
    if (!globals.ourTurn) {
        // Adding this here to avoid bugs with pre-moves
        globals.elements.clueArea.hide();
    }

    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.nameFrames[i].setActive(data.who === i);
    }

    if (!globals.animateFast) {
        globals.layers.UI.draw();
    }

    globals.elements.turnNumberLabel.setText(`${globals.turn + 1}`);
};

const revealCard = (data) => {
    // Local variables
    const suit = convert.msgSuitToSuit(data.which.suit, globals.variant);
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
    card.setBareImage();

    globals.elements.clueLog.checkExpiry();
};

module.exports = commands;

},{"../../constants":3,"./card":11,"./clueEntry":17,"./convert":21,"./globals":23,"./layoutChild":26,"./replay":34,"./stats":35,"./timer":36}],33:[function(require,module,exports){
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

},{}],34:[function(require,module,exports){
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
        reset();
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
        globals.lobby.ui.handleNotify(msg);

        // Stop if you're at the current turn
        if (msg.type === 'turn' && msg.num === globals.replayTurn) {
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

const reset = function reset() {
    globals.elements.messagePrompt.setMultiText('');
    globals.elements.msgLogGroup.reset();

    const { suits } = globals.variant;

    for (const suit of suits) {
        globals.elements.playStacks.get(suit).removeChildren();
        globals.elements.discardStacks.get(suit).removeChildren();
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

},{"../../constants":3,"./globals":23,"./timer":36}],35:[function(require,module,exports){
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

},{"./globals":23}],36:[function(require,module,exports){
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

},{"./globals":23}],37:[function(require,module,exports){
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

},{"./button":9}],38:[function(require,module,exports){
// Imports
const buildUI = require('./buildUI');
const cardDraw = require('./cardDraw');
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const globalsInit = require('./globalsInit');
const Loader = require('./loader');
const keyboard = require('./keyboard');
const notes = require('./notes');
const notify = require('./notify');
const timer = require('./timer');
const websocket = require('./websocket');

function HanabiUI(lobby, game) {
    // Since the "HanabiUI" object is being reinstantiated,
    // we need to explicitly reinitialize all varaibles (or else they will retain their old values)
    globalsInit();
    cardDraw.init();
    // (the keyboard functions can only be initialized once the clue buttons are drawn)
    notes.init();
    timer.init();

    // Store references to the parent objects for later use
    globals.lobby = lobby; // This is the "globals.js" in the root of the "src" directory
    // It we name it "lobby" here to distinguish it from the UI globals;
    // after more refactoring, we will eventually merge these objects to make it less confusing
    globals.game = game; // This is the "game.js" in the root of the "game" directory
    // We should also combine this with the UI object in the future

    // Initialize the stage and show the loading screen
    this.initStage();
    globals.ImageLoader = new Loader(this.finishedLoadingImages);
    this.showLoadingScreen();
}

HanabiUI.prototype.initStage = function initStage() {
    // Initialize and size the stage depending on the window size
    globals.stage = new Kinetic.Stage({
        container: 'game',
    });
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
    globals.stage.setWidth(cw);
    globals.stage.setHeight(ch);
};

HanabiUI.prototype.showLoadingScreen = function showLoadingScreen() {
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

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
};

HanabiUI.prototype.finishedLoadingImages = function finishedLoadingImages() {
    // Build images for every card (with respect to the variant that we are playing)
    cardDraw.buildCards();

    // Draw the user interface
    buildUI();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    keyboard.init();

    // Tell the server that we are finished loading
    globals.ready = true;
    globals.lobby.conn.send('ready');
};

HanabiUI.prototype.endTurn = function endTurn(action) {
    if (globals.ourTurn) {
        globals.ourTurn = false;
        globals.lobby.conn.send(action.type, action.data);
        globals.lobby.ui.stopAction();
        globals.savedAction = null;
    } else {
        globals.queuedAction = action;
    }
};

HanabiUI.prototype.handleAction = function handleAction(data) {
    globals.savedAction = data;

    if (globals.inReplay) {
        return;
    }

    if (data.canClue) {
        // Show the clue UI
        globals.elements.clueArea.show();
    } else {
        globals.elements.noClueBox.show();
        globals.elements.noClueLabel.show();
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
    if (
        // This is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable
        !globals.lobby.settings.speedrunPreplay
        // This is unnecessary if this a speedrun,
        // as clicking on cards takes priority over dragging cards
        && !globals.speedrun
    ) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const child of ourHand.children) {
            child.checkSetDraggable();
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
                && clueButton.clue.type === constants.CLUE_TYPE.COLOR)
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

HanabiUI.prototype.stopAction = function stopAction() {
    globals.elements.clueArea.hide();
    globals.elements.noClueBox.hide();
    globals.elements.noClueLabel.hide();
    globals.elements.noDiscardLabel.hide();
    globals.elements.noDoubleDiscardLabel.hide();

    globals.lobby.ui.showClueMatch(-1);
    globals.elements.clueTargetButtonGroup.off('change');
    globals.elements.clueButtonGroup.off('change');

    // Make all of the cards in our hand not draggable
    // (but we need to keep them draggable if the pre-play setting is enabled)
    if (!globals.lobby.settings.speedrunPreplay) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const child of ourHand.children) {
            // This is a LayoutChild
            child.off('dragend.play');
            child.setDraggable(false);
        }
    }

    globals.elements.drawDeck.cardback.setDraggable(false);
    globals.elements.deckPlayAvailableLabel.setVisible(false);
};

HanabiUI.prototype.showClueMatch = function showClueMatch(target, clue) {
    // Hide all of the existing arrows on the cards
    for (let i = 0; i < globals.deck.length; i++) {
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
        if (clue.type === constants.CLUE_TYPE.RANK) {
            if (
                clue.value === card.trueRank
                || (globals.variant.name.startsWith('Multi-Fives') && card.trueRank === 5)
            ) {
                touched = true;
                color = constants.INDICATOR.POSITIVE;
            }
        } else if (clue.type === constants.CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            if (
                card.trueSuit === constants.SUIT.RAINBOW
                || card.trueSuit === constants.SUIT.RAINBOW1OE
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

HanabiUI.prototype.giveClue = function giveClue() {
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
    globals.lobby.ui.endTurn({
        type: 'action',
        data: {
            type: constants.ACT.CLUE,
            target: target.targetIndex,
            clue: convert.clueToMsgClue(clueButton.clue, globals.variant),
        },
    });
};

HanabiUI.prototype.handleWebsocket = function handleWebsocket(command, data) {
    if (Object.prototype.hasOwnProperty.call(websocket, command)) {
        websocket[command](data);
    } else {
        console.error(`A WebSocket function for the "${command}" is not defined.`);
    }
};

HanabiUI.prototype.handleNotify = function handleNotify(data) {
    // If a user is editing a note and an action in the game happens,
    // mark to make the tooltip go away as soon as they are finished editing the note
    if (notes.vars.editing !== null) {
        notes.vars.actionOccured = true;
    }

    // Automatically disable any tooltips once an action in the game happens
    if (globals.activeHover) {
        globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.activeHover = null;
    }

    const { type } = data;
    if (Object.prototype.hasOwnProperty.call(notify, type)) {
        notify[type](data);
    } else {
        console.error(`A WebSocket notify function for the "${type}" is not defined.`);
    }
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

HanabiUI.prototype.destroy = function destroy() {
    keyboard.destroy();
    timer.stop();
    globals.stage.destroy();
    // window.removeEventListener('resize', resizeCanvas, false);
};

// Expose the globals to functions in the "game" directory
HanabiUI.prototype.globals = globals;

module.exports = HanabiUI;

},{"../../constants":3,"./buildUI":8,"./cardDraw":13,"./convert":21,"./globals":23,"./globalsInit":24,"./keyboard":25,"./loader":27,"./notes":31,"./notify":32,"./timer":36,"./websocket":39}],39:[function(require,module,exports){
/*
    We will receive WebSocket messages / commands from the server that tell us to do things
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const notes = require('./notes');
const notify = require('./notify');
const replay = require('./replay');
const timer = require('./timer');

// Define a command handler map
const commands = {};

commands.action = (data) => {
    globals.lastAction = data;
    globals.lobby.ui.handleAction.call(this, data);

    if (globals.animateFast) {
        return;
    }

    if (globals.lobby.settings.sendTurnNotify) {
        globals.lobby.sendNotify('It\'s your turn', 'turn');
    }

    // Handle pre-playing / pre-discarding / pre-cluing
    if (globals.queuedAction !== null) {
        // Prevent pre-cluing if the team is now at 0 clues
        if (globals.queuedAction.data.type === constants.ACT.CLUE && globals.clues === 0) {
            return;
        }

        // Prevent discarding if the team is now at 8 clues
        if (globals.queuedAction.data.type === constants.ACT.DISCARD && globals.clues === 8) {
            return;
        }

        // We don't want to send the queued action right away, or else it introduces bugs
        setTimeout(() => {
            globals.lobby.conn.send(globals.queuedAction.type, globals.queuedAction.data);
            globals.lobby.ui.stopAction();
            globals.queuedAction = null;
        }, 250);
    }
};

// This is sent to the client upon game initialization (in the "commandReady.go" file)
commands.advanced = () => {
    globals.animateFast = false;

    if (globals.inReplay) {
        replay.goto(0);
    }

    globals.layers.card.draw();
    globals.layers.UI.draw(); // We need to re-draw the UI or else the action text will not appear
};

// This is sent by the server to force the client to go back to the lobby
commands.boot = () => {
    timer.stop();
    globals.game.hide();
};

// Update the clocks to show how much time people are taking
// or how much time people have left
commands.clock = (data) => {
    timer.update(data);
};

commands.connected = (data) => {
    if (!globals.ready) {
        return;
    }

    for (let i = 0; i < data.list.length; i++) {
        globals.elements.nameFrames[i].setConnected(data.list[i]);
    }

    globals.layers.UI.draw();
};

commands.init = (data) => {
    // Game settings
    globals.playerNames = data.names;
    globals.variant = constants.VARIANTS[data.variant];
    globals.playerUs = data.seat;
    globals.spectating = data.spectating;
    globals.replay = data.replay;
    globals.sharedReplay = data.sharedReplay;

    // Optional settings
    globals.timed = data.timed;
    globals.baseTime = data.baseTime;
    globals.timePerTurn = data.timePerTurn;
    globals.speedrun = data.speedrun;
    globals.deckPlays = data.deckPlays;
    globals.emptyClues = data.emptyClues;
    globals.characterAssignments = data.characterAssignments;
    globals.characterMetadata = data.characterMetadata;

    globals.inReplay = globals.replay;
    if (globals.replay) {
        globals.replayTurn = -1;
    }

    // Begin to load all of the card images
    globals.ImageLoader.start();
};

// Used when the game state changes
commands.notify = (data) => {
    // We need to save this game state change for the purposes of the in-game replay
    globals.replayLog.push(data);
    if (data.type === 'turn') {
        globals.replayMax = data.num;
    }
    if (data.type === 'gameOver') {
        globals.replayMax += 1;
    }
    if (!globals.replay && globals.replayMax > 0) {
        globals.elements.replayButton.show();
    }
    if (globals.inReplay) {
        replay.adjustShuttles();
        globals.layers.UI.draw();
    }

    // Now that it is recorded, change the actual active game state
    // (unless we are in an in-game replay)
    if (!globals.inReplay || data.type === 'reveal') {
        globals.lobby.ui.handleNotify(data);
    }
};

/*
    Recieved by the client when spectating a game
    Has the following data:
    {
        order: 16,
        note: '<strong>Zamiel:</strong> note1<br /><strong>Duneaught:</strong> note2<br />',
    }
*/
commands.note = (data) => {
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
commands.notes = (data) => {
    for (let order = 0; order < data.notes.length; order++) {
        const note = data.notes[order];

        // Set the note
        notes.set(order, note, false);

        // The following code is mosly copied from the "command.note()" function
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

commands.notifyList = (dataList) => {
    for (const data of dataList) {
        commands.notify(data);
    }
};

// This is used in shared replays to highlight a specific card
commands.replayIndicator = (data) => {
    if (globals.sharedReplayLeader === globals.lobby.username) {
        // We don't have to draw any indicator arrows;
        // we already did it manually immediately after sending the "replayAction" message
        return;
    }

    // Ensure that the card exists as a sanity-check
    const card = globals.deck[data.order];
    if (!card) {
        return;
    }

    card.toggleSharedReplayIndicator();
};

// This is used in shared replays to specify who the leader is
commands.replayLeader = (data) => {
    // We might be entering this function after a game just ended
    globals.sharedReplay = true;
    globals.elements.replayExitButton.hide();

    // Update the stored replay leader
    globals.sharedReplayLeader = data.name;

    // Update the UI
    globals.elements.sharedReplayLeaderLabel.show();
    let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
    if (!globals.spectators.includes(globals.sharedReplayLeader)) {
        // Check to see if the leader is away
        content += ' (away)';
    }
    $('#tooltip-leader').tooltipster('instance').content(content);

    globals.elements.sharedReplayLeaderLabelPulse.play();

    globals.elements.toggleSharedTurnButton.show();
    globals.layers.UI.draw();
};

// This is used in shared replays to make hypothetical game states
commands.replayMorph = (data) => {
    notify.reveal({
        which: {
            order: data.order,
            rank: data.rank,
            suit: data.suit,
        },
    });
};

// This is used in shared replays to make fun sounds
commands.replaySound = (data) => {
    if (globals.sharedReplayLeader === globals.lobby.username) {
        // We don't have to play anything;
        // we already did it manually after sending the "replayAction" message
        return;
    }

    globals.game.sounds.play(data.sound);
};

// This is used in shared replays to change the turn
commands.replayTurn = (data) => {
    globals.sharedReplayTurn = data.turn;
    replay.adjustShuttles();
    if (globals.useSharedTurns) {
        replay.goto(globals.sharedReplayTurn);
    } else {
        globals.elements.replayShuttleShared.getLayer().batchDraw();
    }
};

// This is used to update the names of the people currently spectating the game
commands.spectators = (data) => {
    if (!globals.elements.spectatorsLabel) {
        // Sometimes we can get here without the spectators label being initiated yet
        return;
    }

    // Remember the current list of spectators
    globals.spectators = data.names;

    const shouldShowLabel = data.names.length > 0;
    globals.elements.spectatorsLabel.setVisible(shouldShowLabel);
    globals.elements.spectatorsNumLabel.setVisible(shouldShowLabel);
    if (shouldShowLabel) {
        globals.elements.spectatorsNumLabel.setText(data.names.length);

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

module.exports = commands;

},{"../../constants":3,"./globals":23,"./notes":31,"./notify":32,"./replay":34,"./timer":36}],40:[function(require,module,exports){
/*
    WebSocket command handlers for in-game events
*/

// Imports
const globals = require('../globals');

const gameCommands = [
    'action',
    'advanced',
    'boot',
    'clock',
    'connected',
    'init',
    'note',
    'notes',
    'notifyList',
    'notify',
    'replayIndicator',
    'replayLeader',
    'replayMorph',
    'replaySound',
    'replayTurn',
    'spectators',
];

exports.init = () => {
    for (const command of gameCommands) {
        globals.conn.on(command, (data) => {
            if (globals.currentScreen === 'game' && globals.ui !== null) {
                globals.ui.handleWebsocket(command, data);
            }
        });
    }
};

},{"../globals":41}],41:[function(require,module,exports){
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

},{}],42:[function(require,module,exports){
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
    $('#create-game-speedrun').change(() => {
        if ($('#create-game-speedrun').prop('checked')) {
            $('#create-game-timed-row').hide();
            $('#create-game-timed-row-spacing').hide();
        } else {
            $('#create-game-timed-row').show();
            $('#create-game-timed-row-spacing').show();
        }
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
    localStorage.setItem('createTableBaseTimeMinutes', baseTimeMinutes);

    const timePerTurnSeconds = $('#time-per-turn-seconds').val();
    localStorage.setItem('createTableTimePerTurnSeconds', timePerTurnSeconds);

    const speedrun = document.getElementById('create-game-speedrun').checked;
    localStorage.setItem('createTableSpeedrun', speedrun);

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
        speedrun,
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

    // Fill in the "Speedrun" checkbox
    let speedrun;
    try {
        speedrun = JSON.parse(localStorage.getItem('speedrun'));
    } catch (err) {
        speedrun = false;
    }
    if (typeof speedrun !== 'boolean') {
        speedrun = false;
    }
    $('#create-game-speedrun').prop('checked', speedrun);
    $('#create-game-speedrun').change();

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

},{"../constants":3,"../globals":41,"../misc":54}],43:[function(require,module,exports){
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

},{"../constants":3,"../globals":41,"./main":46}],44:[function(require,module,exports){
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

},{"../globals":41}],45:[function(require,module,exports){
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

},{"../globals":41,"../websocket":57,"./main":46}],46:[function(require,module,exports){
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

},{"./createGame":42,"./history":43,"./keyboard":44,"./login":45,"./nav":47,"./pregame":48,"./settings":49,"./tables":50,"./tutorial":51,"./users":52}],47:[function(require,module,exports){
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

},{"../globals":41,"../misc":54,"../modals":55,"./main":46}],48:[function(require,module,exports){
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

    // Scroll to the bottom of both the lobby chat and the pregame chat
    // (even if the lobby chat is already at the bottom, it will change size and cause it to not
    // be scrolled all the way down)
    const chat1 = document.getElementById('lobby-chat-text');
    chat1.scrollTop = chat1.scrollHeight;
    const chat2 = document.getElementById('lobby-chat-pregame-text');
    chat2.scrollTop = chat2.scrollHeight;

    // Focus the pregame chat
    $('#lobby-chat-pregame-input').focus();

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

},{"../constants":3,"../globals":41,"../misc":54,"./main":46}],49:[function(require,module,exports){
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

},{"../globals":41,"../notifications":56}],50:[function(require,module,exports){
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

},{"../globals":41,"../misc":54,"../modals":55,"./main":46}],51:[function(require,module,exports){
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

},{"../globals":41,"./login":45}],52:[function(require,module,exports){
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

},{"../globals":41}],53:[function(require,module,exports){
/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports
// (allowing the client code to be split up into multiple files)
require('./game/main');
require('./lobby/main');
require('./modals');

},{"./game/main":5,"./lobby/main":46,"./modals":55}],54:[function(require,module,exports){
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

},{}],55:[function(require,module,exports){
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

},{"./game/main":5,"./globals":41,"./lobby/main":46,"./misc":54}],56:[function(require,module,exports){
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

},{}],57:[function(require,module,exports){
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
        $('#nav-buttons-history-total-games').html(globals.totalGames);
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
        chat.add(data, false); // The second argument is "fast"
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
            chat.add(line, true); // The second argument is "fast"
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
            }
        }

        // The server sent us more games because
        // we clicked on the "Show More History" button
        if (globals.historyClicked) {
            globals.historyClicked = false;
            lobby.history.draw();
        }

        const shownGames = Object.keys(globals.historyList).length;
        $('#nav-buttons-history-shown-games').html(shownGames);
        $('#nav-buttons-history-total-games').html(globals.totalGames);
        if (shownGames === globals.totalGames) {
            $('#lobby-history-show-more').hide();
        }
    });

    globals.conn.on('historyDetail', (data) => {
        globals.historyDetailList.push(data);
        lobby.history.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.settings.sendTurnSound && globals.currentScreen === 'game') {
            game.sounds.play(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('warning', (data) => {
        console.warn(data.warning);
        modals.warningShow(data.warning);
    });

    globals.conn.on('error', (data) => {
        console.error(data.error);
        modals.errorShow(data.error);

        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }
    });

    // There are yet more command handlers for events that happen in-game
    // These will only have an effect if the current screen is equal to "game"
    game.websocket.init();
};

},{"../lib/golem":1,"./chat":2,"./game/main":5,"./globals":41,"./lobby/main":46,"./modals":55}]},{},[53])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJwdWJsaWMvanMvbGliL2dvbGVtLmpzIiwicHVibGljL2pzL3NyYy9jaGF0LmpzIiwicHVibGljL2pzL3NyYy9jb25zdGFudHMuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvY2hhdC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS9tYWluLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3NvdW5kcy5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS90b29sdGlwcy5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9idWlsZFVJLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2J1dHRvbi5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9idXR0b25Hcm91cC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9jYXJkLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2NhcmREZWNrLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2NhcmREcmF3LmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2NhcmRMYXlvdXQuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvY2FyZFN0YWNrLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2NsdWUuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvY2x1ZUVudHJ5LmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2NsdWVMb2cuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvY2x1ZVJlY2lwaWVudEJ1dHRvbi5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9jb2xvckJ1dHRvbi5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9jb252ZXJ0LmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL2ZpdFRleHQuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvZ2xvYmFscy5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9nbG9iYWxzSW5pdC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9rZXlib2FyZC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9sYXlvdXRDaGlsZC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9sb2FkZXIuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvbXNnTG9nLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL211bHRpRml0VGV4dC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9uYW1lRnJhbWUuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvbm90ZXMuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvbm90aWZ5LmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL251bWJlckJ1dHRvbi5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS91aS9yZXBsYXkuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvc3RhdHMuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvdGltZXIuanMiLCJwdWJsaWMvanMvc3JjL2dhbWUvdWkvdG9nZ2xlQnV0dG9uLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL3VpLmpzIiwicHVibGljL2pzL3NyYy9nYW1lL3VpL3dlYnNvY2tldC5qcyIsInB1YmxpYy9qcy9zcmMvZ2FtZS93ZWJzb2NrZXQuanMiLCJwdWJsaWMvanMvc3JjL2dsb2JhbHMuanMiLCJwdWJsaWMvanMvc3JjL2xvYmJ5L2NyZWF0ZUdhbWUuanMiLCJwdWJsaWMvanMvc3JjL2xvYmJ5L2hpc3RvcnkuanMiLCJwdWJsaWMvanMvc3JjL2xvYmJ5L2tleWJvYXJkLmpzIiwicHVibGljL2pzL3NyYy9sb2JieS9sb2dpbi5qcyIsInB1YmxpYy9qcy9zcmMvbG9iYnkvbWFpbi5qcyIsInB1YmxpYy9qcy9zcmMvbG9iYnkvbmF2LmpzIiwicHVibGljL2pzL3NyYy9sb2JieS9wcmVnYW1lLmpzIiwicHVibGljL2pzL3NyYy9sb2JieS9zZXR0aW5ncy5qcyIsInB1YmxpYy9qcy9zcmMvbG9iYnkvdGFibGVzLmpzIiwicHVibGljL2pzL3NyYy9sb2JieS90dXRvcmlhbC5qcyIsInB1YmxpYy9qcy9zcmMvbG9iYnkvdXNlcnMuanMiLCJwdWJsaWMvanMvc3JjL21haW4uanMiLCJwdWJsaWMvanMvc3JjL21pc2MuanMiLCJwdWJsaWMvanMvc3JjL21vZGFscy5qcyIsInB1YmxpYy9qcy9zcmMvbm90aWZpY2F0aW9ucy5qcyIsInB1YmxpYy9qcy9zcmMvd2Vic29ja2V0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4M0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3IvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqMEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxuICAgQ29weXJpZ2h0IDIwMTMgTmlrbGFzIFZvc3NcblxuICAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuICAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG5cbmNvbnN0IHNlcGFyYXRvciA9ICcgJztcbmNvbnN0IERlZmF1bHRKU09OUHJvdG9jb2wgPSB7XG4gICAgdW5wYWNrOiAoZGF0YSkgPT4ge1xuICAgICAgICBjb25zdCBuYW1lID0gZGF0YS5zcGxpdChzZXBhcmF0b3IpWzBdO1xuICAgICAgICByZXR1cm4gW25hbWUsIGRhdGEuc3Vic3RyaW5nKG5hbWUubGVuZ3RoICsgMSwgZGF0YS5sZW5ndGgpXTtcbiAgICB9LFxuICAgIHVubWFyc2hhbDogZGF0YSA9PiBKU09OLnBhcnNlKGRhdGEpLFxuICAgIG1hcnNoYWxBbmRQYWNrOiAobmFtZSwgZGF0YSkgPT4gbmFtZSArIHNlcGFyYXRvciArIEpTT04uc3RyaW5naWZ5KGRhdGEpLFxufTtcblxuY29uc3QgQ29ubmVjdGlvbiA9IGZ1bmN0aW9uIENvbm5lY3Rpb24oYWRkciwgZGVidWcpIHtcbiAgICB0aGlzLndzID0gbmV3IFdlYlNvY2tldChhZGRyKTtcbiAgICB0aGlzLmNhbGxiYWNrcyA9IHt9O1xuICAgIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgICB0aGlzLndzLm9uY2xvc2UgPSB0aGlzLm9uQ2xvc2UuYmluZCh0aGlzKTtcbiAgICB0aGlzLndzLm9ub3BlbiA9IHRoaXMub25PcGVuLmJpbmQodGhpcyk7XG4gICAgdGhpcy53cy5vbm1lc3NhZ2UgPSB0aGlzLm9uTWVzc2FnZS5iaW5kKHRoaXMpO1xuICAgIHRoaXMud3Mub25lcnJvciA9IHRoaXMub25FcnJvci5iaW5kKHRoaXMpO1xufTtcbkNvbm5lY3Rpb24ucHJvdG90eXBlID0ge1xuICAgIGNvbnN0cnVjdG9yOiBDb25uZWN0aW9uLFxuICAgIHByb3RvY29sOiBEZWZhdWx0SlNPTlByb3RvY29sLFxuICAgIHNldFByb3RvY29sOiBmdW5jdGlvbiBzZXRQcm90b2NvbChwcm90b2NvbCkge1xuICAgICAgICB0aGlzLnByb3RvY29sID0gcHJvdG9jb2w7XG4gICAgfSxcbiAgICBlbmFibGVCaW5hcnk6IGZ1bmN0aW9uIGVuYWJsZUJpbmFyeSgpIHtcbiAgICAgICAgdGhpcy53cy5iaW5hcnlUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgICB9LFxuICAgIG9uQ2xvc2U6IGZ1bmN0aW9uIG9uQ2xvc2UoZXZ0KSB7XG4gICAgICAgIGlmICh0aGlzLmNhbGxiYWNrcy5jbG9zZSkge1xuICAgICAgICAgICAgdGhpcy5jYWxsYmFja3MuY2xvc2UoZXZ0KTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgb25NZXNzYWdlOiBmdW5jdGlvbiBvbk1lc3NhZ2UoZXZ0KSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnByb3RvY29sLnVucGFjayhldnQuZGF0YSk7XG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSBkYXRhWzBdO1xuICAgICAgICBpZiAodGhpcy5jYWxsYmFja3NbY29tbWFuZF0pIHtcbiAgICAgICAgICAgIGNvbnN0IG9iaiA9IHRoaXMucHJvdG9jb2wudW5tYXJzaGFsKGRhdGFbMV0pO1xuICAgICAgICAgICAgaWYgKHRoaXMuZGVidWcpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgJWNSZWNlaXZlZCAke2NvbW1hbmR9OmAsICdjb2xvcjogYmx1ZTsnKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhvYmopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYWxsYmFja3NbY29tbWFuZF0ob2JqKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdSZWNpZXZlZCBXZWJTb2NrZXQgbWVzc2FnZSB3aXRoIG5vIGNhbGxiYWNrOicsIGNvbW1hbmQsIEpTT04ucGFyc2UoZGF0YVsxXSkpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBvbk9wZW46IGZ1bmN0aW9uIG9uT3BlbihldnQpIHtcbiAgICAgICAgaWYgKHRoaXMuY2FsbGJhY2tzLm9wZW4pIHtcbiAgICAgICAgICAgIHRoaXMuY2FsbGJhY2tzLm9wZW4oZXZ0KTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgb246IGZ1bmN0aW9uIG9uKG5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuY2FsbGJhY2tzW25hbWVdID0gY2FsbGJhY2s7XG4gICAgfSxcbiAgICBlbWl0OiBmdW5jdGlvbiBlbWl0KG5hbWUsIGRhdGEpIHtcbiAgICAgICAgdGhpcy53cy5zZW5kKHRoaXMucHJvdG9jb2wubWFyc2hhbEFuZFBhY2sobmFtZSwgZGF0YSkpO1xuICAgIH0sXG5cbiAgICAvLyBBZGRlZCBleHRyYSBoYW5kbGVycyBiZXlvbmQgd2hhdCB0aGUgdmFuaWxsYSBHb2xlbSBjb2RlIHByb3ZpZGVzXG4gICAgb25FcnJvcjogZnVuY3Rpb24gb25FcnJvcihldnQpIHtcbiAgICAgICAgaWYgKHRoaXMuY2FsbGJhY2tzLnNvY2tldEVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLmNhbGxiYWNrcy5zb2NrZXRFcnJvcihldnQpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBjbG9zZTogZnVuY3Rpb24gY2xvc2UoKSB7XG4gICAgICAgIHRoaXMud3MuY2xvc2UoKTtcbiAgICB9LFxufTtcbmV4cG9ydHMuQ29ubmVjdGlvbiA9IENvbm5lY3Rpb247XG4iLCIvKlxuICAgIFVzZXJzIGNhbiBjaGF0IGluIHRoZSBsb2JieSwgaW4gdGhlIHByZWdhbWUsIGFuZCBpbiBhIGdhbWVcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuLy8gVmFyaWFibGVzXG5sZXQgY2hhdExpbmVOdW0gPSAxO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgY29uc3QgaW5wdXQxID0gJCgnI2xvYmJ5LWNoYXQtaW5wdXQnKTtcbiAgICBpbnB1dDEub24oJ2tleXByZXNzJywgc2VuZCgnbG9iYnknLCBpbnB1dDEpKTtcbiAgICBjb25zdCBpbnB1dDIgPSAkKCcjbG9iYnktY2hhdC1wcmVnYW1lLWlucHV0Jyk7XG4gICAgaW5wdXQyLm9uKCdrZXlwcmVzcycsIHNlbmQoJ2dhbWUnLCBpbnB1dDIpKTtcbiAgICBjb25zdCBpbnB1dDMgPSAkKCcjZ2FtZS1jaGF0LWlucHV0Jyk7XG4gICAgaW5wdXQzLm9uKCdrZXlwcmVzcycsIHNlbmQoJ2dhbWUnLCBpbnB1dDMpKTtcbn0pO1xuXG5jb25zdCBzZW5kID0gKHJvb20sIGlucHV0KSA9PiAoZXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQua2V5ICE9PSAnRW50ZXInKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpbnB1dC52YWwoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ2xlYXIgdGhlIGNoYXQgYm94XG4gICAgY29uc3QgbXNnID0gaW5wdXQudmFsKCk7XG4gICAgaW5wdXQudmFsKCcnKTtcblxuICAgIGdsb2JhbHMuY29ubi5zZW5kKCdjaGF0Jywge1xuICAgICAgICBtc2csXG4gICAgICAgIHJvb20sXG4gICAgfSk7XG59O1xuXG5leHBvcnRzLmFkZCA9IChkYXRhLCBmYXN0KSA9PiB7XG4gICAgbGV0IGNoYXQ7XG4gICAgaWYgKGRhdGEucm9vbSA9PT0gJ2xvYmJ5Jykge1xuICAgICAgICBjaGF0ID0gJCgnI2xvYmJ5LWNoYXQtdGV4dCcpO1xuICAgIH0gZWxzZSBpZiAoJCgnI2xvYmJ5LWNoYXQtcHJlZ2FtZS10ZXh0JykuaXMoJzp2aXNpYmxlJykpIHtcbiAgICAgICAgY2hhdCA9ICQoJyNsb2JieS1jaGF0LXByZWdhbWUtdGV4dCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNoYXQgPSAkKCcjZ2FtZS1jaGF0LXRleHQnKTtcbiAgICB9XG5cbiAgICAvLyBDb252ZXJ0IGFueSBEaXNjb3JkIGVtb3Rlc1xuICAgIGRhdGEubXNnID0gZmlsbEVtb3RlcyhkYXRhLm1zZyk7XG5cbiAgICAvLyBHZXQgdGhlIGhvdXJzIGFuZCBtaW51dGVzIGZyb20gdGhlIHRpbWVcbiAgICBjb25zdCBkYXRldGltZSA9IG5ldyBJbnRsLkRhdGVUaW1lRm9ybWF0KFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHtcbiAgICAgICAgICAgIGhvdXI6ICcyLWRpZ2l0JyxcbiAgICAgICAgICAgIG1pbnV0ZTogJzItZGlnaXQnLFxuICAgICAgICAgICAgaG91cjEyOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICApLmZvcm1hdChuZXcgRGF0ZShkYXRhLmRhdGV0aW1lKSk7XG5cbiAgICBsZXQgbGluZSA9IGA8c3BhbiBpZD1cImNoYXQtbGluZS0ke2NoYXRMaW5lTnVtfVwiIGNsYXNzPVwiJHtmYXN0ID8gJycgOiAnaGlkZGVuJ31cIj5bJHtkYXRldGltZX1dJm5ic3A7IGA7XG4gICAgaWYgKGRhdGEuc2VydmVyKSB7XG4gICAgICAgIGxpbmUgKz0gZGF0YS5tc2c7XG4gICAgfSBlbHNlIGlmIChkYXRhLndobykge1xuICAgICAgICBsaW5lICs9IGAmbHQ7PHN0cm9uZz4ke2RhdGEud2hvfTwvc3Ryb25nPiZndDsmbmJzcDsgYDtcbiAgICAgICAgbGluZSArPSBkYXRhLm1zZztcbiAgICB9IGVsc2Uge1xuICAgICAgICBsaW5lICs9IGRhdGEubXNnO1xuICAgIH1cbiAgICBsaW5lICs9ICc8L3NwYW4+PGJyIC8+JztcblxuICAgIC8vIEZpbmQgb3V0IGlmIHdlIHNob3VsZCBhdXRvbWF0aWNhbGx5IHNjcm9sbCBkb3duIGFmdGVyIGFkZGluZyB0aGUgbmV3IGxpbmUgb2YgY2hhdFxuICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzYyNzEyMzcvZGV0ZWN0aW5nLXdoZW4tdXNlci1zY3JvbGxzLXRvLWJvdHRvbS1vZi1kaXYtd2l0aC1qcXVlcnlcbiAgICAvLyBJZiB3ZSBhcmUgYWxyZWFkeSBzY3JvbGxlZCB0byB0aGUgYm90dG9tLCB0aGVuIGl0IGlzIG9rIHRvIGF1dG9tYXRpY2FsbHkgc2Nyb2xsXG4gICAgbGV0IGF1dG9TY3JvbGwgPSBmYWxzZTtcbiAgICBpZiAoY2hhdC5zY3JvbGxUb3AoKSArIE1hdGguY2VpbChjaGF0LmlubmVySGVpZ2h0KCkpID49IGNoYXRbMF0uc2Nyb2xsSGVpZ2h0KSB7XG4gICAgICAgIGF1dG9TY3JvbGwgPSB0cnVlO1xuICAgIH1cblxuICAgIC8vIEFkZCB0aGUgbmV3IGxpbmUgYW5kIGZhZGUgaXQgaW5cbiAgICBjaGF0LmFwcGVuZChsaW5lKTtcbiAgICAkKGAjY2hhdC1saW5lLSR7Y2hhdExpbmVOdW19YCkuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgIGNoYXRMaW5lTnVtICs9IDE7XG5cbiAgICAvLyBBdXRvbWF0aWNhbGx5IHNjcm9sbCBkb3duXG4gICAgaWYgKGF1dG9TY3JvbGwpIHtcbiAgICAgICAgY2hhdC5hbmltYXRlKHtcbiAgICAgICAgICAgIHNjcm9sbFRvcDogY2hhdFswXS5zY3JvbGxIZWlnaHQsXG4gICAgICAgIH0sIChmYXN0ID8gMCA6IDUwMCkpO1xuICAgIH1cbn07XG5cbmNvbnN0IGZpbGxFbW90ZXMgPSAobWVzc2FnZSkgPT4ge1xuICAgIGxldCBmaWxsZWRNZXNzZWQgPSBtZXNzYWdlO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gZmlsbGVkTWVzc2VkLm1hdGNoKC8mbHQ7OiguKz8pOihcXGQrPykmZ3Q7Lyk7XG4gICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVtb3RlVGFnID0gYDxpbWcgc3JjPVwiaHR0cHM6Ly9jZG4uZGlzY29yZGFwcC5jb20vZW1vamlzLyR7bWF0Y2hbMl19LnBuZ1wiIHRpdGxlPVwiJHttYXRjaFsxXX1cIiBoZWlnaHQ9MjggLz5gO1xuICAgICAgICBmaWxsZWRNZXNzZWQgPSBmaWxsZWRNZXNzZWQucmVwbGFjZShtYXRjaFswXSwgZW1vdGVUYWcpO1xuICAgIH1cbiAgICByZXR1cm4gZmlsbGVkTWVzc2VkO1xufTtcbiIsIi8qXG4gICAgU3VpdCBkZWZpbml0aW9ucywgdmFyaWFudCBkZWZpbml0aW9ucywgY2hhcmFjdGVyIGRlZmluaXRpb25zLCBhbmQgc28gZm9ydGhcbiovXG5cbmV4cG9ydHMuQ0FSRFcgPSAyODY7XG5leHBvcnRzLkNBUkRIID0gNDA2O1xuXG5jb25zdCBDb2xvciA9IGZ1bmN0aW9uIENvbG9yKG5hbWUsIGFiYnJldmlhdGlvbiwgaGV4Q29kZSkge1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5hYmJyZXZpYXRpb24gPSBhYmJyZXZpYXRpb247XG4gICAgdGhpcy5oZXhDb2RlID0gaGV4Q29kZTtcbn07XG5cbmV4cG9ydHMuQ09MT1IgPSB7XG4gICAgLy8gTm9ybWFsXG4gICAgQkxVRTogbmV3IENvbG9yKCdCbHVlJywgJ0InLCAnIzAwNDRjYycpLFxuICAgIEdSRUVOOiBuZXcgQ29sb3IoJ0dyZWVuJywgJ0cnLCAnIzAwY2MwMCcpLFxuICAgIFlFTExPVzogbmV3IENvbG9yKCdZZWxsb3cnLCAnWScsICcjY2NhYTIyJyksXG4gICAgUkVEOiBuZXcgQ29sb3IoJ1JlZCcsICdSJywgJyNhYTAwMDAnKSxcbiAgICBQVVJQTEU6IG5ldyBDb2xvcignUHVycGxlJywgJ1AnLCAnIzY2MDBjYycpLFxuICAgIEdSQVk6IG5ldyBDb2xvcignR3JheScsICdHJywgJyNjY2NjY2MnKSwgLy8gRm9yIHVua25vd24gY2FyZHNcblxuICAgIC8vIEJhc2ljIHZhcmlhbnRzXG4gICAgV0hJVEU6IG5ldyBDb2xvcignV2hpdGUnLCAnVycsICcjZDlkOWQ5JyksXG4gICAgQkxBQ0s6IG5ldyBDb2xvcignQmxhY2snLCAnSycsICcjMTExMTExJyksXG5cbiAgICBOQVZZOiBuZXcgQ29sb3IoJ05hdnknLCAnTicsICcjMDAwMDY2JyksXG4gICAgT1JBTkdFOiBuZXcgQ29sb3IoJ09yYW5nZScsICdPJywgJyNmZjg4MDAnKSwgLy8gZmY4ODAwIGlzIG9yYW5nZSwgZmYzM2NjIGlzIHBpbmssIGZmMDBmZiBpcyBtYWdlbnRhXG4gICAgVEFOOiBuZXcgQ29sb3IoJ1RhbicsICdUJywgJyM5OTk5MDAnKSxcbiAgICBNQUhPR0FOWTogbmV3IENvbG9yKCdNYWhvZ2FueScsICdNJywgJyM2NjAwMTYnKSxcbiAgICBURUFMOiBuZXcgQ29sb3IoJ1RlYWwnLCAnVCcsICcjMDBiM2IzJyksXG4gICAgTElNRTogbmV3IENvbG9yKCdMaW1lJywgJ0wnLCAnIzgwYzAwMCcpLFxuICAgIENBUkRJTkFMOiBuZXcgQ29sb3IoJ0NhcmRpbmFsJywgJ0MnLCAnIzgxMDczNScpLFxuICAgIElORElHTzogbmV3IENvbG9yKCdJbmRpZ28nLCAnSScsICcjMWEwMDgyJyksXG4gICAgTEJMVUU6IG5ldyBDb2xvcignU2t5JywgJ1MnLCAnIzFhNjZmZicpLFxuICAgIERCTFVFOiBuZXcgQ29sb3IoJ05hdnknLCAnTicsICcjMDAyYjgwJyksXG4gICAgTEdSRUVOOiBuZXcgQ29sb3IoJ0xpbWUnLCAnTCcsICcjMWFmZjFhJyksXG4gICAgREdSRUVOOiBuZXcgQ29sb3IoJ0ZvcmVzdCcsICdGJywgJyMwMDgwMDAnKSxcbiAgICBMUkVEOiBuZXcgQ29sb3IoJ1RvbWF0bycsICdUJywgJyNlNjAwMDAnKSxcbiAgICBEUkVEOiBuZXcgQ29sb3IoJ01haG9nYW55JywgJ00nLCAnIzY2MDAwMCcpLFxuICAgIEJMVUUxOiBuZXcgQ29sb3IoJ1NreScsICdTJywgJyM0ZDg4ZmYnKSxcbiAgICBCTFVFMzogbmV3IENvbG9yKCdOYXZ5JywgJ04nLCAnIzAwMWE0ZCcpLFxuICAgIFJFRDE6IG5ldyBDb2xvcignVG9tYXRvJywgJ1QnLCAnI2ZmMWExYScpLFxuICAgIFJFRDM6IG5ldyBDb2xvcignTWFob2dhbnknLCAnTScsICcjMzMwMDAwJyksXG59O1xuXG5jb25zdCBGSUxMX1RZUEUgPSB7XG4gICAgU09MSUQ6ICdzb2xpZCcsXG4gICAgTElORUFSX0dSQURJRU5UOiAnbGluZWFyX2dyYWRpZW50JyxcbiAgICBSQURJQUxfR1JBRElFTlQ6ICdyYWRpYWxfZ3JhZGllbnQnLFxufTtcblxuY29uc3QgYmFzZUNvbG9ycyA9IFtcbiAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgZXhwb3J0cy5DT0xPUi5HUkVFTixcbiAgICBleHBvcnRzLkNPTE9SLllFTExPVyxcbiAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICBleHBvcnRzLkNPTE9SLlBVUlBMRSxcbl07XG5jb25zdCBiYXNlQ29sb3JzUGx1c09yYW5nZSA9IFtcbiAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgZXhwb3J0cy5DT0xPUi5HUkVFTixcbiAgICBleHBvcnRzLkNPTE9SLllFTExPVyxcbiAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICBleHBvcnRzLkNPTE9SLlBVUlBMRSxcbiAgICBleHBvcnRzLkNPTE9SLk9SQU5HRSxcbl07XG5jb25zdCBiYXNlQ29sb3JzUGx1c0JsYWNrID0gW1xuICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICBleHBvcnRzLkNPTE9SLkdSRUVOLFxuICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgIGV4cG9ydHMuQ09MT1IuUkVELFxuICAgIGV4cG9ydHMuQ09MT1IuUFVSUExFLFxuICAgIGV4cG9ydHMuQ09MT1IuQkxBQ0ssXG5dO1xuY29uc3QgYmFzZUNvbG9yczQgPSBbXG4gICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgZXhwb3J0cy5DT0xPUi5ZRUxMT1csXG4gICAgZXhwb3J0cy5DT0xPUi5SRUQsXG5dO1xuY29uc3QgYmFzZUNvbG9yczRwbHVzQmxhY2sgPSBbXG4gICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgZXhwb3J0cy5DT0xPUi5ZRUxMT1csXG4gICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgZXhwb3J0cy5DT0xPUi5CTEFDSyxcbl07XG5jb25zdCBiYXNlQ29sb3JzMyA9IFtcbiAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgZXhwb3J0cy5DT0xPUi5HUkVFTixcbiAgICBleHBvcnRzLkNPTE9SLllFTExPVyxcbl07XG5jb25zdCBiYXNlQ29sb3JzMiA9IFtcbiAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgZXhwb3J0cy5DT0xPUi5HUkVFTixcbl07XG5cbi8vIFNwZWNpZnkgYmV0d2VlbiBzb2xpZCBjb2xvciBhbmQgZ3JhZGllbnRzLFxuLy8gYWxvbmcgd2l0aCBhZGRpdGlvbmFsIGFyZ3MgaW4gdGhlIGNhc2Ugb2YgZ3JhZGllbnRzXG5jb25zdCBGaWxsU3BlYyA9IGZ1bmN0aW9uIEZpbGxTcGVjKGZpbGxUeXBlLCBhcmdzID0gbnVsbCkge1xuICAgIHRoaXMuZmlsbFR5cGUgPSBmaWxsVHlwZTtcbiAgICB0aGlzLmFyZ3MgPSBhcmdzO1xufTtcblxuY29uc3Qgc29saWRGaWxsU3BlYyA9IG5ldyBGaWxsU3BlYyhGSUxMX1RZUEUuU09MSUQpO1xuY29uc3QgbXVsdGlCa2dGaWxsU3BlYyA9IG5ldyBGaWxsU3BlYyhcbiAgICBGSUxMX1RZUEUuTElORUFSX0dSQURJRU5ULFxuICAgIFswLCAwLCAwLCBleHBvcnRzLkNBUkRIXSxcbik7XG5jb25zdCBtdWx0aU51bWJlckZpbGxTcGVjID0gbmV3IEZpbGxTcGVjKFxuICAgIEZJTExfVFlQRS5MSU5FQVJfR1JBRElFTlQsXG4gICAgWzAsIDE0LCAwLCAxMTBdLFxuKTtcbmNvbnN0IG11bHRpU3ltYm9sRmlsbFNwZWMgPSBuZXcgRmlsbFNwZWMoXG4gICAgRklMTF9UWVBFLlJBRElBTF9HUkFESUVOVCxcbiAgICBbNzUsIDE1MCwgMjUsIDc1LCAxNTAsIDc1XSxcbik7XG5cbmV4cG9ydHMuQ0FSRF9BUkVBID0ge1xuICAgIEJBQ0tHUk9VTkQ6ICdiYWNrZ3JvdW5kJyxcbiAgICBOVU1CRVI6ICdudW1iZXInLFxuICAgIFNZTUJPTDogJ3N5bWJvbCcsXG59O1xuXG4vLyBCdW5kbGVzIGZpbGwgc3BlY3MgdG9nZXRoZXIgZm9yIGFsbCB0aGUgY2FyZCBhdHRyaWJ1dGVzXG4vLyAoYmFja2dyb3VuZCwgbnVtYmVyLCBzeW1ib2wpXG5jb25zdCBCdWlsZENhcmRGaWxsU3BlYyA9IGZ1bmN0aW9uIEJ1aWxkQ2FyZEZpbGxTcGVjKFxuICAgIGJhY2tncm91bmRGaWxsU3BlYyxcbiAgICBudW1iZXJGaWxsU3BlYyxcbiAgICBzeW1ib2xGaWxsU3BlYyxcbikge1xuICAgIHJldHVybiBuZXcgTWFwKFtcbiAgICAgICAgW2V4cG9ydHMuQ0FSRF9BUkVBLkJBQ0tHUk9VTkQsIGJhY2tncm91bmRGaWxsU3BlY10sXG4gICAgICAgIFtleHBvcnRzLkNBUkRfQVJFQS5OVU1CRVIsIG51bWJlckZpbGxTcGVjXSxcbiAgICAgICAgW2V4cG9ydHMuQ0FSRF9BUkVBLlNZTUJPTCwgc3ltYm9sRmlsbFNwZWNdLFxuICAgIF0pO1xufTtcbmNvbnN0IGJhc2ljQ2FyZEZpbGxTcGVjID0gQnVpbGRDYXJkRmlsbFNwZWMoXG4gICAgc29saWRGaWxsU3BlYyxcbiAgICBzb2xpZEZpbGxTcGVjLFxuICAgIHNvbGlkRmlsbFNwZWMsXG4pO1xuY29uc3QgbXVsdGlDYXJkRmlsbFNwZWMgPSBCdWlsZENhcmRGaWxsU3BlYyhcbiAgICBtdWx0aUJrZ0ZpbGxTcGVjLFxuICAgIG11bHRpTnVtYmVyRmlsbFNwZWMsXG4gICAgbXVsdGlTeW1ib2xGaWxsU3BlYyxcbik7XG5cbi8vIEdlbmVyYXRlcyBhIHZlcnRpY2FsIGdyYWRpZW50IHRoYXQgaXMgZXZlbmx5IGRpc3RyaWJ1dGVkIGJldHdlZW4gaXRzIGNvbXBvbmVudCBjb2xvcnNcbmNvbnN0IGV2ZW5MaW5lYXJHcmFkaWVudCA9IChjdHgsIGNvbG9ycywgYXJncykgPT4ge1xuICAgIGNvbnN0IGdyYWQgPSBjdHguY3JlYXRlTGluZWFyR3JhZGllbnQoLi4uYXJncyk7XG4gICAgY29uc3QgbkNvbG9ycyA9IGNvbG9ycy5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuQ29sb3JzOyArK2kpIHtcbiAgICAgICAgZ3JhZC5hZGRDb2xvclN0b3AoaSAvIChuQ29sb3JzIC0gMSksIGNvbG9yc1tpXS5oZXhDb2RlKTtcbiAgICB9XG4gICAgcmV0dXJuIGdyYWQ7XG59O1xuXG4vLyBHZW5lcmF0ZXMgYSByYWRpYWwgZ3JhZGllbnQgdGhhdCBpcyBldmVubHkgZGlzdHJpYnV0ZWQgYmV0d2VlbiBpdHMgY29tcG9uZW50IGNvbG9yc1xuY29uc3QgZXZlblJhZGlhbEdyYWRpZW50ID0gKGN0eCwgY29sb3JzLCBhcmdzKSA9PiB7XG4gICAgY29uc3QgZ3JhZCA9IGN0eC5jcmVhdGVSYWRpYWxHcmFkaWVudCguLi5hcmdzKTtcbiAgICBjb25zdCBuQ29sb3JzID0gY29sb3JzLmxlbmd0aDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5Db2xvcnM7ICsraSkge1xuICAgICAgICBncmFkLmFkZENvbG9yU3RvcChpIC8gKG5Db2xvcnMgLSAxKSwgY29sb3JzW2ldLmhleENvZGUpO1xuICAgIH1cbiAgICByZXR1cm4gZ3JhZDtcbn07XG5cbi8vIFBhaXIgZWFjaCBzdWl0IG5hbWUgd2l0aCB0aGUgY29sb3IocykgdGhhdCBjb3JyZXNwb25kKHMpIHRvIGl0XG5jb25zdCBTdWl0ID0gZnVuY3Rpb24gU3VpdChcbiAgICBuYW1lLFxuICAgIGFiYnJldmlhdGlvbixcbiAgICBmaWxsQ29sb3JzLFxuICAgIGNhcmRGaWxsU3BlYyxcbiAgICBjbHVlQ29sb3JzLFxuICAgIG9uZU9mRWFjaCA9IGZhbHNlLFxuKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB0aGlzLmFiYnJldmlhdGlvbiA9IGFiYnJldmlhdGlvbjtcbiAgICB0aGlzLmZpbGxDb2xvcnMgPSBmaWxsQ29sb3JzO1xuICAgIHRoaXMuY2FyZEZpbGxTcGVjID0gY2FyZEZpbGxTcGVjO1xuICAgIHRoaXMuY2x1ZUNvbG9ycyA9IGNsdWVDb2xvcnM7XG4gICAgdGhpcy5vbmVPZkVhY2ggPSBvbmVPZkVhY2g7XG59O1xuXG4vLyBSZXR1cm5zIHRoZSBzdHlsZSAoY29sb3IsIGdyYWRpZW50LCBldGMuKSBmb3IgYSBnaXZlbiBjYXJkIGFyZWFcbi8vIChia2csIG51bWJlciwgc3ltYm9sKVxuU3VpdC5wcm90b3R5cGUuc3R5bGUgPSBmdW5jdGlvbiBzdHlsZShjdHgsIGNhcmRBcmVhKSB7XG4gICAgY29uc3QgZmlsbFNwZWMgPSB0aGlzLmNhcmRGaWxsU3BlYy5nZXQoY2FyZEFyZWEpO1xuICAgIGNvbnN0IHsgZmlsbFR5cGUgfSA9IGZpbGxTcGVjO1xuICAgIGNvbnN0IGNvbG9ycyA9IHRoaXMuZmlsbENvbG9ycztcblxuICAgIGlmIChmaWxsVHlwZSA9PT0gRklMTF9UWVBFLlNPTElEKSB7XG4gICAgICAgIC8vIFwiY29sb3JzXCIgaW4gdGhpcyBjYXNlIHNob3VsZCBiZSBhIHNpbmdsZSBjb2xvciwgbm90IGFuIGFycmF5XG4gICAgICAgIHJldHVybiBjb2xvcnMuaGV4Q29kZTtcbiAgICB9XG4gICAgaWYgKGZpbGxUeXBlID09PSBGSUxMX1RZUEUuTElORUFSX0dSQURJRU5UKSB7XG4gICAgICAgIHJldHVybiBldmVuTGluZWFyR3JhZGllbnQoY3R4LCBjb2xvcnMsIGZpbGxTcGVjLmFyZ3MpO1xuICAgIH1cbiAgICBpZiAoZmlsbFR5cGUgPT09IEZJTExfVFlQRS5SQURJQUxfR1JBRElFTlQpIHtcbiAgICAgICAgcmV0dXJuIGV2ZW5SYWRpYWxHcmFkaWVudChjdHgsIGNvbG9ycywgZmlsbFNwZWMuYXJncyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG59O1xuXG4vLyBJdCBwcm9iYWJseSBpc24ndCBkZXNpZ24tbmVjZXNzYXJ5IHRvIGRlZmluZSB0aGlzIGxpc3Qgb2Ygc3VpdHMsIGJ1dCBpdFxuLy8gd2lsbCBvbmx5IGh1cnQgaWYgd2UgaGF2ZSBhIGxvdCBvZiBpbnN0YW5jZXMgb2Ygc3VpdHMgdGhhdCB2YXJ5IGluXG4vLyBwcm9wZXJ0eSBiZXR3ZWVuIHZhcmlhbnRzXG5leHBvcnRzLlNVSVQgPSB7XG4gICAgLy8gVGhlIGJhc2UgZ2FtZVxuICAgIEJMVUU6IG5ldyBTdWl0KFxuICAgICAgICAnQmx1ZScsXG4gICAgICAgICdCJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuQkxVRV0sXG4gICAgKSxcbiAgICBHUkVFTjogbmV3IFN1aXQoXG4gICAgICAgICdHcmVlbicsXG4gICAgICAgICdHJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5HUkVFTixcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLkdSRUVOXSxcbiAgICApLFxuICAgIFlFTExPVzogbmV3IFN1aXQoXG4gICAgICAgICdZZWxsb3cnLFxuICAgICAgICAnWScsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuWUVMTE9XXSxcbiAgICApLFxuICAgIFJFRDogbmV3IFN1aXQoXG4gICAgICAgICdSZWQnLFxuICAgICAgICAnUicsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuUkVELFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuUkVEXSxcbiAgICApLFxuICAgIFBVUlBMRTogbmV3IFN1aXQoXG4gICAgICAgICdQdXJwbGUnLFxuICAgICAgICAnUCcsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuUFVSUExFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuUFVSUExFXSxcbiAgICApLFxuICAgIEdSQVk6IG5ldyBTdWl0KFxuICAgICAgICAvLyBUaGlzIHJlcHJlc2VudHMgY2FyZHMgb2YgdW5rbm93biBzdWl0OyBpdCBtdXN0IG5vdCBiZSBpbmNsdWRlZCBpbiB2YXJpYW50c1xuICAgICAgICAnR3JheScsXG4gICAgICAgICcnLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkdSQVksXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBudWxsLFxuICAgICAgICBbXSxcbiAgICApLFxuXG4gICAgLy8gQmFzaWMgdmFyaWFudHNcbiAgICBPUkFOR0U6IG5ldyBTdWl0KFxuICAgICAgICAnT3JhbmdlJyxcbiAgICAgICAgJ08nLFxuICAgICAgICBleHBvcnRzLkNPTE9SLk9SQU5HRSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLk9SQU5HRV0sXG4gICAgKSxcbiAgICBXSElURTogbmV3IFN1aXQoXG4gICAgICAgICdXaGl0ZScsXG4gICAgICAgICdXJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5XSElURSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLldISVRFXSxcbiAgICApLFxuICAgIEJMQUNLOiBuZXcgU3VpdChcbiAgICAgICAgJ0JsYWNrJyxcbiAgICAgICAgJ0snLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkJMQUNLLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuQkxBQ0tdLFxuICAgICAgICB0cnVlLCAvLyBUaGlzIHN1aXQgaGFzIG9uZSBvZiBlYWNoIGNhcmRcbiAgICApLFxuICAgIFJBSU5CT1c6IG5ldyBTdWl0KFxuICAgICAgICAvLyBDb2xvciBvcmRlcmluZyBpcyBub3QgZ3VhcmFudGVlZCB0byBiZSB0aGUgc2FtZSBhcyBkZWNsYXJhdGlvbiBvcmRlclxuICAgICAgICAvLyBEbyBub3QgdGhlc2UgdmFsdWVzIGZvciB0aGUgcmFpbmJvdyBzdWl0OyBpbnN0ZWFkLCB1c2Ugc3BlY2lhbCBjYXNlc1xuICAgICAgICAvLyBlLmcuIGlmIChzdWl0ID09PSBTVUlULlJBSU5CT1csIGNvbG9yX21hdGNoID0gdHJ1ZSlcbiAgICAgICAgJ1JhaW5ib3cnLFxuICAgICAgICAnTScsXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIG11bHRpQ2FyZEZpbGxTcGVjLFxuICAgICAgICBPYmplY3QudmFsdWVzKGV4cG9ydHMuQ09MT1IpLFxuICAgICksXG4gICAgUkFJTkJPVzFPRTogbmV3IFN1aXQoXG4gICAgICAgICdSYWluYm93JyxcbiAgICAgICAgJ00nLFxuICAgICAgICBbXG4gICAgICAgICAgICBuZXcgQ29sb3IobnVsbCwgbnVsbCwgJyMwMDA1NTUnKSxcbiAgICAgICAgICAgIG5ldyBDb2xvcihudWxsLCBudWxsLCAnIzAwNTUwNScpLFxuICAgICAgICAgICAgbmV3IENvbG9yKG51bGwsIG51bGwsICcjNTU1NTAwJyksXG4gICAgICAgICAgICBuZXcgQ29sb3IobnVsbCwgbnVsbCwgJyM1RjAwMDAnKSxcbiAgICAgICAgICAgIG5ldyBDb2xvcihudWxsLCBudWxsLCAnIzU1MDA1NScpLFxuICAgICAgICBdLFxuICAgICAgICBtdWx0aUNhcmRGaWxsU3BlYyxcbiAgICAgICAgT2JqZWN0LnZhbHVlcyhleHBvcnRzLkNPTE9SKSxcbiAgICAgICAgdHJ1ZSwgLy8gVGhpcyBzdWl0IGhhcyBvbmUgb2YgZWFjaCBjYXJkXG4gICAgKSxcblxuICAgIC8vIEZvciBcIkNvbG9yIEJsaW5kXCJcbiAgICBDQl9CTFVFOiBuZXcgU3VpdChcbiAgICAgICAgJ0JsdWUnLFxuICAgICAgICAnQicsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtdLFxuICAgICksXG4gICAgQ0JfR1JFRU46IG5ldyBTdWl0KFxuICAgICAgICAnR3JlZW4nLFxuICAgICAgICAnRycsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXSxcbiAgICApLFxuICAgIENCX1lFTExPVzogbmV3IFN1aXQoXG4gICAgICAgICdZZWxsb3cnLFxuICAgICAgICAnWScsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW10sXG4gICAgKSxcbiAgICBDQl9SRUQ6IG5ldyBTdWl0KFxuICAgICAgICAnUmVkJyxcbiAgICAgICAgJ1InLFxuICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtdLFxuICAgICksXG4gICAgQ0JfUFVSUExFOiBuZXcgU3VpdChcbiAgICAgICAgJ1B1cnBsZScsXG4gICAgICAgICdQJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5QVVJQTEUsXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXSxcbiAgICApLFxuICAgIENCX09SQU5HRTogbmV3IFN1aXQoXG4gICAgICAgICdPcmFuZ2UnLFxuICAgICAgICAnTycsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuT1JBTkdFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW10sXG4gICAgKSxcblxuICAgIC8vIEZvciBcIkFtYmlndW91c1wiXG4gICAgTEJMVUU6IG5ldyBTdWl0KFxuICAgICAgICAnU2t5JyxcbiAgICAgICAgJ1MnLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkxCTFVFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuQkxVRV0sXG4gICAgKSxcbiAgICBEQkxVRTogbmV3IFN1aXQoXG4gICAgICAgICdOYXZ5JyxcbiAgICAgICAgJ04nLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkRCTFVFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuQkxVRV0sXG4gICAgKSxcbiAgICBMR1JFRU46IG5ldyBTdWl0KFxuICAgICAgICAnTGltZScsXG4gICAgICAgICdMJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5MR1JFRU4sXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbZXhwb3J0cy5DT0xPUi5HUkVFTl0sXG4gICAgKSxcbiAgICBER1JFRU46IG5ldyBTdWl0KFxuICAgICAgICAnRm9yZXN0JyxcbiAgICAgICAgJ0YnLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkRHUkVFTixcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLkdSRUVOXSxcbiAgICApLFxuICAgIExSRUQ6IG5ldyBTdWl0KFxuICAgICAgICAnVG9tYXRvJyxcbiAgICAgICAgJ1QnLFxuICAgICAgICBleHBvcnRzLkNPTE9SLkxSRUQsXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbZXhwb3J0cy5DT0xPUi5SRURdLFxuICAgICksXG4gICAgRFJFRDogbmV3IFN1aXQoXG4gICAgICAgICdNYWhvZ2FueScsXG4gICAgICAgICdCJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5EUkVELFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuUkVEXSxcbiAgICApLFxuICAgIEJMVUUxOiBuZXcgU3VpdChcbiAgICAgICAgJ1NreScsXG4gICAgICAgICdTJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFMSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLkJMVUVdLFxuICAgICksXG4gICAgQkxVRTI6IG5ldyBTdWl0KFxuICAgICAgICAnQmVycnknLFxuICAgICAgICAnQicsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLkJMVUVdLFxuICAgICksXG4gICAgQkxVRTM6IG5ldyBTdWl0KFxuICAgICAgICAnTmF2eScsXG4gICAgICAgICdOJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFMyxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLkJMVUVdLFxuICAgICksXG4gICAgUkVEMTogbmV3IFN1aXQoXG4gICAgICAgICdUb21hdG8nLFxuICAgICAgICAnVCcsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuUkVEMSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLlJFRF0sXG4gICAgKSxcbiAgICBSRUQyOiBuZXcgU3VpdChcbiAgICAgICAgJ1J1YnknLFxuICAgICAgICAnUicsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuUkVELFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW2V4cG9ydHMuQ09MT1IuUkVEXSxcbiAgICApLFxuICAgIFJFRDM6IG5ldyBTdWl0KFxuICAgICAgICAnTWFob2dhbnknLFxuICAgICAgICAnTScsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuUkVEMyxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtleHBvcnRzLkNPTE9SLlJFRF0sXG4gICAgKSxcblxuICAgIC8vIEZvciBcIkR1YWwtQ29sb3IgKDYgU3VpdHMpXCJcbiAgICBNR1JFRU46IG5ldyBTdWl0KFxuICAgICAgICAnR3JlZW4nLFxuICAgICAgICAnRycsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLllFTExPVyxcbiAgICAgICAgXSxcbiAgICApLFxuICAgIE1QVVJQTEU6IG5ldyBTdWl0KFxuICAgICAgICAnUHVycGxlJyxcbiAgICAgICAgJ1AnLFxuICAgICAgICBleHBvcnRzLkNPTE9SLlBVUlBMRSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuUkVELFxuICAgICAgICBdLFxuICAgICksXG4gICAgTkFWWTogbmV3IFN1aXQoXG4gICAgICAgICdOYXZ5JyxcbiAgICAgICAgJ04nLFxuICAgICAgICBleHBvcnRzLkNPTE9SLk5BVlksXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMQUNLLFxuICAgICAgICBdLFxuICAgICksXG4gICAgTU9SQU5HRTogbmV3IFN1aXQoXG4gICAgICAgICdPcmFuZ2UnLFxuICAgICAgICAnTycsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuT1JBTkdFLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgXSxcbiAgICApLFxuICAgIFRBTjogbmV3IFN1aXQoXG4gICAgICAgICdUYW4nLFxuICAgICAgICAnVCcsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuVEFOLFxuICAgICAgICBiYXNpY0NhcmRGaWxsU3BlYyxcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMQUNLLFxuICAgICAgICBdLFxuICAgICksXG4gICAgTUFIT0dBTlk6IG5ldyBTdWl0KFxuICAgICAgICAnTWFob2dhbnknLFxuICAgICAgICAnTScsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuTUFIT0dBTlksXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxBQ0ssXG4gICAgICAgIF0sXG4gICAgKSxcblxuICAgIC8vIEZvciBcIkR1YWwtQ29sb3IgKDUgU3VpdHMpXCJcbiAgICBURUFMOiBuZXcgU3VpdChcbiAgICAgICAgJ1RlYWwnLFxuICAgICAgICAnVCcsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuVEVBTCxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgICAgIF0sXG4gICAgKSxcbiAgICBMSU1FOiBuZXcgU3VpdChcbiAgICAgICAgJ0xpbWUnLFxuICAgICAgICAnTCcsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuTElNRSxcbiAgICAgICAgYmFzaWNDYXJkRmlsbFNwZWMsXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLllFTExPVyxcbiAgICAgICAgXSxcbiAgICApLFxuICAgIC8vIE1PUkFOR0UgaXMgcmV1c2VkXG4gICAgQ0FSRElOQUw6IG5ldyBTdWl0KFxuICAgICAgICAnQ2FyZGluYWwnLFxuICAgICAgICAnQycsXG4gICAgICAgIGV4cG9ydHMuQ09MT1IuQ0FSRElOQUwsXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuUFVSUExFLFxuICAgICAgICBdLFxuICAgICksXG4gICAgSU5ESUdPOiBuZXcgU3VpdChcbiAgICAgICAgJ0luZGlnbycsXG4gICAgICAgICdJJyxcbiAgICAgICAgZXhwb3J0cy5DT0xPUi5JTkRJR08sXG4gICAgICAgIGJhc2ljQ2FyZEZpbGxTcGVjLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlBVUlBMRSxcbiAgICAgICAgXSxcbiAgICApLFxufTtcblxuZXhwb3J0cy5BQ1QgPSB7XG4gICAgQ0xVRTogMCxcbiAgICBQTEFZOiAxLFxuICAgIERJU0NBUkQ6IDIsXG4gICAgREVDS1BMQVk6IDMsXG59O1xuXG5leHBvcnRzLkNMVUVfVFlQRSA9IHtcbiAgICBSQU5LOiAwLFxuICAgIENPTE9SOiAxLFxufTtcblxuY29uc3QgVmFyaWFudCA9IGZ1bmN0aW9uIFZhcmlhbnQoc3VpdHMsIGNsdWVDb2xvcnMsIHNob3dTdWl0TmFtZXMpIHtcbiAgICB0aGlzLnN1aXRzID0gc3VpdHM7XG4gICAgdGhpcy5yYW5rcyA9IFsxLCAyLCAzLCA0LCA1XTtcbiAgICB0aGlzLmNsdWVDb2xvcnMgPSBjbHVlQ29sb3JzO1xuICAgIHRoaXMuc2hvd1N1aXROYW1lcyA9IHNob3dTdWl0TmFtZXM7XG4gICAgLy8gV2UgZHJhdyB0ZXh0IG9mIHRoZSBzdWl0IG5hbWVzIGJlbG93IHRoZSBzdGFja3MgZm9yIGNvbmZ1c2luZyB2YXJpYW50c1xuICAgIHRoaXMub2Zmc2V0Q2FyZEluZGljYXRvcnMgPSBzdWl0cy5zb21lKFxuICAgICAgICBzID0+IHMgIT09IGV4cG9ydHMuU1VJVC5SQUlOQk9XXG4gICAgICAgICAgICAmJiBzICE9PSBleHBvcnRzLlNVSVQuUkFJTkJPVzFPRVxuICAgICAgICAgICAgJiYgcy5jbHVlQ29sb3JzLmxlbmd0aCA+IDEsXG4gICAgKTtcbiAgICB0aGlzLm1heFNjb3JlID0gc3VpdHMubGVuZ3RoICogNTtcbn07XG5cbmV4cG9ydHMuVkFSSUFOVFMgPSB7XG4gICAgLy8gTm9ybWFsXG4gICAgJ05vIFZhcmlhbnQnOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5QVVJQTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ1NpeCBTdWl0cyc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlBVUlBMRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5PUkFOR0UsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnNQbHVzT3JhbmdlLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdGb3VyIFN1aXRzJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnM0LFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdUaHJlZSBTdWl0cyc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMzLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuXG4gICAgLy8gV2hpdGVcbiAgICAnV2hpdGUgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULldISVRFLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdXaGl0ZSAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczQsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ1doaXRlICg0IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuV0hJVEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMzLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdXaGl0ZSAoMyBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuV0hJVEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMyLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuXG4gICAgLy8gQmxhY2tcbiAgICAnQmxhY2sgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMQUNLLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzUGx1c0JsYWNrLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdCbGFjayAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTEFDSyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczRwbHVzQmxhY2ssXG4gICAgICAgIGZhbHNlLFxuICAgICksXG5cbiAgICAvLyBSYWluYm93XG4gICAgJ1JhaW5ib3cgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ1JhaW5ib3cgKDUgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkFJTkJPVyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczQsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ1JhaW5ib3cgKDQgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzMyxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnUmFpbmJvdyAoMyBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkFJTkJPVyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczIsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG5cbiAgICAvLyBXaGl0ZSAmIFJhaW5ib3dcbiAgICAnV2hpdGUgJiBSYWluYm93ICg2IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULldISVRFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnM0LFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdXaGl0ZSAmIFJhaW5ib3cgKDUgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzMyxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnV2hpdGUgJiBSYWluYm93ICg0IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzMixcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcblxuICAgIC8vIERhcmsgUmFpbmJvd1xuICAgICdEYXJrIFJhaW5ib3cgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1cxT0UsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ0RhcmsgUmFpbmJvdyAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XMU9FLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzNCxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnQmxhY2sgJiBEYXJrIFJhaW5ib3cgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxBQ0ssXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkFJTkJPVzFPRSxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczRwbHVzQmxhY2ssXG4gICAgICAgIGZhbHNlLFxuICAgICksXG5cbiAgICAvLyBDb2xvciBCbGluZFxuICAgICdDb2xvciBCbGluZCAoNiBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX0JMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX1JFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5DQl9QVVJQTEUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfT1JBTkdFLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzUGx1c09yYW5nZSxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnQ29sb3IgQmxpbmQgKDUgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5DQl9CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX0dSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX1lFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5DQl9SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfUFVSUExFLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdDb2xvciBCbGluZCAoNCBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX0JMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNCX1JFRCxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczQsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ0NvbG9yIEJsaW5kICgzIFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0JfQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5DQl9HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5DQl9ZRUxMT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMzLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuXG4gICAgLy8gQW1iaWd1b3VzXG4gICAgJ0FtYmlndW91cyAoNiBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgLy8gTCBzdGFuZHMgZm9yIGxpZ2h0XG4gICAgICAgICAgICAvLyBEIHN0YW5kcyBmb3IgZGFya1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkRCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxHUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ER1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTFJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5EUkVELFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnQW1iaWd1b3VzICg0IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTEJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuREJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTFJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5EUkVELFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgXSxcbiAgICAgICAgdHJ1ZSxcbiAgICApLFxuICAgICdBbWJpZ3VvdXMgJiBXaGl0ZSAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkRCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxSRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuRFJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgXSxcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnQW1iaWd1b3VzICYgUmFpbmJvdyAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkRCTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxSRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuRFJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgXSxcbiAgICAgICAgdHJ1ZSxcbiAgICApLFxuICAgICdWZXJ5IEFtYmlndW91cyAoNiBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUxLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUyLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUzLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRDEsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVEMixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQzLFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgXSxcbiAgICAgICAgdHJ1ZSxcbiAgICApLFxuXG4gICAgLy8gRHVhbC1Db2xvclxuICAgICdEdWFsLUNvbG9yICg2IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTUdSRUVOLCAvLyBCbHVlICsgWWVsbG93XG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTVBVUlBMRSwgLy8gQmx1ZSArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk5BVlksIC8vIEJsdWUgKyBCbGFja1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk1PUkFOR0UsIC8vIFllbGxvdyArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlRBTiwgLy8gWWVsbG93ICsgQmxhY2tcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5NQUhPR0FOWSwgLy8gUmVkICsgQmxhY2tcbiAgICAgICAgXSxcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxBQ0ssXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnRHVhbC1Db2xvciAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlRFQUwsIC8vIEJsdWUgKyBHcmVlblxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxJTUUsIC8vIEdyZWVuICsgWWVsbG93XG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTU9SQU5HRSwgLy8gWWVsbG93ICsgUmVkXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQ0FSRElOQUwsIC8vIFJlZCArIFB1cnBsZVxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULklORElHTywgLy8gUHVycGxlICsgQmx1ZVxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzLFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ0R1YWwtQ29sb3IgKDMgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5NR1JFRU4sIC8vIEJsdWUgKyBZZWxsb3dcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5NUFVSUExFLCAvLyBCbHVlICsgUmVkXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTU9SQU5HRSwgLy8gWWVsbG93ICsgUmVkXG4gICAgICAgIF0sXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnRHVhbC1Db2xvciAmIFJhaW5ib3cgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5URUFMLCAvLyBCbHVlICsgR3JlZW5cbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5MSU1FLCAvLyBHcmVlbiArIFllbGxvd1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk1PUkFOR0UsIC8vIFllbGxvdyArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkNBUkRJTkFMLCAvLyBSZWQgKyBQdXJwbGVcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5JTkRJR08sIC8vIFB1cnBsZSArIEJsdWVcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzLFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ0R1YWwtQ29sb3IgJiBSYWluYm93ICg0IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTUdSRUVOLCAvLyBCbHVlICsgWWVsbG93XG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTVBVUlBMRSwgLy8gQmx1ZSArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk1PUkFOR0UsIC8vIFllbGxvdyArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgIF0sXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgIF0sXG4gICAgICAgIHRydWUsXG4gICAgKSxcblxuICAgIC8vIE11bHRpLUZpdmVzXG4gICAgJ011bHRpLUZpdmVzICg2IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlBVUlBMRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5PUkFOR0UsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnNQbHVzT3JhbmdlLFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdNdWx0aS1GaXZlcyAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5QVVJQTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ011bHRpLUZpdmVzICg0IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzNCxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnTXVsdGktRml2ZXMgKDMgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ011bHRpLUZpdmVzICYgUmFpbmJvdyAoNiBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5QVVJQTEUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkFJTkJPVyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9ycyxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnTXVsdGktRml2ZXMgJiBSYWluYm93ICg1IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnM0LFxuICAgICAgICBmYWxzZSxcbiAgICApLFxuICAgICdNdWx0aS1GaXZlcyAmIFJhaW5ib3cgKDQgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzMyxcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcbiAgICAnTXVsdGktRml2ZXMgJiBSYWluYm93ICgzIFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzMixcbiAgICAgICAgZmFsc2UsXG4gICAgKSxcblxuICAgIC8vIENsdWUgU3RhcnZlZFxuICAgICdDbHVlIFN0YXJ2ZWQgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk9SQU5HRSxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yc1BsdXNPcmFuZ2UsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ0NsdWUgU3RhcnZlZCAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5QVVJQTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG4gICAgJ0NsdWUgU3RhcnZlZCAoNCBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczQsXG4gICAgICAgIGZhbHNlLFxuICAgICksXG5cbiAgICAvLyBVcCBvciBEb3duXG4gICAgJ1VwIG9yIERvd24gKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUFVSUExFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk9SQU5HRSxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yc1BsdXNPcmFuZ2UsXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnVXAgb3IgRG93biAoNSBTdWl0cyknOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkJMVUUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuR1JFRU4sXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5QVVJQTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnMsXG4gICAgICAgIHRydWUsXG4gICAgKSxcbiAgICAnVXAgb3IgRG93biAmIFdoaXRlICg2IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlBVUlBMRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9ycyxcbiAgICAgICAgdHJ1ZSxcbiAgICApLFxuICAgICdVcCBvciBEb3duICYgV2hpdGUgKDUgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuV0hJVEUsXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnM0LFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ1VwIG9yIERvd24gJiBSYWluYm93ICg2IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlBVUlBMRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SQUlOQk9XLFxuICAgICAgICBdLFxuICAgICAgICBiYXNlQ29sb3JzLFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ1VwIG9yIERvd24gJiBSYWluYm93ICg1IFN1aXRzKSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5HUkVFTixcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5ZRUxMT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkVELFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgIF0sXG4gICAgICAgIGJhc2VDb2xvcnM0LFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ1VwIG9yIERvd24gJiBXaGl0ZSAmIFJhaW5ib3cgKDYgU3VpdHMpJzogbmV3IFZhcmlhbnQoXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkdSRUVOLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULllFTExPVyxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuV0hJVEUsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuUkFJTkJPVyxcbiAgICAgICAgXSxcbiAgICAgICAgYmFzZUNvbG9yczQsXG4gICAgICAgIHRydWUsXG4gICAgKSxcblxuICAgIC8vIE1peGVkXG4gICAgJ0FmcmljYW4gQW1lcmljYW4nOiBuZXcgVmFyaWFudChcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5TVUlULkxSRUQsXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuRFJFRCxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5XSElURSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5MQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5EQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuU1VJVC5CTEFDSyxcbiAgICAgICAgXSxcbiAgICAgICAgW1xuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5CTFVFLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMQUNLLFxuICAgICAgICBdLFxuICAgICAgICB0cnVlLFxuICAgICksXG4gICAgJ1dpbGQgJiBDcmF6eSc6IG5ldyBWYXJpYW50KFxuICAgICAgICBbXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTUdSRUVOLCAvLyBCbHVlICsgWWVsbG93XG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuTVBVUlBMRSwgLy8gQmx1ZSArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULk1PUkFOR0UsIC8vIFllbGxvdyArIFJlZFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULldISVRFLFxuICAgICAgICAgICAgZXhwb3J0cy5TVUlULlJBSU5CT1csXG4gICAgICAgICAgICBleHBvcnRzLlNVSVQuQkxBQ0ssXG4gICAgICAgIF0sXG4gICAgICAgIFtcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuQkxVRSxcbiAgICAgICAgICAgIGV4cG9ydHMuQ09MT1IuWUVMTE9XLFxuICAgICAgICAgICAgZXhwb3J0cy5DT0xPUi5SRUQsXG4gICAgICAgICAgICBleHBvcnRzLkNPTE9SLkJMQUNLLFxuICAgICAgICBdLFxuICAgICAgICB0cnVlLFxuICAgICksXG59O1xuXG4vLyBDb3B5IHRoZSBuYW1lIG9mIGVhY2ggdmFyaWFudCBpbnNpZGUgb2YgdGhlIG9iamVjdCBmb3IgbGF0ZXIgdXNlXG5mb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXMoZXhwb3J0cy5WQVJJQU5UUykpIHtcbiAgICBleHBvcnRzLlZBUklBTlRTW25hbWVdLm5hbWUgPSBuYW1lO1xufVxuXG5leHBvcnRzLklORElDQVRPUiA9IHtcbiAgICBQT1NJVElWRTogJyNmZmZmZmYnLFxuICAgIE5FR0FUSVZFOiAnI2ZmNzc3NycsXG4gICAgUkVQTEFZX0xFQURFUjogJyNmZmRmMDAnLFxufTtcblxuY29uc3QgQ2hhcmFjdGVyID0gZnVuY3Rpb24gQ2hhcmFjdGVyKGRlc2NyaXB0aW9uLCBlbW9qaSkge1xuICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcbiAgICB0aGlzLmVtb2ppID0gZW1vamk7XG59O1xuZXhwb3J0cy5DSEFSQUNURVJTID0ge1xuICAgIC8vIENsdWUgcmVzdHJpY3Rpb24gY2hhcmFjdGVycyAoZ2l2aW5nKVxuICAgICdGdW1pbmcnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2FuIG9ubHkgY2x1ZSBudW1iZXJzIGFuZCBbcmFuZG9tIGNvbG9yXScsXG4gICAgICAgICfwn4yLJyxcbiAgICApLFxuICAgICdEdW1iZm91bmRlZCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW4gb25seSBjbHVlIGNvbG9ycyBhbmQgW3JhbmRvbSBudW1iZXJdJyxcbiAgICAgICAgJ/CfpK8nLFxuICAgICksXG4gICAgJ0luZXB0JzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBnaXZlIGFueSBjbHVlcyB0aGF0IHRvdWNoIFtyYW5kb20gc3VpdF0gY2FyZHMnLFxuICAgICAgICAn8J+klCcsXG4gICAgKSxcbiAgICAnQXdrd2FyZCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW5ub3QgZ2l2ZSBhbnkgY2x1ZXMgdGhhdCB0b3VjaCBbcmFuZG9tIG51bWJlcl1zJyxcbiAgICAgICAgJ/CfmKwnLFxuICAgICksXG4gICAgJ0NvbnNlcnZhdGl2ZSc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW4gb25seSBnaXZlIGNsdWVzIHRoYXQgdG91Y2ggYSBzaW5nbGUgY2FyZCcsXG4gICAgICAgICfwn5WHJyxcbiAgICApLFxuICAgICdHcmVlZHknOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2FuIG9ubHkgZ2l2ZSBjbHVlcyB0aGF0IHRvdWNoIDIrIGNhcmRzJyxcbiAgICAgICAgJ/CfpJEnLFxuICAgICksXG4gICAgJ1BpY2t5JzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0NhbiBvbmx5IGNsdWUgb2RkIG51bWJlcnMgb3Igb2RkIGNvbG9ycycsXG4gICAgICAgICfwn6SiJyxcbiAgICApLFxuICAgICdTcGl0ZWZ1bCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW5ub3QgY2x1ZSB0aGUgcGxheWVyIHRvIHRoZWlyIGxlZnQnLFxuICAgICAgICAn8J+YiCcsXG4gICAgKSxcbiAgICAnSW5zb2xlbnQnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2Fubm90IGNsdWUgdGhlIHBsYXllciB0byB0aGVpciByaWdodCcsXG4gICAgICAgICfwn5iPJyxcbiAgICApLFxuICAgICdWaW5kaWN0aXZlJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ011c3QgY2x1ZSBpZiB0aGV5IHJlY2VpdmVkIGEgY2x1ZSBzaW5jZSB0aGVpciBsYXN0IHR1cm4nLFxuICAgICAgICAn8J+Xoe+4jycsXG4gICAgKSxcbiAgICAnTWlzZXInOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2FuIG9ubHkgY2x1ZSBpZiB0aGVyZSBhcmUgNCBvciBtb3JlIGNsdWVzIGF2YWlsYWJsZScsXG4gICAgICAgICfwn5KwJyxcbiAgICApLFxuICAgICdDb21wdWxzaXZlJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0NhbiBvbmx5IGNsdWUgaWYgaXQgdG91Y2hlcyB0aGUgbmV3ZXN0IG9yIG9sZGVzdCBjYXJkIGluIHNvbWVvbmVcXCdzIGhhbmQnLFxuICAgICAgICAn8J+TuicsXG4gICAgKSxcbiAgICAnTW9vZCBTd2luZ3MnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2x1ZXMgZ2l2ZW4gbXVzdCBhbHRlcm5hdGUgYmV0d2VlbiBjb2xvciBhbmQgbnVtYmVyJyxcbiAgICAgICAgJ/CfkacnLFxuICAgICksXG4gICAgJ0luc2lzdGVudCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdNdXN0IGNvbnRpbnVlIHRvIGNsdWUgY2FyZHMgdW50aWwgb25lIG9mIHRoZW0gaXMgcGxheWVkIG9yIGRpc2NhcmRlZCcsXG4gICAgICAgICfwn5ijJyxcbiAgICApLFxuXG4gICAgLy8gQ2x1ZSByZXN0cmljdGlvbiBjaGFyYWN0ZXJzIChyZWNlaXZpbmcpXG4gICAgJ1Z1bG5lcmFibGUnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnQ2Fubm90IHJlY2VpdmUgYSBudW1iZXIgMiBvciBudW1iZXIgNSBjbHVlJyxcbiAgICAgICAgJ/Cfm6HvuI8nLFxuICAgICksXG4gICAgJ0NvbG9yLUJsaW5kJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCByZWNlaXZlIGEgY29sb3IgY2x1ZScsXG4gICAgICAgICfwn5GTJyxcbiAgICApLFxuXG4gICAgLy8gUGxheSByZXN0cmljdGlvbiBjaGFyYWN0ZXJzXG4gICAgJ0ZvbGxvd2VyJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBwbGF5IGEgY2FyZCB1bmxlc3MgdHdvIGNhcmRzIG9mIHRoZSBzYW1lIHJhbmsgaGF2ZSBhbHJlYWR5IGJlZW4gcGxheWVkJyxcbiAgICAgICAgJ/CfkYHvuI8nLFxuICAgICksXG4gICAgJ0ltcHVsc2l2ZSc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdNdXN0IHBsYXkgc2xvdCAxIGlmIGl0IGhhcyBiZWVuIGNsdWVkJyxcbiAgICAgICAgJ/CfkoknLFxuICAgICksXG4gICAgJ0luZG9sZW50JzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBwbGF5IGEgY2FyZCBpZiB0aGV5IHBsYXllZCBvbiB0aGUgbGFzdCByb3VuZCcsXG4gICAgICAgICfwn5K6JyxcbiAgICApLFxuICAgICdIZXNpdGFudCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW5ub3QgcGxheSBjYXJkcyBmcm9tIHNsb3QgMScsXG4gICAgICAgICfwn5G08J+PuycsXG4gICAgKSxcblxuICAgIC8vIERpc2NhcmQgcmVzdHJpY3Rpb24gY2hhcmFjdGVyc1xuICAgICdBbnhpb3VzJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBkaXNjYXJkIGlmIHRoZXJlIGlzIGFuIGV2ZW4gbnVtYmVyIG9mIGNsdWVzIGF2YWlsYWJsZSAoaW5jbHVkaW5nIDApJyxcbiAgICAgICAgJ/CfmLAnLFxuICAgICksXG4gICAgJ1RyYXVtYXRpemVkJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBkaXNjYXJkIGlmIHRoZXJlIGlzIGFuIG9kZCBudW1iZXIgb2YgY2x1ZXMgYXZhaWxhYmxlJyxcbiAgICAgICAgJ/CfmKgnLFxuICAgICksXG4gICAgJ1dhc3RlZnVsJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBkaXNjYXJkIGlmIHRoZXJlIGFyZSAyIG9yIG1vcmUgY2x1ZXMgYXZhaWxhYmxlJyxcbiAgICAgICAgJ/Cfl5HvuI8nLFxuICAgICksXG5cbiAgICAvLyBFeHRyYSB0dXJuIGNoYXJhY3RlcnNcbiAgICAnR2VuaXVzJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ011c3QgY2x1ZSBib3RoIGEgbnVtYmVyIGFuZCBhIGNvbG9yICh1c2VzIHR3byBjbHVlcyknLFxuICAgICAgICAn8J+noCcsXG4gICAgKSxcbiAgICAnU3luZXN0aGV0aWMnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnR2l2ZXMgbnVtYmVyIGFuZCBjb2xvciBjbHVlcyBhdCB0aGUgc2FtZSB0aW1lJyxcbiAgICAgICAgJ/CfjqgnLFxuICAgICksXG4gICAgJ1Bhbmlja3knOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnV2hlbiBkaXNjYXJkaW5nLCBkaXNjYXJkcyB0d2ljZSBpZiA0IGNsdWVzIG9yIGxlc3MnLFxuICAgICAgICAn8J+YsycsXG4gICAgKSxcblxuICAgIC8vIE90aGVyXG4gICAgJ0NvbnRyYXJpYW4nOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnUGxheSBvcmRlciBpbnZlcnRzIGFmdGVyIHRha2luZyBhIHR1cm4gKyAyIHR1cm4gZW5kIGdhbWUnLFxuICAgICAgICAn8J+ZhScsXG4gICAgKSxcbiAgICAnU3R1YmJvcm4nOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnTXVzdCBwZXJmb3JtIGEgZGlmZmVyZW50IGFjdGlvbiB0eXBlIHRoYW4gdGhlIHBsYXllciB0aGF0IGNhbWUgYmVmb3JlIHRoZW0nLFxuICAgICAgICAn8J+YoCcsXG4gICAgKSxcbiAgICAvKlxuICAgICdGb3JnZXRmdWwnOiBuZXcgQ2hhcmFjdGVyKFxuICAgICAgICAnSGFuZCBpcyBzaHVmZmxlZCBhZnRlciBkaXNjYXJkaW5nIChidXQgYmVmb3JlIGRyYXdpbmcpJyxcbiAgICAgICAgJ/CflIAnLFxuICAgICksXG4gICAgKi9cbiAgICAnQmxpbmQgU3BvdCc6IG5ldyBDaGFyYWN0ZXIoXG4gICAgICAgICdDYW5ub3Qgc2VlIHRoZSBjYXJkcyBvZiB0aGUgcGxheWVyIHRvIHRoZWlyIGxlZnQnLFxuICAgICAgICAn8J+alycsXG4gICAgKSxcbiAgICAnT2JsaXZpb3VzJzogbmV3IENoYXJhY3RlcihcbiAgICAgICAgJ0Nhbm5vdCBzZWUgdGhlIGNhcmRzIG9mIHRoZSBwbGF5ZXIgdG8gdGhlaXIgcmlnaHQnLFxuICAgICAgICAn8J+agicsXG4gICAgKSxcbn07XG5cbi8vIENvcHkgdGhlIG5hbWUgb2YgZWFjaCBjaGFyYWN0ZXIgaW5zaWRlIG9mIHRoZSBvYmplY3QgZm9yIGxhdGVyIHVzZVxuZm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKGV4cG9ydHMuQ0hBUkFDVEVSUykpIHtcbiAgICBleHBvcnRzLkNIQVJBQ1RFUlNbbmFtZV0ubmFtZSA9IG5hbWU7XG59XG5cbi8vIFRoaXMgbXVzdCBtYXRjaCB0aGUgXCJyZXBsYXlBY3Rpb25UeXBlXCIgY29uc3RhbnRzIGluIHRoZSBcImNvbnN0YW50cy5nb1wiIGZpbGVcbmV4cG9ydHMuUkVQTEFZX0FDVElPTl9UWVBFID0ge1xuICAgIFRVUk46IDAsXG4gICAgQVJST1c6IDEsXG4gICAgTEVBREVSX1RSQU5TRkVSOiAyLFxuICAgIE1PUlBIOiAzLFxuICAgIFNPVU5EOiA0LFxufTtcblxuLy8gVGhpcyBvbmx5IGZyZWV6ZXMgb25lIGxheWVyIGRlZXA7IHRvIGRvIGFueSBiZXR0ZXIsIHdlIHNob3VsZCBsaWtlbHlcbi8vIGludm9sdmUgYSBsaWJyYXJ5IGxpa2UgaW1tdXRhYmxlanMuIEJ1dCBwcm9iYWJseSBub3Qgd29ydGggYm90aGVyaW5nIHdpdGguXG5mb3IgKGNvbnN0IHByb3BlcnR5IG9mIE9iamVjdC5rZXlzKGV4cG9ydHMpKSB7XG4gICAgT2JqZWN0LmZyZWV6ZShwcm9wZXJ0eSk7XG59XG4iLCIvKlxuICAgIEluLWdhbWUgY2hhdFxuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcblxuJChkb2N1bWVudCkucmVhZHkoKCkgPT4ge1xuICAgIGluaXREcmFnZ2FibGVEaXYoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWUtY2hhdC1tb2RhbCcpKTtcbiAgICBpbml0UmVzaXphYmxlRGl2KCcucmVzaXphYmxlJyk7XG5cbiAgICAkKCcjZ2FtZS1jaGF0LW1vZGFsLWhlYWRlci1jbG9zZScpLmNsaWNrKCgpID0+IHtcbiAgICAgICAgaGlkZSgpO1xuICAgIH0pO1xufSk7XG5cbmV4cG9ydHMudG9nZ2xlID0gKCkgPT4ge1xuICAgIGNvbnN0IG1vZGFsID0gJCgnI2dhbWUtY2hhdC1tb2RhbCcpO1xuICAgIGlmIChtb2RhbC5pcygnOnZpc2libGUnKSkge1xuICAgICAgICBoaWRlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2hvdygpO1xuICAgIH1cbn07XG5cbmNvbnN0IHNob3cgPSAoKSA9PiB7XG4gICAgY29uc3QgbW9kYWwgPSAkKCcjZ2FtZS1jaGF0LW1vZGFsJyk7XG4gICAgbW9kYWwuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuXG4gICAgLy8gQ2hlY2sgdG8gc2VlIGlmIHRoZXJlIGFyZSBhbnkgdW5jdXJyZW50bHkgdW5yZWFkIGNoYXQgbWVzc2FnZXNcbiAgICBpZiAoZ2xvYmFscy5jaGF0VW5yZWFkICE9PSAwKSB7XG4gICAgICAgIC8vIElmIHRoZSB1c2VyIGlzIG9wZW5pbmcgdGhlIGNoYXQsIHRoZW4gd2UgYXNzdW1lIHRoYXQgYWxsIG9mIHRoZSBjaGF0IG1lc3NhZ2VzIGFyZSByZWFkXG4gICAgICAgIGdsb2JhbHMuY2hhdFVucmVhZCA9IDA7XG4gICAgICAgIGdsb2JhbHMuY29ubi5zZW5kKCdjaGF0UmVhZCcpOyAvLyBXZSBuZWVkIHRvIG5vdGlmeSB0aGUgc2VydmVyIHRoYXQgd2UgaGF2ZSByZWFkIGV2ZXJ5dGhpbmdcbiAgICAgICAgZ2xvYmFscy51aS51cGRhdGVDaGF0TGFiZWwoKTsgLy8gUmVzZXQgdGhlIFwiQ2hhdFwiIFVJIGJ1dHRvbiBiYWNrIHRvIG5vcm1hbFxuICAgIH1cblxuICAgIC8vIElmIHRoZXJlIGlzIGEgc3RvcmVkIHNpemUgLyBwb3NpdGlvbiBmb3IgdGhlIGNoYXQgYm94LCBzZXQgdGhhdFxuICAgIGxldCBwdXRDaGF0SW5EZWZhdWx0UG9zaXRpb24gPSB0cnVlO1xuICAgIGNvbnN0IHdpZHRoID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NoYXRXaW5kb3dXaWR0aCcpO1xuICAgIGNvbnN0IGhlaWdodCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjaGF0V2luZG93SGVpZ2h0Jyk7XG4gICAgY29uc3QgdG9wID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NoYXRXaW5kb3dUb3AnKTtcbiAgICBjb25zdCBsZWZ0ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NoYXRXaW5kb3dMZWZ0Jyk7XG4gICAgaWYgKFxuICAgICAgICB3aWR0aCAhPT0gbnVsbCAmJiB3aWR0aCAhPT0gJydcbiAgICAgICAgJiYgaGVpZ2h0ICE9PSBudWxsICYmIGhlaWdodCAhPT0gJydcbiAgICAgICAgJiYgdG9wICE9PSBudWxsICYmIHRvcCAhPT0gJydcbiAgICAgICAgJiYgbGVmdCAhPT0gbnVsbCAmJiBsZWZ0ICE9PSAnJ1xuICAgICkge1xuICAgICAgICBwdXRDaGF0SW5EZWZhdWx0UG9zaXRpb24gPSBmYWxzZTtcbiAgICAgICAgbW9kYWwuY3NzKCd3aWR0aCcsIHdpZHRoKTtcbiAgICAgICAgbW9kYWwuY3NzKCdoZWlnaHQnLCBoZWlnaHQpO1xuICAgICAgICBtb2RhbC5jc3MoJ3RvcCcsIHRvcCk7XG4gICAgICAgIG1vZGFsLmNzcygnbGVmdCcsIGxlZnQpO1xuICAgIH1cblxuICAgIC8vIEp1c3QgaW4gY2FzZSwgcmVzZXQgdGhlIHNpemUgYW5kIHBvc2l0aW9uIGlmIHRoZSBzdG9yZWQgbG9jYXRpb24gcHV0cyB0aGUgY2hhdCBib3ggb2Zmc2NyZWVuXG4gICAgaWYgKG1vZGFsLmlzKCc6b2Zmc2NyZWVuJykpIHtcbiAgICAgICAgcHV0Q2hhdEluRGVmYXVsdFBvc2l0aW9uID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocHV0Q2hhdEluRGVmYXVsdFBvc2l0aW9uKSB7XG4gICAgICAgIG1vZGFsLmNzcygnd2lkdGgnLCAnMjAlJyk7XG4gICAgICAgIG1vZGFsLmNzcygnaGVpZ2h0JywgJzUwJScpO1xuICAgICAgICBtb2RhbC5jc3MoJ3RvcCcsICcxJScpO1xuICAgICAgICBtb2RhbC5jc3MoJ2xlZnQnLCAnNzklJyk7XG4gICAgfVxuXG4gICAgLy8gU2Nyb2xsIHRvIHRoZSBib3R0b20gb2YgdGhlIGNoYXRcbiAgICBjb25zdCBjaGF0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWUtY2hhdC10ZXh0Jyk7XG4gICAgY2hhdC5zY3JvbGxUb3AgPSBjaGF0LnNjcm9sbEhlaWdodDtcblxuICAgICQoJyNnYW1lLWNoYXQtaW5wdXQnKS5mb2N1cygpO1xufTtcbmV4cG9ydHMuc2hvdyA9IHNob3c7XG5cbmNvbnN0IGhpZGUgPSAoKSA9PiB7XG4gICAgJCgnI2dhbWUtY2hhdC1tb2RhbCcpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSk7XG59O1xuZXhwb3J0cy5oaWRlID0gaGlkZTtcblxuLypcbiAgICBNYWtlIGRyYWdnYWJsZSBkaXZcbiAgICBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2hvd3RvL2hvd3RvX2pzX2RyYWdnYWJsZS5hc3BcbiovXG5cbmZ1bmN0aW9uIGluaXREcmFnZ2FibGVEaXYoZWxlbWVudCkge1xuICAgIGxldCBwb3MxID0gMDtcbiAgICBsZXQgcG9zMiA9IDA7XG4gICAgbGV0IHBvczMgPSAwO1xuICAgIGxldCBwb3M0ID0gMDtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYCR7ZWxlbWVudC5pZH0taGVhZGVyYCkpIHtcbiAgICAgICAgLy8gSWYgcHJlc2VudCwgdGhlIGhlYWRlciBpcyB3aGVyZSB5b3UgbW92ZSB0aGUgZGl2IGZyb21cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYCR7ZWxlbWVudC5pZH0taGVhZGVyYCkub25tb3VzZWRvd24gPSBkcmFnTW91c2VEb3duO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE90aGVyd2lzZSwgbW92ZSB0aGUgZGl2IGZyb20gYW55d2hlcmUgaW5zaWRlIHRoZSBkaXZcbiAgICAgICAgZWxlbWVudC5vbm1vdXNlZG93biA9IGRyYWdNb3VzZURvd247XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZHJhZ01vdXNlRG93bihlKSB7XG4gICAgICAgIGUgPSBlIHx8IHdpbmRvdy5ldmVudDtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgIC8vIEdldCB0aGUgbW91c2UgY3Vyc29yIHBvc2l0aW9uIGF0IHN0YXJ0dXBcbiAgICAgICAgcG9zMyA9IGUuY2xpZW50WDtcbiAgICAgICAgcG9zNCA9IGUuY2xpZW50WTtcbiAgICAgICAgZG9jdW1lbnQub25tb3VzZXVwID0gY2xvc2VEcmFnRWxlbWVudDtcblxuICAgICAgICAvLyBDYWxsIGEgZnVuY3Rpb24gd2hlbmV2ZXIgdGhlIGN1cnNvciBtb3Zlc1xuICAgICAgICBkb2N1bWVudC5vbm1vdXNlbW92ZSA9IGVsZW1lbnREcmFnO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVsZW1lbnREcmFnKGUpIHtcbiAgICAgICAgZSA9IGUgfHwgd2luZG93LmV2ZW50O1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBuZXcgY3Vyc29yIHBvc2l0aW9uXG4gICAgICAgIHBvczEgPSBwb3MzIC0gZS5jbGllbnRYO1xuICAgICAgICBwb3MyID0gcG9zNCAtIGUuY2xpZW50WTtcbiAgICAgICAgcG9zMyA9IGUuY2xpZW50WDtcbiAgICAgICAgcG9zNCA9IGUuY2xpZW50WTtcblxuICAgICAgICAvLyBSZWNvcmQgdGhlIGN1cnJlbnQgcG9zaXRpb25cbiAgICAgICAgY29uc3Qgb2xkVG9wID0gZWxlbWVudC5zdHlsZS50b3A7XG4gICAgICAgIGNvbnN0IG9sZExlZnQgPSBlbGVtZW50LnN0eWxlLmxlZnQ7XG5cbiAgICAgICAgLy8gU2V0IHRoZSBlbGVtZW50J3MgbmV3IHBvc2l0aW9uXG4gICAgICAgIGVsZW1lbnQuc3R5bGUudG9wID0gYCR7ZWxlbWVudC5vZmZzZXRUb3AgLSBwb3MyfXB4YDtcbiAgICAgICAgZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7ZWxlbWVudC5vZmZzZXRMZWZ0IC0gcG9zMX1weGA7XG5cbiAgICAgICAgLy8gTW92ZSBpZiBiYWNrIGlmIGl0IGlzIG9mZnNjcmVlblxuICAgICAgICBpZiAoJCgnI2dhbWUtY2hhdC1tb2RhbCcpLmlzKCc6b2Zmc2NyZWVuJykpIHtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUudG9wID0gb2xkVG9wO1xuICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5sZWZ0ID0gb2xkTGVmdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsb3NlRHJhZ0VsZW1lbnQoKSB7XG4gICAgICAgIC8vIFN0b3AgbW92aW5nIHdoZW4gbW91c2UgYnV0dG9uIGlzIHJlbGVhc2VkXG4gICAgICAgIGRvY3VtZW50Lm9ubW91c2V1cCA9IG51bGw7XG4gICAgICAgIGRvY3VtZW50Lm9ubW91c2Vtb3ZlID0gbnVsbDtcblxuICAgICAgICAvLyBTdG9yZSB0aGUgc2l6ZSBhbmQgbG9jYXRpb24gb2YgdGhlIGRpdlxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY2hhdFdpbmRvd1dpZHRoJywgZWxlbWVudC5zdHlsZS53aWR0aCk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjaGF0V2luZG93SGVpZ2h0JywgZWxlbWVudC5zdHlsZS5oZWlnaHQpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY2hhdFdpbmRvd1RvcCcsIGVsZW1lbnQuc3R5bGUudG9wKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NoYXRXaW5kb3dMZWZ0JywgZWxlbWVudC5zdHlsZS5sZWZ0KTtcbiAgICB9XG59XG5cbi8qXG4gICAgTWFrZSByZXNpemFibGUgZGl2IGJ5IEh1bmcgTmd1eWVuXG4gICAgaHR0cHM6Ly9jb2RlcGVuLmlvL1plcm9YLURHL3Blbi92amRvWWVcbiovXG5cbi8qIGVzbGludC1kaXNhYmxlICovXG5mdW5jdGlvbiBpbml0UmVzaXphYmxlRGl2KGRpdikge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGRpdik7XG4gICAgY29uc3QgcmVzaXplcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGAke2Rpdn0gLnJlc2l6ZXJgKTtcbiAgICBjb25zdCBtaW5pbXVtU2l6ZSA9IDIwO1xuICAgIGxldCBvcmlnaW5hbFdpZHRoID0gMDtcbiAgICBsZXQgb3JpZ2luYWxIZWlnaHQgPSAwO1xuICAgIGxldCBvcmlnaW5hbFggPSAwO1xuICAgIGxldCBvcmlnaW5hbFkgPSAwO1xuICAgIGxldCBvcmlnaW5hbE1vdXNlWCA9IDA7XG4gICAgbGV0IG9yaWdpbmFsTW91c2VZID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJlc2l6ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRSZXNpemVyID0gcmVzaXplcnNbaV07XG4gICAgICAgIGN1cnJlbnRSZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBvcmlnaW5hbFdpZHRoID0gcGFyc2VGbG9hdChnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQsIG51bGwpXG4gICAgICAgICAgICAgICAgLmdldFByb3BlcnR5VmFsdWUoJ3dpZHRoJylcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgncHgnLCAnJykpO1xuICAgICAgICAgICAgb3JpZ2luYWxIZWlnaHQgPSBwYXJzZUZsb2F0KGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCwgbnVsbClcbiAgICAgICAgICAgICAgICAuZ2V0UHJvcGVydHlWYWx1ZSgnaGVpZ2h0JylcbiAgICAgICAgICAgICAgICAucmVwbGFjZSgncHgnLCAnJykpO1xuICAgICAgICAgICAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICBvcmlnaW5hbFggPSByZWN0LmxlZnQ7XG4gICAgICAgICAgICBvcmlnaW5hbFkgPSByZWN0LnRvcDtcbiAgICAgICAgICAgIG9yaWdpbmFsTW91c2VYID0gZS5wYWdlWDtcbiAgICAgICAgICAgIG9yaWdpbmFsTW91c2VZID0gZS5wYWdlWTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCByZXNpemUpO1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBzdG9wUmVzaXplKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVzaXplKGUpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UmVzaXplci5jbGFzc0xpc3QuY29udGFpbnMoJ2JvdHRvbS1yaWdodCcpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgd2lkdGggPSBvcmlnaW5hbFdpZHRoICsgKGUucGFnZVggLSBvcmlnaW5hbE1vdXNlWCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gb3JpZ2luYWxIZWlnaHQgKyAoZS5wYWdlWSAtIG9yaWdpbmFsTW91c2VZKTtcbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiBtaW5pbXVtU2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaGVpZ2h0ID4gbWluaW11bVNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY3VycmVudFJlc2l6ZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdib3R0b20tbGVmdCcpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gb3JpZ2luYWxIZWlnaHQgKyAoZS5wYWdlWSAtIG9yaWdpbmFsTW91c2VZKTtcbiAgICAgICAgICAgICAgICBjb25zdCB3aWR0aCA9IG9yaWdpbmFsV2lkdGggLSAoZS5wYWdlWCAtIG9yaWdpbmFsTW91c2VYKTtcbiAgICAgICAgICAgICAgICBpZiAoaGVpZ2h0ID4gbWluaW11bVNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiBtaW5pbXVtU2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLmxlZnQgPSBgJHtvcmlnaW5hbFggKyAoZS5wYWdlWCAtIG9yaWdpbmFsTW91c2VYKX1weGA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50UmVzaXplci5jbGFzc0xpc3QuY29udGFpbnMoJ3RvcC1yaWdodCcpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgd2lkdGggPSBvcmlnaW5hbFdpZHRoICsgKGUucGFnZVggLSBvcmlnaW5hbE1vdXNlWCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gb3JpZ2luYWxIZWlnaHQgLSAoZS5wYWdlWSAtIG9yaWdpbmFsTW91c2VZKTtcbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiBtaW5pbXVtU2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaGVpZ2h0ID4gbWluaW11bVNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnRvcCA9IGAke29yaWdpbmFsWSArIChlLnBhZ2VZIC0gb3JpZ2luYWxNb3VzZVkpfXB4YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHdpZHRoID0gb3JpZ2luYWxXaWR0aCAtIChlLnBhZ2VYIC0gb3JpZ2luYWxNb3VzZVgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IG9yaWdpbmFsSGVpZ2h0IC0gKGUucGFnZVkgLSBvcmlnaW5hbE1vdXNlWSk7XG4gICAgICAgICAgICAgICAgaWYgKHdpZHRoID4gbWluaW11bVNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7b3JpZ2luYWxYICsgKGUucGFnZVggLSBvcmlnaW5hbE1vdXNlWCl9cHhgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaGVpZ2h0ID4gbWluaW11bVNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLnRvcCA9IGAke29yaWdpbmFsWSArIChlLnBhZ2VZIC0gb3JpZ2luYWxNb3VzZVkpfXB4YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzdG9wUmVzaXplKCkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHJlc2l6ZSk7XG5cbiAgICAgICAgICAgIC8vIFN0b3JlIHRoZSBzaXplIGFuZCBsb2NhdGlvbiBvZiB0aGUgZGl2XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY2hhdFdpbmRvd1dpZHRoJywgZWxlbWVudC5zdHlsZS53aWR0aCk7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY2hhdFdpbmRvd0hlaWdodCcsIGVsZW1lbnQuc3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjaGF0V2luZG93VG9wJywgZWxlbWVudC5zdHlsZS50b3ApO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NoYXRXaW5kb3dMZWZ0JywgZWxlbWVudC5zdHlsZS5sZWZ0KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbi8qIGVzbGludC1lbmFibGUgKi9cbiIsIi8qXG4gICAgVGhlIEhhbmFiaSBnYW1lIFVJXG4qL1xuXG5leHBvcnRzLmNoYXQgPSByZXF1aXJlKCcuL2NoYXQnKTtcbmV4cG9ydHMud2Vic29ja2V0ID0gcmVxdWlyZSgnLi93ZWJzb2NrZXQnKTtcbmV4cG9ydHMuc291bmRzID0gcmVxdWlyZSgnLi9zb3VuZHMnKTtcbmV4cG9ydHMudG9vbHRpcHMgPSByZXF1aXJlKCcuL3Rvb2x0aXBzJyk7XG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuLi9nbG9iYWxzJyk7XG5jb25zdCBtaXNjID0gcmVxdWlyZSgnLi4vbWlzYycpO1xuY29uc3QgdWkgPSByZXF1aXJlKCcuL3VpL3VpJyk7XG5cbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcbiAgICAvLyBEaXNhYmxlIHRoZSByaWdodC1jbGljayBjb250ZXh0IG1lbnUgd2hpbGUgaW4gYSBnYW1lXG4gICAgJCgnYm9keScpLm9uKCdjb250ZXh0bWVudScsICcjZ2FtZScsICgpID0+IGZhbHNlKTtcbn0pO1xuXG5leHBvcnRzLnNob3cgPSAoKSA9PiB7XG4gICAgZ2xvYmFscy5jdXJyZW50U2NyZWVuID0gJ2dhbWUnO1xuXG4gICAgJCgnI3BhZ2Utd3JhcHBlcicpLmhpZGUoKTsgLy8gV2UgY2FuJ3QgZmFkZSB0aGlzIG91dCBhcyBpdCB3aWxsIG92ZXJsYXBcbiAgICAkKCcjZ2FtZScpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcblxuICAgIC8vIENsZWFyIHRoZSBpbi1nYW1lIGNoYXQgYm94IG9mIGFueSBwcmV2aW91cyBjb250ZW50XG4gICAgJCgnI2dhbWUtY2hhdC10ZXh0JykuaHRtbCgnJyk7XG5cbiAgICBnbG9iYWxzLnVpID0gbmV3IHVpKGdsb2JhbHMsIGV4cG9ydHMpOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5ldy1jYXBcbiAgICBnbG9iYWxzLmNoYXRVbnJlYWQgPSAwO1xuICAgIGdsb2JhbHMuY29ubi5zZW5kKCdoZWxsbycpO1xufTtcblxuZXhwb3J0cy5oaWRlID0gKCkgPT4ge1xuICAgIGdsb2JhbHMuY3VycmVudFNjcmVlbiA9ICdsb2JieSc7XG5cbiAgICBnbG9iYWxzLnVpLmRlc3Ryb3koKTtcbiAgICBnbG9iYWxzLnVpID0gbnVsbDtcblxuICAgICQoJyNnYW1lJykuaGlkZSgpOyAvLyBXZSBjYW4ndCBmYWRlIHRoaXMgb3V0IGFzIGl0IHdpbGwgb3ZlcmxhcFxuICAgICQoJyNwYWdlLXdyYXBwZXInKS5mYWRlSW4oZ2xvYmFscy5mYWRlVGltZSk7XG5cbiAgICAvLyBNYWtlIHN1cmUgdGhhdCB0aGVyZSBhcmUgbm90IGFueSBnYW1lLXJlbGF0ZWQgbW9kYWxzIHNob3dpbmdcbiAgICAkKCcjZ2FtZS1jaGF0LW1vZGFsJykuaGlkZSgpO1xuXG4gICAgLy8gTWFrZSBzdXJlIHRoYXQgdGhlcmUgYXJlIG5vdCBhbnkgZ2FtZS1yZWxhdGVkIHRvb2x0aXBzIHNob3dpbmdcbiAgICBtaXNjLmNsb3NlQWxsVG9vbHRpcHMoKTtcblxuICAgIC8vIFNjcm9sbCB0byB0aGUgYm90dG9tIG9mIHRoZSBjaGF0XG4gICAgY29uc3QgY2hhdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieS1jaGF0LXRleHQnKTtcbiAgICBjaGF0LnNjcm9sbFRvcCA9IGNoYXQuc2Nyb2xsSGVpZ2h0O1xufTtcblxuLy8gQWxzbyBtYWtlIGl0IGF2YWlsYWJsZSB0byB0aGUgd2luZG93IHNvIHRoYXQgd2UgY2FuIGFjY2VzcyBnbG9iYWwgdmFyaWFibGVzXG4vLyBmcm9tIHRoZSBKYXZhU2NyaXB0IGNvbnNvbGUgKGZvciBkZWJ1Z2dpbmcgcHVycG9zZXMpXG53aW5kb3cuZ2FtZSA9IGV4cG9ydHM7XG4iLCIvKlxuICAgIEluLWdhbWUgc291bmRzXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi4vZ2xvYmFscycpO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgcHJlbG9hZCgpO1xufSk7XG5cbmV4cG9ydHMucGxheSA9IChmaWxlKSA9PiB7XG4gICAgY29uc3QgcGF0aCA9IGAvcHVibGljL3NvdW5kcy8ke2ZpbGV9Lm1wM2A7XG4gICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8ocGF0aCk7XG4gICAgY29uc3QgcGxheVByb21pc2UgPSBhdWRpby5wbGF5KCk7XG4gICAgaWYgKHBsYXlQcm9taXNlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcGxheVByb21pc2UudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAvLyBBdWRpbyBwbGF5YmFjayB3YXMgc3VjY2Vzc2Z1bDsgZG8gbm90aGluZ1xuICAgICAgICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIC8vIEF1ZGlvIHBsYXliYWNrIGZhaWxlZFxuICAgICAgICAgICAgLy8gVGhpcyBpcyBtb3N0IGxpa2VseSBkdWUgdG8gdGhlIHVzZXIgbm90IGhhdmluZyBpbnRlcmFjdGVkIHdpdGggdGhlIHBhZ2UgeWV0XG4gICAgICAgICAgICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy81MjgwNzg3NC9ob3ctdG8tbWFrZS1hdWRpby1wbGF5LW9uLWJvZHktb25sb2FkXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gcGxheSBcIiR7cGF0aH1cIjpgLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5cbmNvbnN0IHByZWxvYWQgPSAoKSA9PiB7XG4gICAgaWYgKCFnbG9iYWxzLnNldHRpbmdzLnNlbmRUdXJuU291bmQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHNvdW5kRmlsZXMgPSBbXG4gICAgICAgICdibGluZDEnLFxuICAgICAgICAnYmxpbmQyJyxcbiAgICAgICAgJ2JsaW5kMycsXG4gICAgICAgICdibGluZDQnLFxuICAgICAgICAnZmFpbDEnLFxuICAgICAgICAnZmFpbDInLFxuICAgICAgICAnZmluaXNoZWRfZmFpbCcsXG4gICAgICAgICdmaW5pc2hlZF9zdWNjZXNzJyxcbiAgICAgICAgJ3NhZCcsXG4gICAgICAgICd0b25lJyxcbiAgICAgICAgJ3R1cm5fb3RoZXInLFxuICAgICAgICAndHVybl91cycsXG4gICAgICAgIC8vIERvbid0IHByZWxvYWQgc2hhcmVkIHJlcGxheSBzb3VuZCBlZmZlY3RzLCBhcyB0aGV5IGFyZSB1c2VkIG1vcmUgcmFyZWx5XG4gICAgXTtcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2Ygc291bmRGaWxlcykge1xuICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhgcHVibGljL3NvdW5kcy8ke2ZpbGV9Lm1wM2ApO1xuICAgICAgICBhdWRpby5sb2FkKCk7XG4gICAgfVxufTtcbiIsIi8qXG4gICAgSW4tZ2FtZSB0b29sdGlwcyAoZm9yIG5vdGVzLCBldGMuKVxuKi9cblxuLy8gQ29uc3RhbnRzXG5jb25zdCBtYXhQbGF5ZXJzID0gNjtcbmNvbnN0IG1heENhcmRzSW5BRGVjayA9IDYwO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgY29uc3QgdG9vbHRpcFRoZW1lcyA9IFtcbiAgICAgICAgJ3Rvb2x0aXBzdGVyLXNoYWRvdycsXG4gICAgICAgICd0b29sdGlwc3Rlci1zaGFkb3ctYmlnJyxcbiAgICBdO1xuICAgIGNvbnN0IHRvb2x0aXBPcHRpb25zID0ge1xuICAgICAgICBhbmltYXRpb246ICdncm93JyxcbiAgICAgICAgY29udGVudEFzSFRNTDogdHJ1ZSxcbiAgICAgICAgZGVsYXk6IDAsXG4gICAgICAgIGludGVyYWN0aXZlOiB0cnVlLCAvLyBTbyB0aGF0IHVzZXJzIGNhbiB1cGRhdGUgdGhlaXIgbm90ZXNcbiAgICAgICAgdGhlbWU6IHRvb2x0aXBUaGVtZXMsXG4gICAgICAgIHRyaWdnZXI6ICdjdXN0b20nLFxuICAgICAgICB1cGRhdGVBbmltYXRpb246IG51bGwsXG4gICAgfTtcblxuICAgIC8vIFNvbWUgdG9vbHRpcHMgYXJlIGRlZmluZWQgaW4gXCJtYWluLnRtcGxcIlxuICAgICQoJyN0b29sdGlwLWRlY2snKS50b29sdGlwc3Rlcih0b29sdGlwT3B0aW9ucyk7XG4gICAgJCgnI3Rvb2x0aXAtc3BlY3RhdG9ycycpLnRvb2x0aXBzdGVyKHRvb2x0aXBPcHRpb25zKTtcbiAgICAkKCcjdG9vbHRpcC1sZWFkZXInKS50b29sdGlwc3Rlcih0b29sdGlwT3B0aW9ucyk7XG5cbiAgICAvLyBEeW5hbWljYWxseSBjcmVhdGUgdGhlIHBsYXllciB0b29sdGlwc1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF4UGxheWVyczsgaSsrKSB7XG4gICAgICAgICQoJyNnYW1lLXRvb2x0aXBzJykuYXBwZW5kKGA8ZGl2IGlkPVwidG9vbHRpcC1wbGF5ZXItJHtpfVwiPjwvZGl2PmApO1xuICAgICAgICAkKGAjdG9vbHRpcC1wbGF5ZXItJHtpfWApLnRvb2x0aXBzdGVyKHRvb2x0aXBPcHRpb25zKTtcbiAgICAgICAgY29uc3QgbmV3VGhlbWVzID0gdG9vbHRpcFRoZW1lcy5zbGljZSgpO1xuICAgICAgICBuZXdUaGVtZXMucHVzaCgnYWxpZ24tY2VudGVyJyk7XG4gICAgICAgICQoYCN0b29sdGlwLXBsYXllci0ke2l9YCkudG9vbHRpcHN0ZXIoJ2luc3RhbmNlJykub3B0aW9uKCd0aGVtZScsIG5ld1RoZW1lcyk7XG5cbiAgICAgICAgJCgnI2dhbWUtdG9vbHRpcHMnKS5hcHBlbmQoYDxkaXYgaWQ9XCJ0b29sdGlwLWNoYXJhY3Rlci1hc3NpZ25tZW50LSR7aX1cIj48L2Rpdj5gKTtcbiAgICAgICAgJChgI3Rvb2x0aXAtY2hhcmFjdGVyLWFzc2lnbm1lbnQtJHtpfWApLnRvb2x0aXBzdGVyKHRvb2x0aXBPcHRpb25zKTtcbiAgICAgICAgJChgI3Rvb2x0aXAtY2hhcmFjdGVyLWFzc2lnbm1lbnQtJHtpfWApLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpLm9wdGlvbigndGhlbWUnLCBuZXdUaGVtZXMpO1xuICAgIH1cblxuICAgIC8vIER5bmFtaWNhbGx5IGNyZWF0ZSB0aGUgY2FyZCBub3RlIHRvb2x0aXBzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhDYXJkc0luQURlY2s7IGkrKykgeyAvLyBNYXRjaGVzIGNhcmQub3JkZXJcbiAgICAgICAgJCgnI2dhbWUtdG9vbHRpcHMnKS5hcHBlbmQoYDxkaXYgaWQ9XCJ0b29sdGlwLWNhcmQtJHtpfVwiPjwvZGl2PmApO1xuICAgICAgICAkKGAjdG9vbHRpcC1jYXJkLSR7aX1gKS50b29sdGlwc3Rlcih0b29sdGlwT3B0aW9ucyk7XG4gICAgfVxufSk7XG4iLCIvKlxuICAgIFRoaXMgZnVuY3Rpb24gZHJhd3MgdGhlIFVJIHdoZW4gZ29pbmcgaW50byBhIGdhbWUgZm9yIHRoZSBmaXJzdCB0aW1lXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5jb25zdCBCdXR0b24gPSByZXF1aXJlKCcuL2J1dHRvbicpO1xuY29uc3QgQnV0dG9uR3JvdXAgPSByZXF1aXJlKCcuL2J1dHRvbkdyb3VwJyk7XG5jb25zdCBDYXJkRGVjayA9IHJlcXVpcmUoJy4vY2FyZERlY2snKTtcbmNvbnN0IENhcmRTdGFjayA9IHJlcXVpcmUoJy4vY2FyZFN0YWNrJyk7XG5jb25zdCBDYXJkTGF5b3V0ID0gcmVxdWlyZSgnLi9jYXJkTGF5b3V0Jyk7XG5jb25zdCBDbHVlID0gcmVxdWlyZSgnLi9jbHVlJyk7XG5jb25zdCBDbHVlUmVjaXBpZW50QnV0dG9uID0gcmVxdWlyZSgnLi9jbHVlUmVjaXBpZW50QnV0dG9uJyk7XG5jb25zdCBDb2xvckJ1dHRvbiA9IHJlcXVpcmUoJy4vY29sb3JCdXR0b24nKTtcbmNvbnN0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4uLy4uL2NvbnN0YW50cycpO1xuY29uc3QgRml0VGV4dCA9IHJlcXVpcmUoJy4vZml0VGV4dCcpO1xuY29uc3QgSGFuYWJpQ2x1ZUxvZyA9IHJlcXVpcmUoJy4vY2x1ZUxvZycpO1xuY29uc3QgSGFuYWJpTmFtZUZyYW1lID0gcmVxdWlyZSgnLi9uYW1lRnJhbWUnKTtcbmNvbnN0IEhhbmFiaU1zZ0xvZyA9IHJlcXVpcmUoJy4vbXNnTG9nJyk7XG5jb25zdCBNdWx0aUZpdFRleHQgPSByZXF1aXJlKCcuL211bHRpRml0VGV4dCcpO1xuY29uc3QgTnVtYmVyQnV0dG9uID0gcmVxdWlyZSgnLi9udW1iZXJCdXR0b24nKTtcbmNvbnN0IHJlcGxheSA9IHJlcXVpcmUoJy4vcmVwbGF5Jyk7XG5jb25zdCB0aW1lciA9IHJlcXVpcmUoJy4vdGltZXInKTtcbmNvbnN0IFRvZ2dsZUJ1dHRvbiA9IHJlcXVpcmUoJy4vdG9nZ2xlQnV0dG9uJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKCkgPT4ge1xuICAgIGxldCB4O1xuICAgIGxldCB5O1xuICAgIGxldCB3aWR0aDtcbiAgICBsZXQgaGVpZ2h0O1xuICAgIGxldCB5T2Zmc2V0O1xuICAgIGxldCByZWN0OyAvLyBXZSByZXVzZSB0aGlzIHRvIGRyYXcgbWFueSBzcXVhcmVzIC8gcmVjdGFuZ2xlc1xuICAgIGxldCBidXR0b247IC8vIFdlIHJldXNlIHRoaXMgdG8gZHJhdyBtYW55IGJ1dHRvbnNcblxuICAgIC8vIENvbnN0YW50c1xuICAgIGNvbnN0IHdpblcgPSBnbG9iYWxzLnN0YWdlLmdldFdpZHRoKCk7XG4gICAgY29uc3Qgd2luSCA9IGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCk7XG5cbiAgICAvLyBKdXN0IGluIGNhc2UsIGRlbGV0ZSBhbGwgZXhpc3RpbmcgbGF5ZXJzXG4gICAgY29uc3QgbGF5ZXJzID0gZ2xvYmFscy5zdGFnZS5nZXRMYXllcnMoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxheWVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICBsYXllcnNbaV0ucmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgLy8gRGVmaW5lIHRoZSBsYXllcnNcbiAgICAvLyAodGhleSBhcmUgYWRkZWQgdG8gdGhlIHN0YWdlIGxhdGVyIG9uIGF0IHRoZSBlbmQgb2YgdGhlIGJ1aWxkVUkgZnVuY3Rpb24pXG4gICAgZ2xvYmFscy5sYXllcnMuYmFja2dyb3VuZCA9IG5ldyBLaW5ldGljLkxheWVyKCk7XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZCA9IG5ldyBLaW5ldGljLkxheWVyKCk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkgPSBuZXcgS2luZXRpYy5MYXllcigpO1xuICAgIGdsb2JhbHMubGF5ZXJzLm92ZXJ0b3AgPSBuZXcgS2luZXRpYy5MYXllcigpO1xuICAgIGdsb2JhbHMubGF5ZXJzLnRleHQgPSBuZXcgS2luZXRpYy5MYXllcih7XG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMudGltZXIgPSBuZXcgS2luZXRpYy5MYXllcih7XG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG5cbiAgICBjb25zdCBiYWNrZ3JvdW5kID0gbmV3IEtpbmV0aWMuSW1hZ2Uoe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogd2luVyxcbiAgICAgICAgaGVpZ2h0OiB3aW5ILFxuICAgICAgICBpbWFnZTogZ2xvYmFscy5JbWFnZUxvYWRlci5nZXQoJ2JhY2tncm91bmQnKSxcbiAgICB9KTtcblxuICAgIGdsb2JhbHMubGF5ZXJzLmJhY2tncm91bmQuYWRkKGJhY2tncm91bmQpO1xuXG4gICAgLypcbiAgICAgICAgRHJhdyB0aGUgZGlzY2FyZCBhcmVhXG4gICAgKi9cblxuICAgIC8vIFRoaXMgaXMgdGhlIGludmlzaWJsZSByZWN0YW5nbGUgdGhhdCBwbGF5ZXJzIGRyYWcgY2FyZHMgdG8gaW4gb3JkZXIgdG8gZGlzY2FyZCB0aGVtXG4gICAgZ2xvYmFscy5lbGVtZW50cy5kaXNjYXJkQXJlYSA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiAwLjggKiB3aW5XLFxuICAgICAgICB5OiAwLjYgKiB3aW5ILFxuICAgICAgICB3aWR0aDogMC4yICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjQgKiB3aW5ILFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMuZGlzY2FyZEFyZWEuaXNPdmVyID0gcG9zID0+IChcbiAgICAgICAgcG9zLnggPj0gZ2xvYmFscy5lbGVtZW50cy5kaXNjYXJkQXJlYS5nZXRYKClcbiAgICAgICAgJiYgcG9zLnkgPj0gZ2xvYmFscy5lbGVtZW50cy5kaXNjYXJkQXJlYS5nZXRZKClcbiAgICAgICAgJiYgcG9zLnggPD0gZ2xvYmFscy5lbGVtZW50cy5kaXNjYXJkQXJlYS5nZXRYKCkgKyBnbG9iYWxzLmVsZW1lbnRzLmRpc2NhcmRBcmVhLmdldFdpZHRoKClcbiAgICAgICAgJiYgcG9zLnkgPD0gZ2xvYmFscy5lbGVtZW50cy5kaXNjYXJkQXJlYS5nZXRZKCkgKyBnbG9iYWxzLmVsZW1lbnRzLmRpc2NhcmRBcmVhLmdldEhlaWdodCgpXG4gICAgKTtcblxuICAgIC8vIFRoZSByZWQgYm9yZGVyIHRoYXQgc3Vycm91bmRzIHRoZSBkaXNjYXJkIHBpbGUgd2hlbiB0aGUgdGVhbSBpcyBhdCA4IGNsdWVzXG4gICAgZ2xvYmFscy5lbGVtZW50cy5ub0Rpc2NhcmRMYWJlbCA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiAwLjggKiB3aW5XLFxuICAgICAgICB5OiAwLjYgKiB3aW5ILFxuICAgICAgICB3aWR0aDogMC4xOSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4zOSAqIHdpbkgsXG4gICAgICAgIHN0cm9rZTogJyNkZjFjMmQnLFxuICAgICAgICBzdHJva2VXaWR0aDogMC4wMDUgKiB3aW5XLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDEgKiB3aW5XLFxuICAgICAgICB2aXNpYmxlOiBmYWxzZSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5ub0Rpc2NhcmRMYWJlbCk7XG5cbiAgICAvLyBUaGUgeWVsbG93IGJvcmRlciB0aGF0IHN1cnJvdW5kcyB0aGUgZGlzY2FyZCBwaWxlIHdoZW4gaXQgaXMgYSBcIkRvdWJsZSBEaXNjYXJkXCIgc2l0dWF0aW9uXG4gICAgZ2xvYmFscy5lbGVtZW50cy5ub0RvdWJsZURpc2NhcmRMYWJlbCA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiAwLjggKiB3aW5XLFxuICAgICAgICB5OiAwLjYgKiB3aW5ILFxuICAgICAgICB3aWR0aDogMC4xOSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4zOSAqIHdpbkgsXG4gICAgICAgIHN0cm9rZTogJ3llbGxvdycsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAwLjAwNCAqIHdpblcsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4wMSAqIHdpblcsXG4gICAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgICAgICBvcGFjaXR5OiAwLjc1LFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChnbG9iYWxzLmVsZW1lbnRzLm5vRG91YmxlRGlzY2FyZExhYmVsKTtcblxuICAgIC8vIFRoZSBmYWRlZCByZWN0YW5nZSBhcm91bmQgdGhlIHRyYXNoIGNhblxuICAgIHJlY3QgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMC44ICogd2luVyxcbiAgICAgICAgeTogMC42ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMTkgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMzkgKiB3aW5ILFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBvcGFjaXR5OiAwLjIsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4wMSAqIHdpblcsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuYmFja2dyb3VuZC5hZGQocmVjdCk7XG5cbiAgICAvLyBUaGUgaWNvbiBvdmVyIHRoZSBkaXNjYXJkIHBpbGVcbiAgICBjb25zdCBpbWcgPSBuZXcgS2luZXRpYy5JbWFnZSh7XG4gICAgICAgIHg6IDAuODIgKiB3aW5XLFxuICAgICAgICB5OiAwLjYyICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMTUgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMzUgKiB3aW5ILFxuICAgICAgICBvcGFjaXR5OiAwLjIsXG4gICAgICAgIGltYWdlOiBnbG9iYWxzLkltYWdlTG9hZGVyLmdldCgndHJhc2hjYW4nKSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5iYWNrZ3JvdW5kLmFkZChpbWcpO1xuXG4gICAgLypcbiAgICAgICAgVGhlIGFjdGlvbiBsb2dcbiAgICAqL1xuXG4gICAgY29uc3QgYWN0aW9uTG9nVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjIsXG4gICAgICAgIHk6IDAuMjM1LFxuICAgICAgICB3OiAwLjQsXG4gICAgICAgIGg6IDAuMDk4LFxuICAgIH07XG4gICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0JHQVVJKSB7XG4gICAgICAgIGFjdGlvbkxvZ1ZhbHVlcy54ID0gMC4wMTtcbiAgICAgICAgYWN0aW9uTG9nVmFsdWVzLnkgPSAwLjAxO1xuICAgICAgICBhY3Rpb25Mb2dWYWx1ZXMuaCA9IDAuMjU7XG4gICAgfVxuICAgIGNvbnN0IGFjdGlvbkxvZyA9IG5ldyBLaW5ldGljLkdyb3VwKHtcbiAgICAgICAgeDogYWN0aW9uTG9nVmFsdWVzLnggKiB3aW5XLFxuICAgICAgICB5OiBhY3Rpb25Mb2dWYWx1ZXMueSAqIHdpbkgsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGFjdGlvbkxvZyk7XG5cbiAgICAvLyBUaGUgZmFkZWQgcmVjdGFuZ2UgYXJvdW5kIHRoZSBhY3Rpb24gbG9nXG4gICAgcmVjdCA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogYWN0aW9uTG9nVmFsdWVzLncgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IGFjdGlvbkxvZ1ZhbHVlcy5oICogd2luSCxcbiAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgb3BhY2l0eTogMC4zLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDEgKiB3aW5ILFxuICAgICAgICBsaXN0ZW5pbmc6IHRydWUsXG4gICAgfSk7XG4gICAgYWN0aW9uTG9nLmFkZChyZWN0KTtcblxuICAgIC8vIENsaWNraW5nIG9uIHRoZSBhY3Rpb24gbG9nXG4gICAgcmVjdC5vbignY2xpY2sgdGFwJywgKCkgPT4ge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm1zZ0xvZ0dyb3VwLnNob3coKTtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5zdGFnZUZhZGUuc2hvdygpO1xuXG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLm92ZXJ0b3AuZHJhdygpO1xuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlLm9uKCdjbGljayB0YXAnLCAoKSA9PiB7XG4gICAgICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnN0YWdlRmFkZS5vZmYoJ2NsaWNrIHRhcCcpO1xuXG4gICAgICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm1zZ0xvZ0dyb3VwLmhpZGUoKTtcbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlLmhpZGUoKTtcblxuICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMub3ZlcnRvcC5kcmF3KCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gVGhlIGFjdGlvbiBsb2dcbiAgICBsZXQgbWF4TGluZXMgPSAzO1xuICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICBtYXhMaW5lcyA9IDg7XG4gICAgfVxuICAgIGdsb2JhbHMuZWxlbWVudHMubWVzc2FnZVByb21wdCA9IG5ldyBNdWx0aUZpdFRleHQoe1xuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIGZvbnRTaXplOiAwLjAyOCAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgZmlsbDogJyNkOGQ1ZWYnLFxuICAgICAgICBzaGFkb3dDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc2hhZG93Qmx1cjogMTAsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAuOSxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICAgICAgeDogMC4wMSAqIHdpblcsXG4gICAgICAgIHk6IDAuMDAzICogd2luSCxcbiAgICAgICAgd2lkdGg6IChhY3Rpb25Mb2dWYWx1ZXMudyAtIDAuMDIpICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAoYWN0aW9uTG9nVmFsdWVzLmggLSAwLjAwMykgKiB3aW5ILFxuICAgICAgICBtYXhMaW5lcyxcbiAgICB9KTtcbiAgICBhY3Rpb25Mb2cuYWRkKGdsb2JhbHMuZWxlbWVudHMubWVzc2FnZVByb21wdCk7XG5cbiAgICAvLyBUaGUgZGFyayBvdmVybGF5IHRoYXQgYXBwZWFycyB3aGVuIHlvdSBjbGljayBvbiB0aGUgYWN0aW9uIGxvZyAob3IgYSBwbGF5ZXIncyBuYW1lKVxuICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAsXG4gICAgICAgIHdpZHRoOiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IHdpbkgsXG4gICAgICAgIG9wYWNpdHk6IDAuMyxcbiAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMub3ZlcnRvcC5hZGQoZ2xvYmFscy5lbGVtZW50cy5zdGFnZUZhZGUpO1xuXG4gICAgLy8gVGhlIGZ1bGwgYWN0aW9uIGxvZyAodGhhdCBhcHBlYXJzIHdoZW4geW91IGNsaWNrIG9uIHRoZSBhY3Rpb24gbG9nKVxuICAgIGdsb2JhbHMuZWxlbWVudHMubXNnTG9nR3JvdXAgPSBuZXcgSGFuYWJpTXNnTG9nKCk7XG4gICAgZ2xvYmFscy5sYXllcnMub3ZlcnRvcC5hZGQoZ2xvYmFscy5lbGVtZW50cy5tc2dMb2dHcm91cCk7XG5cbiAgICAvLyBUaGUgcmVjdGFuZ2xlIHRoYXQgaG9sZHMgdGhlIHR1cm4sIHNjb3JlLCBhbmQgY2x1ZSBjb3VudFxuICAgIGNvbnN0IHNjb3JlQXJlYVZhbHVlcyA9IHtcbiAgICAgICAgeDogMC42NixcbiAgICAgICAgeTogMC44MSxcbiAgICB9O1xuICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICBzY29yZUFyZWFWYWx1ZXMueCA9IDAuMTY4O1xuICAgICAgICBzY29yZUFyZWFWYWx1ZXMueSA9IDAuODE7XG4gICAgfVxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2NvcmVBcmVhID0gbmV3IEtpbmV0aWMuR3JvdXAoe1xuICAgICAgICB4OiBzY29yZUFyZWFWYWx1ZXMueCAqIHdpblcsXG4gICAgICAgIHk6IHNjb3JlQXJlYVZhbHVlcy55ICogd2luSCxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5zY29yZUFyZWEpO1xuXG4gICAgLy8gVGhlIGZhZGVkIHJlY3RhbmdsZSBhcm91bmQgdGhlIHNjb3JlIGFyZWFcbiAgICByZWN0ID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAsXG4gICAgICAgIHdpZHRoOiAwLjEzICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjE4ICogd2luSCxcbiAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgb3BhY2l0eTogMC4yLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDEgKiB3aW5XLFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMuc2NvcmVBcmVhLmFkZChyZWN0KTtcblxuICAgIGNvbnN0IGJhc2ljVGV4dExhYmVsID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IDAuMDEgKiB3aW5XLFxuICAgICAgICB5OiAwLjAxICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMTEgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDMgKiB3aW5ILFxuICAgICAgICBmb250U2l6ZTogMC4wMjYgKiB3aW5ILFxuICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgIGFsaWduOiAnbGVmdCcsXG4gICAgICAgIHRleHQ6ICdQbGFjZWhvbGRlciB0ZXh0JyxcbiAgICAgICAgZmlsbDogJyNkOGQ1ZWYnLFxuICAgICAgICBzaGFkb3dDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc2hhZG93Qmx1cjogMTAsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAuOSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJhc2ljTnVtYmVyTGFiZWwgPSBiYXNpY1RleHRMYWJlbC5jbG9uZSgpLnNldFRleHQoJzAnKS5zZXRXaWR0aCgwLjAzICogd2luVykuYWxpZ24oJ3JpZ2h0Jyk7XG5cbiAgICBjb25zdCB0dXJuVGV4dExhYmVsID0gYmFzaWNUZXh0TGFiZWwuY2xvbmUoe1xuICAgICAgICB0ZXh0OiAnVHVybicsXG4gICAgICAgIHg6IDAuMDMgKiB3aW5XLFxuICAgICAgICB5OiAwLjAxICogd2luSCxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNjb3JlQXJlYS5hZGQodHVyblRleHRMYWJlbCk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnR1cm5OdW1iZXJMYWJlbCA9IGJhc2ljTnVtYmVyTGFiZWwuY2xvbmUoe1xuICAgICAgICB0ZXh0OiAnMScsXG4gICAgICAgIHg6IDAuMDcgKiB3aW5XLFxuICAgICAgICB5OiAwLjAxICogd2luSCxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNjb3JlQXJlYS5hZGQoZ2xvYmFscy5lbGVtZW50cy50dXJuTnVtYmVyTGFiZWwpO1xuXG4gICAgY29uc3Qgc2NvcmVUZXh0TGFiZWwgPSBiYXNpY1RleHRMYWJlbC5jbG9uZSh7XG4gICAgICAgIHRleHQ6ICdTY29yZScsXG4gICAgICAgIHg6IDAuMDMgKiB3aW5XLFxuICAgICAgICB5OiAwLjA0NSAqIHdpbkgsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5zY29yZUFyZWEuYWRkKHNjb3JlVGV4dExhYmVsKTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2NvcmVOdW1iZXJMYWJlbCA9IGJhc2ljTnVtYmVyTGFiZWwuY2xvbmUoe1xuICAgICAgICB0ZXh0OiAnMCcsXG4gICAgICAgIHg6IDAuMDcgKiB3aW5XLFxuICAgICAgICB5OiAwLjA0NSAqIHdpbkgsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5zY29yZUFyZWEuYWRkKGdsb2JhbHMuZWxlbWVudHMuc2NvcmVOdW1iZXJMYWJlbCk7XG5cbiAgICBjb25zdCBjbHVlc1RleHRMYWJlbCA9IGJhc2ljVGV4dExhYmVsLmNsb25lKHtcbiAgICAgICAgdGV4dDogJ0NsdWVzJyxcbiAgICAgICAgeDogMC4wMyAqIHdpblcsXG4gICAgICAgIHk6IDAuMDggKiB3aW5ILFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMuc2NvcmVBcmVhLmFkZChjbHVlc1RleHRMYWJlbCk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVzTnVtYmVyTGFiZWwgPSBiYXNpY051bWJlckxhYmVsLmNsb25lKHtcbiAgICAgICAgdGV4dDogJzgnLFxuICAgICAgICB4OiAwLjA3ICogd2luVyxcbiAgICAgICAgeTogMC4wOCAqIHdpbkgsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5zY29yZUFyZWEuYWRkKGdsb2JhbHMuZWxlbWVudHMuY2x1ZXNOdW1iZXJMYWJlbCk7XG5cbiAgICAvLyBEcmF3IHRoZSAzIHN0cmlrZSAoYm9tYikgYmxhY2sgc3F1YXJlc1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHNxdWFyZSA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICAgICAgeDogKDAuMDEgKyAwLjA0ICogaSkgKiB3aW5XLFxuICAgICAgICAgICAgeTogMC4xMTUgKiB3aW5ILFxuICAgICAgICAgICAgd2lkdGg6IDAuMDMgKiB3aW5XLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLjA1MyAqIHdpbkgsXG4gICAgICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICAgICAgb3BhY2l0eTogMC42LFxuICAgICAgICAgICAgY29ybmVyUmFkaXVzOiAwLjAwMyAqIHdpblcsXG4gICAgICAgIH0pO1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnNjb3JlQXJlYS5hZGQoc3F1YXJlKTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAgICBUaGUgXCJleWVzXCIgc3ltYm9sIHRvIHNob3cgdGhhdCBvbmUgb3IgbW9yZSBwZW9wbGUgYXJlIHNwZWN0YXRpbmcgdGhlIGdhbWVcbiAgICAqL1xuXG4gICAgY29uc3Qgc3BlY3RhdG9yc0xhYmVsVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjYyMyxcbiAgICAgICAgeTogMC45LFxuICAgIH07XG4gICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0JHQVVJKSB7XG4gICAgICAgIHNwZWN0YXRvcnNMYWJlbFZhbHVlcy54ID0gMC4wMTtcbiAgICAgICAgc3BlY3RhdG9yc0xhYmVsVmFsdWVzLnkgPSAwLjcyO1xuICAgIH1cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNwZWN0YXRvcnNMYWJlbCA9IG5ldyBLaW5ldGljLlRleHQoe1xuICAgICAgICB4OiBzcGVjdGF0b3JzTGFiZWxWYWx1ZXMueCAqIHdpblcsXG4gICAgICAgIHk6IHNwZWN0YXRvcnNMYWJlbFZhbHVlcy55ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDMgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDMgKiB3aW5ILFxuICAgICAgICBmb250U2l6ZTogMC4wMyAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICB0ZXh0OiAn8J+RgCcsXG4gICAgICAgIGZpbGw6ICd5ZWxsb3cnLFxuICAgICAgICBzaGFkb3dDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc2hhZG93Qmx1cjogMTAsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAuOSxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGdsb2JhbHMuZWxlbWVudHMuc3BlY3RhdG9yc0xhYmVsKTtcblxuICAgIC8vIFRvb2x0aXAgZm9yIHRoZSBleWVzXG4gICAgZ2xvYmFscy5lbGVtZW50cy5zcGVjdGF0b3JzTGFiZWwub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uIHNwZWN0YXRvcnNMYWJlbE1vdXNlTW92ZSgpIHtcbiAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IHRoaXM7XG5cbiAgICAgICAgY29uc3QgdG9vbHRpcFggPSB0aGlzLmF0dHJzLnggKyB0aGlzLmdldFdpZHRoKCkgLyAyO1xuICAgICAgICAkKCcjdG9vbHRpcC1zcGVjdGF0b3JzJykuY3NzKCdsZWZ0JywgdG9vbHRpcFgpO1xuICAgICAgICAkKCcjdG9vbHRpcC1zcGVjdGF0b3JzJykuY3NzKCd0b3AnLCB0aGlzLmF0dHJzLnkpO1xuICAgICAgICAkKCcjdG9vbHRpcC1zcGVjdGF0b3JzJykudG9vbHRpcHN0ZXIoJ29wZW4nKTtcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNwZWN0YXRvcnNMYWJlbC5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICQoJyN0b29sdGlwLXNwZWN0YXRvcnMnKS50b29sdGlwc3RlcignY2xvc2UnKTtcbiAgICB9KTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMuc3BlY3RhdG9yc051bUxhYmVsID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IChzcGVjdGF0b3JzTGFiZWxWYWx1ZXMueCAtIDAuMDQpICogd2luVyxcbiAgICAgICAgeTogKHNwZWN0YXRvcnNMYWJlbFZhbHVlcy55ICsgMC4wMzQpICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMTEgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDMgKiB3aW5ILFxuICAgICAgICBmb250U2l6ZTogMC4wMyAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICB0ZXh0OiAnMCcsXG4gICAgICAgIGZpbGw6ICcjZDhkNWVmJyxcbiAgICAgICAgc2hhZG93Q29sb3I6ICdibGFjaycsXG4gICAgICAgIHNoYWRvd0JsdXI6IDEwLFxuICAgICAgICBzaGFkb3dPZmZzZXQ6IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAwLFxuICAgICAgICB9LFxuICAgICAgICBzaGFkb3dPcGFjaXR5OiAwLjksXG4gICAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChnbG9iYWxzLmVsZW1lbnRzLnNwZWN0YXRvcnNOdW1MYWJlbCk7XG5cbiAgICAvLyBTaGFyZWQgcmVwbGF5IGxlYWRlciBpbmRpY2F0b3JcbiAgICBjb25zdCBzaGFyZWRSZXBsYXlMZWFkZXJMYWJlbFZhbHVlcyA9IHtcbiAgICAgICAgeDogMC42MjMsXG4gICAgICAgIHk6IDAuODUsXG4gICAgfTtcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgc2hhcmVkUmVwbGF5TGVhZGVyTGFiZWxWYWx1ZXMueCA9IHNwZWN0YXRvcnNMYWJlbFZhbHVlcy54ICsgMC4wMztcbiAgICAgICAgc2hhcmVkUmVwbGF5TGVhZGVyTGFiZWxWYWx1ZXMueSA9IHNwZWN0YXRvcnNMYWJlbFZhbHVlcy55O1xuICAgIH1cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IHNoYXJlZFJlcGxheUxlYWRlckxhYmVsVmFsdWVzLnggKiB3aW5XLFxuICAgICAgICB5OiBzaGFyZWRSZXBsYXlMZWFkZXJMYWJlbFZhbHVlcy55ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDMgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDMgKiB3aW5ILFxuICAgICAgICBmb250U2l6ZTogMC4wMyAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICB0ZXh0OiAn8J+RkScsXG4gICAgICAgIGZpbGw6ICcjZDhkNWVmJyxcbiAgICAgICAgc2hhZG93Q29sb3I6ICdibGFjaycsXG4gICAgICAgIHNoYWRvd0JsdXI6IDEwLFxuICAgICAgICBzaGFkb3dPZmZzZXQ6IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAwLFxuICAgICAgICB9LFxuICAgICAgICBzaGFkb3dPcGFjaXR5OiAwLjksXG4gICAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsKTtcblxuICAgIC8vIEFkZCBhbiBhbmltYXRpb24gdG8gYWxlcnQgZXZlcnlvbmUgd2hlbiBzaGFyZWQgcmVwbGF5IGxlYWRlcnNoaXAgaGFzIGJlZW4gdHJhbnNmZXJlZFxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2hhcmVkUmVwbGF5TGVhZGVyTGFiZWxQdWxzZSA9IG5ldyBLaW5ldGljLlR3ZWVuKHtcbiAgICAgICAgbm9kZTogZ2xvYmFscy5lbGVtZW50cy5zaGFyZWRSZXBsYXlMZWFkZXJMYWJlbCxcbiAgICAgICAgc2NhbGVYOiAyLFxuICAgICAgICBzY2FsZVk6IDIsXG4gICAgICAgIG9mZnNldFg6IDEyLFxuICAgICAgICBvZmZzZXRZOiAxMCxcbiAgICAgICAgZHVyYXRpb246IDAuNSxcbiAgICAgICAgZWFzaW5nOiBLaW5ldGljLkVhc2luZ3MuRWFzZUluT3V0LFxuICAgICAgICBvbkZpbmlzaDogKCkgPT4ge1xuICAgICAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5zaGFyZWRSZXBsYXlMZWFkZXJMYWJlbFB1bHNlLnJldmVyc2UoKTtcbiAgICAgICAgfSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsUHVsc2UuYW5pbS5hZGRMYXllcihnbG9iYWxzLmxheWVycy5VSSk7XG5cbiAgICAvLyBUb29sdGlwIGZvciB0aGUgY3Jvd25cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbiBzaGFyZWRSZXBsYXlMZWFkZXJMYWJlbE1vdXNlTW92ZSgpIHtcbiAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IHRoaXM7XG5cbiAgICAgICAgY29uc3QgdG9vbHRpcFggPSB0aGlzLmF0dHJzLnggKyB0aGlzLmdldFdpZHRoKCkgLyAyO1xuICAgICAgICAkKCcjdG9vbHRpcC1sZWFkZXInKS5jc3MoJ2xlZnQnLCB0b29sdGlwWCk7XG4gICAgICAgICQoJyN0b29sdGlwLWxlYWRlcicpLmNzcygndG9wJywgdGhpcy5hdHRycy55KTtcbiAgICAgICAgJCgnI3Rvb2x0aXAtbGVhZGVyJykudG9vbHRpcHN0ZXIoJ29wZW4nKTtcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgJCgnI3Rvb2x0aXAtbGVhZGVyJykudG9vbHRpcHN0ZXIoJ2Nsb3NlJyk7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgdXNlciBjYW4gcmlnaHQtY2xpY2sgb24gdGhlIGNyb3duIHRvIHBhc3MgdGhlIHJlcGxheSBsZWFkZXIgdG8gYW4gYXJiaXRyYXJ5IHBlcnNvblxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2hhcmVkUmVwbGF5TGVhZGVyTGFiZWwub24oJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIC8vIERvIG5vdGhpbmcgaWYgdGhpcyBpcyBub3QgYSByaWdodC1jbGlja1xuICAgICAgICBpZiAoZXZlbnQuZXZ0LndoaWNoICE9PSAzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEbyBub3RoaW5nIGlmIHdlIGFyZSBub3QgdGhlIHNoYXJlZCByZXBsYXkgbGVhZGVyXG4gICAgICAgIGlmIChnbG9iYWxzLnNoYXJlZFJlcGxheUxlYWRlciAhPT0gZ2xvYmFscy5sb2JieS51c2VybmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IG1zZyA9ICdXaGF0IGlzIHRoZSBudW1iZXIgb2YgdGhlIHBlcnNvbiB0aGF0IHlvdSB3YW50IHRvIHBhc3MgdGhlIHJlcGxheSBsZWFkZXIgdG8/XFxuXFxuJztcbiAgICAgICAgbXNnICs9IGdsb2JhbHMuc3BlY3RhdG9ycy5tYXAoKG5hbWUsIGkpID0+IGAke2kgKyAxfSAtICR7bmFtZX1cXG5gKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHRhcmdldCA9IHdpbmRvdy5wcm9tcHQobXNnKTtcbiAgICAgICAgaWYgKE51bWJlci5pc05hTih0YXJnZXQpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGFyZ2V0IC09IDE7XG4gICAgICAgIHRhcmdldCA9IGdsb2JhbHMuc3BlY3RhdG9yc1t0YXJnZXRdO1xuXG4gICAgICAgIC8vIE9ubHkgcHJvY2VlZCBpZiB3ZSBjaG9zZSBzb21lb25lIGVsc2VcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gZ2xvYmFscy5sb2JieS51c2VybmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2xvYmFscy5sb2JieS5jb25uLnNlbmQoJ3JlcGxheUFjdGlvbicsIHtcbiAgICAgICAgICAgIHR5cGU6IGNvbnN0YW50cy5SRVBMQVlfQUNUSU9OX1RZUEUuTEVBREVSX1RSQU5TRkVSLFxuICAgICAgICAgICAgbmFtZTogdGFyZ2V0LFxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8qXG4gICAgICAgIEVuZCBvZiBzcGVjdGF0b3IgLyBzaGFyZWQgcmVwbGF5IHN0dWZmXG4gICAgKi9cblxuICAgIC8qXG4gICAgICAgIERyYXcgdGhlIGNsdWUgbG9nXG4gICAgKi9cblxuICAgIGNvbnN0IGNsdWVMb2dWYWx1ZXMgPSB7XG4gICAgICAgIHg6IDAuOCxcbiAgICAgICAgeTogMC4wMSxcbiAgICAgICAgdzogMC4xOSxcbiAgICAgICAgaDogMC41MSxcbiAgICB9O1xuICAgIGNvbnN0IGNsdWVMb2dSZWN0ID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IGNsdWVMb2dWYWx1ZXMueCAqIHdpblcsXG4gICAgICAgIHk6IGNsdWVMb2dWYWx1ZXMueSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiBjbHVlTG9nVmFsdWVzLncgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IGNsdWVMb2dWYWx1ZXMuaCAqIHdpbkgsXG4gICAgICAgIGZpbGw6ICdibGFjaycsXG4gICAgICAgIG9wYWNpdHk6IDAuMixcbiAgICAgICAgY29ybmVyUmFkaXVzOiAwLjAxICogd2luVyxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5iYWNrZ3JvdW5kLmFkZChjbHVlTG9nUmVjdCk7XG5cbiAgICBjb25zdCBzcGFjaW5nID0gMC4wMTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVMb2cgPSBuZXcgSGFuYWJpQ2x1ZUxvZyh7XG4gICAgICAgIHg6IChjbHVlTG9nVmFsdWVzLnggKyBzcGFjaW5nKSAqIHdpblcsXG4gICAgICAgIHk6IChjbHVlTG9nVmFsdWVzLnkgKyBzcGFjaW5nKSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAoY2x1ZUxvZ1ZhbHVlcy53IC0gc3BhY2luZyAqIDIpICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAoY2x1ZUxvZ1ZhbHVlcy5oIC0gc3BhY2luZyAqIDIpICogd2luSCxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nKTtcblxuICAgIC8qXG4gICAgICAgIFN0YXRpc3RpY3Mgc2hvd24gb24gdGhlIHJpZ2h0LWhhbmQgc2lkZSBvZiB0aGUgc2NyZWVuIChhdCB0aGUgYm90dG9tIG9mIHRoZSBjbHVlIGxvZylcbiAgICAqL1xuXG4gICAgcmVjdCA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiBjbHVlTG9nVmFsdWVzLnggKiB3aW5XLFxuICAgICAgICB5OiAwLjUzICogd2luSCxcbiAgICAgICAgd2lkdGg6IGNsdWVMb2dWYWx1ZXMudyAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4wNiAqIHdpbkgsXG4gICAgICAgIGZpbGw6ICdibGFjaycsXG4gICAgICAgIG9wYWNpdHk6IDAuMixcbiAgICAgICAgY29ybmVyUmFkaXVzOiAwLjAxICogd2luVyxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5iYWNrZ3JvdW5kLmFkZChyZWN0KTtcblxuICAgIGNvbnN0IHBhY2VUZXh0TGFiZWwgPSBiYXNpY1RleHRMYWJlbC5jbG9uZSh7XG4gICAgICAgIHRleHQ6ICdQYWNlJyxcbiAgICAgICAgeDogMC44MjUgKiB3aW5XLFxuICAgICAgICB5OiAwLjU0ICogd2luSCxcbiAgICAgICAgZm9udFNpemU6IDAuMDIgKiB3aW5ILFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChwYWNlVGV4dExhYmVsKTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMucGFjZU51bWJlckxhYmVsID0gYmFzaWNOdW1iZXJMYWJlbC5jbG9uZSh7XG4gICAgICAgIHRleHQ6ICctJyxcbiAgICAgICAgeDogMC45ICogd2luVyxcbiAgICAgICAgeTogMC41NCAqIHdpbkgsXG4gICAgICAgIGZvbnRTaXplOiAwLjAyICogd2luSCxcbiAgICAgICAgYWxpZ246ICdsZWZ0JyxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5wYWNlTnVtYmVyTGFiZWwpO1xuXG4gICAgY29uc3QgZWZmaWNpZW5jeVRleHRMYWJlbCA9IGJhc2ljVGV4dExhYmVsLmNsb25lKHtcbiAgICAgICAgdGV4dDogJ0VmZmljaWVuY3knLFxuICAgICAgICB4OiAwLjgyNSAqIHdpblcsXG4gICAgICAgIHk6IDAuNTYgKiB3aW5ILFxuICAgICAgICBmb250U2l6ZTogMC4wMiAqIHdpbkgsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGVmZmljaWVuY3lUZXh0TGFiZWwpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5lZmZpY2llbmN5TnVtYmVyTGFiZWwgPSBiYXNpY051bWJlckxhYmVsLmNsb25lKHtcbiAgICAgICAgdGV4dDogJy0nLFxuICAgICAgICB4OiAwLjkgKiB3aW5XLFxuICAgICAgICB5OiAwLjU2ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDggKiB3aW5XLFxuICAgICAgICBmb250U2l6ZTogMC4wMiAqIHdpbkgsXG4gICAgICAgIGFsaWduOiAnbGVmdCcsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGdsb2JhbHMuZWxlbWVudHMuZWZmaWNpZW5jeU51bWJlckxhYmVsKTtcblxuICAgIC8qXG4gICAgICAgIERyYXcgdGhlIHN0YWNrcyBhbmQgdGhlIGRpc2NhcmQgcGlsZVxuICAgICovXG5cbiAgICBsZXQgcGlsZWJhY2s7XG4gICAgaWYgKGdsb2JhbHMudmFyaWFudC5zdWl0cy5sZW5ndGggPT09IDYgfHwgZ2xvYmFscy52YXJpYW50LnNob3dTdWl0TmFtZXMpIHtcbiAgICAgICAgeSA9IDAuMDQ7XG4gICAgICAgIHdpZHRoID0gMC4wNjtcbiAgICAgICAgaGVpZ2h0ID0gMC4xNTE7XG4gICAgICAgIHlPZmZzZXQgPSAwLjAxOTtcbiAgICB9IGVsc2UgeyAvLyA0IG9yIDUgc3RhY2tzXG4gICAgICAgIHkgPSAwLjA1O1xuICAgICAgICB3aWR0aCA9IDAuMDc1O1xuICAgICAgICBoZWlnaHQgPSAwLjE4OTtcbiAgICAgICAgeU9mZnNldCA9IDA7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogbW92ZSBibG9ja3MgbGlrZSB0aGlzIGludG8gdGhlaXIgb3duIGZ1bmN0aW9uc1xuICAgIGNvbnN0IHBsYXlTdGFja1ZhbHVlcyA9IHtcbiAgICAgICAgeDogMC4xODMsXG4gICAgICAgIHk6IDAuMzQ1ICsgeU9mZnNldCxcbiAgICAgICAgc3BhY2luZzogMC4wMTUsXG4gICAgfTtcbiAgICBpZiAoZ2xvYmFscy52YXJpYW50LnNob3dTdWl0TmFtZXMpIHtcbiAgICAgICAgcGxheVN0YWNrVmFsdWVzLnkgLT0gMC4wMTg7XG4gICAgfVxuICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICBwbGF5U3RhY2tWYWx1ZXMueCA9IGFjdGlvbkxvZ1ZhbHVlcy54O1xuICAgICAgICBwbGF5U3RhY2tWYWx1ZXMueSA9IGFjdGlvbkxvZ1ZhbHVlcy55ICsgYWN0aW9uTG9nVmFsdWVzLmggKyAwLjAyO1xuICAgICAgICBwbGF5U3RhY2tWYWx1ZXMuc3BhY2luZyA9IDAuMDA2O1xuICAgIH1cbiAgICBpZiAoXG4gICAgICAgIGdsb2JhbHMudmFyaWFudC5zdWl0cy5sZW5ndGggPT09IDRcbiAgICAgICAgfHwgKGdsb2JhbHMudmFyaWFudC5zdWl0cy5sZW5ndGggPT09IDUgJiYgZ2xvYmFscy52YXJpYW50LnNob3dTdWl0TmFtZXMpXG4gICAgKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGFyZSBvbmx5IDQgc3RhY2tzLCB0aGV5IHdpbGwgYmUgbGVmdC1hbGlnbmVkIGluc3RlYWQgb2YgY2VudGVyZWRcbiAgICAgICAgLy8gU28sIGNlbnRlciB0aGVtIGJ5IG1vdmluZyB0aGVtIHRvIHRoZSByaWdodCBhIGxpdHRsZSBiaXRcbiAgICAgICAgcGxheVN0YWNrVmFsdWVzLnggKz0gKCh3aWR0aCArIHBsYXlTdGFja1ZhbHVlcy5zcGFjaW5nKSAvIDIpO1xuICAgIH0gZWxzZSBpZiAoZ2xvYmFscy52YXJpYW50LnN1aXRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgb25seSAzIHN0YWNrcywgdGhleSB3aWxsIGJlIGxlZnQtYWxpZ25lZCBpbnN0ZWFkIG9mIGNlbnRlcmVkXG4gICAgICAgIC8vIFNvLCBjZW50ZXIgdGhlbSBieSBtb3ZpbmcgdGhlbSB0byB0aGUgcmlnaHQgYSBsaXR0bGUgYml0XG4gICAgICAgIHBsYXlTdGFja1ZhbHVlcy54ICs9ICgod2lkdGggKyBwbGF5U3RhY2tWYWx1ZXMuc3BhY2luZykgLyAyKSAqIDI7XG4gICAgfVxuICAgIHtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHN1aXQgb2YgZ2xvYmFscy52YXJpYW50LnN1aXRzKSB7XG4gICAgICAgICAgICBjb25zdCBwbGF5U3RhY2tYID0gcGxheVN0YWNrVmFsdWVzLnggKyAod2lkdGggKyBwbGF5U3RhY2tWYWx1ZXMuc3BhY2luZykgKiBpO1xuXG4gICAgICAgICAgICBwaWxlYmFjayA9IG5ldyBLaW5ldGljLkltYWdlKHtcbiAgICAgICAgICAgICAgICB4OiBwbGF5U3RhY2tYICogd2luVyxcbiAgICAgICAgICAgICAgICB5OiBwbGF5U3RhY2tWYWx1ZXMueSAqIHdpbkgsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoICogd2luVyxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodCAqIHdpbkgsXG4gICAgICAgICAgICAgICAgaW1hZ2U6IGdsb2JhbHMuY2FyZEltYWdlc1tgQ2FyZC0ke3N1aXQubmFtZX0tMGBdLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGdsb2JhbHMubGF5ZXJzLmJhY2tncm91bmQuYWRkKHBpbGViYWNrKTtcblxuICAgICAgICAgICAgY29uc3QgdGhpc1N1aXRQbGF5U3RhY2sgPSBuZXcgQ2FyZFN0YWNrKHtcbiAgICAgICAgICAgICAgICB4OiBwbGF5U3RhY2tYICogd2luVyxcbiAgICAgICAgICAgICAgICB5OiBwbGF5U3RhY2tWYWx1ZXMueSAqIHdpbkgsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoICogd2luVyxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodCAqIHdpbkgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMucGxheVN0YWNrcy5zZXQoc3VpdCwgdGhpc1N1aXRQbGF5U3RhY2spO1xuICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMuY2FyZC5hZGQodGhpc1N1aXRQbGF5U3RhY2spO1xuXG4gICAgICAgICAgICBjb25zdCB0aGlzU3VpdERpc2NhcmRTdGFjayA9IG5ldyBDYXJkTGF5b3V0KHtcbiAgICAgICAgICAgICAgICB4OiAwLjgxICogd2luVyxcbiAgICAgICAgICAgICAgICB5OiAoMC42MSArIHkgKiBpKSAqIHdpbkgsXG4gICAgICAgICAgICAgICAgd2lkdGg6IDAuMTcgKiB3aW5XLFxuICAgICAgICAgICAgICAgIGhlaWdodDogMC4xNyAqIHdpbkgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuZGlzY2FyZFN0YWNrcy5zZXQoc3VpdCwgdGhpc1N1aXREaXNjYXJkU3RhY2spO1xuICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMuY2FyZC5hZGQodGhpc1N1aXREaXNjYXJkU3RhY2spO1xuXG4gICAgICAgICAgICAvLyBEcmF3IHRoZSBzdWl0IG5hbWUgbmV4dCB0byBlYWNoIHN1aXRcbiAgICAgICAgICAgIC8vIChhIHRleHQgZGVzY3JpcHRpb24gb2YgdGhlIHN1aXQpXG4gICAgICAgICAgICBpZiAoZ2xvYmFscy52YXJpYW50LnNob3dTdWl0TmFtZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGV4dCA9IHN1aXQubmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0NvbG9yYmxpbmRVSVxuICAgICAgICAgICAgICAgICAgICAmJiBzdWl0LmNsdWVDb2xvcnMubGVuZ3RoID4gMVxuICAgICAgICAgICAgICAgICAgICAmJiBzdWl0ICE9PSBjb25zdGFudHMuU1VJVC5SQUlOQk9XXG4gICAgICAgICAgICAgICAgICAgICYmIHN1aXQgIT09IGNvbnN0YW50cy5TVUlULlJBSU5CT1cxT0VcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29sb3JMaXN0ID0gc3VpdC5jbHVlQ29sb3JzLm1hcChjID0+IGMuYWJicmV2aWF0aW9uKS5qb2luKCcvJyk7XG4gICAgICAgICAgICAgICAgICAgIHRleHQgKz0gYCBbJHtjb2xvckxpc3R9XWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdVcCBvciBEb3duJykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dCA9ICcnO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHN1aXRMYWJlbFRleHQgPSBuZXcgRml0VGV4dCh7XG4gICAgICAgICAgICAgICAgICAgIHg6IChwbGF5U3RhY2tWYWx1ZXMueCAtIDAuMDEgKyAod2lkdGggKyBwbGF5U3RhY2tWYWx1ZXMuc3BhY2luZykgKiBpKSAqIHdpblcsIC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgICAgICAgICAgICAgeTogKHBsYXlTdGFja1ZhbHVlcy55ICsgMC4xNTUpICogd2luSCxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IDAuMDggKiB3aW5XLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IDAuMDUxICogd2luSCxcbiAgICAgICAgICAgICAgICAgICAgZm9udFNpemU6IDAuMDIgKiB3aW5ILFxuICAgICAgICAgICAgICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgICAgICAgICAgICAgIGFsaWduOiAnY2VudGVyJyxcbiAgICAgICAgICAgICAgICAgICAgdGV4dCxcbiAgICAgICAgICAgICAgICAgICAgZmlsbDogJyNkOGQ1ZWYnLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRleHQuYWRkKHN1aXRMYWJlbFRleHQpO1xuICAgICAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuc3VpdExhYmVsVGV4dHMucHVzaChzdWl0TGFiZWxUZXh0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaSArPSAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyB0aGUgaW52aXNpYmxlIHJlY3RhbmdsZSB0aGF0IHBsYXllcnMgZHJhZyBjYXJkcyB0byBpbiBvcmRlciB0byBwbGF5IHRoZW1cbiAgICAvLyBNYWtlIGl0IGEgbGl0dGxlIGJpZyBiaWdnZXIgdGhhbiB0aGUgc3RhY2tzXG4gICAgY29uc3Qgb3ZlcmxhcCA9IDAuMDM7XG4gICAgY29uc3QgcGxheUFyZWFWYWx1ZXMgPSB7XG4gICAgICAgIHg6IDAuMTgzLFxuICAgICAgICB5OiAwLjM0NSxcbiAgICAgICAgdzogMC40MzUsXG4gICAgICAgIGg6IDAuMTg5LFxuICAgIH07XG4gICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0JHQVVJKSB7XG4gICAgICAgIHBsYXlBcmVhVmFsdWVzLnggPSAwLjAxO1xuICAgICAgICBwbGF5QXJlYVZhbHVlcy55ID0gMC4yNzk7XG4gICAgICAgIHBsYXlBcmVhVmFsdWVzLncgPSAwLjQ7XG4gICAgfVxuICAgIGdsb2JhbHMuZWxlbWVudHMucGxheUFyZWEgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogKHBsYXlBcmVhVmFsdWVzLnggLSBvdmVybGFwKSAqIHdpblcsXG4gICAgICAgIHk6IChwbGF5QXJlYVZhbHVlcy55IC0gb3ZlcmxhcCkgKiB3aW5ILFxuICAgICAgICB3aWR0aDogKHBsYXlBcmVhVmFsdWVzLncgKyBvdmVybGFwICogMikgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IChwbGF5QXJlYVZhbHVlcy5oICsgb3ZlcmxhcCAqIDIpICogd2luSCxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnBsYXlBcmVhLmlzT3ZlciA9IHBvcyA9PiAoXG4gICAgICAgIHBvcy54ID49IGdsb2JhbHMuZWxlbWVudHMucGxheUFyZWEuZ2V0WCgpXG4gICAgICAgICYmIHBvcy55ID49IGdsb2JhbHMuZWxlbWVudHMucGxheUFyZWEuZ2V0WSgpXG4gICAgICAgICYmIHBvcy54IDw9IGdsb2JhbHMuZWxlbWVudHMucGxheUFyZWEuZ2V0WCgpICsgZ2xvYmFscy5lbGVtZW50cy5wbGF5QXJlYS5nZXRXaWR0aCgpXG4gICAgICAgICYmIHBvcy55IDw9IGdsb2JhbHMuZWxlbWVudHMucGxheUFyZWEuZ2V0WSgpICsgZ2xvYmFscy5lbGVtZW50cy5wbGF5QXJlYS5nZXRIZWlnaHQoKVxuICAgICk7XG5cbiAgICAvKlxuICAgICAgICBEcmF3IHRoZSBkZWNrXG4gICAgKi9cblxuICAgIC8vIFRoaXMgaXMgdGhlIGZhZGVkIHJlY3RhbmdsZSB0aGF0IGlzIGhpZGRlbiB1bnRpbCBhbGwgb2YgdGhlIGRlY2sgaGFzIGJlZW4gZGVwbGV0ZWRcbiAgICBjb25zdCBkcmF3RGVja1JlY3QgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMC4wOCAqIHdpblcsXG4gICAgICAgIHk6IDAuOCAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA3NSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4xODkgKiB3aW5ILFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBvcGFjaXR5OiAwLjIsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4wMDYgKiB3aW5XLFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLmJhY2tncm91bmQuYWRkKGRyYXdEZWNrUmVjdCk7XG5cbiAgICAvLyBXZSBhbHNvIHdhbnQgdG8gYmUgYWJsZSB0byByaWdodC1jbGljayB0aGUgZGVjayBpZiBhbGwgdGhlIGNhcmRzIGFyZSBkcmF3blxuICAgIGRyYXdEZWNrUmVjdC5vbignY2xpY2snLCByZXBsYXkucHJvbXB0VHVybik7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmRyYXdEZWNrID0gbmV3IENhcmREZWNrKHtcbiAgICAgICAgeDogMC4wOCAqIHdpblcsXG4gICAgICAgIHk6IDAuOCAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA3NSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4xODkgKiB3aW5ILFxuICAgICAgICBjYXJkYmFjazogJ2RlY2stYmFjaycsXG4gICAgICAgIHN1aXRzOiBnbG9iYWxzLnZhcmlhbnQuc3VpdHMsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5hZGQoZ2xvYmFscy5lbGVtZW50cy5kcmF3RGVjayk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmRlY2tQbGF5QXZhaWxhYmxlTGFiZWwgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMC4wOCAqIHdpblcsXG4gICAgICAgIHk6IDAuOCAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA3NSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4xODkgKiB3aW5ILFxuICAgICAgICBzdHJva2U6ICd5ZWxsb3cnLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDYsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAxMCxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGdsb2JhbHMuZWxlbWVudHMuZGVja1BsYXlBdmFpbGFibGVMYWJlbCk7XG5cbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBvYmplY3QtY3VybHktbmV3bGluZSAqL1xuXG4gICAgY29uc3QgaGFuZFBvcyA9IHtcbiAgICAgICAgMjogW1xuICAgICAgICAgICAgeyB4OiAwLjE5LCB5OiAwLjc3LCB3OiAwLjQyLCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMTksIHk6IDAuMDEsIHc6IDAuNDIsIGg6IDAuMTg5LCByb3Q6IDAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgMzogW1xuICAgICAgICAgICAgeyB4OiAwLjE5LCB5OiAwLjc3LCB3OiAwLjQyLCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDEsIHk6IDAuNzEsIHc6IDAuNDEsIGg6IDAuMTg5LCByb3Q6IC03OCB9LFxuICAgICAgICAgICAgeyB4OiAwLjcwNSwgeTogMCwgdzogMC40MSwgaDogMC4xODksIHJvdDogNzggfSxcbiAgICAgICAgXSxcbiAgICAgICAgNDogW1xuICAgICAgICAgICAgeyB4OiAwLjIzLCB5OiAwLjc3LCB3OiAwLjM0LCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDE1LCB5OiAwLjcsIHc6IDAuMzQsIGg6IDAuMTg5LCByb3Q6IC03OCB9LFxuICAgICAgICAgICAgeyB4OiAwLjIzLCB5OiAwLjAxLCB3OiAwLjM0LCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuNzE1LCB5OiAwLjA5NSwgdzogMC4zNCwgaDogMC4xODksIHJvdDogNzggfSxcbiAgICAgICAgXSxcbiAgICAgICAgNTogW1xuICAgICAgICAgICAgeyB4OiAwLjIzLCB5OiAwLjc3LCB3OiAwLjM0LCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDMsIHk6IDAuNzcsIHc6IDAuMzAxLCBoOiAwLjE4LCByb3Q6IC05MCB9LFxuICAgICAgICAgICAgeyB4OiAwLjAyNSwgeTogMC4wMDksIHc6IDAuMzQsIGg6IDAuMTg5LCByb3Q6IDAgfSxcbiAgICAgICAgICAgIHsgeDogMC40NDUsIHk6IDAuMDA5LCB3OiAwLjM0LCBoOiAwLjE4OSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuNzcsIHk6IDAuMjIsIHc6IDAuMzAxLCBoOiAwLjE4LCByb3Q6IDkwIH0sXG4gICAgICAgIF0sXG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRQb3NCR0EgPSB7XG4gICAgICAgIDI6IFtdLFxuICAgICAgICAzOiBbXSxcbiAgICAgICAgNDogW10sXG4gICAgICAgIDU6IFtdLFxuICAgIH07XG5cbiAgICBjb25zdCBoYW5kUG9zQkdBVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjQ0LFxuICAgICAgICB5OiAwLjA0LFxuICAgICAgICB3OiAwLjM0LFxuICAgICAgICBoOiAwLjE2LFxuICAgICAgICBzcGFjaW5nOiAwLjI0LFxuICAgIH07XG4gICAgZm9yIChsZXQgaSA9IDI7IGkgPD0gNTsgaSsrKSB7XG4gICAgICAgIGxldCBoYW5kWCA9IGhhbmRQb3NCR0FWYWx1ZXMueDtcbiAgICAgICAgbGV0IGhhbmRZID0gaGFuZFBvc0JHQVZhbHVlcy55O1xuICAgICAgICBsZXQgaGFuZFcgPSBoYW5kUG9zQkdBVmFsdWVzLnc7XG4gICAgICAgIGxldCBoYW5kU3BhY2luZyA9IGhhbmRQb3NCR0FWYWx1ZXMuc3BhY2luZztcbiAgICAgICAgaWYgKGkgPj0gNCkge1xuICAgICAgICAgICAgLy8gVGhlIGhhbmRzIG9ubHkgaGF2ZSA0IGNhcmRzIGluc3RlYWQgb2YgNSxcbiAgICAgICAgICAgIC8vIHNvIHdlIG5lZWQgdG8gc2xpZ2h0bHkgcmVwb3NpdGlvbiB0aGUgaGFuZHMgaG9yaXpvbnRhbGx5XG4gICAgICAgICAgICBoYW5kWCArPSAwLjAzO1xuICAgICAgICAgICAgaGFuZFcgLT0gMC4wNztcbiAgICAgICAgfVxuICAgICAgICBpZiAoaSA9PT0gNSkge1xuICAgICAgICAgICAgaGFuZFkgLT0gMC4wMztcbiAgICAgICAgICAgIGhhbmRTcGFjaW5nIC09IDAuMDQyO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBpOyBqKyspIHtcbiAgICAgICAgICAgIGhhbmRQb3NCR0FbaV0ucHVzaCh7XG4gICAgICAgICAgICAgICAgeDogaGFuZFgsXG4gICAgICAgICAgICAgICAgeTogaGFuZFkgKyAoaGFuZFNwYWNpbmcgKiBqKSxcbiAgICAgICAgICAgICAgICB3OiBoYW5kVyxcbiAgICAgICAgICAgICAgICBoOiBoYW5kUG9zQkdBVmFsdWVzLmgsXG4gICAgICAgICAgICAgICAgcm90OiAwLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIGhhbmQgcG9zaXRpb25zIGZvciA0LXBsYXllciBhbmQgNS1wbGF5ZXJcbiAgICAvLyAod2l0aCA0IGNhcmRzIGluIHRoZSBoYW5kKVxuICAgIGNvbnN0IGhhbmRQb3NCR0FWYWx1ZXM0ID0ge1xuICAgICAgICB4OiAwLjQ3LFxuICAgICAgICB5OiBoYW5kUG9zQkdBVmFsdWVzLnksXG4gICAgICAgIHc6IDAuMjcsXG4gICAgICAgIGg6IGhhbmRQb3NCR0FWYWx1ZXMuaCxcbiAgICAgICAgcm90OiBoYW5kUG9zQkdBVmFsdWVzLnJvdCxcbiAgICAgICAgc3BhY2luZzogaGFuZFBvc0JHQVZhbHVlcy5zcGFjaW5nLFxuICAgIH07XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCA0OyBqKyspIHtcbiAgICAgICAgaGFuZFBvc0JHQVs0XS5wdXNoKHtcbiAgICAgICAgICAgIHg6IGhhbmRQb3NCR0FWYWx1ZXM0LngsXG4gICAgICAgICAgICB5OiBoYW5kUG9zQkdBVmFsdWVzNC55ICsgKGhhbmRQb3NCR0FWYWx1ZXM0LnNwYWNpbmcgKiBqKSxcbiAgICAgICAgICAgIHc6IGhhbmRQb3NCR0FWYWx1ZXM0LncsXG4gICAgICAgICAgICBoOiBoYW5kUG9zQkdBVmFsdWVzNC5oLFxuICAgICAgICAgICAgcm90OiBoYW5kUG9zQkdBVmFsdWVzNC5yb3QsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgdGhlIHBvc2l0aW9uIGZvciB0aGUgd2hpdGUgc2hhZGUgdGhhdCBzaG93cyB3aGVyZSB0aGUgbmV3IHNpZGUgb2YgdGhlIGhhbmQgaXNcbiAgICAvLyAodGhlcmUgaXMgbm8gc2hhZGUgb24gdGhlIEJvYXJkIEdhbWUgQXJlbmEgbW9kZSlcbiAgICBjb25zdCBzaGFkZVBvcyA9IHtcbiAgICAgICAgMjogW1xuICAgICAgICAgICAgeyB4OiAwLjE4NSwgeTogMC43NjIsIHc6IDAuNDMsIGg6IDAuMjA1LCByb3Q6IDAgfSxcbiAgICAgICAgICAgIHsgeDogMC4xODUsIHk6IDAuMDAyLCB3OiAwLjQzLCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgIF0sXG4gICAgICAgIDM6IFtcbiAgICAgICAgICAgIHsgeDogMC4xODUsIHk6IDAuNzYyLCB3OiAwLjQzLCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDA1LCB5OiAwLjcxOCwgdzogMC40MiwgaDogMC4yMDUsIHJvdDogLTc4IH0sXG4gICAgICAgICAgICB7IHg6IDAuNzA4LCB5OiAtMC4wMDgsIHc6IDAuNDIsIGg6IDAuMjA1LCByb3Q6IDc4IH0sXG4gICAgICAgIF0sXG4gICAgICAgIDQ6IFtcbiAgICAgICAgICAgIHsgeDogMC4yMjUsIHk6IDAuNzYyLCB3OiAwLjM1LCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDEsIHk6IDAuNzA4LCB3OiAwLjM1LCBoOiAwLjIwNSwgcm90OiAtNzggfSxcbiAgICAgICAgICAgIHsgeDogMC4yMjUsIHk6IDAuMDAyLCB3OiAwLjM1LCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuNzE4LCB5OiAwLjA4NywgdzogMC4zNSwgaDogMC4yMDUsIHJvdDogNzggfSxcbiAgICAgICAgXSxcbiAgICAgICAgNTogW1xuICAgICAgICAgICAgeyB4OiAwLjIyNSwgeTogMC43NjIsIHc6IDAuMzUsIGg6IDAuMjA1LCByb3Q6IDAgfSxcbiAgICAgICAgICAgIHsgeDogMC4wMjYsIHk6IDAuNzc1LCB3OiAwLjMxMSwgaDogMC4xOTYsIHJvdDogLTkwIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDIsIHk6IDAuMDAxLCB3OiAwLjM1LCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuNDQsIHk6IDAuMDAxLCB3OiAwLjM1LCBoOiAwLjIwNSwgcm90OiAwIH0sXG4gICAgICAgICAgICB7IHg6IDAuNzc0LCB5OiAwLjIxNSwgdzogMC4zMTEsIGg6IDAuMTk2LCByb3Q6IDkwIH0sXG4gICAgICAgIF0sXG4gICAgfTtcblxuICAgIGNvbnN0IG5hbWVQb3NWYWx1ZXMgPSB7XG4gICAgICAgIGg6IDAuMDIsXG4gICAgfTtcbiAgICBjb25zdCBuYW1lUG9zID0ge1xuICAgICAgICAyOiBbXG4gICAgICAgICAgICB7IHg6IDAuMTgsIHk6IDAuOTcsIHc6IDAuNDQsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjE4LCB5OiAwLjIxLCB3OiAwLjQ0LCBoOiBuYW1lUG9zVmFsdWVzLmggfSxcbiAgICAgICAgXSxcbiAgICAgICAgMzogW1xuICAgICAgICAgICAgeyB4OiAwLjE4LCB5OiAwLjk3LCB3OiAwLjQ0LCBoOiBuYW1lUG9zVmFsdWVzLmggfSxcbiAgICAgICAgICAgIHsgeDogMC4wMSwgeTogMC43NjUsIHc6IDAuMTIsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjY3LCB5OiAwLjc2NSwgdzogMC4xMiwgaDogbmFtZVBvc1ZhbHVlcy5oIH0sXG4gICAgICAgIF0sXG4gICAgICAgIDQ6IFtcbiAgICAgICAgICAgIHsgeDogMC4yMiwgeTogMC45NywgdzogMC4zNiwgaDogbmFtZVBvc1ZhbHVlcy5oIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDEsIHk6IDAuNzQsIHc6IDAuMTMsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjIyLCB5OiAwLjIxLCB3OiAwLjM2LCBoOiBuYW1lUG9zVmFsdWVzLmggfSxcbiAgICAgICAgICAgIHsgeDogMC42NiwgeTogMC43NCwgdzogMC4xMywgaDogbmFtZVBvc1ZhbHVlcy5oIH0sXG4gICAgICAgIF0sXG4gICAgICAgIDU6IFtcbiAgICAgICAgICAgIHsgeDogMC4yMiwgeTogMC45NywgdzogMC4zNiwgaDogbmFtZVBvc1ZhbHVlcy5oIH0sXG4gICAgICAgICAgICB7IHg6IDAuMDI1LCB5OiAwLjc3NSwgdzogMC4xMTYsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjAxNSwgeTogMC4xOTksIHc6IDAuMzYsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjQzNSwgeTogMC4xOTksIHc6IDAuMzYsIGg6IG5hbWVQb3NWYWx1ZXMuaCB9LFxuICAgICAgICAgICAgeyB4OiAwLjY1OSwgeTogMC43NzUsIHc6IDAuMTE2LCBoOiBuYW1lUG9zVmFsdWVzLmggfSxcbiAgICAgICAgXSxcbiAgICB9O1xuXG4gICAgY29uc3QgbmFtZVBvc0JHQU1vZCA9IHtcbiAgICAgICAgeDogLTAuMDEsXG4gICAgICAgIHk6IDAuMTcsXG4gICAgICAgIHc6IDAuMDIsXG4gICAgfTtcbiAgICBjb25zdCBuYW1lUG9zQkdBID0ge1xuICAgICAgICAyOiBbXSxcbiAgICAgICAgMzogW10sXG4gICAgICAgIDQ6IFtdLFxuICAgICAgICA1OiBbXSxcbiAgICB9O1xuICAgIGZvciAobGV0IGkgPSAyOyBpIDw9IDU7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGk7IGorKykge1xuICAgICAgICAgICAgbmFtZVBvc0JHQVtpXS5wdXNoKHtcbiAgICAgICAgICAgICAgICB4OiBoYW5kUG9zQkdBW2ldW2pdLnggKyBuYW1lUG9zQkdBTW9kLngsXG4gICAgICAgICAgICAgICAgeTogaGFuZFBvc0JHQVtpXVtqXS55ICsgbmFtZVBvc0JHQU1vZC55LFxuICAgICAgICAgICAgICAgIHc6IGhhbmRQb3NCR0FbaV1bal0udyArIG5hbWVQb3NCR0FNb2QudyxcbiAgICAgICAgICAgICAgICBoOiBuYW1lUG9zVmFsdWVzLmgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qIGVzbGludC1lbmFibGUgb2JqZWN0LWN1cmx5LW5ld2xpbmUgKi9cblxuICAgIGNvbnN0IG51bXAgPSBnbG9iYWxzLnBsYXllck5hbWVzLmxlbmd0aDtcblxuICAgIGNvbnN0IGlzSGFuZFJldmVyc2VkID0gKGopID0+IHtcbiAgICAgICAgLy8gQnkgZGVmYXVsdCwgdGhlIGhhbmQgaXMgbm90IHJldmVyc2VkXG4gICAgICAgIGxldCByZXZlcnNlID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKGogPT09IDApIHtcbiAgICAgICAgICAgIC8vIFJldmVyc2UgdGhlIG9yZGVyaW5nIG9mIHRoZSBjYXJkcyBmb3Igb3VyIG93biBoYW5kXG4gICAgICAgICAgICAvLyAoZm9yIG91ciBoYW5kLCB0aGUgb2xkZXN0IGNhcmQgaXMgdGhlIGZpcnN0IGNhcmQsIHdoaWNoIHNob3VsZCBiZSBvbiB0aGUgcmlnaHQpXG4gICAgICAgICAgICByZXZlcnNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgICAgIC8vIElmIEJvYXJkIEdhbWUgQXJlbmEgbW9kZSBpcyBvbiwgdGhlbiB3ZSBuZWVkIHRvIHJldmVyc2UgZXZlcnkgaGFuZFxuICAgICAgICAgICAgcmV2ZXJzZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3MucmV2ZXJzZUhhbmRzKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgXCJSZXZlcnNlIGhhbmQgZGlyZWN0aW9uXCIgb3B0aW9uIGlzIHR1cm5lZCBvbixcbiAgICAgICAgICAgIC8vIHRoZW4gd2UgbmVlZCB0byBmbGlwIHRoZSBkaXJlY3Rpb24gb2YgZXZlcnkgaGFuZFxuICAgICAgICAgICAgcmV2ZXJzZSA9ICFyZXZlcnNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJldmVyc2U7XG4gICAgfTtcblxuICAgIC8vIERyYXcgdGhlIGhhbmRzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1wOyBpKyspIHtcbiAgICAgICAgbGV0IGogPSBpIC0gZ2xvYmFscy5wbGF5ZXJVcztcblxuICAgICAgICBpZiAoaiA8IDApIHtcbiAgICAgICAgICAgIGogKz0gbnVtcDtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBwbGF5ZXJIYW5kUG9zID0gaGFuZFBvcztcbiAgICAgICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0JHQVVJKSB7XG4gICAgICAgICAgICBwbGF5ZXJIYW5kUG9zID0gaGFuZFBvc0JHQTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbnZlcnRDYXJkcyA9IGZhbHNlO1xuICAgICAgICBpZiAoaSAhPT0gZ2xvYmFscy5wbGF5ZXJVcykge1xuICAgICAgICAgICAgLy8gV2Ugd2FudCB0byBmbGlwIHRoZSBjYXJkcyBmb3Igb3RoZXIgcGxheWVyc1xuICAgICAgICAgICAgaW52ZXJ0Q2FyZHMgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICAgICAgLy8gT24gdGhlIEJHQSBsYXlvdXQsIGFsbCB0aGUgaGFuZHMgc2hvdWxkIG5vdCBiZSBmbGlwcGVkXG4gICAgICAgICAgICBpbnZlcnRDYXJkcyA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tpXSA9IG5ldyBDYXJkTGF5b3V0KHtcbiAgICAgICAgICAgIHg6IHBsYXllckhhbmRQb3NbbnVtcF1bal0ueCAqIHdpblcsXG4gICAgICAgICAgICB5OiBwbGF5ZXJIYW5kUG9zW251bXBdW2pdLnkgKiB3aW5ILFxuICAgICAgICAgICAgd2lkdGg6IHBsYXllckhhbmRQb3NbbnVtcF1bal0udyAqIHdpblcsXG4gICAgICAgICAgICBoZWlnaHQ6IHBsYXllckhhbmRQb3NbbnVtcF1bal0uaCAqIHdpbkgsXG4gICAgICAgICAgICByb3RhdGlvbkRlZzogcGxheWVySGFuZFBvc1tudW1wXVtqXS5yb3QsXG4gICAgICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgICAgICByZXZlcnNlOiBpc0hhbmRSZXZlcnNlZChqKSxcbiAgICAgICAgICAgIGludmVydENhcmRzLFxuICAgICAgICB9KTtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuY2FyZC5hZGQoZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tpXSk7XG5cbiAgICAgICAgLy8gRHJhdyB0aGUgZmFkZWQgc2hhZGUgdGhhdCBzaG93cyB3aGVyZSB0aGUgXCJuZXdcIiBzaWRlIG9mIHRoZSBoYW5kIGlzXG4gICAgICAgIC8vIChidXQgZG9uJ3QgYm90aGVyIGRyYXdpbmcgaXQgaW4gQm9hcmQgR2FtZSBBcmVuYSBtb2RlIHNpbmNlXG4gICAgICAgIC8vIGFsbCB0aGUgaGFuZHMgZmFjZSB0aGUgc2FtZSB3YXkpXG4gICAgICAgIGlmICghZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgICAgIHJlY3QgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgICAgICAgICB4OiBzaGFkZVBvc1tudW1wXVtqXS54ICogd2luVyxcbiAgICAgICAgICAgICAgICB5OiBzaGFkZVBvc1tudW1wXVtqXS55ICogd2luSCxcbiAgICAgICAgICAgICAgICB3aWR0aDogc2hhZGVQb3NbbnVtcF1bal0udyAqIHdpblcsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBzaGFkZVBvc1tudW1wXVtqXS5oICogd2luSCxcbiAgICAgICAgICAgICAgICByb3RhdGlvbkRlZzogc2hhZGVQb3NbbnVtcF1bal0ucm90LFxuICAgICAgICAgICAgICAgIGNvcm5lclJhZGl1czogMC4wMSAqIHNoYWRlUG9zW251bXBdW2pdLncgKiB3aW5XLFxuICAgICAgICAgICAgICAgIG9wYWNpdHk6IDAuNCxcbiAgICAgICAgICAgICAgICBmaWxsTGluZWFyR3JhZGllbnRTdGFydFBvaW50OiB7XG4gICAgICAgICAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICAgICAgICAgIHk6IDAsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBmaWxsTGluZWFyR3JhZGllbnRFbmRQb2ludDoge1xuICAgICAgICAgICAgICAgICAgICB4OiBzaGFkZVBvc1tudW1wXVtqXS53ICogd2luVyxcbiAgICAgICAgICAgICAgICAgICAgeTogMCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZpbGxMaW5lYXJHcmFkaWVudENvbG9yU3RvcHM6IFtcbiAgICAgICAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgICAgICAgJ3JnYmEoMCwwLDAsMCknLFxuICAgICAgICAgICAgICAgICAgICAwLjksXG4gICAgICAgICAgICAgICAgICAgICd3aGl0ZScsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoaXNIYW5kUmV2ZXJzZWQoaikpIHtcbiAgICAgICAgICAgICAgICByZWN0LnNldEZpbGxMaW5lYXJHcmFkaWVudENvbG9yU3RvcHMoW1xuICAgICAgICAgICAgICAgICAgICAxLFxuICAgICAgICAgICAgICAgICAgICAncmdiYSgwLDAsMCwwKScsXG4gICAgICAgICAgICAgICAgICAgIDAuMSxcbiAgICAgICAgICAgICAgICAgICAgJ3doaXRlJyxcbiAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMuYmFja2dyb3VuZC5hZGQocmVjdCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcGxheWVyTmFtZVBvcyA9IG5hbWVQb3M7XG4gICAgICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICAgICAgcGxheWVyTmFtZVBvcyA9IG5hbWVQb3NCR0E7XG4gICAgICAgIH1cbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5uYW1lRnJhbWVzW2ldID0gbmV3IEhhbmFiaU5hbWVGcmFtZSh7XG4gICAgICAgICAgICB4OiBwbGF5ZXJOYW1lUG9zW251bXBdW2pdLnggKiB3aW5XLFxuICAgICAgICAgICAgeTogcGxheWVyTmFtZVBvc1tudW1wXVtqXS55ICogd2luSCxcbiAgICAgICAgICAgIHdpZHRoOiBwbGF5ZXJOYW1lUG9zW251bXBdW2pdLncgKiB3aW5XLFxuICAgICAgICAgICAgaGVpZ2h0OiBwbGF5ZXJOYW1lUG9zW251bXBdW2pdLmggKiB3aW5ILFxuICAgICAgICAgICAgbmFtZTogZ2xvYmFscy5wbGF5ZXJOYW1lc1tpXSxcbiAgICAgICAgICAgIHBsYXllck51bTogaSxcbiAgICAgICAgfSk7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChnbG9iYWxzLmVsZW1lbnRzLm5hbWVGcmFtZXNbaV0pO1xuXG4gICAgICAgIC8vIERyYXcgdGhlIFwiRGV0cmltZW50YWwgQ2hhcmFjdGVyIEFzc2lnbm1lbnRzXCIgaWNvbiBhbmQgdG9vbHRpcFxuICAgICAgICBpZiAoZ2xvYmFscy5jaGFyYWN0ZXJBc3NpZ25tZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCB3aWR0aDIgPSAwLjAzICogd2luVztcbiAgICAgICAgICAgIGNvbnN0IGhlaWdodDIgPSAwLjAzICogd2luSDtcbiAgICAgICAgICAgIGNvbnN0IGNoYXJJY29uID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgICAgICAgICAgd2lkdGg6IHdpZHRoMixcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGhlaWdodDIsXG4gICAgICAgICAgICAgICAgeDogcGxheWVyTmFtZVBvc1tudW1wXVtqXS54ICogd2luVyAtIHdpZHRoMiAvIDIsXG4gICAgICAgICAgICAgICAgeTogcGxheWVyTmFtZVBvc1tudW1wXVtqXS55ICogd2luSCAtIGhlaWdodDIgLyAyLFxuICAgICAgICAgICAgICAgIGZvbnRTaXplOiAwLjAzICogd2luSCxcbiAgICAgICAgICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgICAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICAgICAgICAgIHRleHQ6IGNvbnN0YW50cy5DSEFSQUNURVJTW2dsb2JhbHMuY2hhcmFjdGVyQXNzaWdubWVudHNbaV1dLmVtb2ppLFxuICAgICAgICAgICAgICAgIGZpbGw6ICd5ZWxsb3cnLFxuICAgICAgICAgICAgICAgIHNoYWRvd0NvbG9yOiAnYmxhY2snLFxuICAgICAgICAgICAgICAgIHNoYWRvd0JsdXI6IDEwLFxuICAgICAgICAgICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgICAgICAgICB5OiAwLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2hhZG93T3BhY2l0eTogMC45LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoY2hhckljb24pO1xuXG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1sb29wLWZ1bmMgKi9cbiAgICAgICAgICAgIGNoYXJJY29uLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbiBjaGFySWNvbk1vdXNlTW92ZSgpIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxzLmFjdGl2ZUhvdmVyID0gdGhpcztcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRvb2x0aXBYID0gdGhpcy5nZXRXaWR0aCgpIC8gMiArIHRoaXMuYXR0cnMueDtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29sdGlwID0gJChgI3Rvb2x0aXAtY2hhcmFjdGVyLWFzc2lnbm1lbnQtJHtpfWApO1xuICAgICAgICAgICAgICAgIHRvb2x0aXAuY3NzKCdsZWZ0JywgdG9vbHRpcFgpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXAuY3NzKCd0b3AnLCB0aGlzLmF0dHJzLnkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgY2hhcmFjdGVyID0gY29uc3RhbnRzLkNIQVJBQ1RFUlNbZ2xvYmFscy5jaGFyYWN0ZXJBc3NpZ25tZW50c1tpXV07XG4gICAgICAgICAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBnbG9iYWxzLmNoYXJhY3Rlck1ldGFkYXRhW2ldO1xuICAgICAgICAgICAgICAgIGxldCBjb250ZW50ID0gYDxiPiR7Y2hhcmFjdGVyLm5hbWV9PC9iPjo8YnIgLz4ke2NoYXJhY3Rlci5kZXNjcmlwdGlvbn1gO1xuICAgICAgICAgICAgICAgIGlmIChjb250ZW50LmluY2x1ZGVzKCdbcmFuZG9tIGNvbG9yXScpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJlcGxhY2UgXCJbcmFuZG9tIGNvbG9yXVwiIHdpdGggdGhlIHNlbGVjdGVkIGNvbG9yXG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoJ1tyYW5kb20gY29sb3JdJywgZ2xvYmFscy52YXJpYW50LmNsdWVDb2xvcnNbbWV0YWRhdGFdLm5hbWUudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZW50LmluY2x1ZGVzKCdbcmFuZG9tIG51bWJlcl0nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXBsYWNlIFwiW3JhbmRvbSBudW1iZXJdXCIgd2l0aCB0aGUgc2VsZWN0ZWQgbnVtYmVyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoJ1tyYW5kb20gbnVtYmVyXScsIG1ldGFkYXRhKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbnRlbnQuaW5jbHVkZXMoJ1tyYW5kb20gc3VpdF0nKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXBsYWNlIFwiW3JhbmRvbSBzdWl0XVwiIHdpdGggdGhlIHNlbGVjdGVkIHN1aXQgbmFtZVxuICAgICAgICAgICAgICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKCdbcmFuZG9tIHN1aXRdJywgZ2xvYmFscy52YXJpYW50LnN1aXRzW21ldGFkYXRhXS5uYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdG9vbHRpcC50b29sdGlwc3RlcignaW5zdGFuY2UnKS5jb250ZW50KGNvbnRlbnQpO1xuXG4gICAgICAgICAgICAgICAgdG9vbHRpcC50b29sdGlwc3Rlcignb3BlbicpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWxvb3AtZnVuYyAqL1xuICAgICAgICAgICAgY2hhckljb24ub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb2x0aXAgPSAkKGAjdG9vbHRpcC1jaGFyYWN0ZXItYXNzaWdubWVudC0ke2l9YCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcC50b29sdGlwc3RlcignY2xvc2UnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLypcbiAgICAgICAgRHJhdyB0aGUgY2x1ZSBhcmVhXG4gICAgKi9cblxuICAgIGNvbnN0IGNsdWVBcmVhVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjEsXG4gICAgICAgIHk6IDAuNTQsXG4gICAgICAgIHc6IDAuNTUsIC8vIFRoZSB3aWR0aCBvZiBhbGwgb2YgdGhlIHZhbmlsbGEgY2FyZHMgaXMgMC40MzVcbiAgICAgICAgaDogMC4yNyxcbiAgICB9O1xuICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICBjbHVlQXJlYVZhbHVlcy54ID0gcGxheVN0YWNrVmFsdWVzLnggLSAwLjEwMjtcbiAgICAgICAgY2x1ZUFyZWFWYWx1ZXMueSA9IHBsYXlTdGFja1ZhbHVlcy55ICsgMC4yMjtcbiAgICB9XG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlQXJlYSA9IG5ldyBLaW5ldGljLkdyb3VwKHtcbiAgICAgICAgeDogY2x1ZUFyZWFWYWx1ZXMueCAqIHdpblcsXG4gICAgICAgIHk6IGNsdWVBcmVhVmFsdWVzLnkgKiB3aW5ILFxuICAgICAgICB3aWR0aDogY2x1ZUFyZWFWYWx1ZXMudyAqIHdpblcsXG4gICAgICAgIGhlaWdodDogY2x1ZUFyZWFWYWx1ZXMuaCAqIHdpbkgsXG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVUYXJnZXRCdXR0b25Hcm91cCA9IG5ldyBCdXR0b25Hcm91cCgpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlVGFyZ2V0QnV0dG9uR3JvdXAuc2VsZWN0TmV4dFRhcmdldCA9IGZ1bmN0aW9uIHNlbGVjdE5leHRUYXJnZXQoKSB7XG4gICAgICAgIGxldCBuZXdTZWxlY3Rpb25JbmRleCA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5saXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5saXN0W2ldLnByZXNzZWQpIHtcbiAgICAgICAgICAgICAgICBuZXdTZWxlY3Rpb25JbmRleCA9IChpICsgMSkgJSB0aGlzLmxpc3QubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5saXN0W25ld1NlbGVjdGlvbkluZGV4XS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycpKTtcbiAgICB9O1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlQnV0dG9uR3JvdXAgPSBuZXcgQnV0dG9uR3JvdXAoKTtcblxuICAgIC8vIFN0b3JlIGVhY2ggYnV0dG9uIGluc2lkZSBhbiBhcnJheSBmb3IgbGF0ZXJcbiAgICAvLyAoc28gdGhhdCB3ZSBjYW4gcHJlc3MgdGhlbSB3aXRoIGtleWJvYXJkIGhvdGtleXMpXG4gICAgZ2xvYmFscy5lbGVtZW50cy5yYW5rQ2x1ZUJ1dHRvbnMgPSBbXTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnN1aXRDbHVlQnV0dG9ucyA9IFtdO1xuXG4gICAgLy8gUGxheWVyIGJ1dHRvbnNcbiAgICB4ID0gMC4yNiAqIHdpblcgLSAobnVtcCAtIDIpICogMC4wNDQgKiB3aW5XO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtcCAtIDE7IGkrKykge1xuICAgICAgICBjb25zdCBqID0gKGdsb2JhbHMucGxheWVyVXMgKyBpICsgMSkgJSBudW1wO1xuXG4gICAgICAgIGJ1dHRvbiA9IG5ldyBDbHVlUmVjaXBpZW50QnV0dG9uKHtcbiAgICAgICAgICAgIHgsXG4gICAgICAgICAgICB5OiAwLFxuICAgICAgICAgICAgd2lkdGg6IDAuMDggKiB3aW5XLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLjAyNSAqIHdpbkgsXG4gICAgICAgICAgICB0ZXh0OiBnbG9iYWxzLnBsYXllck5hbWVzW2pdLFxuICAgICAgICAgICAgdGFyZ2V0SW5kZXg6IGosXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuYWRkKGJ1dHRvbik7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZVRhcmdldEJ1dHRvbkdyb3VwLmFkZChidXR0b24pO1xuXG4gICAgICAgIHggKz0gMC4wODc1ICogd2luVztcbiAgICB9XG5cbiAgICAvLyBSYW5rIGJ1dHRvbnMgLyBudW1iZXIgYnV0dG9uc1xuICAgIGxldCBudW1SYW5rcyA9IDU7XG4gICAgaWYgKGdsb2JhbHMudmFyaWFudC5uYW1lLnN0YXJ0c1dpdGgoJ011bHRpLUZpdmVzJykpIHtcbiAgICAgICAgbnVtUmFua3MgPSA0O1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBudW1SYW5rczsgaSsrKSB7XG4gICAgICAgIHggPSAwLjEzNCArICgoNSAtIG51bVJhbmtzKSAqIDAuMDI1KTtcbiAgICAgICAgYnV0dG9uID0gbmV3IE51bWJlckJ1dHRvbih7XG4gICAgICAgICAgICAvLyB4OiAoMC4xODMgKyAoaSAtIDEpICogMC4wNDkpICogd2luVyxcbiAgICAgICAgICAgIHg6ICh4ICsgaSAqIDAuMDQ5KSAqIHdpblcsXG4gICAgICAgICAgICB5OiAwLjAyNyAqIHdpbkgsXG4gICAgICAgICAgICB3aWR0aDogMC4wNCAqIHdpblcsXG4gICAgICAgICAgICBoZWlnaHQ6IDAuMDcxICogd2luSCxcbiAgICAgICAgICAgIG51bWJlcjogaSxcbiAgICAgICAgICAgIGNsdWU6IG5ldyBDbHVlKGNvbnN0YW50cy5DTFVFX1RZUEUuUkFOSywgaSksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBpdCB0byB0aGUgYnV0dG9uIGFycmF5IChmb3Iga2V5Ym9hcmQgaG90a2V5cylcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5yYW5rQ2x1ZUJ1dHRvbnMucHVzaChidXR0b24pO1xuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuYWRkKGJ1dHRvbik7XG5cbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlQnV0dG9uR3JvdXAuYWRkKGJ1dHRvbik7XG4gICAgfVxuXG4gICAgLy8gQ29sb3IgYnV0dG9uc1xuICAgIHggPSAwLjE1OCArICgoNiAtIGdsb2JhbHMudmFyaWFudC5jbHVlQ29sb3JzLmxlbmd0aCkgKiAwLjAyNSk7XG4gICAge1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgY29sb3Igb2YgZ2xvYmFscy52YXJpYW50LmNsdWVDb2xvcnMpIHtcbiAgICAgICAgICAgIGJ1dHRvbiA9IG5ldyBDb2xvckJ1dHRvbih7XG4gICAgICAgICAgICAgICAgeDogKHggKyBpICogMC4wNDkpICogd2luVyxcbiAgICAgICAgICAgICAgICB5OiAwLjEgKiB3aW5ILFxuICAgICAgICAgICAgICAgIHdpZHRoOiAwLjA0ICogd2luVyxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IDAuMDcxICogd2luSCxcbiAgICAgICAgICAgICAgICBjb2xvcjogY29sb3IuaGV4Q29kZSxcbiAgICAgICAgICAgICAgICB0ZXh0OiBjb2xvci5hYmJyZXZpYXRpb24sXG4gICAgICAgICAgICAgICAgY2x1ZTogbmV3IENsdWUoY29uc3RhbnRzLkNMVUVfVFlQRS5DT0xPUiwgY29sb3IpLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuYWRkKGJ1dHRvbik7XG5cbiAgICAgICAgICAgIC8vIEFkZCBpdCB0byB0aGUgYnV0dG9uIGFycmF5IChmb3Iga2V5Ym9hcmQgaG90a2V5cylcbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuc3VpdENsdWVCdXR0b25zLnB1c2goYnV0dG9uKTtcblxuICAgICAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlQnV0dG9uR3JvdXAuYWRkKGJ1dHRvbik7XG4gICAgICAgICAgICBpICs9IDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGUgXCJHaXZlIENsdWVcIiBidXR0b25cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmdpdmVDbHVlQnV0dG9uID0gbmV3IEJ1dHRvbih7XG4gICAgICAgIHg6IDAuMTgzICogd2luVyxcbiAgICAgICAgeTogMC4xNzIgKiB3aW5ILFxuICAgICAgICB3aWR0aDogMC4yMzYgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDUxICogd2luSCxcbiAgICAgICAgdGV4dDogJ0dpdmUgQ2x1ZScsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlQXJlYS5hZGQoZ2xvYmFscy5lbGVtZW50cy5naXZlQ2x1ZUJ1dHRvbik7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5naXZlQ2x1ZUJ1dHRvbi5vbignY2xpY2sgdGFwJywgZ2xvYmFscy5sb2JieS51aS5naXZlQ2x1ZSk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVBcmVhLmhpZGUoKTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5jbHVlQXJlYSk7XG5cbiAgICAvLyBUaGUgXCJObyBDbHVlc1wiIGJveFxuICAgIGNvbnN0IG5vQ2x1ZUJveFZhbHVlcyA9IHtcbiAgICAgICAgeDogMC4yNzUsXG4gICAgICAgIHk6IDAuNTYsXG4gICAgfTtcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgbm9DbHVlQm94VmFsdWVzLnggPSBjbHVlQXJlYVZhbHVlcy54ICsgMC4xNzg7XG4gICAgICAgIG5vQ2x1ZUJveFZhbHVlcy55ID0gY2x1ZUFyZWFWYWx1ZXMueTtcbiAgICB9XG4gICAgZ2xvYmFscy5lbGVtZW50cy5ub0NsdWVCb3ggPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogbm9DbHVlQm94VmFsdWVzLnggKiB3aW5XLFxuICAgICAgICB5OiBub0NsdWVCb3hWYWx1ZXMueSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjI1ICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjE1ICogd2luSCxcbiAgICAgICAgY29ybmVyUmFkaXVzOiAwLjAxICogd2luVyxcbiAgICAgICAgZmlsbDogJ2JsYWNrJyxcbiAgICAgICAgb3BhY2l0eTogMC41LFxuICAgICAgICB2aXNpYmxlOiBmYWxzZSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5ub0NsdWVCb3gpO1xuXG4gICAgY29uc3Qgbm9DbHVlTGFiZWxWYWx1ZXMgPSB7XG4gICAgICAgIHg6IG5vQ2x1ZUJveFZhbHVlcy54IC0gMC4xMjUsXG4gICAgICAgIHk6IG5vQ2x1ZUJveFZhbHVlcy55ICsgMC4wMjUsXG4gICAgfTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm5vQ2x1ZUxhYmVsID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IG5vQ2x1ZUxhYmVsVmFsdWVzLnggKiB3aW5XLFxuICAgICAgICB5OiBub0NsdWVMYWJlbFZhbHVlcy55ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuNSAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4xOSAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgZm9udFNpemU6IDAuMDggKiB3aW5ILFxuICAgICAgICBzdHJva2VXaWR0aDogMSxcbiAgICAgICAgdGV4dDogJ05vIENsdWVzJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICBmaWxsOiAnI2RmMmM0ZCcsXG4gICAgICAgIHN0cm9rZTogJ2JsYWNrJyxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgfSk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGdsb2JhbHMuZWxlbWVudHMubm9DbHVlTGFiZWwpO1xuXG4gICAgLypcbiAgICAgICAgRHJhdyB0aGUgdGltZXJcbiAgICAqL1xuXG4gICAgLy8gV2UgZG9uJ3Qgd2FudCB0aGUgdGltZXIgdG8gc2hvdyBpbiByZXBsYXlzXG4gICAgaWYgKCFnbG9iYWxzLnJlcGxheSAmJiAoZ2xvYmFscy50aW1lZCB8fCBnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dUaW1lckluVW50aW1lZCkpIHtcbiAgICAgICAgY29uc3QgdGltZXJWYWx1ZXMgPSB7XG4gICAgICAgICAgICB4MTogMC4xNTUsXG4gICAgICAgICAgICB4MjogMC41NjUsXG4gICAgICAgICAgICB5MTogMC41OTIsXG4gICAgICAgICAgICB5MjogMC41OTIsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dCR0FVSSkge1xuICAgICAgICAgICAgdGltZXJWYWx1ZXMueDEgPSAwLjMxO1xuICAgICAgICAgICAgdGltZXJWYWx1ZXMueDIgPSAwLjMxO1xuICAgICAgICAgICAgdGltZXJWYWx1ZXMueTEgPSAwLjc3O1xuICAgICAgICAgICAgdGltZXJWYWx1ZXMueTIgPSAwLjg4NTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMudGltZXIxID0gbmV3IHRpbWVyLlRpbWVyRGlzcGxheSh7XG4gICAgICAgICAgICB4OiB0aW1lclZhbHVlcy54MSAqIHdpblcsXG4gICAgICAgICAgICB5OiB0aW1lclZhbHVlcy55MSAqIHdpbkgsXG4gICAgICAgICAgICB3aWR0aDogMC4wOCAqIHdpblcsXG4gICAgICAgICAgICBoZWlnaHQ6IDAuMDUxICogd2luSCxcbiAgICAgICAgICAgIGZvbnRTaXplOiAwLjAzICogd2luSCxcbiAgICAgICAgICAgIGNvcm5lclJhZGl1czogMC4wMDUgKiB3aW5ILFxuICAgICAgICAgICAgc3BhY2VIOiAwLjAxICogd2luSCxcbiAgICAgICAgICAgIGxhYmVsOiAnWW91JyxcbiAgICAgICAgICAgIHZpc2libGU6ICFnbG9iYWxzLnNwZWN0YXRpbmcsXG4gICAgICAgIH0pO1xuICAgICAgICBnbG9iYWxzLmxheWVycy50aW1lci5hZGQoZ2xvYmFscy5lbGVtZW50cy50aW1lcjEpO1xuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMudGltZXIyID0gbmV3IHRpbWVyLlRpbWVyRGlzcGxheSh7XG4gICAgICAgICAgICB4OiB0aW1lclZhbHVlcy54MiAqIHdpblcsXG4gICAgICAgICAgICB5OiB0aW1lclZhbHVlcy55MiAqIHdpbkgsXG4gICAgICAgICAgICB3aWR0aDogMC4wOCAqIHdpblcsXG4gICAgICAgICAgICBoZWlnaHQ6IDAuMDUxICogd2luSCxcbiAgICAgICAgICAgIGZvbnRTaXplOiAwLjAzICogd2luSCxcbiAgICAgICAgICAgIGxhYmVsRm9udFNpemU6IDAuMDIgKiB3aW5ILFxuICAgICAgICAgICAgY29ybmVyUmFkaXVzOiAwLjAwNSAqIHdpbkgsXG4gICAgICAgICAgICBzcGFjZUg6IDAuMDEgKiB3aW5ILFxuICAgICAgICAgICAgbGFiZWw6ICdDdXJyZW50XFxuUGxheWVyJyxcbiAgICAgICAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMudGltZXIuYWRkKGdsb2JhbHMuZWxlbWVudHMudGltZXIyKTtcbiAgICB9XG5cbiAgICAvLyBKdXN0IGluIGNhc2UsIHN0b3AgdGhlIHByZXZpb3VzIHRpbWVyLCBpZiBhbnlcbiAgICB0aW1lci5zdG9wKCk7XG5cbiAgICAvKlxuICAgICAgICBEcmF3IHRoZSByZXBsYXkgYXJlYVxuICAgICovXG5cbiAgICBjb25zdCByZXBsYXlBcmVhVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjE1LFxuICAgICAgICB5OiAwLjUxLFxuICAgICAgICB3OiAwLjUsXG4gICAgfTtcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgcmVwbGF5QXJlYVZhbHVlcy54ID0gMC4wMTtcbiAgICAgICAgcmVwbGF5QXJlYVZhbHVlcy55ID0gMC40OTtcbiAgICAgICAgcmVwbGF5QXJlYVZhbHVlcy53ID0gMC40O1xuICAgIH1cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEgPSBuZXcgS2luZXRpYy5Hcm91cCh7XG4gICAgICAgIHg6IHJlcGxheUFyZWFWYWx1ZXMueCAqIHdpblcsXG4gICAgICAgIHk6IHJlcGxheUFyZWFWYWx1ZXMueSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiByZXBsYXlBcmVhVmFsdWVzLncgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMjcgKiB3aW5ILFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVwbGF5QmFyID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAuMDQyNSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiByZXBsYXlBcmVhVmFsdWVzLncgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDEgKiB3aW5ILFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDA1ICogd2luSCxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKHJlcGxheUJhcik7XG5cbiAgICByZWN0ID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAsXG4gICAgICAgIHdpZHRoOiByZXBsYXlBcmVhVmFsdWVzLncgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDUgKiB3aW5ILFxuICAgICAgICBvcGFjaXR5OiAwLFxuICAgIH0pO1xuICAgIHJlY3Qub24oJ2NsaWNrJywgcmVwbGF5LmJhckNsaWNrKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKHJlY3QpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlTaHV0dGxlID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAuMDMyNSAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjAzICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjAzICogd2luSCxcbiAgICAgICAgZmlsbDogJyMwMDAwY2MnLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDEgKiB3aW5XLFxuICAgICAgICBkcmFnZ2FibGU6IHRydWUsXG4gICAgICAgIGRyYWdCb3VuZEZ1bmM6IHJlcGxheS5iYXJEcmFnLFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5U2h1dHRsZS5vbignZHJhZ2VuZCcsICgpID0+IHtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuY2FyZC5kcmF3KCk7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLlVJLmRyYXcoKTtcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKGdsb2JhbHMuZWxlbWVudHMucmVwbGF5U2h1dHRsZSk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheVNodXR0bGVTaGFyZWQgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMC4wMzI1ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDMgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDMgKiB3aW5ILFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMDEgKiB3aW5XLFxuICAgICAgICBmaWxsOiAnI2QxZDFkMScsXG4gICAgICAgIHZpc2libGU6ICFnbG9iYWxzLnVzZVNoYXJlZFR1cm5zLFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5U2h1dHRsZVNoYXJlZC5vbignY2xpY2sgdGFwJywgKCkgPT4ge1xuICAgICAgICByZXBsYXkuZ290byhnbG9iYWxzLnNoYXJlZFJlcGxheVR1cm4sIHRydWUpO1xuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5QXJlYS5hZGQoZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlTaHV0dGxlU2hhcmVkKTtcblxuICAgIHJlcGxheS5hZGp1c3RTaHV0dGxlcygpO1xuXG4gICAgY29uc3QgcmVwbGF5QnV0dG9uVmFsdWVzID0ge1xuICAgICAgICB4OiAwLjEsXG4gICAgICAgIHk6IDAuMDcsXG4gICAgICAgIHNwYWNpbmc6IDAuMDgsXG4gICAgfTtcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93QkdBVUkpIHtcbiAgICAgICAgcmVwbGF5QnV0dG9uVmFsdWVzLnggPSAwLjA1O1xuICAgIH1cblxuICAgIC8vIEdvIGJhY2sgdG8gdGhlIGJlZ2lubmluZyAodGhlIGxlZnQtbW9zdCBidXR0b24pXG4gICAgYnV0dG9uID0gbmV3IEJ1dHRvbih7XG4gICAgICAgIHg6IHJlcGxheUJ1dHRvblZhbHVlcy54ICogd2luVyxcbiAgICAgICAgeTogMC4wNyAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA2ICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjA4ICogd2luSCxcbiAgICAgICAgaW1hZ2U6ICdyZXBsYXktYmFjay1mdWxsJyxcbiAgICB9KTtcbiAgICBidXR0b24ub24oJ2NsaWNrIHRhcCcsIHJlcGxheS5iYWNrRnVsbCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlBcmVhLmFkZChidXR0b24pO1xuXG4gICAgLy8gR28gYmFjayBvbmUgdHVybiAodGhlIHNlY29uZCBsZWZ0LW1vc3QgYnV0dG9uKVxuICAgIGJ1dHRvbiA9IG5ldyBCdXR0b24oe1xuICAgICAgICB4OiAocmVwbGF5QnV0dG9uVmFsdWVzLnggKyByZXBsYXlCdXR0b25WYWx1ZXMuc3BhY2luZykgKiB3aW5XLFxuICAgICAgICB5OiAwLjA3ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDYgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDggKiB3aW5ILFxuICAgICAgICBpbWFnZTogJ3JlcGxheS1iYWNrJyxcbiAgICB9KTtcbiAgICBidXR0b24ub24oJ2NsaWNrIHRhcCcsIHJlcGxheS5iYWNrKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKGJ1dHRvbik7XG5cbiAgICAvLyBHbyBmb3J3YXJkIG9uZSB0dXJuICh0aGUgc2Vjb25kIHJpZ2h0LW1vc3QgYnV0dG9uKVxuICAgIGJ1dHRvbiA9IG5ldyBCdXR0b24oe1xuICAgICAgICB4OiAocmVwbGF5QnV0dG9uVmFsdWVzLnggKyByZXBsYXlCdXR0b25WYWx1ZXMuc3BhY2luZyAqIDIpICogd2luVyxcbiAgICAgICAgeTogMC4wNyAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA2ICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjA4ICogd2luSCxcbiAgICAgICAgaW1hZ2U6ICdyZXBsYXktZm9yd2FyZCcsXG4gICAgfSk7XG4gICAgYnV0dG9uLm9uKCdjbGljayB0YXAnLCByZXBsYXkuZm9yd2FyZCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlBcmVhLmFkZChidXR0b24pO1xuXG4gICAgLy8gR28gZm9yd2FyZCB0byB0aGUgZW5kICh0aGUgcmlnaHQtbW9zdCBidXR0b24pXG4gICAgYnV0dG9uID0gbmV3IEJ1dHRvbih7XG4gICAgICAgIHg6IChyZXBsYXlCdXR0b25WYWx1ZXMueCArIHJlcGxheUJ1dHRvblZhbHVlcy5zcGFjaW5nICogMykgKiB3aW5XLFxuICAgICAgICB5OiAwLjA3ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDYgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDggKiB3aW5ILFxuICAgICAgICBpbWFnZTogJ3JlcGxheS1mb3J3YXJkLWZ1bGwnLFxuICAgIH0pO1xuICAgIGJ1dHRvbi5vbignY2xpY2sgdGFwJywgcmVwbGF5LmZvcndhcmRGdWxsKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKGJ1dHRvbik7XG5cbiAgICAvLyBUaGUgXCJFeGl0IFJlcGxheVwiIGJ1dHRvblxuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5RXhpdEJ1dHRvbiA9IG5ldyBCdXR0b24oe1xuICAgICAgICB4OiAocmVwbGF5QnV0dG9uVmFsdWVzLnggKyAwLjA1KSAqIHdpblcsXG4gICAgICAgIHk6IDAuMTcgKiB3aW5ILFxuICAgICAgICB3aWR0aDogMC4yICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjA2ICogd2luSCxcbiAgICAgICAgdGV4dDogJ0V4aXQgUmVwbGF5JyxcbiAgICAgICAgdmlzaWJsZTogIWdsb2JhbHMucmVwbGF5ICYmICFnbG9iYWxzLnNoYXJlZFJlcGxheSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUV4aXRCdXR0b24ub24oJ2NsaWNrIHRhcCcsIHJlcGxheS5leGl0QnV0dG9uKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKGdsb2JhbHMuZWxlbWVudHMucmVwbGF5RXhpdEJ1dHRvbik7XG5cbiAgICAvLyBUaGUgXCJQYXVzZSBTaGFyZWQgVHVybnNcIiAgLyBcIlVzZSBTaGFyZWQgVHVybnNcIiBidXR0b25cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnRvZ2dsZVNoYXJlZFR1cm5CdXR0b24gPSBuZXcgVG9nZ2xlQnV0dG9uKHtcbiAgICAgICAgeDogKHJlcGxheUJ1dHRvblZhbHVlcy54ICsgMC4wNSkgKiB3aW5XLFxuICAgICAgICB5OiAwLjE3ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMiAqIHdpblcsXG4gICAgICAgIGhlaWdodDogMC4wNiAqIHdpbkgsXG4gICAgICAgIHRleHQ6ICdQYXVzZSBTaGFyZWQgVHVybnMnLFxuICAgICAgICBhbHRlcm5hdGVUZXh0OiAnVXNlIFNoYXJlZCBUdXJucycsXG4gICAgICAgIGluaXRpYWxTdGF0ZTogIWdsb2JhbHMudXNlU2hhcmVkVHVybnMsXG4gICAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgIH0pO1xuICAgIGdsb2JhbHMuZWxlbWVudHMudG9nZ2xlU2hhcmVkVHVybkJ1dHRvbi5vbignY2xpY2sgdGFwJywgcmVwbGF5LnRvZ2dsZVNoYXJlZFR1cm5zKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuYWRkKGdsb2JhbHMuZWxlbWVudHMudG9nZ2xlU2hhcmVkVHVybkJ1dHRvbik7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEuaGlkZSgpO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlCdXR0b24gPSBuZXcgQnV0dG9uKHtcbiAgICAgICAgeDogMC4wMSAqIHdpblcsXG4gICAgICAgIHk6IDAuOCAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiAwLjA2ICogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjA2ICogd2luSCxcbiAgICAgICAgaW1hZ2U6ICdyZXBsYXknLFxuICAgICAgICB2aXNpYmxlOiBmYWxzZSxcbiAgICB9KTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUJ1dHRvbi5vbignY2xpY2sgdGFwJywgKCkgPT4ge1xuICAgICAgICBpZiAoZ2xvYmFscy5pblJlcGxheSkge1xuICAgICAgICAgICAgcmVwbGF5LmV4aXQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcGxheS5lbnRlcigpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmxheWVycy5VSS5hZGQoZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlCdXR0b24pO1xuXG4gICAgLy8gVGhlIGNoYXQgYnV0dG9uIGlzIG5vdCBuZWNlc3NhcnkgaW4gbm9uLXNoYXJlZCByZXBsYXlzXG4gICAgaWYgKCFnbG9iYWxzLnJlcGxheSB8fCBnbG9iYWxzLnNoYXJlZFJlcGxheSkge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNoYXRCdXR0b24gPSBuZXcgQnV0dG9uKHtcbiAgICAgICAgICAgIHg6IDAuMDEgKiB3aW5XLFxuICAgICAgICAgICAgeTogMC44NyAqIHdpbkgsXG4gICAgICAgICAgICB3aWR0aDogMC4wNiAqIHdpblcsXG4gICAgICAgICAgICBoZWlnaHQ6IDAuMDYgKiB3aW5ILFxuICAgICAgICAgICAgdGV4dDogJ0NoYXQnLFxuICAgICAgICB9KTtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuVUkuYWRkKGdsb2JhbHMuZWxlbWVudHMuY2hhdEJ1dHRvbik7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2hhdEJ1dHRvbi5vbignY2xpY2sgdGFwJywgKCkgPT4ge1xuICAgICAgICAgICAgZ2xvYmFscy5nYW1lLmNoYXQudG9nZ2xlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGxvYmJ5QnV0dG9uID0gbmV3IEJ1dHRvbih7XG4gICAgICAgIHg6IDAuMDEgKiB3aW5XLFxuICAgICAgICB5OiAwLjk0ICogd2luSCxcbiAgICAgICAgd2lkdGg6IDAuMDYgKiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDUgKiB3aW5ILFxuICAgICAgICB0ZXh0OiAnTG9iYnknLFxuICAgIH0pO1xuICAgIGdsb2JhbHMubGF5ZXJzLlVJLmFkZChsb2JieUJ1dHRvbik7XG5cbiAgICBsb2JieUJ1dHRvbi5vbignY2xpY2sgdGFwJywgKCkgPT4ge1xuICAgICAgICBsb2JieUJ1dHRvbi5vZmYoJ2NsaWNrIHRhcCcpO1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZCgnZ2FtZVVuYXR0ZW5kJyk7XG5cbiAgICAgICAgdGltZXIuc3RvcCgpO1xuICAgICAgICBnbG9iYWxzLmdhbWUuaGlkZSgpO1xuICAgIH0pO1xuXG4gICAgaWYgKGdsb2JhbHMuaW5SZXBsYXkpIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlBcmVhLnNob3coKTtcbiAgICB9XG5cbiAgICBnbG9iYWxzLnN0YWdlLmFkZChnbG9iYWxzLmxheWVycy5iYWNrZ3JvdW5kKTtcbiAgICBnbG9iYWxzLnN0YWdlLmFkZChnbG9iYWxzLmxheWVycy50ZXh0KTtcbiAgICBnbG9iYWxzLnN0YWdlLmFkZChnbG9iYWxzLmxheWVycy5VSSk7XG4gICAgZ2xvYmFscy5zdGFnZS5hZGQoZ2xvYmFscy5sYXllcnMudGltZXIpO1xuICAgIGdsb2JhbHMuc3RhZ2UuYWRkKGdsb2JhbHMubGF5ZXJzLmNhcmQpO1xuICAgIGdsb2JhbHMuc3RhZ2UuYWRkKGdsb2JhbHMubGF5ZXJzLm92ZXJ0b3ApO1xufTtcbiIsIi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcbmNvbnN0IEZpdFRleHQgPSByZXF1aXJlKCcuL2ZpdFRleHQnKTtcblxuY29uc3QgQnV0dG9uID0gZnVuY3Rpb24gQnV0dG9uKGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgY29uc3QgdyA9IHRoaXMuZ2V0V2lkdGgoKTtcbiAgICBjb25zdCBoID0gdGhpcy5nZXRIZWlnaHQoKTtcblxuICAgIGNvbnN0IGJhY2tncm91bmQgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgbmFtZTogJ2JhY2tncm91bmQnLFxuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBsaXN0ZW5pbmc6IHRydWUsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4xMiAqIGgsXG4gICAgICAgIGZpbGw6ICdibGFjaycsXG4gICAgICAgIG9wYWNpdHk6IDAuNixcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkKGJhY2tncm91bmQpO1xuXG4gICAgaWYgKGNvbmZpZy50ZXh0KSB7XG4gICAgICAgIGNvbnN0IHRleHQgPSBuZXcgRml0VGV4dCh7XG4gICAgICAgICAgICBuYW1lOiAndGV4dCcsXG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMC4yNzUgKiBoLFxuICAgICAgICAgICAgd2lkdGg6IHcsXG4gICAgICAgICAgICBoZWlnaHQ6IDAuNSAqIGgsXG4gICAgICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgICAgICAgICAgZm9udFNpemU6IDAuNSAqIGgsXG4gICAgICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgICAgICBmaWxsOiAnd2hpdGUnLFxuICAgICAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICAgICAgdGV4dDogY29uZmlnLnRleHQsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0VGV4dCA9IG5ld1RleHQgPT4gdGV4dC5zZXRUZXh0KG5ld1RleHQpO1xuICAgICAgICB0aGlzLnNldEZpbGwgPSBuZXdGaWxsID0+IHRleHQuc2V0RmlsbChuZXdGaWxsKTtcblxuICAgICAgICB0aGlzLmFkZCh0ZXh0KTtcbiAgICB9IGVsc2UgaWYgKGNvbmZpZy5pbWFnZSkge1xuICAgICAgICBjb25zdCBpbWcgPSBuZXcgS2luZXRpYy5JbWFnZSh7XG4gICAgICAgICAgICBuYW1lOiAnaW1hZ2UnLFxuICAgICAgICAgICAgeDogMC4yICogdyxcbiAgICAgICAgICAgIHk6IDAuMiAqIGgsXG4gICAgICAgICAgICB3aWR0aDogMC42ICogdyxcbiAgICAgICAgICAgIGhlaWdodDogMC42ICogaCxcbiAgICAgICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgICAgICAgICBpbWFnZTogZ2xvYmFscy5JbWFnZUxvYWRlci5nZXQoY29uZmlnLmltYWdlKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGQoaW1nKTtcbiAgICB9XG5cbiAgICB0aGlzLmVuYWJsZWQgPSB0cnVlO1xuICAgIHRoaXMucHJlc3NlZCA9IGZhbHNlO1xuXG4gICAgYmFja2dyb3VuZC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICBiYWNrZ3JvdW5kLnNldEZpbGwoJyM4ODg4ODgnKTtcbiAgICAgICAgYmFja2dyb3VuZC5nZXRMYXllcigpLmRyYXcoKTtcblxuICAgICAgICBjb25zdCByZXNldEJ1dHRvbiA9ICgpID0+IHtcbiAgICAgICAgICAgIGJhY2tncm91bmQuc2V0RmlsbCgnYmxhY2snKTtcbiAgICAgICAgICAgIGJhY2tncm91bmQuZ2V0TGF5ZXIoKS5kcmF3KCk7XG5cbiAgICAgICAgICAgIGJhY2tncm91bmQub2ZmKCdtb3VzZXVwJyk7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kLm9mZignbW91c2VvdXQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBiYWNrZ3JvdW5kLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIHJlc2V0QnV0dG9uKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBiYWNrZ3JvdW5kLm9uKCdtb3VzZXVwJywgKCkgPT4ge1xuICAgICAgICAgICAgcmVzZXRCdXR0b24oKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEJ1dHRvbiwgS2luZXRpYy5Hcm91cCk7XG5cbkJ1dHRvbi5wcm90b3R5cGUuc2V0RW5hYmxlZCA9IGZ1bmN0aW9uIHNldEVuYWJsZWQoZW5hYmxlZCkge1xuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cbiAgICB0aGlzLmdldCgnLnRleHQnKVswXS5zZXRGaWxsKGVuYWJsZWQgPyAnd2hpdGUnIDogJyM0NDQ0NDQnKTtcblxuICAgIHRoaXMuZ2V0KCcuYmFja2dyb3VuZCcpWzBdLnNldExpc3RlbmluZyhlbmFibGVkKTtcblxuICAgIHRoaXMuZ2V0TGF5ZXIoKS5kcmF3KCk7XG59O1xuXG5CdXR0b24ucHJvdG90eXBlLmdldEVuYWJsZWQgPSBmdW5jdGlvbiBnZXRFbmFibGVkKCkge1xuICAgIHJldHVybiB0aGlzLmVuYWJsZWQ7XG59O1xuXG5CdXR0b24ucHJvdG90eXBlLnNldFByZXNzZWQgPSBmdW5jdGlvbiBzZXRQcmVzc2VkKHByZXNzZWQpIHtcbiAgICB0aGlzLnByZXNzZWQgPSBwcmVzc2VkO1xuXG4gICAgdGhpcy5nZXQoJy5iYWNrZ3JvdW5kJylbMF0uc2V0RmlsbChwcmVzc2VkID8gJyNjY2NjY2MnIDogJ2JsYWNrJyk7XG5cbiAgICB0aGlzLmdldExheWVyKCkuYmF0Y2hEcmF3KCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJ1dHRvbjtcbiIsImNvbnN0IEJ1dHRvbkdyb3VwID0gZnVuY3Rpb24gQnV0dG9uR3JvdXAoY29uZmlnKSB7XG4gICAgS2luZXRpYy5Ob2RlLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAgIHRoaXMubGlzdCA9IFtdO1xufTtcblxuS2luZXRpYy5VdGlsLmV4dGVuZChCdXR0b25Hcm91cCwgS2luZXRpYy5Ob2RlKTtcblxuQnV0dG9uR3JvdXAucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZChidXR0b24pIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIHRoaXMubGlzdC5wdXNoKGJ1dHRvbik7XG5cbiAgICBidXR0b24ub24oJ2NsaWNrIHRhcCcsIGZ1bmN0aW9uIGJ1dHRvbkNsaWNrKCkge1xuICAgICAgICB0aGlzLnNldFByZXNzZWQodHJ1ZSk7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZWxmLmxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmxpc3RbaV0gIT09IHRoaXMgJiYgc2VsZi5saXN0W2ldLnByZXNzZWQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmxpc3RbaV0uc2V0UHJlc3NlZChmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLmZpcmUoJ2NoYW5nZScpO1xuICAgIH0pO1xufTtcblxuQnV0dG9uR3JvdXAucHJvdG90eXBlLmdldFByZXNzZWQgPSBmdW5jdGlvbiBnZXRQcmVzc2VkKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5saXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzLmxpc3RbaV0ucHJlc3NlZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubGlzdFtpXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xufTtcblxuQnV0dG9uR3JvdXAucHJvdG90eXBlLmNsZWFyUHJlc3NlZCA9IGZ1bmN0aW9uIGNsZWFyUHJlc3NlZCgpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodGhpcy5saXN0W2ldLnByZXNzZWQpIHtcbiAgICAgICAgICAgIHRoaXMubGlzdFtpXS5zZXRQcmVzc2VkKGZhbHNlKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQnV0dG9uR3JvdXA7XG4iLCIvKlxuICAgIFRoZSBIYW5hYmlDYXJkIG9iamVjdCwgd2hpY2ggcmVwcmVzdHMgYSBzaW5nbGUgY2FyZFxuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5jb25zdCBjYXJkRHJhdyA9IHJlcXVpcmUoJy4vY2FyZERyYXcnKTtcbmNvbnN0IG5vdGVzID0gcmVxdWlyZSgnLi9ub3RlcycpO1xuY29uc3QgcmVwbGF5ID0gcmVxdWlyZSgnLi9yZXBsYXknKTtcblxuLy8gQ29uc3RhbnRzXG5jb25zdCB7XG4gICAgQ0FSREgsXG4gICAgQ0FSRFcsXG4gICAgQ0xVRV9UWVBFLFxuICAgIElORElDQVRPUixcbiAgICBTVUlULFxufSA9IGNvbnN0YW50cztcblxuY29uc3QgSGFuYWJpQ2FyZCA9IGZ1bmN0aW9uIEhhbmFiaUNhcmQoY29uZmlnKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICBjb25zdCB3aW5IID0gZ2xvYmFscy5zdGFnZS5nZXRIZWlnaHQoKTtcblxuICAgIGNvbmZpZy53aWR0aCA9IENBUkRXO1xuICAgIGNvbmZpZy5oZWlnaHQgPSBDQVJESDtcbiAgICBjb25maWcueCA9IENBUkRXIC8gMjtcbiAgICBjb25maWcueSA9IENBUkRIIC8gMjtcbiAgICBjb25maWcub2Zmc2V0ID0ge1xuICAgICAgICB4OiBDQVJEVyAvIDIsXG4gICAgICAgIHk6IENBUkRIIC8gMixcbiAgICB9O1xuXG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgICB0aGlzLnR3ZWVuaW5nID0gZmFsc2U7XG5cbiAgICB0aGlzLmJhcmUgPSBuZXcgS2luZXRpYy5JbWFnZSh7XG4gICAgICAgIHdpZHRoOiBjb25maWcud2lkdGgsXG4gICAgICAgIGhlaWdodDogY29uZmlnLmhlaWdodCxcbiAgICB9KTtcblxuICAgIHRoaXMuZG9Sb3RhdGlvbnMgPSBmdW5jdGlvbiBkb1JvdGF0aW9ucyhpbnZlcnRlZCA9IGZhbHNlKSB7XG4gICAgICAgIHRoaXMuc2V0Um90YXRpb24oaW52ZXJ0ZWQgPyAxODAgOiAwKTtcblxuICAgICAgICB0aGlzLmJhcmUuc2V0Um90YXRpb24oaW52ZXJ0ZWQgPyAxODAgOiAwKTtcbiAgICAgICAgdGhpcy5iYXJlLnNldFgoaW52ZXJ0ZWQgPyBjb25maWcud2lkdGggOiAwKTtcbiAgICAgICAgdGhpcy5iYXJlLnNldFkoaW52ZXJ0ZWQgPyBjb25maWcuaGVpZ2h0IDogMCk7XG4gICAgfTtcblxuICAgIHRoaXMuYmFyZS5zZXREcmF3RnVuYyhmdW5jdGlvbiBzZXREcmF3RnVuYyhjb250ZXh0KSB7XG4gICAgICAgIGNhcmREcmF3LnNjYWxlQ2FyZEltYWdlKFxuICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgIHNlbGYuYmFyZW5hbWUsXG4gICAgICAgICAgICB0aGlzLmdldFdpZHRoKCksXG4gICAgICAgICAgICB0aGlzLmdldEhlaWdodCgpLFxuICAgICAgICAgICAgdGhpcy5nZXRBYnNvbHV0ZVRyYW5zZm9ybSgpLFxuICAgICAgICApO1xuICAgIH0pO1xuICAgIHRoaXMuYWRkKHRoaXMuYmFyZSk7XG5cbiAgICB0aGlzLmhvbGRlciA9IGNvbmZpZy5ob2xkZXI7XG5cbiAgICB0aGlzLnRydWVTdWl0ID0gY29uZmlnLnN1aXQgfHwgdW5kZWZpbmVkO1xuICAgIHRoaXMudHJ1ZVJhbmsgPSBjb25maWcucmFuayB8fCB1bmRlZmluZWQ7XG4gICAgdGhpcy5zdWl0S25vd24gPSBmdW5jdGlvbiBzdWl0S25vd24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRydWVTdWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgfTtcbiAgICB0aGlzLnJhbmtLbm93biA9IGZ1bmN0aW9uIHJhbmtLbm93bigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudHJ1ZVJhbmsgIT09IHVuZGVmaW5lZDtcbiAgICB9O1xuICAgIHRoaXMuaWRlbnRpdHlLbm93biA9IGZ1bmN0aW9uIGlkZW50aXR5S25vd24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN1aXRLbm93bigpICYmIHRoaXMucmFua0tub3duKCk7XG4gICAgfTtcbiAgICB0aGlzLm9yZGVyID0gY29uZmlnLm9yZGVyO1xuICAgIC8vIFBvc3NpYmxlIHN1aXRzIGFuZCByYW5rcyAoYmFzZWQgb24gY2x1ZXMgZ2l2ZW4pIGFyZSB0cmFja2VkIHNlcGFyYXRlbHkgZnJvbSBrbm93bGVkZ2Ugb2ZcbiAgICAvLyB0aGUgdHJ1ZSBzdWl0IGFuZCByYW5rXG4gICAgdGhpcy5wb3NzaWJsZVN1aXRzID0gY29uZmlnLnN1aXRzO1xuICAgIHRoaXMucG9zc2libGVSYW5rcyA9IGNvbmZpZy5yYW5rcztcblxuICAgIHRoaXMucmFua1BpcHMgPSBuZXcgS2luZXRpYy5Hcm91cCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IE1hdGguZmxvb3IoQ0FSREggKiAwLjg1KSxcbiAgICAgICAgd2lkdGg6IENBUkRXLFxuICAgICAgICBoZWlnaHQ6IE1hdGguZmxvb3IoQ0FSREggKiAwLjE1KSxcbiAgICAgICAgdmlzaWJsZTogIXRoaXMucmFua0tub3duKCksXG4gICAgfSk7XG4gICAgdGhpcy5zdWl0UGlwcyA9IG5ldyBLaW5ldGljLkdyb3VwKHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IE1hdGguZmxvb3IoQ0FSRFcpLFxuICAgICAgICBoZWlnaHQ6IE1hdGguZmxvb3IoQ0FSREgpLFxuICAgICAgICB2aXNpYmxlOiAhdGhpcy5zdWl0S25vd24oKSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZCh0aGlzLnJhbmtQaXBzKTtcbiAgICB0aGlzLmFkZCh0aGlzLnN1aXRQaXBzKTtcblxuICAgIGNvbnN0IGNhcmRQcmVzZW50S25vd2xlZGdlID0gZ2xvYmFscy5sZWFybmVkQ2FyZHNbdGhpcy5vcmRlcl07XG4gICAgaWYgKGNhcmRQcmVzZW50S25vd2xlZGdlLnJhbmspIHtcbiAgICAgICAgdGhpcy5yYW5rUGlwcy52aXNpYmxlKGZhbHNlKTtcbiAgICB9XG4gICAgaWYgKGNhcmRQcmVzZW50S25vd2xlZGdlLnN1aXQpIHtcbiAgICAgICAgdGhpcy5zdWl0UGlwcy52aXNpYmxlKGZhbHNlKTtcbiAgICB9XG4gICAgaWYgKGdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgIHRoaXMucmFua1BpcHMudmlzaWJsZShmYWxzZSk7XG4gICAgICAgIHRoaXMuc3VpdFBpcHMudmlzaWJsZShmYWxzZSk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBpIG9mIGNvbmZpZy5yYW5rcykge1xuICAgICAgICBjb25zdCByYW5rUGlwID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgICAgICB4OiBNYXRoLmZsb29yKENBUkRXICogKGkgKiAwLjE5IC0gMC4xNCkpLFxuICAgICAgICAgICAgeTogMCxcbiAgICAgICAgICAgIHdpZHRoOiBNYXRoLmZsb29yKENBUkRXICogMC4xNSksXG4gICAgICAgICAgICBoZWlnaHQ6IE1hdGguZmxvb3IoQ0FSREggKiAwLjEwKSxcbiAgICAgICAgICAgIGZpbGw6ICdibGFjaycsXG4gICAgICAgICAgICBzdHJva2U6ICdibGFjaycsXG4gICAgICAgICAgICBuYW1lOiBpLnRvU3RyaW5nKCksXG4gICAgICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCFnbG9iYWxzLmxlYXJuZWRDYXJkc1t0aGlzLm9yZGVyXS5wb3NzaWJsZVJhbmtzLmluY2x1ZGVzKGkpKSB7XG4gICAgICAgICAgICByYW5rUGlwLnNldE9wYWNpdHkoMC4zKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnJhbmtQaXBzLmFkZChyYW5rUGlwKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHN1aXRzIH0gPSBjb25maWc7XG4gICAgY29uc3QgblN1aXRzID0gc3VpdHMubGVuZ3RoO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3VpdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgc3VpdCA9IHN1aXRzW2ldO1xuXG4gICAgICAgIGxldCBmaWxsID0gc3VpdC5maWxsQ29sb3JzLmhleENvZGU7XG4gICAgICAgIGlmIChzdWl0ID09PSBTVUlULlJBSU5CT1cgfHwgc3VpdCA9PT0gU1VJVC5SQUlOQk9XMU9FKSB7XG4gICAgICAgICAgICBmaWxsID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3VpdFBpcCA9IG5ldyBLaW5ldGljLlNoYXBlKHtcbiAgICAgICAgICAgIHg6IE1hdGguZmxvb3IoQ0FSRFcgKiAwLjUpLFxuICAgICAgICAgICAgeTogTWF0aC5mbG9vcihDQVJESCAqIDAuNSksXG5cbiAgICAgICAgICAgIC8vIFNjYWxlIG51bWJlcnMgYXJlIG1hZ2ljXG4gICAgICAgICAgICBzY2FsZToge1xuICAgICAgICAgICAgICAgIHg6IDAuNCxcbiAgICAgICAgICAgICAgICB5OiAwLjQsXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvLyBUcmFuc2Zvcm0gcG9sYXIgdG8gY2FydGVzaWFuIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICAvLyBUaGUgbWFnaWMgbnVtYmVyIGFkZGVkIHRvIHRoZSBvZmZzZXQgaXMgbmVlZGVkIHRvIGNlbnRlciB0aGluZ3MgcHJvcGVybHk7XG4gICAgICAgICAgICAvLyBXZSBkb24ndCBrbm93IHdoeSBpdCdzIG5lZWRlZDtcbiAgICAgICAgICAgIC8vIHBlcmhhcHMgc29tZXRoaW5nIHRvIGRvIHdpdGggdGhlIHNoYXBlIGZ1bmN0aW9uc1xuICAgICAgICAgICAgb2Zmc2V0OiB7XG4gICAgICAgICAgICAgICAgeDogTWF0aC5mbG9vcihDQVJEVyAqIDAuNyAqIE1hdGguY29zKCgtaSAvIG5TdWl0cyArIDAuMjUpICogTWF0aC5QSSAqIDIpICsgQ0FSRFcgKiAwLjI1KSwgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgICAgICAgIHk6IE1hdGguZmxvb3IoQ0FSRFcgKiAwLjcgKiBNYXRoLnNpbigoLWkgLyBuU3VpdHMgKyAwLjI1KSAqIE1hdGguUEkgKiAyKSArIENBUkRXICogMC4zKSwgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZpbGwsXG4gICAgICAgICAgICBzdHJva2U6ICdibGFjaycsXG4gICAgICAgICAgICBuYW1lOiBzdWl0Lm5hbWUsXG4gICAgICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgICAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tbG9vcC1mdW5jICovXG4gICAgICAgICAgICBkcmF3RnVuYzogKGN0eCkgPT4ge1xuICAgICAgICAgICAgICAgIGNhcmREcmF3LmRyYXdTdWl0U2hhcGUoc3VpdCwgaSkoY3R4KTtcbiAgICAgICAgICAgICAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgICAgICAgICAgICAgY3R4LmZpbGxTdHJva2VTaGFwZShzdWl0UGlwKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWxvb3AtZnVuYyAqL1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBHcmFkaWVudCBudW1iZXJzIGFyZSBtYWdpY1xuICAgICAgICBpZiAoc3VpdCA9PT0gU1VJVC5SQUlOQk9XIHx8IHN1aXQgPT09IFNVSVQuUkFJTkJPVzFPRSkge1xuICAgICAgICAgICAgc3VpdFBpcC5maWxsUmFkaWFsR3JhZGllbnRDb2xvclN0b3BzKFtcbiAgICAgICAgICAgICAgICAwLjMsIHN1aXQuZmlsbENvbG9yc1swXS5oZXhDb2RlLFxuICAgICAgICAgICAgICAgIDAuNDI1LCBzdWl0LmZpbGxDb2xvcnNbMV0uaGV4Q29kZSxcbiAgICAgICAgICAgICAgICAwLjY1LCBzdWl0LmZpbGxDb2xvcnNbMl0uaGV4Q29kZSxcbiAgICAgICAgICAgICAgICAwLjg3NSwgc3VpdC5maWxsQ29sb3JzWzNdLmhleENvZGUsXG4gICAgICAgICAgICAgICAgMSwgc3VpdC5maWxsQ29sb3JzWzRdLmhleENvZGUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIHN1aXRQaXAuZmlsbFJhZGlhbEdyYWRpZW50U3RhcnRQb2ludCh7XG4gICAgICAgICAgICAgICAgeDogNzUsXG4gICAgICAgICAgICAgICAgeTogMTQwLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzdWl0UGlwLmZpbGxSYWRpYWxHcmFkaWVudEVuZFBvaW50KHtcbiAgICAgICAgICAgICAgICB4OiA3NSxcbiAgICAgICAgICAgICAgICB5OiAxNDAsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHN1aXRQaXAuZmlsbFJhZGlhbEdyYWRpZW50U3RhcnRSYWRpdXMoMCk7XG4gICAgICAgICAgICBzdWl0UGlwLmZpbGxSYWRpYWxHcmFkaWVudEVuZFJhZGl1cyhNYXRoLmZsb29yKENBUkRXICogMC4yNSkpO1xuICAgICAgICB9XG4gICAgICAgIHN1aXRQaXAucm90YXRpb24oMCk7XG5cbiAgICAgICAgLy8gUmVkdWNlIG9wYWN0aXR5IG9mIGVsaW1pbmF0ZWQgc3VpdHMgYW5kIG91dGxpbmUgcmVtYWluaW5nIHN1aXRzXG4gICAgICAgIGlmICghZ2xvYmFscy5sZWFybmVkQ2FyZHNbdGhpcy5vcmRlcl0ucG9zc2libGVTdWl0cy5pbmNsdWRlcyhzdWl0KSkge1xuICAgICAgICAgICAgc3VpdFBpcC5zZXRPcGFjaXR5KDAuNCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdWl0UGlwLnNldFN0cm9rZVdpZHRoKDUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zdWl0UGlwcy5hZGQoc3VpdFBpcCk7XG4gICAgfVxuXG4gICAgdGhpcy5iYXJlbmFtZSA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLnNob3dPbmx5TGVhcm5lZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5zZXRCYXJlSW1hZ2UoKTtcblxuICAgIHRoaXMuY2x1ZWRCb3JkZXIgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMyxcbiAgICAgICAgeTogMyxcbiAgICAgICAgd2lkdGg6IGNvbmZpZy53aWR0aCAtIDYsXG4gICAgICAgIGhlaWdodDogY29uZmlnLmhlaWdodCAtIDYsXG4gICAgICAgIGNvcm5lclJhZGl1czogNixcbiAgICAgICAgc3Ryb2tlV2lkdGg6IDE2LFxuICAgICAgICBzdHJva2U6ICcjZmZkZjAwJyxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG4gICAgdGhpcy5hZGQodGhpcy5jbHVlZEJvcmRlcik7XG5cbiAgICB0aGlzLmlzQ2x1ZWQgPSBmdW5jdGlvbiBpc0NsdWVkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jbHVlZEJvcmRlci52aXNpYmxlKCk7XG4gICAgfTtcbiAgICB0aGlzLmlzRGlzY2FyZGVkID0gZmFsc2U7XG4gICAgdGhpcy50dXJuRGlzY2FyZGVkID0gbnVsbDtcbiAgICB0aGlzLmlzUGxheWVkID0gZmFsc2U7XG4gICAgdGhpcy50dXJuUGxheWVkID0gbnVsbDtcblxuICAgIHRoaXMuaW5kaWNhdG9yQXJyb3cgPSBuZXcgS2luZXRpYy5UZXh0KHtcbiAgICAgICAgeDogY29uZmlnLndpZHRoICogMS4wMSxcbiAgICAgICAgeTogY29uZmlnLmhlaWdodCAqIDAuMTgsXG4gICAgICAgIHdpZHRoOiBjb25maWcud2lkdGgsXG4gICAgICAgIGhlaWdodDogMC41ICogY29uZmlnLmhlaWdodCxcbiAgICAgICAgZm9udFNpemU6IDAuMiAqIHdpbkgsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICB0ZXh0OiAn4qyGJyxcbiAgICAgICAgcm90YXRpb246IDE4MCxcbiAgICAgICAgZmlsbDogJyNmZmZmZmYnLFxuICAgICAgICBzaGFkb3dDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc2hhZG93Qmx1cjogMTAsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAuOSxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG4gICAgdGhpcy5hZGQodGhpcy5pbmRpY2F0b3JBcnJvdyk7XG5cbiAgICAvLyBEZWZpbmUgdGhlIG5vdGUgaW5kaWNhdG9yIGVtb2ppICh0aGlzIHVzZWQgdG8gYmUgYSB3aGl0ZSBzcXVhcmUpXG4gICAgY29uc3Qgbm90ZVggPSAwLjc4O1xuICAgIGNvbnN0IG5vdGVZID0gMC4wNjtcbiAgICB0aGlzLm5vdGVHaXZlbiA9IG5ldyBLaW5ldGljLlRleHQoe1xuICAgICAgICB4OiBub3RlWCAqIGNvbmZpZy53aWR0aCxcbiAgICAgICAgLy8gSWYgdGhlIGNhcmRzIGhhdmUgdHJpYW5nbGVzIG9uIHRoZSBjb3JuZXJzIHRoYXQgc2hvdyB0aGUgY29sb3IgY29tcG9zaXRpb24sXG4gICAgICAgIC8vIHRoZSBub3RlIGVtb2ppIHdpbGwgb3ZlcmxhcFxuICAgICAgICAvLyBUaHVzLCB3ZSBtb3ZlIGl0IGRvd253YXJkcyBpZiB0aGlzIGlzIHRoZSBjYXNlXG4gICAgICAgIHk6IChnbG9iYWxzLnZhcmlhbnQub2Zmc2V0Q2FyZEluZGljYXRvcnMgPyBub3RlWSArIDAuMSA6IG5vdGVZKSAqIGNvbmZpZy5oZWlnaHQsXG4gICAgICAgIGZvbnRTaXplOiAwLjEgKiBjb25maWcuaGVpZ2h0LFxuICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgIGFsaWduOiAnY2VudGVyJyxcbiAgICAgICAgdGV4dDogJ/Cfk50nLFxuICAgICAgICByb3RhdGlvbjogMTgwLFxuICAgICAgICBmaWxsOiAnI2ZmZmZmZicsXG4gICAgICAgIHNoYWRvd0NvbG9yOiAnYmxhY2snLFxuICAgICAgICBzaGFkb3dCbHVyOiAxMCxcbiAgICAgICAgc2hhZG93T2Zmc2V0OiB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMCxcbiAgICAgICAgfSxcbiAgICAgICAgc2hhZG93T3BhY2l0eTogMC45LFxuICAgICAgICB2aXNpYmxlOiBmYWxzZSxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICB0aGlzLm5vdGVHaXZlbi5zZXRTY2FsZSh7XG4gICAgICAgIHg6IC0xLFxuICAgICAgICB5OiAtMSxcbiAgICB9KTtcbiAgICB0aGlzLm5vdGVHaXZlbi5yb3RhdGVkID0gZmFsc2U7XG4gICAgLy8gKHdlIG1pZ2h0IHJvdGF0ZSBpdCBsYXRlciB0byBpbmRpY2F0ZSB0byBzcGVjdGF0b3JzIHRoYXQgdGhlIG5vdGUgd2FzIHVwZGF0ZWQpXG4gICAgdGhpcy5hZGQodGhpcy5ub3RlR2l2ZW4pO1xuICAgIGlmIChub3Rlcy5nZXQodGhpcy5vcmRlcikpIHtcbiAgICAgICAgdGhpcy5ub3RlR2l2ZW4uc2hvdygpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICAgIERlZmluZSBldmVudCBoYW5kbGVyc1xuICAgICAgICBNdWx0aXBsZSBoYW5kbGVycyBtYXkgc2V0IGFjdGl2ZUhvdmVyXG4gICAgKi9cblxuICAgIHRoaXMub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uIGNhcmRNb3VzZU1vdmUoKSB7XG4gICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIHRoZXJlIGlzIG5vdCBhIG5vdGUgb24gdGhpcyBjYXJkXG4gICAgICAgIGlmICghc2VsZi5ub3RlR2l2ZW4udmlzaWJsZSgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBhcmUgc3BlY3RhdGluZyBhbmQgdGhlcmUgaXMgYW4gbmV3IG5vdGUsIG1hcmsgaXQgYXMgc2VlblxuICAgICAgICBpZiAoc2VsZi5ub3RlR2l2ZW4ucm90YXRlZCkge1xuICAgICAgICAgICAgc2VsZi5ub3RlR2l2ZW4ucm90YXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgc2VsZi5ub3RlR2l2ZW4ucm90YXRlKC0xNSk7XG4gICAgICAgICAgICBnbG9iYWxzLmxheWVycy5jYXJkLmJhdGNoRHJhdygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG9uJ3Qgb3BlbiBhbnkgbW9yZSBub3RlIHRvb2x0aXBzIGlmIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBlZGl0aW5nIGEgbm90ZVxuICAgICAgICBpZiAobm90ZXMudmFycy5lZGl0aW5nICE9PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBnbG9iYWxzLmFjdGl2ZUhvdmVyID0gdGhpcztcbiAgICAgICAgbm90ZXMuc2hvdyhzZWxmKTsgLy8gV2Ugc3VwcGx5IHRoZSBjYXJkIGFzIHRoZSBhcmd1bWVudFxuICAgIH0pO1xuXG4gICAgdGhpcy5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vIERvbid0IGNsb3NlIHRoZSB0b29sdGlwIGlmIHdlIGFyZSBjdXJyZW50bHkgZWRpdGluZyBhIG5vdGVcbiAgICAgICAgaWYgKG5vdGVzLnZhcnMuZWRpdGluZyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9vbHRpcCA9ICQoYCN0b29sdGlwLWNhcmQtJHtzZWxmLm9yZGVyfWApO1xuICAgICAgICB0b29sdGlwLnRvb2x0aXBzdGVyKCdjbG9zZScpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5vbignbW91c2Vtb3ZlIHRhcCcsICgpID0+IHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLnNob3dNYXRjaGVzKHNlbGYpO1xuICAgICAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLnNob3dNYXRjaGVzKG51bGwpO1xuICAgICAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLm9uKCdjbGljayB0YXAnLCB0aGlzLmNsaWNrKTtcbiAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmNsaWNrU3BlZWRydW4pO1xuXG4gICAgLy8gSGlkZSBjbHVlIGFycm93cyBhaGVhZCBvZiB1c2VyIGRyYWdnaW5nIHRoZWlyIGNhcmRcbiAgICBpZiAodGhpcy5ob2xkZXIgPT09IGdsb2JhbHMucGxheWVyVXMgJiYgIWdsb2JhbHMucmVwbGF5ICYmICFnbG9iYWxzLnNwZWN0YXRpbmcpIHtcbiAgICAgICAgdGhpcy5vbignbW91c2Vkb3duJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgZXZlbnQuZXZ0LndoaWNoICE9PSAxIC8vIERyYWdnaW5nIHVzZXMgbGVmdCBjbGlja1xuICAgICAgICAgICAgICAgIHx8IGdsb2JhbHMuaW5SZXBsYXlcbiAgICAgICAgICAgICAgICB8fCAhdGhpcy5pbmRpY2F0b3JBcnJvdy5pc1Zpc2libGUoKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLnNob3dDbHVlTWF0Y2goLTEpO1xuICAgICAgICAgICAgLy8gRG8gbm90IHByZXZlbnQgZGVmYXVsdCBzaW5jZSB0aGVyZSBjYW4gYmUgbW9yZSB0aGFuIG9uZSBtb3VzZWRvd24gZXZlbnRcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgICAgRW1wYXRoeSBmZWF0dXJlXG4gICAgKi9cblxuICAgIC8vIENsaWNrIG9uIGEgdGVhbW1hdGUncyBjYXJkIHRvIGhhdmUgdGhlIGNhcmQgc2hvdyBhcyBpdCB3b3VsZCB0byB0aGF0IHRlYW1tYXRlXG4gICAgLy8gKG9yLCBpbiBhIHJlcGxheSwgc2hvdyB5b3VyIG93biBjYXJkIGFzIGl0IGFwcGVhcmVkIGF0IHRoYXQgbW9tZW50IGluIHRpbWUpXG4gICAgLy8gUGlwcyB2aXNpYmlsaXR5IHN0YXRlIGlzIHRyYWNrZWQgc28gaXQgY2FuIGJlIHJlc3RvcmVkIGZvciB5b3VyIG93biBoYW5kIGR1cmluZyBhIGdhbWVcbiAgICBjb25zdCB0b2dnbGVIb2xkZXJWaWV3T25DYXJkID0gKGMsIGVuYWJsZWQsIHRvZ2dsZVBpcHMpID0+IHtcbiAgICAgICAgY29uc3QgdG9nZ2xlZFBpcHMgPSBbMCwgMF07XG4gICAgICAgIGlmIChjLnJhbmtQaXBzLnZpc2libGUoKSAhPT0gZW5hYmxlZCAmJiB0b2dnbGVQaXBzWzBdID09PSAxKSB7XG4gICAgICAgICAgICBjLnJhbmtQaXBzLnNldFZpc2libGUoZW5hYmxlZCk7XG4gICAgICAgICAgICB0b2dnbGVkUGlwc1swXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGMuc3VpdFBpcHMudmlzaWJsZSgpICE9PSBlbmFibGVkICYmIHRvZ2dsZVBpcHNbMV0gPT09IDEpIHtcbiAgICAgICAgICAgIGMuc3VpdFBpcHMuc2V0VmlzaWJsZShlbmFibGVkKTtcbiAgICAgICAgICAgIHRvZ2dsZWRQaXBzWzFdID0gMTtcbiAgICAgICAgfVxuICAgICAgICBjLnNob3dPbmx5TGVhcm5lZCA9IGVuYWJsZWQ7XG4gICAgICAgIGMuc2V0QmFyZUltYWdlKCk7XG4gICAgICAgIHJldHVybiB0b2dnbGVkUGlwcztcbiAgICB9O1xuXG4gICAgLy8gRHluYW1pY2FsbHkgYWRqdXN0ZWQga25vd24gY2FyZHMsIHRvIGJlIHJlc3RvcmVkIGJ5IGV2ZW50XG4gICAgY29uc3QgdG9nZ2xlZEhvbGRlclZpZXdDYXJkcyA9IFtdO1xuICAgIGNvbnN0IGVuZEhvbGRlclZpZXdPbkNhcmQgPSBmdW5jdGlvbiBlbmRIb2xkZXJWaWV3T25DYXJkKHRvZ2dsZWRQaXBzKSB7XG4gICAgICAgIGNvbnN0IGNhcmRzVG9SZXNldCA9IHRvZ2dsZWRIb2xkZXJWaWV3Q2FyZHMuc3BsaWNlKDAsIHRvZ2dsZWRIb2xkZXJWaWV3Q2FyZHMubGVuZ3RoKTtcbiAgICAgICAgY2FyZHNUb1Jlc2V0Lm1hcChcbiAgICAgICAgICAgIChjYXJkLCBpbmRleCkgPT4gdG9nZ2xlSG9sZGVyVmlld09uQ2FyZChjYXJkLCBmYWxzZSwgdG9nZ2xlZFBpcHNbaW5kZXhdKSxcbiAgICAgICAgKTtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuY2FyZC5iYXRjaERyYXcoKTtcbiAgICB9O1xuICAgIGNvbnN0IGJlZ2luSG9sZGVyVmlld09uQ2FyZCA9IGZ1bmN0aW9uIGJlZ2luSG9sZGVyVmlld09uQ2FyZChjYXJkcykge1xuICAgICAgICBpZiAodG9nZ2xlZEhvbGRlclZpZXdDYXJkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkOyAvLyBIYW5kbGUgcmFjZSBjb25kaXRpb25zIHdpdGggc3RvcFxuICAgICAgICB9XG5cbiAgICAgICAgdG9nZ2xlZEhvbGRlclZpZXdDYXJkcy5zcGxpY2UoMCwgMCwgLi4uY2FyZHMpO1xuICAgICAgICBjb25zdCB0b2dnbGVkUGlwcyA9IGNhcmRzLm1hcChjID0+IHRvZ2dsZUhvbGRlclZpZXdPbkNhcmQoYywgdHJ1ZSwgWzEsIDFdKSk7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLmNhcmQuYmF0Y2hEcmF3KCk7XG4gICAgICAgIHJldHVybiB0b2dnbGVkUGlwcztcbiAgICB9O1xuICAgIGlmICh0aGlzLmhvbGRlciAhPT0gZ2xvYmFscy5wbGF5ZXJVcyB8fCBnbG9iYWxzLmluUmVwbGF5IHx8IGdsb2JhbHMuc3BlY3RhdGluZykge1xuICAgICAgICBjb25zdCBtb3VzZUJ1dHRvbiA9IDE7IC8vIExlZnQtY2xpY2tcbiAgICAgICAgbGV0IHRvZ2dsZWRQaXBzID0gW107XG4gICAgICAgIHRoaXMub24oJ21vdXNlZG93bicsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKGV2ZW50LmV2dC53aGljaCAhPT0gbW91c2VCdXR0b24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpc2FibGUgRW1wYXRoeSBpZiB0aGUgY2FyZCBpcyB0d2VlbmluZ1xuICAgICAgICAgICAgaWYgKHRoaXMudHdlZW5pbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpc2FibGUgRW1wYXRoeSBpZiB0aGUgY2FyZCBpcyBwbGF5ZWQgb3IgZGlzY2FyZGVkXG4gICAgICAgICAgICAvLyAoY2xpY2tpbmcgb24gYSBwbGF5ZWQvZGlzY2FyZGVkIGNhcmQgZ29lcyB0byB0aGUgdHVybiB0aGF0IGl0IHdhcyBwbGF5ZWQvZGlzY2FyZGVkKVxuICAgICAgICAgICAgaWYgKHRoaXMuaXNQbGF5ZWQgfHwgdGhpcy5pc0Rpc2NhcmRlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRW1wYXRoeSBpbiBzcGVlZHJ1bnMgdXNlcyBDdHJsXG4gICAgICAgICAgICBpZiAoZ2xvYmFscy5zcGVlZHJ1biAmJiAhd2luZG93LmV2ZW50LmN0cmxLZXkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpc2FibGUgRW1wYXRoeSBpZiBhbnkgbW9kaWZpZXJzIGFyZSBiZWluZyBoZWxkIGRvd25cbiAgICAgICAgICAgIGlmICghZ2xvYmFscy5zcGVlZHJ1biAmJiB3aW5kb3cuZXZlbnQuY3RybEtleSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3aW5kb3cuZXZlbnQuc2hpZnRLZXkgfHwgd2luZG93LmV2ZW50LmFsdEtleSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IHRoaXM7XG4gICAgICAgICAgICBjb25zdCBjYXJkcyA9IHRoaXMucGFyZW50LnBhcmVudC5jaGlsZHJlbi5tYXAoYyA9PiBjLmNoaWxkcmVuWzBdKTtcbiAgICAgICAgICAgIHRvZ2dsZWRQaXBzID0gYmVnaW5Ib2xkZXJWaWV3T25DYXJkKGNhcmRzKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMub24oJ21vdXNldXAgbW91c2VvdXQnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgIGlmIChldmVudC50eXBlID09PSAnbW91c2V1cCcgJiYgZXZlbnQuZXZ0LndoaWNoICE9PSBtb3VzZUJ1dHRvbikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVuZEhvbGRlclZpZXdPbkNhcmQodG9nZ2xlZFBpcHMpO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEhhbmFiaUNhcmQsIEtpbmV0aWMuR3JvdXApO1xuXG5IYW5hYmlDYXJkLnByb3RvdHlwZS5zZXRCYXJlSW1hZ2UgPSBmdW5jdGlvbiBzZXRCYXJlSW1hZ2UoKSB7XG4gICAgdGhpcy5iYXJlbmFtZSA9IGltYWdlTmFtZSh0aGlzKTtcbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLnNldEluZGljYXRvciA9IGZ1bmN0aW9uIHNldEluZGljYXRvcih2aXNpYmxlLCB0eXBlID0gSU5ESUNBVE9SLlBPU0lUSVZFKSB7XG4gICAgdGhpcy5pbmRpY2F0b3JBcnJvdy5zZXRTdHJva2UoJyMwMDAwMDAnKTtcbiAgICB0aGlzLmluZGljYXRvckFycm93LnNldEZpbGwodHlwZSk7XG4gICAgdGhpcy5pbmRpY2F0b3JBcnJvdy5zZXRWaXNpYmxlKHZpc2libGUpO1xuICAgIHRoaXMuZ2V0TGF5ZXIoKS5iYXRjaERyYXcoKTtcbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmFwcGx5Q2x1ZSA9IGZ1bmN0aW9uIGFwcGx5Q2x1ZShjbHVlLCBwb3NpdGl2ZSkge1xuICAgIGlmIChjbHVlLnR5cGUgPT09IENMVUVfVFlQRS5SQU5LKSB7XG4gICAgICAgIGNvbnN0IGNsdWVSYW5rID0gY2x1ZS52YWx1ZTtcbiAgICAgICAgY29uc3QgZmluZFBpcEVsZW1lbnQgPSByYW5rID0+IHRoaXMucmFua1BpcHMuZmluZChgLiR7cmFua31gKTtcbiAgICAgICAgbGV0IHJlbW92ZWQ7XG4gICAgICAgIGlmIChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdNdWx0aS1GaXZlcycpKSB7XG4gICAgICAgICAgICByZW1vdmVkID0gZmlsdGVySW5QbGFjZShcbiAgICAgICAgICAgICAgICB0aGlzLnBvc3NpYmxlUmFua3MsXG4gICAgICAgICAgICAgICAgcmFuayA9PiAocmFuayA9PT0gY2x1ZVJhbmsgfHwgcmFuayA9PT0gNSkgPT09IHBvc2l0aXZlLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbW92ZWQgPSBmaWx0ZXJJblBsYWNlKFxuICAgICAgICAgICAgICAgIHRoaXMucG9zc2libGVSYW5rcyxcbiAgICAgICAgICAgICAgICByYW5rID0+IChyYW5rID09PSBjbHVlUmFuaykgPT09IHBvc2l0aXZlLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICByZW1vdmVkLmZvckVhY2gocmFuayA9PiBmaW5kUGlwRWxlbWVudChyYW5rKS5oaWRlKCkpO1xuICAgICAgICAvLyBEb24ndCBtYXJrIHVuY2x1ZWQgY2FyZHMgaW4geW91ciBvd24gaGFuZCB3aXRoIHRydWUgc3VpdCBvciByYW5rLCBzbyB0aGF0IHRoZXkgZG9uJ3RcbiAgICAgICAgLy8gZGlzcGxheSBhIG5vbi1ncmV5IGNhcmQgZmFjZVxuICAgICAgICBpZiAodGhpcy5wb3NzaWJsZVJhbmtzLmxlbmd0aCA9PT0gMSAmJiAoIXRoaXMuaXNJblBsYXllckhhbmQoKSB8fCB0aGlzLmlzQ2x1ZWQoKSkpIHtcbiAgICAgICAgICAgIFt0aGlzLnRydWVSYW5rXSA9IHRoaXMucG9zc2libGVSYW5rcztcbiAgICAgICAgICAgIGZpbmRQaXBFbGVtZW50KHRoaXMudHJ1ZVJhbmspLmhpZGUoKTtcbiAgICAgICAgICAgIHRoaXMucmFua1BpcHMuaGlkZSgpO1xuICAgICAgICAgICAgZ2xvYmFscy5sZWFybmVkQ2FyZHNbdGhpcy5vcmRlcl0ucmFuayA9IHRoaXMudHJ1ZVJhbms7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIGxlYXJuZWQgY2FyZCBkYXRhIGlzIG5vdCBvdmVyd3JpdHRlbiB3aXRoIGxlc3MgcmVjZW50IGluZm9ybWF0aW9uXG4gICAgICAgIGZpbHRlckluUGxhY2UoXG4gICAgICAgICAgICBnbG9iYWxzLmxlYXJuZWRDYXJkc1t0aGlzLm9yZGVyXS5wb3NzaWJsZVJhbmtzLFxuICAgICAgICAgICAgcyA9PiB0aGlzLnBvc3NpYmxlUmFua3MuaW5jbHVkZXMocyksXG4gICAgICAgICk7XG4gICAgfSBlbHNlIGlmIChjbHVlLnR5cGUgPT09IENMVUVfVFlQRS5DT0xPUikge1xuICAgICAgICBjb25zdCBjbHVlQ29sb3IgPSBjbHVlLnZhbHVlO1xuICAgICAgICBjb25zdCBmaW5kUGlwRWxlbWVudCA9IHN1aXQgPT4gdGhpcy5zdWl0UGlwcy5maW5kKGAuJHtzdWl0Lm5hbWV9YCk7XG4gICAgICAgIGNvbnN0IHJlbW92ZWQgPSBmaWx0ZXJJblBsYWNlKFxuICAgICAgICAgICAgdGhpcy5wb3NzaWJsZVN1aXRzLFxuICAgICAgICAgICAgc3VpdCA9PiBzdWl0LmNsdWVDb2xvcnMuaW5jbHVkZXMoY2x1ZUNvbG9yKSA9PT0gcG9zaXRpdmUsXG4gICAgICAgICk7XG4gICAgICAgIHJlbW92ZWQuZm9yRWFjaChzdWl0ID0+IGZpbmRQaXBFbGVtZW50KHN1aXQpLmhpZGUoKSk7XG4gICAgICAgIC8vIERvbid0IG1hcmsgdW5jbHVlZCBjYXJkcyBpbiB5b3VyIG93biBoYW5kIHdpdGggdHJ1ZSBzdWl0IG9yIHJhbmssIHNvIHRoYXQgdGhleSBkb24ndFxuICAgICAgICAvLyBkaXNwbGF5IGEgbm9uLWdyZXkgY2FyZCBmYWNlXG4gICAgICAgIGlmICh0aGlzLnBvc3NpYmxlU3VpdHMubGVuZ3RoID09PSAxICYmICghdGhpcy5pc0luUGxheWVySGFuZCgpIHx8IHRoaXMuaXNDbHVlZCgpKSkge1xuICAgICAgICAgICAgW3RoaXMudHJ1ZVN1aXRdID0gdGhpcy5wb3NzaWJsZVN1aXRzO1xuICAgICAgICAgICAgZmluZFBpcEVsZW1lbnQodGhpcy50cnVlU3VpdCkuaGlkZSgpO1xuICAgICAgICAgICAgdGhpcy5zdWl0UGlwcy5oaWRlKCk7XG4gICAgICAgICAgICBnbG9iYWxzLmxlYXJuZWRDYXJkc1t0aGlzLm9yZGVyXS5zdWl0ID0gdGhpcy50cnVlU3VpdDtcbiAgICAgICAgfVxuICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgbGVhcm5lZCBjYXJkIGRhdGEgaXMgbm90IG92ZXJ3cml0dGVuIHdpdGggbGVzcyByZWNlbnQgaW5mb3JtYXRpb25cbiAgICAgICAgZmlsdGVySW5QbGFjZShcbiAgICAgICAgICAgIGdsb2JhbHMubGVhcm5lZENhcmRzW3RoaXMub3JkZXJdLnBvc3NpYmxlU3VpdHMsXG4gICAgICAgICAgICBzID0+IHRoaXMucG9zc2libGVTdWl0cy5pbmNsdWRlcyhzKSxcbiAgICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdDbHVlIHR5cGUgaW52YWxpZC4nKTtcbiAgICB9XG59O1xuXG5IYW5hYmlDYXJkLnByb3RvdHlwZS5oaWRlQ2x1ZXMgPSBmdW5jdGlvbiBoaWRlQ2x1ZXMoKSB7XG4gICAgdGhpcy5jbHVlZEJvcmRlci5oaWRlKCk7XG59O1xuXG5IYW5hYmlDYXJkLnByb3RvdHlwZS5pc0luUGxheWVySGFuZCA9IGZ1bmN0aW9uIGlzSW5QbGF5ZXJIYW5kKCkge1xuICAgIHJldHVybiBnbG9iYWxzLmVsZW1lbnRzLnBsYXllckhhbmRzLmluZGV4T2YodGhpcy5wYXJlbnQucGFyZW50KSAhPT0gLTE7XG59O1xuXG5IYW5hYmlDYXJkLnByb3RvdHlwZS50b2dnbGVTaGFyZWRSZXBsYXlJbmRpY2F0b3IgPSBmdW5jdGlvbiBzZXRTaGFyZWRSZXBsYXlJbmRpY2F0b3IoKSB7XG4gICAgLy8gRWl0aGVyIHNob3cgb3IgaGlkZSB0aGUgYXJyb3cgKGlmIGl0IGlzIGFscmVhZHkgdmlzaWJsZSlcbiAgICBjb25zdCB2aXNpYmxlID0gIShcbiAgICAgICAgdGhpcy5pbmRpY2F0b3JBcnJvdy52aXNpYmxlKClcbiAgICAgICAgJiYgdGhpcy5pbmRpY2F0b3JBcnJvdy5nZXRGaWxsKCkgPT09IGNvbnN0YW50cy5JTkRJQ0FUT1IuUkVQTEFZX0xFQURFUlxuICAgICk7XG4gICAgLy8gKGlmIHRoZSBhcnJvdyBpcyBzaG93aW5nIGJ1dCBpcyBhIGRpZmZlcmVudCBraW5kIG9mIGFycm93LFxuICAgIC8vIHRoZW4ganVzdCBvdmVyd3JpdGUgdGhlIGV4aXN0aW5nIGFycm93KVxuICAgIGdsb2JhbHMubG9iYnkudWkuc2hvd0NsdWVNYXRjaCgtMSk7XG4gICAgdGhpcy5zZXRJbmRpY2F0b3IodmlzaWJsZSwgY29uc3RhbnRzLklORElDQVRPUi5SRVBMQVlfTEVBREVSKTtcbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrID0gZnVuY3Rpb24gY2xpY2soZXZlbnQpIHtcbiAgICAvLyBEaXNhYmxlIGFsbCBjbGljayBldmVudHMgaWYgdGhlIGNhcmQgaXMgdHdlZW5pbmdcbiAgICBpZiAodGhpcy50d2VlbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gU3BlZWRydW5uaW5nIG92ZXJyaWRlcyB0aGUgbm9ybWFsIGNhcmQgY2xpY2tpbmcgYmVoYXZpb3JcbiAgICAvLyAoYnV0IGRvbid0IHVzZSB0aGUgc3BlZWRydW5uaW5nIGJlaGF2aW9yIGlmIHdlIGFyZSBpbiBhIHNvbG8gb3Igc2hhcmVkIHJlcGxheSlcbiAgICBpZiAoZ2xvYmFscy5zcGVlZHJ1biAmJiAhZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChldmVudC5ldnQud2hpY2ggPT09IDEpIHsgLy8gTGVmdC1jbGlja1xuICAgICAgICB0aGlzLmNsaWNrTGVmdCgpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQuZXZ0LndoaWNoID09PSAzKSB7IC8vIFJpZ2h0LWNsaWNrXG4gICAgICAgIHRoaXMuY2xpY2tSaWdodCgpO1xuICAgIH1cbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrTGVmdCA9IGZ1bmN0aW9uIGNsaWNrTGVmdCgpIHtcbiAgICAvLyBUaGUgXCJFbXBhdGh5XCIgZmVhdHVyZSBpcyBoYW5kbGVkIGFib3ZlLCBzbyB3ZSBkb24ndCBoYXZlIHRvIHdvcnJ5IGFib3V0IGl0IGhlcmVcbiAgICBpZiAodGhpcy5pc1BsYXllZCkge1xuICAgICAgICAvLyBDbGlja2luZyBvbiBwbGF5ZWQgY2FyZHMgZ29lcyB0byB0aGUgdHVybiB0aGF0IHRoZXkgd2VyZSBwbGF5ZWRcbiAgICAgICAgaWYgKGdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgICAgICByZXBsYXkuY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcGxheS5lbnRlcigpO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxheS5nb3RvKHRoaXMudHVyblBsYXllZCArIDEsIHRydWUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5pc0Rpc2NhcmRlZCkge1xuICAgICAgICAvLyBDbGlja2luZyBvbiBkaXNjYXJkZWQgY2FyZHMgZ29lcyB0byB0aGUgdHVybiB0aGF0IHRoZXkgd2VyZSBkaXNjYXJkZWRcbiAgICAgICAgaWYgKGdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgICAgICByZXBsYXkuY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcGxheS5lbnRlcigpO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxheS5nb3RvKHRoaXMudHVybkRpc2NhcmRlZCArIDEsIHRydWUpO1xuICAgIH1cbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrUmlnaHQgPSBmdW5jdGlvbiBjbGlja1JpZ2h0KCkge1xuICAgIC8vIEN0cmwgKyBzaGlmdCArIGFsdCArIHJpZ2h0LWNsaWNrIGlzIGEgY2FyZCBtb3JwaFxuICAgIGlmICh3aW5kb3cuZXZlbnQuY3RybEtleSAmJiB3aW5kb3cuZXZlbnQuc2hpZnRLZXkgJiYgd2luZG93LmV2ZW50LmFsdEtleSkge1xuICAgICAgICB0aGlzLmNsaWNrTW9ycGgoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJpZ2h0LWNsaWNrIGZvciBhIGxlYWRlciBpbiBhIHNoYXJlZCByZXBsYXkgaXMgYW4gYXJyb3dcbiAgICBpZiAoXG4gICAgICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5XG4gICAgICAgICYmIGdsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyID09PSBnbG9iYWxzLmxvYmJ5LnVzZXJuYW1lXG4gICAgICAgICYmIGdsb2JhbHMudXNlU2hhcmVkVHVybnNcbiAgICApIHtcbiAgICAgICAgdGhpcy5jbGlja0Fycm93KCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDdHJsICsgc2hpZnQgKyByaWdodC1jbGljayBpcyBhIHNob3J0Y3V0IGZvciBlbnRlcmluZyB0aGUgc2FtZSBub3RlIGFzIHByZXZpb3VzbHkgZW50ZXJlZFxuICAgIC8vICh0aGlzIG11c3QgYmUgYWJvdmUgdGhlIG90aGVyIG5vdGUgY29kZSBiZWNhdXNlIG9mIHRoZSBtb2RpZmllcnMpXG4gICAgaWYgKHdpbmRvdy5ldmVudC5jdHJsS2V5ICYmIHdpbmRvdy5ldmVudC5zaGlmdEtleSkge1xuICAgICAgICB0aGlzLnNldE5vdGUobm90ZXMudmFycy5sYXN0Tm90ZSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTaGZpdCArIHJpZ2h0LWNsaWNrIGlzIGEgXCJmXCIgbm90ZVxuICAgIC8vICh0aGlzIGlzIGEgY29tbW9uIGFiYnJldmlhdGlvbiBmb3IgXCJ0aGlzIGNhcmQgaXMgRmluZXNzZWRcIilcbiAgICBpZiAod2luZG93LmV2ZW50LnNoaWZ0S2V5KSB7XG4gICAgICAgIHRoaXMuc2V0Tm90ZSgnZicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQWx0ICsgcmlnaHQtY2xpY2sgaXMgYSBcImNtXCIgbm90ZVxuICAgIC8vICh0aGlzIGlzIGEgY29tbW9uIGFiYnJldmlhdGlvbiBmb3IgXCJ0aGlzIGNhcmQgaXMgY2hvcCBtb3ZlZFwiKVxuICAgIGlmICh3aW5kb3cuZXZlbnQuYWx0S2V5KSB7XG4gICAgICAgIHRoaXMuc2V0Tm90ZSgnY20nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEN0cmwgKyByaWdodC1jbGljayBpcyBhIGxvY2FsIGFycm93XG4gICAgLy8gKHdlIGRvbid0IHdhbnQgdGhpcyBmdW5jdGlvbmFsaXR5IGluIHNoYXJlZCByZXBsYXlzIGJlY2F1c2VcbiAgICAvLyBpdCBjb3VsZCBiZSBtaXNsZWFkaW5nIGFzIHRvIHdobyB0aGUgcmVhbCByZXBsYXkgbGVhZGVyIGlzKVxuICAgIGlmICh3aW5kb3cuZXZlbnQuY3RybEtleSAmJiBnbG9iYWxzLnNoYXJlZFJlcGxheSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhpcy5jbGlja0Fycm93TG9jYWwoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEEgbm9ybWFsIHJpZ2h0LWNsaWNrIGlzIGVkaXQgYSBub3RlXG4gICAgbm90ZXMub3BlbkVkaXRUb29sdGlwKHRoaXMpO1xufTtcblxuSGFuYWJpQ2FyZC5wcm90b3R5cGUuY2xpY2tBcnJvdyA9IGZ1bmN0aW9uIGNsaWNrQXJyb3coKSB7XG4gICAgLy8gSW4gYSBzaGFyZWQgcmVwbGF5LCB0aGUgbGVhZGVyIHJpZ2h0LWNsaWNrcyBhIGNhcmQgdG8gZHJhdyBvbiBhcnJvdyBvbiBpdCB0byBhdHRlbnRpb24gdG8gaXRcbiAgICAvLyAoYW5kIGl0IGlzIHNob3duIHRvIGFsbCBvZiB0aGUgcGxheWVycyBpbiB0aGUgcmV2aWV3KVxuICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKCdyZXBsYXlBY3Rpb24nLCB7XG4gICAgICAgIHR5cGU6IGNvbnN0YW50cy5SRVBMQVlfQUNUSU9OX1RZUEUuQVJST1csXG4gICAgICAgIG9yZGVyOiB0aGlzLm9yZGVyLFxuICAgIH0pO1xuXG4gICAgLy8gRHJhdyB0aGUgaW5kaWNhdG9yIG1hbnVhbGx5IHNvIHRoYXQgd2UgZG9uJ3QgaGF2ZSB0byB3YWl0IGZvciB0aGUgY2xpZW50IHRvIHNlcnZlciByb3VuZC10cmlwXG4gICAgdGhpcy50b2dnbGVTaGFyZWRSZXBsYXlJbmRpY2F0b3IoKTtcbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrQXJyb3dMb2NhbCA9IGZ1bmN0aW9uIGNsaWNrQXJyb3dMb2NhbCgpIHtcbiAgICAvLyBFdmVuIGlmIHRoZXkgYXJlIG5vdCBhIGxlYWRlciBpbiBhIHNoYXJlZCByZXBsYXksXG4gICAgLy8gYSB1c2VyIG1pZ2h0IHN0aWxsIHdhbnQgdG8gZHJhdyBhbiBhcnJvdyBvbiBhIGNhcmQgZm9yIGRlbW9uc3RyYXRpb24gcHVycG9zZXNcbiAgICB0aGlzLnRvZ2dsZVNoYXJlZFJlcGxheUluZGljYXRvcigpO1xufTtcblxuLy8gTW9ycGhpbmcgY2FyZHMgYWxsb3dzIGZvciBjcmVhdGlvbiBvZiBoeXBvdGhldGljYWwgc2l0dWF0aW9uc1xuSGFuYWJpQ2FyZC5wcm90b3R5cGUuY2xpY2tNb3JwaCA9IGZ1bmN0aW9uIGNsaWNrTW9ycGgoKSB7XG4gICAgLy8gT25seSBhbGxvdyB0aGlzIGZlYXR1cmUgaW4gcmVwbGF5c1xuICAgIGlmICghZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNhcmQgPSBwcm9tcHQoJ1doYXQgY2FyZCBkbyB5b3Ugd2FudCB0byBtb3JwaCBpdCBpbnRvP1xcbihlLmcuIFwiYjFcIiwgXCJrMlwiLCBcIm0zXCIsIFwiMTFcIiwgXCI2NVwiKScpO1xuICAgIGlmIChjYXJkID09PSBudWxsIHx8IGNhcmQubGVuZ3RoICE9PSAyKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3VpdExldHRlciA9IGNhcmRbMF07XG4gICAgbGV0IHN1aXQ7XG4gICAgaWYgKHN1aXRMZXR0ZXIgPT09ICdiJyB8fCBzdWl0TGV0dGVyID09PSAnMScpIHtcbiAgICAgICAgc3VpdCA9IDA7XG4gICAgfSBlbHNlIGlmIChzdWl0TGV0dGVyID09PSAnZycgfHwgc3VpdExldHRlciA9PT0gJzInKSB7XG4gICAgICAgIHN1aXQgPSAxO1xuICAgIH0gZWxzZSBpZiAoc3VpdExldHRlciA9PT0gJ3knIHx8IHN1aXRMZXR0ZXIgPT09ICczJykge1xuICAgICAgICBzdWl0ID0gMjtcbiAgICB9IGVsc2UgaWYgKHN1aXRMZXR0ZXIgPT09ICdyJyB8fCBzdWl0TGV0dGVyID09PSAnNCcpIHtcbiAgICAgICAgc3VpdCA9IDM7XG4gICAgfSBlbHNlIGlmIChzdWl0TGV0dGVyID09PSAncCcgfHwgc3VpdExldHRlciA9PT0gJzUnKSB7XG4gICAgICAgIHN1aXQgPSA0O1xuICAgIH0gZWxzZSBpZiAoc3VpdExldHRlciA9PT0gJ2snIHx8IHN1aXRMZXR0ZXIgPT09ICdtJyB8fCBzdWl0TGV0dGVyID09PSAnNicpIHtcbiAgICAgICAgc3VpdCA9IDU7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByYW5rID0gcGFyc2VJbnQoY2FyZFsxXSwgMTApO1xuICAgIGlmIChOdW1iZXIuaXNOYU4ocmFuaykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFRlbGwgdGhlIHNlcnZlciB0aGF0IHdlIGFyZSBkb2luZyBhIGh5cG90aGV0aWNhbFxuICAgIGlmIChnbG9iYWxzLnNoYXJlZFJlcGxheUxlYWRlciA9PT0gZ2xvYmFscy5sb2JieS51c2VybmFtZSkge1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZCgncmVwbGF5QWN0aW9uJywge1xuICAgICAgICAgICAgdHlwZTogY29uc3RhbnRzLlJFUExBWV9BQ1RJT05fVFlQRS5NT1JQSCxcbiAgICAgICAgICAgIG9yZGVyOiB0aGlzLm9yZGVyLFxuICAgICAgICAgICAgc3VpdCxcbiAgICAgICAgICAgIHJhbmssXG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrU3BlZWRydW4gPSBmdW5jdGlvbiBjbGlja1NwZWVkcnVuKGV2ZW50KSB7XG4gICAgLy8gU3BlZWRydW5uaW5nIG92ZXJyaWRlcyB0aGUgbm9ybWFsIGNhcmQgY2xpY2tpbmcgYmVoYXZpb3JcbiAgICAvLyAoYnV0IGRvbid0IHVzZSB0aGUgc3BlZWRydW5uaW5nIGJlaGF2aW9yIGlmIHdlIGFyZSBpbiBhIHNvbG8gb3Igc2hhcmVkIHJlcGxheSlcbiAgICBpZiAoIWdsb2JhbHMuc3BlZWRydW4gfHwgZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIERvIG5vdGhpbmcgaWYgd2UgYWNjaWRlbnRhbGx5IGNsaWNrIG9uIGEgcGxheWVkL2Rpc2NhcmRlZCBjYXJkXG4gICAgaWYgKHRoaXMuaXNQbGF5ZWQgfHwgdGhpcy5pc0Rpc2NhcmRlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmV2dC53aGljaCA9PT0gMSkgeyAvLyBMZWZ0LWNsaWNrXG4gICAgICAgIHRoaXMuY2xpY2tTcGVlZHJ1bkxlZnQoKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LmV2dC53aGljaCA9PT0gMykgeyAvLyBSaWdodC1jbGlja1xuICAgICAgICB0aGlzLmNsaWNrU3BlZWRydW5SaWdodCgpO1xuICAgIH1cbn07XG5cbkhhbmFiaUNhcmQucHJvdG90eXBlLmNsaWNrU3BlZWRydW5MZWZ0ID0gZnVuY3Rpb24gY2xpY2tTcGVlZHJ1bkxlZnQoKSB7XG4gICAgLy8gTGVmdC1jbGlja2luZyBvbiBjYXJkcyBpbiBvdXIgb3duIGhhbmQgaXMgYSBwbGF5IGFjdGlvblxuICAgIGlmICh0aGlzLmhvbGRlciA9PT0gZ2xvYmFscy5wbGF5ZXJVcykge1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmVuZFR1cm4oe1xuICAgICAgICAgICAgdHlwZTogJ2FjdGlvbicsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogY29uc3RhbnRzLkFDVC5QTEFZLFxuICAgICAgICAgICAgICAgIHRhcmdldDogdGhpcy5vcmRlcixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gTGVmdC1jbGlja2luZyBvbiBjYXJkcyBpbiBvdGhlciBwZW9wbGUncyBoYW5kcyBpcyBhIGNvbG9yIGNsdWUgYWN0aW9uXG4gICAgLy8gKGJ1dCBpZiB3ZSBhcmUgaG9sZGluZyBDdHJsLCB0aGVuIHdlIGFyZSB1c2luZyBFbXBhdGh5KVxuICAgIGlmICh3aW5kb3cuZXZlbnQuY3RybEtleSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChnbG9iYWxzLmNsdWVzICE9PSAwKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gdGhpcy50cnVlU3VpdC5jbHVlQ29sb3JzWzBdO1xuICAgICAgICBjb25zdCBjb2xvcnMgPSBnbG9iYWxzLnZhcmlhbnQuY2x1ZUNvbG9ycztcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb2xvcnMuZmluZEluZGV4KHZhcmlhbnRDbHVlQ29sb3IgPT4gdmFyaWFudENsdWVDb2xvciA9PT0gY29sb3IpO1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmVuZFR1cm4oe1xuICAgICAgICAgICAgdHlwZTogJ2FjdGlvbicsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogY29uc3RhbnRzLkFDVC5DTFVFLFxuICAgICAgICAgICAgICAgIHRhcmdldDogdGhpcy5ob2xkZXIsXG4gICAgICAgICAgICAgICAgY2x1ZToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb25zdGFudHMuQ0xVRV9UWVBFLkNPTE9SLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfVxufTtcblxuSGFuYWJpQ2FyZC5wcm90b3R5cGUuY2xpY2tTcGVlZHJ1blJpZ2h0ID0gZnVuY3Rpb24gY2xpY2tTcGVlZHJ1blJpZ2h0KCkge1xuICAgIC8vIFNoZml0ICsgcmlnaHQtY2xpY2sgaXMgYSBcImZcIiBub3RlXG4gICAgLy8gKHRoaXMgaXMgYSBjb21tb24gYWJicmV2aWF0aW9uIGZvciBcInRoaXMgY2FyZCBpcyBGaW5lc3NlZFwiKVxuICAgIGlmICh3aW5kb3cuZXZlbnQuc2hpZnRLZXkpIHtcbiAgICAgICAgdGhpcy5zZXROb3RlKCdmJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBBbHQgKyByaWdodC1jbGljayBpcyBhIFwiY21cIiBub3RlXG4gICAgLy8gKHRoaXMgaXMgYSBjb21tb24gYWJicmV2aWF0aW9uIGZvciBcInRoaXMgY2FyZCBpcyBjaG9wIG1vdmVkXCIpXG4gICAgaWYgKHdpbmRvdy5ldmVudC5hbHRLZXkpIHtcbiAgICAgICAgdGhpcy5zZXROb3RlKCdjbScpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmlnaHQtY2xpY2tpbmcgb24gY2FyZHMgaW4gb3VyIG93biBoYW5kIGlzIGEgZGlzY2FyZCBhY3Rpb25cbiAgICBpZiAodGhpcy5ob2xkZXIgPT09IGdsb2JhbHMucGxheWVyVXMpIHtcbiAgICAgICAgLy8gUHJldmVudCBkaXNjYXJkaW5nIHdoaWxlIGF0IDggY2x1ZXNcbiAgICAgICAgaWYgKGdsb2JhbHMuY2x1ZXMgPT09IDgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmVuZFR1cm4oe1xuICAgICAgICAgICAgdHlwZTogJ2FjdGlvbicsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogY29uc3RhbnRzLkFDVC5ESVNDQVJELFxuICAgICAgICAgICAgICAgIHRhcmdldDogdGhpcy5vcmRlcixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmlnaHQtY2xpY2tpbmcgb24gY2FyZHMgaW4gb3RoZXIgcGVvcGxlJ3MgaGFuZHMgaXMgYSBudW1iZXIgY2x1ZSBhY3Rpb25cbiAgICBpZiAoZ2xvYmFscy5jbHVlcyAhPT0gMCkge1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmVuZFR1cm4oe1xuICAgICAgICAgICAgdHlwZTogJ2FjdGlvbicsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogY29uc3RhbnRzLkFDVC5DTFVFLFxuICAgICAgICAgICAgICAgIHRhcmdldDogdGhpcy5ob2xkZXIsXG4gICAgICAgICAgICAgICAgY2x1ZToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBjb25zdGFudHMuQ0xVRV9UWVBFLlJBTkssXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB0aGlzLnRydWVSYW5rLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5IYW5hYmlDYXJkLnByb3RvdHlwZS5zZXROb3RlID0gZnVuY3Rpb24gc2V0Tm90ZShub3RlKSB7XG4gICAgbm90ZXMuc2V0KHRoaXMub3JkZXIsIG5vdGUpO1xuICAgIG5vdGVzLnVwZGF0ZSh0aGlzKTtcbiAgICBub3Rlcy5zaG93KHRoaXMpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIYW5hYmlDYXJkO1xuXG4vKlxuICAgIE1pc2MuIGZ1bmN0aW9uc1xuKi9cblxuY29uc3QgaW1hZ2VOYW1lID0gKGNhcmQpID0+IHtcbiAgICBsZXQgcHJlZml4ID0gJ0NhcmQnO1xuXG4gICAgY29uc3QgbGVhcm5lZENhcmQgPSBnbG9iYWxzLmxlYXJuZWRDYXJkc1tjYXJkLm9yZGVyXTtcblxuICAgIGNvbnN0IHJhbmsgPSAoIWNhcmQuc2hvd09ubHlMZWFybmVkICYmIGNhcmQudHJ1ZVJhbmspO1xuICAgIGNvbnN0IGVtcGF0aHlQYXN0UmFua1VuY2VydGFpbiA9IGNhcmQuc2hvd09ubHlMZWFybmVkICYmIGNhcmQucG9zc2libGVSYW5rcy5sZW5ndGggPiAxO1xuXG4gICAgY29uc3Qgc3VpdCA9ICghY2FyZC5zaG93T25seUxlYXJuZWQgJiYgY2FyZC50cnVlU3VpdCk7XG4gICAgY29uc3QgZW1wYXRoeVBhc3RTdWl0VW5jZXJ0YWluID0gY2FyZC5zaG93T25seUxlYXJuZWQgJiYgY2FyZC5wb3NzaWJsZVN1aXRzLmxlbmd0aCA+IDE7XG5cbiAgICBsZXQgc3VpdFRvU2hvdyA9IHN1aXQgfHwgbGVhcm5lZENhcmQuc3VpdCB8fCBTVUlULkdSQVk7XG4gICAgaWYgKGVtcGF0aHlQYXN0U3VpdFVuY2VydGFpbikge1xuICAgICAgICBzdWl0VG9TaG93ID0gU1VJVC5HUkFZO1xuICAgIH1cblxuICAgIC8vIEZvciB3aGF0ZXZlciByZWFzb24sIENhcmQtR3JheSBpcyBuZXZlciBjcmVhdGVkLCBzbyB1c2UgTm9QaXAtR3JheVxuICAgIGlmIChzdWl0VG9TaG93ID09PSBTVUlULkdSQVkpIHtcbiAgICAgICAgcHJlZml4ID0gJ05vUGlwJztcbiAgICB9XG5cbiAgICBsZXQgbmFtZSA9IGAke3ByZWZpeH0tJHtzdWl0VG9TaG93Lm5hbWV9LWA7XG4gICAgaWYgKGVtcGF0aHlQYXN0UmFua1VuY2VydGFpbikge1xuICAgICAgICBuYW1lICs9ICc2JztcbiAgICB9IGVsc2Uge1xuICAgICAgICBuYW1lICs9IHJhbmsgfHwgbGVhcm5lZENhcmQucmFuayB8fCAnNic7XG4gICAgfVxuICAgIHJldHVybiBuYW1lO1xufTtcblxuY29uc3QgZmlsdGVySW5QbGFjZSA9ICh2YWx1ZXMsIHByZWRpY2F0ZSkgPT4ge1xuICAgIGNvbnN0IHJlbW92ZWQgPSBbXTtcbiAgICBsZXQgaSA9IHZhbHVlcy5sZW5ndGggLSAxO1xuICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgICAgaWYgKCFwcmVkaWNhdGUodmFsdWVzW2ldLCBpKSkge1xuICAgICAgICAgICAgcmVtb3ZlZC51bnNoaWZ0KHZhbHVlcy5zcGxpY2UoaSwgMSlbMF0pO1xuICAgICAgICB9XG4gICAgICAgIGkgLT0gMTtcbiAgICB9XG4gICAgcmV0dXJuIHJlbW92ZWQ7XG59O1xuIiwiLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5jb25zdCBMYXlvdXRDaGlsZCA9IHJlcXVpcmUoJy4vbGF5b3V0Q2hpbGQnKTtcbmNvbnN0IG1pc2MgPSByZXF1aXJlKCcuLi8uLi9taXNjJyk7XG5jb25zdCByZXBsYXkgPSByZXF1aXJlKCcuL3JlcGxheScpO1xuXG5jb25zdCBDYXJkRGVjayA9IGZ1bmN0aW9uIENhcmREZWNrKGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgdGhpcy5jYXJkYmFjayA9IG5ldyBLaW5ldGljLkltYWdlKHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IHRoaXMuZ2V0V2lkdGgoKSxcbiAgICAgICAgaGVpZ2h0OiB0aGlzLmdldEhlaWdodCgpLFxuICAgICAgICBpbWFnZTogZ2xvYmFscy5jYXJkSW1hZ2VzW2NvbmZpZy5jYXJkYmFja10sXG4gICAgfSk7XG4gICAgdGhpcy5hZGQodGhpcy5jYXJkYmFjayk7XG5cbiAgICB0aGlzLmNhcmRiYWNrLm9uKCdkcmFnZW5kLnBsYXknLCBmdW5jdGlvbiBkcmFnZW5kUGxheSgpIHtcbiAgICAgICAgY29uc3QgcG9zID0gdGhpcy5nZXRBYnNvbHV0ZVBvc2l0aW9uKCk7XG5cbiAgICAgICAgcG9zLnggKz0gdGhpcy5nZXRXaWR0aCgpICogdGhpcy5nZXRTY2FsZVgoKSAvIDI7XG4gICAgICAgIHBvcy55ICs9IHRoaXMuZ2V0SGVpZ2h0KCkgKiB0aGlzLmdldFNjYWxlWSgpIC8gMjtcblxuICAgICAgICBpZiAoZ2xvYmFscy5lbGVtZW50cy5wbGF5QXJlYS5pc092ZXIocG9zKSkge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byByZW1vdmUgdGhlIGNhcmQgZnJvbSB0aGUgc2NyZWVuIG9uY2UgdGhlIGFuaW1hdGlvbiBpcyBmaW5pc2hlZFxuICAgICAgICAgICAgLy8gKG90aGVyd2lzZSwgdGhlIGNhcmQgd2lsbCBiZSBzdHVjayBpbiB0aGUgaW4tZ2FtZSByZXBsYXkpXG4gICAgICAgICAgICBnbG9iYWxzLnBvc3RBbmltYXRpb25MYXlvdXQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJlbnQuZG9MYXlvdXQoKTtcbiAgICAgICAgICAgICAgICBnbG9iYWxzLnBvc3RBbmltYXRpb25MYXlvdXQgPSBudWxsO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5zZXREcmFnZ2FibGUoZmFsc2UpO1xuICAgICAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5kZWNrUGxheUF2YWlsYWJsZUxhYmVsLnNldFZpc2libGUoZmFsc2UpO1xuXG4gICAgICAgICAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZCgnYWN0aW9uJywge1xuICAgICAgICAgICAgICAgIHR5cGU6IGNvbnN0YW50cy5BQ1QuREVDS1BMQVksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZ2xvYmFscy5sb2JieS51aS5zdG9wQWN0aW9uKCk7XG5cbiAgICAgICAgICAgIGdsb2JhbHMuc2F2ZWRBY3Rpb24gPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhlIGRlY2sgd2FzIGRyYWdnZWQgdG8gYW4gaW52YWxpZCBsb2NhdGlvbixcbiAgICAgICAgICAgIC8vIHNvIGFuaW1hdGUgdGhlIGNhcmQgYmFjayB0byB3aGVyZSBpdCB3YXNcbiAgICAgICAgICAgIG5ldyBLaW5ldGljLlR3ZWVuKHtcbiAgICAgICAgICAgICAgICBub2RlOiB0aGlzLFxuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiAwLjUsXG4gICAgICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgICAgICB5OiAwLFxuICAgICAgICAgICAgICAgIHJ1bm9uY2U6IHRydWUsXG4gICAgICAgICAgICAgICAgb25GaW5pc2g6ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMuVUkuZHJhdygpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KS5wbGF5KCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuY2FyZGJhY2sub24oJ2NsaWNrJywgcmVwbGF5LnByb21wdFR1cm4pO1xuXG4gICAgdGhpcy5jb3VudCA9IG5ldyBLaW5ldGljLlRleHQoe1xuICAgICAgICBmaWxsOiAnd2hpdGUnLFxuICAgICAgICBzdHJva2U6ICdibGFjaycsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAxLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAuMyAqIHRoaXMuZ2V0SGVpZ2h0KCksXG4gICAgICAgIHdpZHRoOiB0aGlzLmdldFdpZHRoKCksXG4gICAgICAgIGhlaWdodDogMC40ICogdGhpcy5nZXRIZWlnaHQoKSxcbiAgICAgICAgZm9udFNpemU6IDAuNCAqIHRoaXMuZ2V0SGVpZ2h0KCksXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgZm9udFN0eWxlOiAnYm9sZCcsXG4gICAgICAgIHRleHQ6ICcwJyxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZCh0aGlzLmNvdW50KTtcblxuICAgIC8vIElmIHRoZSB1c2VyIGhvdmVycyBvdmVyIHRoZSBkZWNrLCBzaG93IGEgdG9vbHRpcCB0aGF0IHNob3dzIGV4dHJhIGdhbWUgb3B0aW9ucywgaWYgYW55XG4gICAgdGhpcy5pbml0VG9vbHRpcCgpO1xuICAgIHRoaXMub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uIG1vdXNlTW92ZSgpIHtcbiAgICAgICAgaWYgKGdsb2JhbHMuZWxlbWVudHMuZGVja1BsYXlBdmFpbGFibGVMYWJlbC5pc1Zpc2libGUoKSkge1xuICAgICAgICAgICAgLy8gRGlzYWJsZSB0aGUgdG9vbHRpcCBpZiB0aGUgdXNlciBtaWdodCBiZSBkcmFnZ2luZyB0aGUgZGVja1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9vbHRpcCA9ICQoJyN0b29sdGlwLWRlY2snKTtcbiAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IHRoaXM7XG4gICAgICAgIGNvbnN0IHRvb2x0aXBYID0gdGhpcy5nZXRXaWR0aCgpIC8gMiArIHRoaXMuYXR0cnMueDtcbiAgICAgICAgdG9vbHRpcC5jc3MoJ2xlZnQnLCB0b29sdGlwWCk7XG4gICAgICAgIHRvb2x0aXAuY3NzKCd0b3AnLCB0aGlzLmF0dHJzLnkpO1xuICAgICAgICB0b29sdGlwLnRvb2x0aXBzdGVyKCdvcGVuJyk7XG4gICAgfSk7XG4gICAgdGhpcy5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgICQoJyN0b29sdGlwLWRlY2snKS50b29sdGlwc3RlcignY2xvc2UnKTtcbiAgICB9KTtcbn07XG5cbktpbmV0aWMuVXRpbC5leHRlbmQoQ2FyZERlY2ssIEtpbmV0aWMuR3JvdXApO1xuXG5DYXJkRGVjay5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKGNoaWxkKSB7XG4gICAgS2luZXRpYy5Hcm91cC5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgY2hpbGQpO1xuXG4gICAgaWYgKCEoY2hpbGQgaW5zdGFuY2VvZiBMYXlvdXRDaGlsZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChnbG9iYWxzLmFuaW1hdGVGYXN0KSB7XG4gICAgICAgIGNoaWxkLnJlbW92ZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2hpbGQudHdlZW4gPSBuZXcgS2luZXRpYy5Ud2Vlbih7XG4gICAgICAgIG5vZGU6IGNoaWxkLFxuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICBzY2FsZVg6IDAuMDEsXG4gICAgICAgIHNjYWxlWTogMC4wMSxcbiAgICAgICAgcm90YXRpb246IDAsXG4gICAgICAgIGR1cmF0aW9uOiAwLjUsXG4gICAgICAgIHJ1bm9uY2U6IHRydWUsXG4gICAgfSkucGxheSgpO1xuXG4gICAgY2hpbGQudHdlZW4ub25GaW5pc2ggPSAoKSA9PiB7XG4gICAgICAgIGlmIChjaGlsZC5wYXJlbnQgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIGNoaWxkLnJlbW92ZSgpO1xuICAgICAgICB9XG4gICAgfTtcbn07XG5cbkNhcmREZWNrLnByb3RvdHlwZS5zZXRDYXJkQmFjayA9IGZ1bmN0aW9uIHNldENhcmRCYWNrKGNhcmRiYWNrKSB7XG4gICAgdGhpcy5jYXJkYmFjay5zZXRJbWFnZShnbG9iYWxzLkltYWdlTG9hZGVyLmdldChjYXJkYmFjaykpO1xufTtcblxuQ2FyZERlY2sucHJvdG90eXBlLnNldENvdW50ID0gZnVuY3Rpb24gc2V0Q291bnQoY291bnQpIHtcbiAgICB0aGlzLmNvdW50LnNldFRleHQoY291bnQudG9TdHJpbmcoKSk7XG5cbiAgICB0aGlzLmNhcmRiYWNrLnNldFZpc2libGUoY291bnQgPiAwKTtcbn07XG5cbkNhcmREZWNrLnByb3RvdHlwZS5kb0xheW91dCA9IGZ1bmN0aW9uIGRvTGF5b3V0KCkge1xuICAgIHRoaXMuY2FyZGJhY2suc2V0UG9zaXRpb24oe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgIH0pO1xufTtcblxuLy8gVGhlIGRlY2sgdG9vbHRpcCBzaG93cyB0aGUgY3VzdG9tIG9wdGlvbnMgZm9yIHRoaXMgZ2FtZSwgaWYgYW55XG5DYXJkRGVjay5wcm90b3R5cGUuaW5pdFRvb2x0aXAgPSBmdW5jdGlvbiBpbml0VG9vbHRpcCgpIHtcbiAgICBpZiAoXG4gICAgICAgIGdsb2JhbHMudmFyaWFudC5uYW1lID09PSAnTm8gVmFyaWFudCdcbiAgICAgICAgJiYgIWdsb2JhbHMudGltZWRcbiAgICAgICAgJiYgIWdsb2JhbHMuZGVja1BsYXlzXG4gICAgICAgICYmICFnbG9iYWxzLmVtcHR5Q2x1ZXNcbiAgICAgICAgJiYgZ2xvYmFscy5jaGFyYWN0ZXJBc3NpZ25tZW50cy5sZW5ndGggPT09IDBcbiAgICApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjb250ZW50ID0gJzxzdHJvbmc+R2FtZSBPcHRpb25zOjwvc3Ryb25nPic7XG4gICAgY29udGVudCArPSAnPHVsIGNsYXNzPVwiZ2FtZS10b29sdGlwcy11bFwiPic7XG4gICAgaWYgKGdsb2JhbHMudmFyaWFudC5uYW1lICE9PSAnTm8gVmFyaWFudCcpIHtcbiAgICAgICAgY29udGVudCArPSBgPGxpPlZhcmlhbnQ6ICR7Z2xvYmFscy52YXJpYW50Lm5hbWV9PC9saT5gO1xuICAgIH1cbiAgICBpZiAoZ2xvYmFscy50aW1lZCkge1xuICAgICAgICBjb250ZW50ICs9ICc8bGk+VGltZWQ6ICc7XG4gICAgICAgIGNvbnRlbnQgKz0gbWlzYy50aW1lckZvcm1hdHRlcihnbG9iYWxzLmJhc2VUaW1lICogMTAwMCk7XG4gICAgICAgIGNvbnRlbnQgKz0gJyArICc7XG4gICAgICAgIGNvbnRlbnQgKz0gbWlzYy50aW1lckZvcm1hdHRlcihnbG9iYWxzLnRpbWVQZXJUdXJuICogMTAwMCk7XG4gICAgICAgIGNvbnRlbnQgKz0gJzwvbGk+JztcbiAgICB9XG4gICAgaWYgKGdsb2JhbHMuZGVja1BsYXlzKSB7XG4gICAgICAgIGNvbnRlbnQgKz0gJzxsaT5Cb3R0b20tRGVjayBCbGluZCBQbGF5czwvbGk+JztcbiAgICB9XG4gICAgaWYgKGdsb2JhbHMuZW1wdHlDbHVlcykge1xuICAgICAgICBjb250ZW50ICs9ICc8bGk+RW1wdHkgQ2x1ZXM8L2xpPic7XG4gICAgfVxuICAgIGlmIChnbG9iYWxzLmNoYXJhY3RlckFzc2lnbm1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29udGVudCArPSAnPGxpPkRldHJpbWVudGFsIENoYXJhY3RlcnM8L2xpPic7XG4gICAgfVxuICAgIGNvbnRlbnQgKz0gJzwvdWw+JztcbiAgICAkKCcjdG9vbHRpcC1kZWNrJykudG9vbHRpcHN0ZXIoJ2luc3RhbmNlJykuY29udGVudChjb250ZW50KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FyZERlY2s7XG4iLCIvKlxuICAgIEZ1bmN0aW9ucyBoYXZpbmcgdG8gZG8gd2l0aCBkcmF3aW5nIHRoZSBjYXJkc1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5cbi8vIENvbnN0YW50c1xuY29uc3Qge1xuICAgIENBUkRfQVJFQSxcbiAgICBDQVJESCxcbiAgICBDQVJEVyxcbiAgICBDT0xPUixcbiAgICBTVUlULFxufSA9IGNvbnN0YW50cztcbmNvbnN0IHhyYWQgPSBDQVJEVyAqIDAuMDg7XG5jb25zdCB5cmFkID0gQ0FSREggKiAwLjA4O1xuXG4vLyBWYXJpYWJsZXNcbmxldCBzY2FsZUNhcmRJbWFnZXMgPSB7fTtcblxuZXhwb3J0cy5pbml0ID0gKCkgPT4ge1xuICAgIHNjYWxlQ2FyZEltYWdlcyA9IHt9O1xufTtcblxuZXhwb3J0cy5idWlsZENhcmRzID0gKCkgPT4ge1xuICAgIC8vIFRoZSBncmF5IHN1aXQgcmVwcmVzZW50cyBjYXJkcyBvZiB1bmtub3duIHN1aXRcbiAgICBjb25zdCBzdWl0cyA9IGdsb2JhbHMudmFyaWFudC5zdWl0cy5jb25jYXQoU1VJVC5HUkFZKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN1aXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHN1aXQgPSBzdWl0c1tpXTtcblxuICAgICAgICAvLyBSYW5rIDAgaXMgdGhlIHN0YWNrIGJhc2VcbiAgICAgICAgLy8gUmFuayAxLTUgYXJlIHRoZSBub3JtYWwgY2FyZHNcbiAgICAgICAgLy8gUmFuayA2IGlzIGEgY2FyZCBvZiB1bmtub3duIHJhbmtcbiAgICAgICAgLy8gUmFuayA3IGlzIGEgXCJTVEFSVFwiIGNhcmQgKGluIHRoZSBcIlVwIG9yIERvd25cIiB2YXJpYW50cylcbiAgICAgICAgZm9yIChsZXQgcmFuayA9IDA7IHJhbmsgPD0gNzsgcmFuaysrKSB7XG4gICAgICAgICAgICBjb25zdCBjdnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbiAgICAgICAgICAgIGN2cy53aWR0aCA9IENBUkRXO1xuICAgICAgICAgICAgY3ZzLmhlaWdodCA9IENBUkRIO1xuXG4gICAgICAgICAgICBjb25zdCBjdHggPSBjdnMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICAgICAgICAgICAgaWYgKHJhbmsgPiAwKSB7XG4gICAgICAgICAgICAgICAgZHJhd0NhcmRUZXh0dXJlKGN0eCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRyYXdDYXJkQmFzZShjdHgsIHN1aXQsIHJhbmspO1xuXG4gICAgICAgICAgICBjdHguc2hhZG93Qmx1ciA9IDEwO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHN1aXQuc3R5bGUoY3R4LCBDQVJEX0FSRUEuTlVNQkVSKTtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9ICdibGFjayc7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICAgICAgICAgIGN0eC5saW5lSm9pbiA9ICdyb3VuZCc7XG5cbiAgICAgICAgICAgIGlmIChyYW5rICE9PSAwICYmIHJhbmsgIT09IDYpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGV4dFlQb3M7XG4gICAgICAgICAgICAgICAgbGV0IGluZGV4TGFiZWw7XG4gICAgICAgICAgICAgICAgbGV0IHJhbmtTdHJpbmcgPSByYW5rLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmsgPT09IDcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gXCJTVEFSVFwiIGNhcmRzIGFyZSByZXByZXNlbnRlZCBieSByYW5rIDdcbiAgICAgICAgICAgICAgICAgICAgcmFua1N0cmluZyA9ICdTJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IGZvbnRTaXplO1xuICAgICAgICAgICAgICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dDb2xvcmJsaW5kVUkpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9udFNpemUgPSA2ODtcbiAgICAgICAgICAgICAgICAgICAgdGV4dFlQb3MgPSA4MztcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhMYWJlbCA9IHN1aXQuYWJicmV2aWF0aW9uICsgcmFua1N0cmluZztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmb250U2l6ZSA9IDk2O1xuICAgICAgICAgICAgICAgICAgICB0ZXh0WVBvcyA9IDExMDtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhMYWJlbCA9IHJhbmtTdHJpbmc7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY3R4LmZvbnQgPSBgYm9sZCAke2ZvbnRTaXplfXB0IEFyaWFsYDtcblxuICAgICAgICAgICAgICAgIC8vIERyYXcgaW5kZXggb24gdG9wIGxlZnRcbiAgICAgICAgICAgICAgICBkcmF3Q2FyZEluZGV4KGN0eCwgdGV4dFlQb3MsIGluZGV4TGFiZWwpO1xuXG4gICAgICAgICAgICAgICAgLy8gJ0luZGV4JyBjYXJkcyBhcmUgdXNlZCB0byBkcmF3IGNhcmRzIG9mIGxlYXJuZWQgYnV0IG5vdCB5ZXQga25vd24gcmFua1xuICAgICAgICAgICAgICAgIGdsb2JhbHMuY2FyZEltYWdlc1tgSW5kZXgtJHtzdWl0Lm5hbWV9LSR7cmFua31gXSA9IGNsb25lQ2FudmFzKGN2cyk7XG5cbiAgICAgICAgICAgICAgICAvLyBEcmF3IGluZGV4IG9uIGJvdHRvbSByaWdodFxuICAgICAgICAgICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZShDQVJEVywgQ0FSREgpO1xuICAgICAgICAgICAgICAgIGN0eC5yb3RhdGUoTWF0aC5QSSk7XG4gICAgICAgICAgICAgICAgZHJhd0NhcmRJbmRleChjdHgsIHRleHRZUG9zLCBpbmRleExhYmVsKTtcbiAgICAgICAgICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gc3VpdC5zdHlsZShjdHgsIENBUkRfQVJFQS5TWU1CT0wpO1xuXG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gNTtcblxuICAgICAgICAgICAgLy8gTWFrZSB0aGUgc3BlY2lhbCBjb3JuZXJzIG9uIGNhcmRzIGZvciB0aGUgbWl4ZWQgdmFyaWFudFxuICAgICAgICAgICAgaWYgKHN1aXQuY2x1ZUNvbG9ycyAhPT0gbnVsbCAmJiBzdWl0LmNsdWVDb2xvcnMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgICAgZHJhd01peGVkQ2FyZEhlbHBlcihjdHgsIHN1aXQuY2x1ZUNvbG9ycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vICdOb1BpcCcgY2FyZHMgYXJlIHVzZWQgZm9yXG4gICAgICAgICAgICAvLyAgIGNhcmRzIG9mIGtub3duIHJhbmsgYmVmb3JlIHN1aXQgbGVhcm5lZFxuICAgICAgICAgICAgLy8gICBjYXJkcyBvZiB1bmtub3duIHJhbmtcbiAgICAgICAgICAgIC8vIEVudGlyZWx5IHVua25vd24gY2FyZHMgKEdyYXkgNikgaGF2ZSBhIGN1c3RvbSBpbWFnZSBkZWZpbmVkIHNlcGFyYXRlbHlcbiAgICAgICAgICAgIGlmIChyYW5rID4gMCAmJiAocmFuayA8IDYgfHwgc3VpdCAhPT0gU1VJVC5HUkFZKSkge1xuICAgICAgICAgICAgICAgIGdsb2JhbHMuY2FyZEltYWdlc1tgTm9QaXAtJHtzdWl0Lm5hbWV9LSR7cmFua31gXSA9IGNsb25lQ2FudmFzKGN2cyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdWl0ICE9PSBTVUlULkdSQVkpIHtcbiAgICAgICAgICAgICAgICBkcmF3U3VpdFBpcHMoY3R4LCByYW5rLCBzdWl0LCBpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gR3JheSBDYXJkIGltYWdlcyB3b3VsZCBiZSBpZGVudGljYWwgdG8gTm9QaXAgaW1hZ2VzXG4gICAgICAgICAgICBpZiAoc3VpdCAhPT0gU1VJVC5HUkFZKSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFscy5jYXJkSW1hZ2VzW2BDYXJkLSR7c3VpdC5uYW1lfS0ke3Jhbmt9YF0gPSBjdnM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnbG9iYWxzLmNhcmRJbWFnZXNbJ05vUGlwLUdyYXktNiddID0gbWFrZVVua25vd25DYXJkSW1hZ2UoKTtcbiAgICBnbG9iYWxzLmNhcmRJbWFnZXNbJ2RlY2stYmFjayddID0gbWFrZURlY2tCYWNrKCk7XG59O1xuXG5jb25zdCBjbG9uZUNhbnZhcyA9IChvbGRDYW52YXMpID0+IHtcbiAgICBjb25zdCBuZXdDYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbiAgICBuZXdDYW52YXMud2lkdGggPSBvbGRDYW52YXMud2lkdGg7XG4gICAgbmV3Q2FudmFzLmhlaWdodCA9IG9sZENhbnZhcy5oZWlnaHQ7XG4gICAgY29uc3QgY29udGV4dCA9IG5ld0NhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgIGNvbnRleHQuZHJhd0ltYWdlKG9sZENhbnZhcywgMCwgMCk7XG4gICAgcmV0dXJuIG5ld0NhbnZhcztcbn07XG5cbmNvbnN0IGRyYXdTdWl0UGlwcyA9IChjdHgsIHJhbmssIHN1aXQsIGkpID0+IHtcbiAgICBjb25zdCBwYXRoRnVuYyA9IGRyYXdTdWl0U2hhcGUoc3VpdCwgaSk7XG4gICAgY29uc3Qgc2NhbGUgPSAwLjQ7XG5cbiAgICAvLyBUaGUgbWlkZGxlIGZvciBjYXJkcyAyIG9yIDRcbiAgICBpZiAocmFuayA9PT0gMSB8fCByYW5rID09PSAzKSB7XG4gICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgIGN0eC50cmFuc2xhdGUoQ0FSRFcgLyAyLCBDQVJESCAvIDIpO1xuICAgICAgICBjdHguc2NhbGUoc2NhbGUsIHNjYWxlKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSgtNzUsIC0xMDApO1xuICAgICAgICBwYXRoRnVuYyhjdHgpO1xuICAgICAgICBkcmF3U2hhcGUoY3R4KTtcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBUb3AgYW5kIGJvdHRvbSBmb3IgY2FyZHMgMiwgMywgNCwgNVxuICAgIGlmIChyYW5rID4gMSAmJiByYW5rIDw9IDUpIHtcbiAgICAgICAgY29uc3Qgc3ltYm9sWVBvcyA9IGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2hvd0NvbG9yYmxpbmRVSSA/IDg1IDogMTIwO1xuICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICBjdHgudHJhbnNsYXRlKENBUkRXIC8gMiwgQ0FSREggLyAyKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSgwLCAtc3ltYm9sWVBvcyk7XG4gICAgICAgIGN0eC5zY2FsZShzY2FsZSwgc2NhbGUpO1xuICAgICAgICBjdHgudHJhbnNsYXRlKC03NSwgLTEwMCk7XG4gICAgICAgIHBhdGhGdW5jKGN0eCk7XG4gICAgICAgIGRyYXdTaGFwZShjdHgpO1xuICAgICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgIGN0eC50cmFuc2xhdGUoQ0FSRFcgLyAyLCBDQVJESCAvIDIpO1xuICAgICAgICBjdHgudHJhbnNsYXRlKDAsIHN5bWJvbFlQb3MpO1xuICAgICAgICBjdHguc2NhbGUoc2NhbGUsIHNjYWxlKTtcbiAgICAgICAgY3R4LnJvdGF0ZShNYXRoLlBJKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSgtNzUsIC0xMDApO1xuICAgICAgICBwYXRoRnVuYyhjdHgpO1xuICAgICAgICBkcmF3U2hhcGUoY3R4KTtcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBMZWZ0IGFuZCByaWdodCBmb3IgY2FyZHMgNCBhbmQgNVxuICAgIGlmIChyYW5rID09PSA0IHx8IHJhbmsgPT09IDUpIHtcbiAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZShDQVJEVyAvIDIsIENBUkRIIC8gMik7XG4gICAgICAgIGN0eC50cmFuc2xhdGUoLTkwLCAwKTtcbiAgICAgICAgY3R4LnNjYWxlKHNjYWxlLCBzY2FsZSk7XG4gICAgICAgIGN0eC50cmFuc2xhdGUoLTc1LCAtMTAwKTtcbiAgICAgICAgcGF0aEZ1bmMoY3R4KTtcbiAgICAgICAgZHJhd1NoYXBlKGN0eCk7XG4gICAgICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZShDQVJEVyAvIDIsIENBUkRIIC8gMik7XG4gICAgICAgIGN0eC50cmFuc2xhdGUoOTAsIDApO1xuICAgICAgICBjdHguc2NhbGUoc2NhbGUsIHNjYWxlKTtcbiAgICAgICAgY3R4LnJvdGF0ZShNYXRoLlBJKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSgtNzUsIC0xMDApO1xuICAgICAgICBwYXRoRnVuYyhjdHgpO1xuICAgICAgICBkcmF3U2hhcGUoY3R4KTtcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBTaXplLCBwb3NpdGlvbiwgYW5kIGFscGhhIGFkanVzdG1lbnQgZm9yIHRoZSBjZW50cmFsIGljb24gb24gc3RhY2sgYmFzZSBhbmQgNVxuICAgIGlmIChyYW5rID09PSAwIHx8IHJhbmsgPT09IDUpIHtcbiAgICAgICAgY3R4Lmdsb2JhbEFscGhhID0gMS4wO1xuICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICBjdHgudHJhbnNsYXRlKENBUkRXIC8gMiwgQ0FSREggLyAyKTtcbiAgICAgICAgY3R4LnNjYWxlKHNjYWxlICogMyAvIDIsIHNjYWxlICogMyAvIDIpO1xuICAgICAgICBjdHgudHJhbnNsYXRlKC03NSwgLTEwMCk7XG4gICAgICAgIHBhdGhGdW5jKGN0eCk7XG4gICAgICAgIGRyYXdTaGFwZShjdHgpO1xuICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH1cblxuICAgIC8vIFVua25vd24gcmFuaywgc28gZHJhdyBsYXJnZSBmYWludCBzdWl0XG4gICAgaWYgKHJhbmsgPT09IDYpIHtcbiAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgY3R4Lmdsb2JhbEFscGhhID0gZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zaG93Q29sb3JibGluZFVJID8gMC40IDogMC4xO1xuICAgICAgICBjdHgudHJhbnNsYXRlKENBUkRXIC8gMiwgQ0FSREggLyAyKTtcbiAgICAgICAgY3R4LnNjYWxlKHNjYWxlICogMywgc2NhbGUgKiAzKTtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSgtNzUsIC0xMDApO1xuICAgICAgICBwYXRoRnVuYyhjdHgpO1xuICAgICAgICBkcmF3U2hhcGUoY3R4KTtcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG59O1xuXG5jb25zdCBtYWtlRGVja0JhY2sgPSAoKSA9PiB7XG4gICAgY29uc3QgY3ZzID0gbWFrZVVua25vd25DYXJkSW1hZ2UoKTtcbiAgICBjb25zdCBjdHggPSBjdnMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICAgIGNvbnN0IG5TdWl0cyA9IGdsb2JhbHMudmFyaWFudC5zdWl0cy5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLnZhcmlhbnQuc3VpdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgc3VpdCA9IGdsb2JhbHMudmFyaWFudC5zdWl0c1tpXTtcblxuICAgICAgICBjdHgucmVzZXRUcmFuc2Zvcm0oKTtcbiAgICAgICAgY3R4LnNjYWxlKDAuNCwgMC40KTtcblxuICAgICAgICBsZXQgeCA9IE1hdGguZmxvb3IoQ0FSRFcgKiAxLjI1KTtcbiAgICAgICAgbGV0IHkgPSBNYXRoLmZsb29yKENBUkRIICogMS4yNSk7XG5cbiAgICAgICAgLy8gVHJhbnNmb3JtIHBvbGFyIHRvIGNhcnRlc2lhbiBjb29yZGluYXRlc1xuICAgICAgICAvLyBUaGUgbWFnaWMgbnVtYmVyIGFkZGVkIHRvIHRoZSBvZmZzZXQgaXMgbmVlZGVkIHRvIGNlbnRlciB0aGluZ3MgcHJvcGVybHlcbiAgICAgICAgeCAtPSAxLjA1ICogTWF0aC5mbG9vcihDQVJEVyAqIDAuNyAqIE1hdGguY29zKCgtaSAvIG5TdWl0cyArIDAuMjUpICogTWF0aC5QSSAqIDIpICsgQ0FSRFcgKiAwLjI1KTsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuICAgICAgICB5IC09IDEuMDUgKiBNYXRoLmZsb29yKENBUkRXICogMC43ICogTWF0aC5zaW4oKC1pIC8gblN1aXRzICsgMC4yNSkgKiBNYXRoLlBJICogMikgKyBDQVJEVyAqIDAuMyk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmVcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSh4LCB5KTtcblxuICAgICAgICBkcmF3U3VpdFNoYXBlKHN1aXQsIGkpKGN0eCk7XG4gICAgICAgIGRyYXdTaGFwZShjdHgpO1xuICAgIH1cbiAgICBjdHguc2F2ZSgpO1xuICAgIHJldHVybiBjdnM7XG59O1xuXG5jb25zdCBkcmF3Q2FyZEJhc2UgPSAoY3R4LCBzdWl0LCByYW5rKSA9PiB7XG4gICAgLy8gRHJhdyB0aGUgYmFja2dyb3VuZFxuICAgIGN0eC5maWxsU3R5bGUgPSBzdWl0LnN0eWxlKGN0eCwgQ0FSRF9BUkVBLkJBQ0tHUk9VTkQpO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN1aXQuc3R5bGUoY3R4LCBDQVJEX0FSRUEuQkFDS0dST1VORCk7XG4gICAgaWYgKGN0eC5maWxsU3R5bGUgPT09IENPTE9SLldISVRFLmhleENvZGUpIHtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gQ09MT1IuQkxBQ0suaGV4Q29kZTtcbiAgICB9XG5cbiAgICBiYWNrUGF0aChjdHgsIDQpO1xuXG4gICAgY3R4LnNhdmUoKTtcbiAgICAvLyBEcmF3IHRoZSBib3JkZXJzIChvbiB2aXNpYmxlIGNhcmRzKSBhbmQgdGhlIGNvbG9yIGZpbGxcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAwLjM7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAwLjc7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDg7XG4gICAgLy8gVGhlIGJvcmRlcnMgc2hvdWxkIGJlIG1vcmUgb3BhcXVlIGZvciB0aGUgc3RhY2sgYmFzZVxuICAgIGlmIChyYW5rID09PSAwKSB7XG4gICAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IDEuMDtcbiAgICB9XG4gICAgY3R4LnN0cm9rZSgpO1xuXG4gICAgY3R4LnJlc3RvcmUoKTtcbn07XG5cbmNvbnN0IGJhY2tQYXRoID0gKGN0eCwgcCkgPT4ge1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHAsIHlyYWQgKyBwKTtcbiAgICBjdHgubGluZVRvKHAsIENBUkRIIC0geXJhZCAtIHApO1xuICAgIGN0eC5xdWFkcmF0aWNDdXJ2ZVRvKDAsIENBUkRILCB4cmFkICsgcCwgQ0FSREggLSBwKTtcbiAgICBjdHgubGluZVRvKENBUkRXIC0geHJhZCAtIHAsIENBUkRIIC0gcCk7XG4gICAgY3R4LnF1YWRyYXRpY0N1cnZlVG8oQ0FSRFcsIENBUkRILCBDQVJEVyAtIHAsIENBUkRIIC0geXJhZCAtIHApO1xuICAgIGN0eC5saW5lVG8oQ0FSRFcgLSBwLCB5cmFkICsgcCk7XG4gICAgY3R4LnF1YWRyYXRpY0N1cnZlVG8oQ0FSRFcsIDAsIENBUkRXIC0geHJhZCAtIHAsIHApO1xuICAgIGN0eC5saW5lVG8oeHJhZCArIHAsIHApO1xuICAgIGN0eC5xdWFkcmF0aWNDdXJ2ZVRvKDAsIDAsIHAsIHlyYWQgKyBwKTtcbn07XG5cbmNvbnN0IGRyYXdTaGFwZSA9IChjdHgpID0+IHtcbiAgICBjdHguc2hhZG93Q29sb3IgPSAncmdiYSgwLCAwLCAwLCAwLjkpJztcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5zaGFkb3dDb2xvciA9ICdyZ2JhKDAsIDAsIDAsIDApJztcbiAgICBjdHguc3Ryb2tlKCk7XG59O1xuXG5jb25zdCBkcmF3Q2FyZEluZGV4ID0gKGN0eCwgdGV4dFlQb3MsIGluZGV4TGFiZWwpID0+IHtcbiAgICBjdHguc2hhZG93Q29sb3IgPSAncmdiYSgwLCAwLCAwLCAwLjkpJztcbiAgICBjdHguZmlsbFRleHQoaW5kZXhMYWJlbCwgMTksIHRleHRZUG9zKTtcbiAgICBjdHguc2hhZG93Q29sb3IgPSAncmdiYSgwLCAwLCAwLCAwKSc7XG4gICAgY3R4LnN0cm9rZVRleHQoaW5kZXhMYWJlbCwgMTksIHRleHRZUG9zKTtcbn07XG5cbmNvbnN0IGRyYXdNaXhlZENhcmRIZWxwZXIgPSAoY3R4LCBjbHVlQ29sb3JzKSA9PiB7XG4gICAgY29uc3QgW2NsdWVDb2xvcjEsIGNsdWVDb2xvcjJdID0gY2x1ZUNvbG9ycztcblxuICAgIGN0eC5zYXZlKCk7XG5cbiAgICBjdHgubGluZVdpZHRoID0gMTtcblxuICAgIGNvbnN0IHRyaWFuZ2xlU2l6ZSA9IDUwO1xuICAgIGNvbnN0IGJvcmRlclNpemUgPSA4O1xuXG4gICAgLy8gRHJhdyB0aGUgZmlyc3QgaGFsZiBvZiB0aGUgdG9wLXJpZ2h0IHRyaWFuZ2xlXG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oQ0FSRFcgLSBib3JkZXJTaXplLCBib3JkZXJTaXplKTsgLy8gU3RhcnQgYXQgdGhlIHRvcC1yaWdodC1oYW5kIGNvcm5lclxuICAgIGN0eC5saW5lVG8oQ0FSRFcgLSBib3JkZXJTaXplIC0gdHJpYW5nbGVTaXplLCBib3JkZXJTaXplKTsgLy8gTW92ZSBsZWZ0XG4gICAgY3R4LmxpbmVUbyhDQVJEVyAtIGJvcmRlclNpemUgLSAodHJpYW5nbGVTaXplIC8gMiksIGJvcmRlclNpemUgKyAodHJpYW5nbGVTaXplIC8gMikpO1xuICAgIC8vIE1vdmUgZG93biBhbmQgcmlnaHQgZGlhZ29uYWxseVxuICAgIGN0eC5tb3ZlVG8oQ0FSRFcgLSBib3JkZXJTaXplLCBib3JkZXJTaXplKTsgLy8gTW92ZSBiYWNrIHRvIHRoZSBiZWdpbm5pbmdcbiAgICBjdHguZmlsbFN0eWxlID0gY2x1ZUNvbG9yMS5oZXhDb2RlO1xuICAgIGRyYXdTaGFwZShjdHgpO1xuXG4gICAgLy8gRHJhdyB0aGUgc2Vjb25kIGhhbGYgb2YgdGhlIHRvcC1yaWdodCB0cmlhbmdsZVxuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKENBUkRXIC0gYm9yZGVyU2l6ZSwgYm9yZGVyU2l6ZSk7IC8vIFN0YXJ0IGF0IHRoZSB0b3AtcmlnaHQtaGFuZCBjb3JuZXJcbiAgICBjdHgubGluZVRvKENBUkRXIC0gYm9yZGVyU2l6ZSwgYm9yZGVyU2l6ZSArIHRyaWFuZ2xlU2l6ZSk7IC8vIE1vdmUgZG93blxuICAgIGN0eC5saW5lVG8oQ0FSRFcgLSBib3JkZXJTaXplIC0gKHRyaWFuZ2xlU2l6ZSAvIDIpLCBib3JkZXJTaXplICsgKHRyaWFuZ2xlU2l6ZSAvIDIpKTtcbiAgICAvLyBNb3ZlIHVwIGFuZCBsZWZ0IGRpYWdvbmFsbHlcbiAgICBjdHgubW92ZVRvKENBUkRXIC0gYm9yZGVyU2l6ZSwgYm9yZGVyU2l6ZSk7IC8vIE1vdmUgYmFjayB0byB0aGUgYmVnaW5uaW5nXG4gICAgY3R4LmZpbGxTdHlsZSA9IGNsdWVDb2xvcjIuaGV4Q29kZTtcbiAgICBkcmF3U2hhcGUoY3R4KTtcblxuICAgIC8vIERyYXcgdGhlIGZpcnN0IGhhbGYgb2YgdGhlIGJvdHRvbS1sZWZ0IHRyaWFuZ2xlXG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYm9yZGVyU2l6ZSwgQ0FSREggLSBib3JkZXJTaXplKTsgLy8gU3RhcnQgYXQgdGhlIGJvdHRvbSByaWdodC1oYW5kIGNvcm5lclxuICAgIGN0eC5saW5lVG8oYm9yZGVyU2l6ZSwgQ0FSREggLSBib3JkZXJTaXplIC0gdHJpYW5nbGVTaXplKTsgLy8gTW92ZSB1cFxuICAgIGN0eC5saW5lVG8oYm9yZGVyU2l6ZSArICh0cmlhbmdsZVNpemUgLyAyKSwgQ0FSREggLSBib3JkZXJTaXplIC0gKHRyaWFuZ2xlU2l6ZSAvIDIpKTtcbiAgICAvLyBNb3ZlIHJpZ2h0IGFuZCBkb3duIGRpYWdvbmFsbHlcbiAgICBjdHgubW92ZVRvKGJvcmRlclNpemUsIENBUkRIIC0gYm9yZGVyU2l6ZSk7IC8vIE1vdmUgYmFjayB0byB0aGUgYmVnaW5uaW5nXG4gICAgY3R4LmZpbGxTdHlsZSA9IGNsdWVDb2xvcjEuaGV4Q29kZTtcbiAgICBkcmF3U2hhcGUoY3R4KTtcblxuICAgIC8vIERyYXcgdGhlIHNlY29uZCBoYWxmIG9mIHRoZSBib3R0b20tbGVmdCB0cmlhbmdsZVxuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGJvcmRlclNpemUsIENBUkRIIC0gYm9yZGVyU2l6ZSk7IC8vIFN0YXJ0IGF0IHRoZSBib3R0b20gcmlnaHQtaGFuZCBjb3JuZXJcbiAgICBjdHgubGluZVRvKGJvcmRlclNpemUgKyB0cmlhbmdsZVNpemUsIENBUkRIIC0gYm9yZGVyU2l6ZSk7IC8vIE1vdmUgcmlnaHRcbiAgICBjdHgubGluZVRvKGJvcmRlclNpemUgKyAodHJpYW5nbGVTaXplIC8gMiksIENBUkRIIC0gYm9yZGVyU2l6ZSAtICh0cmlhbmdsZVNpemUgLyAyKSk7XG4gICAgLy8gTW92ZSBsZWZ0IGFuZCB1cCBkaWFnb25hbGx5XG4gICAgY3R4Lm1vdmVUbyhib3JkZXJTaXplLCBDQVJESCAtIGJvcmRlclNpemUpOyAvLyBNb3ZlIGJhY2sgdG8gdGhlIGJlZ2lubmluZ1xuICAgIGN0eC5maWxsU3R5bGUgPSBjbHVlQ29sb3IyLmhleENvZGU7XG4gICAgZHJhd1NoYXBlKGN0eCk7XG5cbiAgICBjdHgucmVzdG9yZSgpO1xufTtcblxuY29uc3QgbWFrZVVua25vd25DYXJkSW1hZ2UgPSAoKSA9PiB7XG4gICAgY29uc3QgY3ZzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgY3ZzLndpZHRoID0gQ0FSRFc7XG4gICAgY3ZzLmhlaWdodCA9IENBUkRIO1xuXG4gICAgY29uc3QgY3R4ID0gY3ZzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgICBkcmF3Q2FyZFRleHR1cmUoY3R4KTtcblxuICAgIGN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xuXG4gICAgYmFja1BhdGgoY3R4LCA0KTtcblxuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMC41O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMC43O1xuICAgIGN0eC5saW5lV2lkdGggPSA4O1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgY3R4LmZpbGxTdHlsZSA9ICcjNDQ0NDQ0JztcbiAgICBjdHgubGluZVdpZHRoID0gODtcbiAgICBjdHgubGluZUpvaW4gPSAncm91bmQnO1xuXG4gICAgY3R4LnRyYW5zbGF0ZShDQVJEVyAvIDIsIENBUkRIIC8gMik7XG5cbiAgICByZXR1cm4gY3ZzO1xufTtcblxuLy8gRHJhdyB0ZXh0dXJlIGxpbmVzIG9uIGNhcmRcbmNvbnN0IGRyYXdDYXJkVGV4dHVyZSA9IChjdHgpID0+IHtcbiAgICBiYWNrUGF0aChjdHgsIDQsIHhyYWQsIHlyYWQpO1xuXG4gICAgY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgY3R4LmZpbGwoKTtcblxuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmNsaXAoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAwLjI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gJ2JsYWNrJztcblxuICAgIGZvciAobGV0IHggPSAwOyB4IDwgQ0FSRFc7IHggKz0gNCArIE1hdGgucmFuZG9tKCkgKiA0KSB7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyh4LCAwKTtcbiAgICAgICAgY3R4LmxpbmVUbyh4LCBDQVJESCk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB5ID0gMDsgeSA8IENBUkRIOyB5ICs9IDQgKyBNYXRoLnJhbmRvbSgpICogNCkge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8oMCwgeSk7XG4gICAgICAgIGN0eC5saW5lVG8oQ0FSRFcsIHkpO1xuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgY3R4LnJlc3RvcmUoKTtcbn07XG5cbmNvbnN0IHNoYXBlRnVuY3Rpb25zID0gW1xuICAgIC8vIERpYW1vbmRcbiAgICAoY3R4KSA9PiB7XG4gICAgICAgIGNvbnN0IHcgPSA3MDtcbiAgICAgICAgY29uc3QgaCA9IDgwO1xuXG4gICAgICAgIC8vIEV4cGVjdGVkIGJvdW5kaW5nIGJveCByZXF1aXJlcyB0aGVzZSBvZmZzZXRzXG4gICAgICAgIGNvbnN0IG9mZnNldFggPSA3NSAtIHc7XG4gICAgICAgIGNvbnN0IG9mZnNldFkgPSAxMDAgLSBoO1xuICAgICAgICBjb25zdCBwb2ludHMgPSBbXG4gICAgICAgICAgICBbMSwgMF0sXG4gICAgICAgICAgICBbMiwgMV0sXG4gICAgICAgICAgICBbMSwgMl0sXG4gICAgICAgICAgICBbMCwgMV0sXG4gICAgICAgIF1cbiAgICAgICAgICAgIC5tYXAocG9pbnQgPT4gW3BvaW50WzBdICogdyArIG9mZnNldFgsIHBvaW50WzFdICogaCArIG9mZnNldFldKTtcbiAgICAgICAgY29uc3QgY3VydmVYID0gMS40NjtcbiAgICAgICAgY29uc3QgY3VydmVZID0gMC42O1xuICAgICAgICBjb25zdCBpbnRlcnBzID0gW1xuICAgICAgICAgICAgWzAsIDBdLFxuICAgICAgICAgICAgWzAsIDFdLFxuICAgICAgICAgICAgWzEsIDFdLFxuICAgICAgICAgICAgWzEsIDBdLFxuICAgICAgICBdXG4gICAgICAgICAgICAubWFwKHYgPT4gW1xuICAgICAgICAgICAgICAgIFtjdXJ2ZVgsIDIgLSBjdXJ2ZVhdW3ZbMF1dICogdyArIG9mZnNldFgsXG4gICAgICAgICAgICAgICAgW2N1cnZlWSwgMiAtIGN1cnZlWV1bdlsxXV0gKiBoICsgb2Zmc2V0WSxcbiAgICAgICAgICAgIF0pO1xuXG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyguLi5wb2ludHNbMF0pO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyguLi5pbnRlcnBzWzBdLCAuLi5wb2ludHNbMV0pO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyguLi5pbnRlcnBzWzFdLCAuLi5wb2ludHNbMl0pO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyguLi5pbnRlcnBzWzJdLCAuLi5wb2ludHNbM10pO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyguLi5pbnRlcnBzWzNdLCAuLi5wb2ludHNbMF0pO1xuICAgIH0sXG5cbiAgICAvLyBDbHViXG4gICAgKGN0eCkgPT4ge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8oNTAsIDE4MCk7XG4gICAgICAgIGN0eC5saW5lVG8oMTAwLCAxODApO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyg4MCwgMTQwLCA3NSwgMTIwKTtcbiAgICAgICAgY3R4LmFyYygxMTAsIDExMCwgMzUsIDIuNjc3OSwgNC43MTIsIHRydWUpO1xuICAgICAgICBjdHguYXJjKDc1LCA1MCwgMzUsIDEsIDIuMTQxNiwgdHJ1ZSk7XG4gICAgICAgIGN0eC5hcmMoNDAsIDExMCwgMzUsIDQuNzEyLCAwLjQ2MzYsIHRydWUpO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyg3MCwgMTQwLCA1MCwgMTgwKTtcbiAgICB9LFxuXG4gICAgLy8gU3RhclxuICAgIChjdHgpID0+IHtcbiAgICAgICAgY3R4LnRyYW5zbGF0ZSg3NSwgMTAwKTtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKDAsIC03NSk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG4gICAgICAgICAgICBjdHgucm90YXRlKE1hdGguUEkgLyA1KTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oMCwgLTMwKTtcbiAgICAgICAgICAgIGN0eC5yb3RhdGUoTWF0aC5QSSAvIDUpO1xuICAgICAgICAgICAgY3R4LmxpbmVUbygwLCAtNzUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIEhlYXJ0XG4gICAgKGN0eCkgPT4ge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8oNzUsIDY1KTtcbiAgICAgICAgY3R4LmJlemllckN1cnZlVG8oNzUsIDU3LCA3MCwgNDUsIDUwLCA0NSk7XG4gICAgICAgIGN0eC5iZXppZXJDdXJ2ZVRvKDIwLCA0NSwgMjAsIDgyLCAyMCwgODIpO1xuICAgICAgICBjdHguYmV6aWVyQ3VydmVUbygyMCwgMTAwLCA0MCwgMTIyLCA3NSwgMTU1KTtcbiAgICAgICAgY3R4LmJlemllckN1cnZlVG8oMTEwLCAxMjIsIDEzMCwgMTAwLCAxMzAsIDgyKTtcbiAgICAgICAgY3R4LmJlemllckN1cnZlVG8oMTMwLCA4MiwgMTMwLCA0NSwgMTAwLCA0NSk7XG4gICAgICAgIGN0eC5iZXppZXJDdXJ2ZVRvKDg1LCA0NSwgNzUsIDU3LCA3NSwgNjUpO1xuICAgIH0sXG5cbiAgICAvLyBDcmVzY2VudFxuICAgIChjdHgpID0+IHtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHguYXJjKDc1LCAxMDAsIDc1LCAzLCA0LjMsIHRydWUpO1xuICAgICAgICBjdHguYXJjKDQ4LCA4MywgNTIsIDUsIDIuNSwgZmFsc2UpO1xuICAgIH0sXG5cbiAgICAvLyBTcGFkZVxuICAgIChjdHgpID0+IHtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8oNTAsIDE4MCk7XG4gICAgICAgIGN0eC5saW5lVG8oMTAwLCAxODApO1xuICAgICAgICBjdHgucXVhZHJhdGljQ3VydmVUbyg4MCwgMTQwLCA3NSwgMTIwKTtcbiAgICAgICAgY3R4LmFyYygxMTAsIDExMCwgMzUsIDIuNjc3OSwgNS43MTIsIHRydWUpO1xuICAgICAgICBjdHgubGluZVRvKDc1LCAwKTtcbiAgICAgICAgY3R4LmFyYyg0MCwgMTEwLCAzNSwgMy43MTIsIDAuNDYzNiwgdHJ1ZSk7XG4gICAgICAgIGN0eC5xdWFkcmF0aWNDdXJ2ZVRvKDcwLCAxNDAsIDUwLCAxODApO1xuICAgIH0sXG5cbiAgICAvLyBSYWluYm93XG4gICAgKGN0eCkgPT4ge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8oMCwgMTQwKTtcbiAgICAgICAgY3R4LmFyYyg3NSwgMTQwLCA3NSwgTWF0aC5QSSwgMCwgZmFsc2UpO1xuICAgICAgICBjdHgubGluZVRvKDEyNSwgMTQwKTtcbiAgICAgICAgY3R4LmFyYyg3NSwgMTQwLCAyNSwgMCwgTWF0aC5QSSwgdHJ1ZSk7XG4gICAgICAgIGN0eC5saW5lVG8oMCwgMTQwKTtcbiAgICB9LFxuXTtcblxuY29uc3QgZHJhd1N1aXRTaGFwZSA9IChzdWl0LCBpKSA9PiB7XG4gICAgLy8gU3VpdCBzaGFwZXMgZ28gaW4gb3JkZXIgZnJvbSBsZWZ0IHRvIHJpZ2h0LCB3aXRoIHRoZSBleGNlcHRpb24gb2YgcmFpbmJvdyBzdWl0cyxcbiAgICAvLyB3aGljaCBhcmUgYWx3YXlzIGdpdmVuIGEgcmFpbmJvdyBzeW1ib2xcbiAgICBpZiAoc3VpdCA9PT0gU1VJVC5SQUlOQk9XIHx8IHN1aXQgPT09IFNVSVQuUkFJTkJPVzFPRSkge1xuICAgICAgICAvLyBUaGUgZmluYWwgc2hhcGUgZnVuY3Rpb24gaW4gdGhlIGFycmF5IGlzIHRoZSByYWluYm93XG4gICAgICAgIGkgPSBzaGFwZUZ1bmN0aW9ucy5sZW5ndGggLSAxO1xuICAgIH1cbiAgICByZXR1cm4gc2hhcGVGdW5jdGlvbnNbaV07XG59O1xuZXhwb3J0cy5kcmF3U3VpdFNoYXBlID0gZHJhd1N1aXRTaGFwZTtcblxuZXhwb3J0cy5zY2FsZUNhcmRJbWFnZSA9IChjb250ZXh0LCBuYW1lLCB3aWR0aCwgaGVpZ2h0LCBhbSkgPT4ge1xuICAgIGxldCBzcmMgPSBnbG9iYWxzLmNhcmRJbWFnZXNbbmFtZV07XG5cbiAgICBpZiAoIXNyYykge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBUaGUgaW1hZ2UgXCIke25hbWV9XCIgd2FzIG5vdCBnZW5lcmF0ZWQuYCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBkdyA9IE1hdGguc3FydChhbS5tWzBdICogYW0ubVswXSArIGFtLm1bMV0gKiBhbS5tWzFdKSAqIHdpZHRoO1xuICAgIGNvbnN0IGRoID0gTWF0aC5zcXJ0KGFtLm1bMl0gKiBhbS5tWzJdICsgYW0ubVszXSAqIGFtLm1bM10pICogaGVpZ2h0O1xuXG4gICAgaWYgKGR3IDwgMSB8fCBkaCA8IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBzdyA9IHdpZHRoO1xuICAgIGxldCBzaCA9IGhlaWdodDtcbiAgICBsZXQgc3RlcHMgPSAwO1xuXG4gICAgaWYgKCFzY2FsZUNhcmRJbWFnZXNbbmFtZV0pIHtcbiAgICAgICAgc2NhbGVDYXJkSW1hZ2VzW25hbWVdID0gW107XG4gICAgfVxuXG4gICAgLy8gU2NhbGluZyB0aGUgY2FyZCBkb3duIGluIHN0ZXBzIG9mIGhhbGYgaW4gZWFjaCBkaW1lbnNpb24gcHJlc3VtYWJseSBpbXByb3ZlcyB0aGUgc2NhbGluZz9cbiAgICB3aGlsZSAoZHcgPCBzdyAvIDIpIHtcbiAgICAgICAgbGV0IHNjYWxlQ2FudmFzID0gc2NhbGVDYXJkSW1hZ2VzW25hbWVdW3N0ZXBzXTtcbiAgICAgICAgc3cgPSBNYXRoLmZsb29yKHN3IC8gMik7XG4gICAgICAgIHNoID0gTWF0aC5mbG9vcihzaCAvIDIpO1xuXG4gICAgICAgIGlmICghc2NhbGVDYW52YXMpIHtcbiAgICAgICAgICAgIHNjYWxlQ2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgICAgICAgICBzY2FsZUNhbnZhcy53aWR0aCA9IHN3O1xuICAgICAgICAgICAgc2NhbGVDYW52YXMuaGVpZ2h0ID0gc2g7XG5cbiAgICAgICAgICAgIGNvbnN0IHNjYWxlQ29udGV4dCA9IHNjYWxlQ2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgICAgICAgICAgIHNjYWxlQ29udGV4dC5kcmF3SW1hZ2Uoc3JjLCAwLCAwLCBzdywgc2gpO1xuXG4gICAgICAgICAgICBzY2FsZUNhcmRJbWFnZXNbbmFtZV1bc3RlcHNdID0gc2NhbGVDYW52YXM7XG4gICAgICAgIH1cblxuICAgICAgICBzcmMgPSBzY2FsZUNhbnZhcztcblxuICAgICAgICBzdGVwcyArPSAxO1xuICAgIH1cblxuICAgIGNvbnRleHQuZHJhd0ltYWdlKHNyYywgMCwgMCwgd2lkdGgsIGhlaWdodCk7XG59O1xuIiwiLypcbiAgICBDYXJkTGF5b3V0IGlzIGFuIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgYSBwbGF5ZXIncyBoYW5kIChvciBhIGRpc2NhcmQgcGlsZSlcbiAgICBJdCBpcyBjb21wb3NlZCBvZiBMYXlvdXRDaGlsZCBvYmplY3RzXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5cbmNvbnN0IENhcmRMYXlvdXQgPSBmdW5jdGlvbiBDYXJkTGF5b3V0KGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgdGhpcy5hbGlnbiA9IChjb25maWcuYWxpZ24gfHwgJ2xlZnQnKTtcbiAgICB0aGlzLnJldmVyc2UgPSAoY29uZmlnLnJldmVyc2UgfHwgZmFsc2UpO1xuICAgIHRoaXMuaW52ZXJ0Q2FyZHMgPSAoY29uZmlnLmludmVydENhcmRzIHx8IGZhbHNlKTtcbn07XG5cbktpbmV0aWMuVXRpbC5leHRlbmQoQ2FyZExheW91dCwgS2luZXRpYy5Hcm91cCk7XG5cbkNhcmRMYXlvdXQucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZChjaGlsZCkge1xuICAgIGNoaWxkLmNoaWxkcmVuLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKGMuZG9Sb3RhdGlvbnMpIHtcbiAgICAgICAgICAgIGMuZG9Sb3RhdGlvbnModGhpcy5pbnZlcnRDYXJkcyk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBwb3MgPSBjaGlsZC5nZXRBYnNvbHV0ZVBvc2l0aW9uKCk7XG4gICAgS2luZXRpYy5Hcm91cC5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgY2hpbGQpO1xuICAgIGNoaWxkLnNldEFic29sdXRlUG9zaXRpb24ocG9zKTtcbiAgICB0aGlzLmRvTGF5b3V0KCk7XG59O1xuXG5DYXJkTGF5b3V0LnByb3RvdHlwZS5fc2V0Q2hpbGRyZW5JbmRpY2VzID0gZnVuY3Rpb24gX3NldENoaWxkcmVuSW5kaWNlcygpIHtcbiAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5fc2V0Q2hpbGRyZW5JbmRpY2VzLmNhbGwodGhpcyk7XG4gICAgdGhpcy5kb0xheW91dCgpO1xufTtcblxuQ2FyZExheW91dC5wcm90b3R5cGUuZG9MYXlvdXQgPSBmdW5jdGlvbiBkb0xheW91dCgpIHtcbiAgICBsZXQgdXcgPSAwO1xuICAgIGxldCBkaXN0ID0gMDtcbiAgICBsZXQgeCA9IDA7XG5cbiAgICBjb25zdCBsdyA9IHRoaXMuZ2V0V2lkdGgoKTtcbiAgICBjb25zdCBsaCA9IHRoaXMuZ2V0SGVpZ2h0KCk7XG5cbiAgICBjb25zdCBuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCBub2RlID0gdGhpcy5jaGlsZHJlbltpXTtcblxuICAgICAgICBpZiAoIW5vZGUuZ2V0SGVpZ2h0KCkpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc2NhbGUgPSBsaCAvIG5vZGUuZ2V0SGVpZ2h0KCk7XG5cbiAgICAgICAgdXcgKz0gc2NhbGUgKiBub2RlLmdldFdpZHRoKCk7XG4gICAgfVxuXG4gICAgaWYgKG4gPiAxKSB7XG4gICAgICAgIGRpc3QgPSAobHcgLSB1dykgLyAobiAtIDEpO1xuICAgIH1cblxuICAgIGlmIChkaXN0ID4gMTApIHtcbiAgICAgICAgZGlzdCA9IDEwO1xuICAgIH1cblxuICAgIHV3ICs9IGRpc3QgKiAobiAtIDEpO1xuXG4gICAgaWYgKHRoaXMuYWxpZ24gPT09ICdjZW50ZXInICYmIHV3IDwgbHcpIHtcbiAgICAgICAgeCA9IChsdyAtIHV3KSAvIDI7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucmV2ZXJzZSkge1xuICAgICAgICB4ID0gbHcgLSB4O1xuICAgIH1cblxuICAgIGNvbnN0IHN0b3JlZFBvc3RBbmltYXRpb25MYXlvdXQgPSBnbG9iYWxzLnBvc3RBbmltYXRpb25MYXlvdXQ7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBjb25zdCBub2RlID0gdGhpcy5jaGlsZHJlbltpXTtcblxuICAgICAgICBpZiAoIW5vZGUuZ2V0SGVpZ2h0KCkpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc2NhbGUgPSBsaCAvIG5vZGUuZ2V0SGVpZ2h0KCk7XG5cbiAgICAgICAgaWYgKG5vZGUudHdlZW4pIHtcbiAgICAgICAgICAgIG5vZGUudHdlZW4uZGVzdHJveSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGdsb2JhbHMuYW5pbWF0ZUZhc3QpIHtcbiAgICAgICAgICAgIG5vZGUuc2V0WCh4IC0gKHRoaXMucmV2ZXJzZSA/IHNjYWxlICogbm9kZS5nZXRXaWR0aCgpIDogMCkpO1xuICAgICAgICAgICAgbm9kZS5zZXRZKDApO1xuICAgICAgICAgICAgbm9kZS5zZXRTY2FsZVgoc2NhbGUpO1xuICAgICAgICAgICAgbm9kZS5zZXRTY2FsZVkoc2NhbGUpO1xuICAgICAgICAgICAgbm9kZS5zZXRSb3RhdGlvbigwKTtcbiAgICAgICAgICAgIG5vZGUuY2hlY2tTZXREcmFnZ2FibGUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFuaW1hdGUgdGhlIGNhcmQgbGVhdmluZyB0aGUgZGVja1xuICAgICAgICAgICAgY29uc3QgY2FyZCA9IG5vZGUuY2hpbGRyZW5bMF07XG4gICAgICAgICAgICBjYXJkLnR3ZWVuaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIG5vZGUudHdlZW4gPSBuZXcgS2luZXRpYy5Ud2Vlbih7XG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogMC41LFxuICAgICAgICAgICAgICAgIHg6IHggLSAodGhpcy5yZXZlcnNlID8gc2NhbGUgKiBub2RlLmdldFdpZHRoKCkgOiAwKSxcbiAgICAgICAgICAgICAgICB5OiAwLFxuICAgICAgICAgICAgICAgIHNjYWxlWDogc2NhbGUsXG4gICAgICAgICAgICAgICAgc2NhbGVZOiBzY2FsZSxcbiAgICAgICAgICAgICAgICByb3RhdGlvbjogMCxcbiAgICAgICAgICAgICAgICBydW5vbmNlOiB0cnVlLFxuICAgICAgICAgICAgICAgIG9uRmluaXNoOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNhcmQudHdlZW5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5jaGVja1NldERyYWdnYWJsZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcmVkUG9zdEFuaW1hdGlvbkxheW91dCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RvcmVkUG9zdEFuaW1hdGlvbkxheW91dCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLnBsYXkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHggKz0gKHNjYWxlICogbm9kZS5nZXRXaWR0aCgpICsgZGlzdCkgKiAodGhpcy5yZXZlcnNlID8gLTEgOiAxKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhcmRMYXlvdXQ7XG4iLCIvKlxuICAgIENhcmRTdGFjayBpcyBhbiBvYmplY3QgdGhhdCByZXByZXNlbnRzIGEgcGxheSBzdGFja1xuICAgIEl0IGlzIGNvbXBvc2VkIG9mIExheW91dENoaWxkIG9iamVjdHNcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuY29uc3QgQ2FyZFN0YWNrID0gZnVuY3Rpb24gQ2FyZFN0YWNrKGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xufTtcblxuS2luZXRpYy5VdGlsLmV4dGVuZChDYXJkU3RhY2ssIEtpbmV0aWMuR3JvdXApO1xuXG5DYXJkU3RhY2sucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIGFkZChjaGlsZCkge1xuICAgIGNoaWxkLmNoaWxkcmVuLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKGMuZG9Sb3RhdGlvbnMpIHtcbiAgICAgICAgICAgIGMuZG9Sb3RhdGlvbnMoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgcG9zID0gY2hpbGQuZ2V0QWJzb2x1dGVQb3NpdGlvbigpO1xuICAgIEtpbmV0aWMuR3JvdXAucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIGNoaWxkKTtcbiAgICBjaGlsZC5zZXRBYnNvbHV0ZVBvc2l0aW9uKHBvcyk7XG4gICAgdGhpcy5kb0xheW91dCgpO1xufTtcblxuQ2FyZFN0YWNrLnByb3RvdHlwZS5fc2V0Q2hpbGRyZW5JbmRpY2VzID0gZnVuY3Rpb24gX3NldENoaWxkcmVuSW5kaWNlcygpIHtcbiAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5fc2V0Q2hpbGRyZW5JbmRpY2VzLmNhbGwodGhpcyk7XG59O1xuXG5DYXJkU3RhY2sucHJvdG90eXBlLmRvTGF5b3V0ID0gZnVuY3Rpb24gZG9MYXlvdXQoKSB7XG4gICAgY29uc3QgbGggPSB0aGlzLmdldEhlaWdodCgpO1xuXG4gICAgY29uc3QgaGlkZVVuZGVyID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBub2RlID0gdGhpcy5jaGlsZHJlbltpXTtcblxuICAgICAgICAgICAgaWYgKCFub2RlLnR3ZWVuKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChub2RlLnR3ZWVuICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbiAtIDE7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5jaGlsZHJlbltpXS5zZXRWaXNpYmxlKGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobiA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGRyZW5bbiAtIDFdLnNldFZpc2libGUodHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLmNoaWxkcmVuW2ldOyAvLyBUaGlzIGlzIGEgTGF5b3V0Q2hpbGRcblxuICAgICAgICBjb25zdCBzY2FsZSA9IGxoIC8gbm9kZS5nZXRIZWlnaHQoKTtcblxuICAgICAgICBpZiAoZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICAgICAgbm9kZS5zZXRYKDApO1xuICAgICAgICAgICAgbm9kZS5zZXRZKDApO1xuICAgICAgICAgICAgbm9kZS5zZXRTY2FsZVgoc2NhbGUpO1xuICAgICAgICAgICAgbm9kZS5zZXRTY2FsZVkoc2NhbGUpO1xuICAgICAgICAgICAgbm9kZS5zZXRSb3RhdGlvbigwKTtcbiAgICAgICAgICAgIGhpZGVVbmRlcigpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQW5pbWF0ZSB0aGUgY2FyZCBsZWF2aW5nIHRoZSBoYW5kIHRvIHRoZSBwbGF5IHN0YWNrc1xuICAgICAgICAgICAgY29uc3QgY2FyZCA9IG5vZGUuY2hpbGRyZW5bMF07XG4gICAgICAgICAgICBjYXJkLnR3ZWVuaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIG5vZGUudHdlZW4gPSBuZXcgS2luZXRpYy5Ud2Vlbih7XG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogMC44LFxuICAgICAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICAgICAgeTogMCxcbiAgICAgICAgICAgICAgICBzY2FsZVg6IHNjYWxlLFxuICAgICAgICAgICAgICAgIHNjYWxlWTogc2NhbGUsXG4gICAgICAgICAgICAgICAgcm90YXRpb246IDAsXG4gICAgICAgICAgICAgICAgcnVub25jZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBvbkZpbmlzaDogKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjYXJkLnR3ZWVuaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIG5vZGUuY2hlY2tTZXREcmFnZ2FibGUoKTtcbiAgICAgICAgICAgICAgICAgICAgaGlkZVVuZGVyKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FyZFN0YWNrO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBDbHVlKHR5cGUsIHZhbHVlKSB7XG4gICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59O1xuIiwiLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgRml0VGV4dCA9IHJlcXVpcmUoJy4vZml0VGV4dCcpO1xuY29uc3QgcmVwbGF5ID0gcmVxdWlyZSgnLi9yZXBsYXknKTtcblxuY29uc3QgSGFuYWJpQ2x1ZUVudHJ5ID0gZnVuY3Rpb24gSGFuYWJpQ2x1ZUVudHJ5KGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgY29uc3QgdyA9IGNvbmZpZy53aWR0aDtcbiAgICBjb25zdCBoID0gY29uZmlnLmhlaWdodDtcblxuICAgIGNvbnN0IGJhY2tncm91bmQgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IHcsXG4gICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgZmlsbDogJ3doaXRlJyxcbiAgICAgICAgb3BhY2l0eTogMC4xLFxuICAgICAgICBsaXN0ZW5pbmc6IHRydWUsXG4gICAgfSk7XG4gICAgdGhpcy5iYWNrZ3JvdW5kID0gYmFja2dyb3VuZDtcblxuICAgIHRoaXMuYWRkKGJhY2tncm91bmQpO1xuXG4gICAgY29uc3QgZ2l2ZXIgPSBuZXcgRml0VGV4dCh7XG4gICAgICAgIHg6IDAuMDUgKiB3LFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogMC4zICogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBmb250U2l6ZTogMC45ICogaCxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBmaWxsOiAnd2hpdGUnLFxuICAgICAgICB0ZXh0OiBjb25maWcuZ2l2ZXIsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG4gICAgdGhpcy5hZGQoZ2l2ZXIpO1xuXG4gICAgY29uc3QgdGFyZ2V0ID0gbmV3IEZpdFRleHQoe1xuICAgICAgICB4OiAwLjQgKiB3LFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogMC4zICogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBmb250U2l6ZTogMC45ICogaCxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBmaWxsOiAnd2hpdGUnLFxuICAgICAgICB0ZXh0OiBjb25maWcudGFyZ2V0LFxuICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgIH0pO1xuICAgIHRoaXMuYWRkKHRhcmdldCk7XG5cbiAgICBjb25zdCBuYW1lID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IDAuNzUgKiB3LFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogMC4yICogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIGZvbnRTaXplOiAwLjkgKiBoLFxuICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgIGZpbGw6ICd3aGl0ZScsXG4gICAgICAgIHRleHQ6IGNvbmZpZy5jbHVlTmFtZSxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZChuYW1lKTtcblxuICAgIGNvbnN0IG5lZ2F0aXZlTWFya2VyID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IDAuODggKiB3LFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogMC4yICogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIGZvbnRTaXplOiAwLjkgKiBoLFxuICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgIGZpbGw6ICd3aGl0ZScsXG4gICAgICAgIHRleHQ6ICfinJgnLFxuICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgICAgICB2aXNpYmxlOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIHRoaXMubmVnYXRpdmVNYXJrZXIgPSBuZWdhdGl2ZU1hcmtlcjtcbiAgICB0aGlzLmFkZChuZWdhdGl2ZU1hcmtlcik7XG5cbiAgICB0aGlzLmxpc3QgPSBjb25maWcubGlzdDtcbiAgICB0aGlzLm5lZ2xpc3QgPSBjb25maWcubmVnbGlzdDtcblxuICAgIC8vIEFkZCBhIG1vdXNlb3ZlciBoaWdobGlnaHRpbmcgZWZmZWN0XG4gICAgYmFja2dyb3VuZC5vbignbW91c2VvdmVyIHRhcCcsICgpID0+IHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLnNob3dNYXRjaGVzKG51bGwpO1xuXG4gICAgICAgIGJhY2tncm91bmQuc2V0T3BhY2l0eSgwLjQpO1xuICAgICAgICBiYWNrZ3JvdW5kLmdldExheWVyKCkuYmF0Y2hEcmF3KCk7XG4gICAgfSk7XG4gICAgYmFja2dyb3VuZC5vbignbW91c2VvdXQnLCAoKSA9PiB7XG4gICAgICAgIC8vIEZpeCB0aGUgYnVnIHdoZXJlIHRoZSBtb3VzZW91dCBjYW4gaGFwcGVuIGFmdGVyIHRoZSBjbHVlIGhhcyBiZWVuIGRlc3Ryb3llZFxuICAgICAgICBpZiAoYmFja2dyb3VuZC5nZXRMYXllcigpID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBiYWNrZ3JvdW5kLnNldE9wYWNpdHkoMC4xKTtcbiAgICAgICAgYmFja2dyb3VuZC5nZXRMYXllcigpLmJhdGNoRHJhdygpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIHR1cm4gdGhhdCB0aGUgY2x1ZSBvY2N1cmVkIGluc2lkZSB0aGlzIG9iamVjdCBmb3IgbGF0ZXJcbiAgICB0aGlzLnR1cm4gPSBjb25maWcudHVybjtcblxuICAgIC8vIENsaWNrIGFuIGVudHJ5IGluIHRoZSBjbHVlIGxvZyB0byBnbyB0byB0aGF0IHR1cm4gaW4gdGhlIHJlcGxheVxuICAgIGJhY2tncm91bmQub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgICAgIHJlcGxheS5jaGVja0Rpc2FibGVTaGFyZWRUdXJucygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVwbGF5LmVudGVyKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGF5LmdvdG8odGhpcy50dXJuICsgMSwgdHJ1ZSk7XG4gICAgfSk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEhhbmFiaUNsdWVFbnRyeSwgS2luZXRpYy5Hcm91cCk7XG5cbkhhbmFiaUNsdWVFbnRyeS5wcm90b3R5cGUuY2hlY2tWYWxpZCA9IChjKSA9PiB7XG4gICAgaWYgKCFnbG9iYWxzLmRlY2tbY10pIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmICghZ2xvYmFscy5kZWNrW2NdLnBhcmVudCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIGdsb2JhbHMuZGVja1tjXS5pc0luUGxheWVySGFuZCgpO1xufTtcblxuLy8gUmV0dXJucyBudW1iZXIgb2YgZXhwaXJhdGlvbnMsIGVpdGhlciAwIG9yIDEgZGVwZW5kaW5nIG9uIHdoZXRoZXIgaXQgZXhwaXJlZFxuSGFuYWJpQ2x1ZUVudHJ5LnByb3RvdHlwZS5jaGVja0V4cGlyeSA9IGZ1bmN0aW9uIGNoZWNrRXhwaXJ5KCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5saXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrVmFsaWQodGhpcy5saXN0W2ldKSkge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubmVnbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodGhpcy5jaGVja1ZhbGlkKHRoaXMubmVnbGlzdFtpXSkpIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5vZmYoJ21vdXNlb3ZlciB0YXAnKTtcbiAgICB0aGlzLm9mZignbW91c2VvdXQnKTtcblxuICAgIHRoaXMucmVtb3ZlKCk7XG4gICAgcmV0dXJuIDE7XG59O1xuXG5IYW5hYmlDbHVlRW50cnkucHJvdG90eXBlLnNob3dNYXRjaCA9IGZ1bmN0aW9uIHNob3dNYXRjaCh0YXJnZXQpIHtcbiAgICB0aGlzLmJhY2tncm91bmQuc2V0T3BhY2l0eSgwLjEpO1xuICAgIHRoaXMuYmFja2dyb3VuZC5zZXRGaWxsKCd3aGl0ZScpO1xuICAgIHRoaXMubmVnYXRpdmVNYXJrZXIuc2V0VmlzaWJsZShmYWxzZSk7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZ2xvYmFscy5kZWNrW3RoaXMubGlzdFtpXV0gPT09IHRhcmdldCkge1xuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kLnNldE9wYWNpdHkoMC40KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5uZWdsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChnbG9iYWxzLmRlY2tbdGhpcy5uZWdsaXN0W2ldXSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmQuc2V0T3BhY2l0eSgwLjQpO1xuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kLnNldEZpbGwoJyNmZjc3NzcnKTtcbiAgICAgICAgICAgIGlmIChnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dDb2xvcmJsaW5kVUkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5lZ2F0aXZlTWFya2VyLnNldFZpc2libGUodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEhhbmFiaUNsdWVFbnRyeTtcbiIsIi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuY29uc3QgSGFuYWJpQ2x1ZUxvZyA9IGZ1bmN0aW9uIEhhbmFiaUNsdWVMb2coY29uZmlnKSB7XG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGNvbmZpZyk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEhhbmFiaUNsdWVMb2csIEtpbmV0aWMuR3JvdXApO1xuXG5IYW5hYmlDbHVlTG9nLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiBhZGQoY2hpbGQpIHtcbiAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBjaGlsZCk7XG4gICAgdGhpcy5kb0xheW91dCgpO1xufTtcblxuSGFuYWJpQ2x1ZUxvZy5wcm90b3R5cGUuX3NldENoaWxkcmVuSW5kaWNlcyA9IGZ1bmN0aW9uIF9zZXRDaGlsZHJlbkluZGljZXMoKSB7XG4gICAgS2luZXRpYy5Hcm91cC5wcm90b3R5cGUuX3NldENoaWxkcmVuSW5kaWNlcy5jYWxsKHRoaXMpO1xuICAgIHRoaXMuZG9MYXlvdXQoKTtcbn07XG5cbkhhbmFiaUNsdWVMb2cucHJvdG90eXBlLmRvTGF5b3V0ID0gZnVuY3Rpb24gZG9MYXlvdXQoKSB7XG4gICAgbGV0IHkgPSAwO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSB0aGlzLmNoaWxkcmVuW2ldO1xuXG4gICAgICAgIG5vZGUuc2V0WSh5KTtcblxuICAgICAgICB5ICs9IG5vZGUuZ2V0SGVpZ2h0KCkgKyAwLjAwMSAqIGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCk7XG4gICAgfVxufTtcblxuSGFuYWJpQ2x1ZUxvZy5wcm90b3R5cGUuY2hlY2tFeHBpcnkgPSBmdW5jdGlvbiBjaGVja0V4cGlyeSgpIHtcbiAgICBjb25zdCBtYXhMZW5ndGggPSAzMTtcbiAgICBjb25zdCBjaGlsZHJlblRvUmVtb3ZlID0gdGhpcy5jaGlsZHJlbi5sZW5ndGggLSBtYXhMZW5ndGg7XG4gICAgaWYgKGNoaWxkcmVuVG9SZW1vdmUgPCAxKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IGNoaWxkcmVuUmVtb3ZlZCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNoaWxkcmVuUmVtb3ZlZCArPSB0aGlzLmNoaWxkcmVuW2ldLmNoZWNrRXhwaXJ5KCk7XG4gICAgICAgIGlmIChjaGlsZHJlblJlbW92ZWQgPj0gY2hpbGRyZW5Ub1JlbW92ZSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmRvTGF5b3V0KCk7XG59O1xuXG5IYW5hYmlDbHVlTG9nLnByb3RvdHlwZS5zaG93TWF0Y2hlcyA9IGZ1bmN0aW9uIHNob3dNYXRjaGVzKHRhcmdldCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLmNoaWxkcmVuW2ldLnNob3dNYXRjaCh0YXJnZXQpO1xuICAgIH1cbn07XG5cbkhhbmFiaUNsdWVMb2cucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gY2xlYXIoKSB7XG4gICAgZm9yIChsZXQgaSA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbltpXS5yZW1vdmUoKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEhhbmFiaUNsdWVMb2c7XG4iLCIvLyBJbXBvcnRzXG5jb25zdCBCdXR0b24gPSByZXF1aXJlKCcuL2J1dHRvbicpO1xuXG5jb25zdCBDbHVlUmVjaXBpZW50QnV0dG9uID0gZnVuY3Rpb24gQ2x1ZVJlY2lwaWVudEJ1dHRvbihjb25maWcpIHtcbiAgICBCdXR0b24uY2FsbCh0aGlzLCBjb25maWcpO1xuICAgIHRoaXMudGFyZ2V0SW5kZXggPSBjb25maWcudGFyZ2V0SW5kZXg7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKENsdWVSZWNpcGllbnRCdXR0b24sIEJ1dHRvbik7XG5cbm1vZHVsZS5leHBvcnRzID0gQ2x1ZVJlY2lwaWVudEJ1dHRvbjtcbiIsIi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuY29uc3QgQ29sb3JCdXR0b24gPSBmdW5jdGlvbiBDb2xvckJ1dHRvbihjb25maWcpIHtcbiAgICBLaW5ldGljLkdyb3VwLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAgIGNvbnN0IHcgPSB0aGlzLmdldFdpZHRoKCk7XG4gICAgY29uc3QgaCA9IHRoaXMuZ2V0SGVpZ2h0KCk7XG5cbiAgICBjb25zdCBiYWNrZ3JvdW5kID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIG5hbWU6ICdiYWNrZ3JvdW5kJyxcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IHcsXG4gICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgbGlzdGVuaW5nOiB0cnVlLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IDAuMTIgKiBoLFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBvcGFjaXR5OiAwLjYsXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZChiYWNrZ3JvdW5kKTtcblxuICAgIGNvbnN0IGNvbG9yID0gbmV3IEtpbmV0aWMuUmVjdCh7XG4gICAgICAgIHg6IDAuMSAqIHcsXG4gICAgICAgIHk6IDAuMSAqIGgsXG4gICAgICAgIHdpZHRoOiAwLjggKiB3LFxuICAgICAgICBoZWlnaHQ6IDAuOCAqIGgsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4xMiAqIDAuOCAqIGgsXG4gICAgICAgIGZpbGw6IGNvbmZpZy5jb2xvcixcbiAgICAgICAgb3BhY2l0eTogMC45LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGQoY29sb3IpO1xuXG4gICAgY29uc3QgdGV4dCA9IG5ldyBLaW5ldGljLlRleHQoe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLjIgKiBoLFxuICAgICAgICB3aWR0aDogdyxcbiAgICAgICAgaGVpZ2h0OiAwLjYgKiBoLFxuICAgICAgICBsaXN0ZW5pbmc6IGZhbHNlLFxuICAgICAgICBmb250U2l6ZTogMC41ICogaCxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBmaWxsOiAnd2hpdGUnLFxuICAgICAgICBzdHJva2U6ICdibGFjaycsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAxLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHRleHQ6IGNvbmZpZy50ZXh0LFxuICAgICAgICB2aXNpYmxlOiBnbG9iYWxzLmxvYmJ5LnNldHRpbmdzLnNob3dDb2xvcmJsaW5kVUksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZCh0ZXh0KTtcblxuICAgIHRoaXMucHJlc3NlZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5jbHVlID0gY29uZmlnLmNsdWU7XG5cbiAgICBiYWNrZ3JvdW5kLm9uKCdtb3VzZWRvd24nLCAoKSA9PiB7XG4gICAgICAgIGJhY2tncm91bmQuc2V0RmlsbCgnIzg4ODg4OCcpO1xuICAgICAgICBiYWNrZ3JvdW5kLmdldExheWVyKCkuZHJhdygpO1xuXG4gICAgICAgIGNvbnN0IHJlc2V0QnV0dG9uID0gKCkgPT4ge1xuICAgICAgICAgICAgYmFja2dyb3VuZC5zZXRGaWxsKCdibGFjaycpO1xuICAgICAgICAgICAgYmFja2dyb3VuZC5nZXRMYXllcigpLmRyYXcoKTtcblxuICAgICAgICAgICAgYmFja2dyb3VuZC5vZmYoJ21vdXNldXAnKTtcbiAgICAgICAgICAgIGJhY2tncm91bmQub2ZmKCdtb3VzZW91dCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGJhY2tncm91bmQub24oJ21vdXNlb3V0JywgKCkgPT4ge1xuICAgICAgICAgICAgcmVzZXRCdXR0b24oKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGJhY2tncm91bmQub24oJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgICAgICAgICByZXNldEJ1dHRvbigpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbktpbmV0aWMuVXRpbC5leHRlbmQoQ29sb3JCdXR0b24sIEtpbmV0aWMuR3JvdXApO1xuXG5Db2xvckJ1dHRvbi5wcm90b3R5cGUuc2V0UHJlc3NlZCA9IGZ1bmN0aW9uIHNldFByZXNzZWQocHJlc3NlZCkge1xuICAgIHRoaXMucHJlc3NlZCA9IHByZXNzZWQ7XG5cbiAgICB0aGlzLmdldCgnLmJhY2tncm91bmQnKVswXS5zZXRGaWxsKHByZXNzZWQgPyAnI2NjY2NjYycgOiAnYmxhY2snKTtcblxuICAgIHRoaXMuZ2V0TGF5ZXIoKS5iYXRjaERyYXcoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ29sb3JCdXR0b247XG4iLCIvKlxuICAgIFRoZXNlIGFyZSBoZWxwZXIgZnVuY3Rpb25zIHRoYXQgY29udmVydCBvYmplY3RzXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBjb25zdGFudHMgPSByZXF1aXJlKCcuLi8uLi9jb25zdGFudHMnKTtcbmNvbnN0IENsdWUgPSByZXF1aXJlKCcuL2NsdWUnKTtcblxuLy8gQ29udmVydCBhIGNsdWUgdG8gdGhlIGZvcm1hdCB1c2VkIGJ5IHRoZSBzZXJ2ZXJcbi8vIE9uIHRoZSBjbGllbnQsIHRoZSBjb2xvciBpcyBhIHJpY2ggb2JqZWN0XG4vLyBPbiB0aGUgc2VydmVyLCB0aGUgY29sb3IgaXMgYSBzaW1wbGUgaW50ZWdlciBtYXBwaW5nXG5leHBvcnRzLmNsdWVUb01zZ0NsdWUgPSAoY2x1ZSwgdmFyaWFudCkgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgICAgdHlwZTogY2x1ZVR5cGUsXG4gICAgICAgIHZhbHVlOiBjbHVlVmFsdWUsXG4gICAgfSA9IGNsdWU7XG4gICAgbGV0IG1zZ0NsdWVWYWx1ZTtcbiAgICBpZiAoY2x1ZVR5cGUgPT09IGNvbnN0YW50cy5DTFVFX1RZUEUuQ09MT1IpIHtcbiAgICAgICAgY29uc3QgY2x1ZUNvbG9yID0gY2x1ZVZhbHVlO1xuICAgICAgICBtc2dDbHVlVmFsdWUgPSB2YXJpYW50LmNsdWVDb2xvcnMuZmluZEluZGV4KGNvbG9yID0+IGNvbG9yID09PSBjbHVlQ29sb3IpO1xuICAgIH0gZWxzZSBpZiAoY2x1ZVR5cGUgPT09IGNvbnN0YW50cy5DTFVFX1RZUEUuUkFOSykge1xuICAgICAgICBtc2dDbHVlVmFsdWUgPSBjbHVlVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IGNsdWVUeXBlLFxuICAgICAgICB2YWx1ZTogbXNnQ2x1ZVZhbHVlLFxuICAgIH07XG59O1xuXG5leHBvcnRzLm1zZ0NsdWVUb0NsdWUgPSAobXNnQ2x1ZSwgdmFyaWFudCkgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgICAgdHlwZTogY2x1ZVR5cGUsXG4gICAgICAgIHZhbHVlOiBtc2dDbHVlVmFsdWUsXG4gICAgfSA9IG1zZ0NsdWU7XG4gICAgbGV0IGNsdWVWYWx1ZTtcbiAgICBpZiAoY2x1ZVR5cGUgPT09IGNvbnN0YW50cy5DTFVFX1RZUEUuQ09MT1IpIHtcbiAgICAgICAgY2x1ZVZhbHVlID0gdmFyaWFudC5jbHVlQ29sb3JzW21zZ0NsdWVWYWx1ZV07XG4gICAgfSBlbHNlIGlmIChjbHVlVHlwZSA9PT0gY29uc3RhbnRzLkNMVUVfVFlQRS5SQU5LKSB7XG4gICAgICAgIGNsdWVWYWx1ZSA9IG1zZ0NsdWVWYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBDbHVlKGNsdWVUeXBlLCBjbHVlVmFsdWUpO1xufTtcblxuZXhwb3J0cy5tc2dTdWl0VG9TdWl0ID0gKG1zZ1N1aXQsIHZhcmlhbnQpID0+IHZhcmlhbnQuc3VpdHNbbXNnU3VpdF07XG4iLCJjb25zdCBGaXRUZXh0ID0gZnVuY3Rpb24gRml0VGV4dChjb25maWcpIHtcbiAgICBLaW5ldGljLlRleHQuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgdGhpcy5vcmlnRm9udFNpemUgPSB0aGlzLmdldEZvbnRTaXplKCk7XG4gICAgdGhpcy5uZWVkc1Jlc2l6ZSA9IHRydWU7XG5cbiAgICB0aGlzLnNldERyYXdGdW5jKGZ1bmN0aW9uIHNldERyYXdGdW5jKGNvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMubmVlZHNSZXNpemUpIHtcbiAgICAgICAgICAgIHRoaXMucmVzaXplKCk7XG4gICAgICAgIH1cbiAgICAgICAgS2luZXRpYy5UZXh0LnByb3RvdHlwZS5fc2NlbmVGdW5jLmNhbGwodGhpcywgY29udGV4dCk7XG4gICAgfSk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEZpdFRleHQsIEtpbmV0aWMuVGV4dCk7XG5cbkZpdFRleHQucHJvdG90eXBlLnJlc2l6ZSA9IGZ1bmN0aW9uIHJlc2l6ZSgpIHtcbiAgICB0aGlzLnNldEZvbnRTaXplKHRoaXMub3JpZ0ZvbnRTaXplKTtcblxuICAgIHdoaWxlIChcbiAgICAgICAgdGhpcy5fZ2V0VGV4dFNpemUodGhpcy5nZXRUZXh0KCkpLndpZHRoID4gdGhpcy5nZXRXaWR0aCgpXG4gICAgICAgICYmIHRoaXMuZ2V0Rm9udFNpemUoKSA+IDVcbiAgICApIHtcbiAgICAgICAgdGhpcy5zZXRGb250U2l6ZSh0aGlzLmdldEZvbnRTaXplKCkgKiAwLjkpO1xuICAgIH1cblxuICAgIHRoaXMubmVlZHNSZXNpemUgPSBmYWxzZTtcbn07XG5cbkZpdFRleHQucHJvdG90eXBlLnNldFRleHQgPSBmdW5jdGlvbiBzZXRUZXh0KHRleHQpIHtcbiAgICBLaW5ldGljLlRleHQucHJvdG90eXBlLnNldFRleHQuY2FsbCh0aGlzLCB0ZXh0KTtcblxuICAgIHRoaXMubmVlZHNSZXNpemUgPSB0cnVlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGaXRUZXh0O1xuIiwiLy8gVGhpcyBvYmplY3QgY29udGFpbnMgZ2xvYmFsIHZhcmlhYmxlcyBmb3IgdGhlIFwidWkuanNcIiBmaWxlXG5jb25zdCBnbG9iYWxzID0ge307XG4vLyAodGhleSBhcmUgaW5pdGlhbGl6ZWQgaW4gdGhlIFwiZ2xvYmFsc0luaXQuanNcIiBmaWxlKVxubW9kdWxlLmV4cG9ydHMgPSBnbG9iYWxzO1xuXG4vLyBBbHNvIG1ha2UgaXQgYXZhaWxhYmxlIHRvIHRoZSB3aW5kb3cgc28gdGhhdCB3ZSBjYW4gYWNjZXNzIGdsb2JhbCB2YXJpYWJsZXNcbi8vIGZyb20gdGhlIEphdmFTY3JpcHQgY29uc29sZSAoZm9yIGRlYnVnZ2luZyBwdXJwb3NlcylcbndpbmRvdy5nbG9iYWxzMiA9IGdsb2JhbHM7XG4iLCIvLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5cbi8vIENvbmZpZ3VyYXRpb25cbmNvbnN0IGRlYnVnID0gdHJ1ZTtcblxuLy8gV2UgbW9kaWZ5IHRoZSBpbmRpdmlkdWFsIHByb3BlcnRpZXMgaW5zdGVhZCBvZiByZXBsYWNpbmcgdGhlIGVudGlyZSBnbG9iYWxzIG9iamVjdFxuLy8gSWYgd2UgZGlkIHRoYXQsIHRoZSByZWZlcmVuY2VzIGluIHRoZSBvdGhlciBmaWxlcyB3b3VsZCBwb2ludCB0byB0aGUgb3V0ZGF0ZWQgdmVyc2lvblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiB7XG4gICAgZ2xvYmFscy5kZWJ1ZyA9IGRlYnVnO1xuXG4gICAgLy8gT2JqZWN0cyBzZW50IHVwb24gVUkgaW5pdGlhbGl6YXRpb25cbiAgICBnbG9iYWxzLmxvYmJ5ID0gbnVsbDtcbiAgICBnbG9iYWxzLmdhbWUgPSBudWxsO1xuXG4gICAgLy8gR2FtZSBzZXR0aW5nc1xuICAgIC8vIChzZW50IGluIHRoZSBcImluaXRcIiBtZXNzYWdlKVxuICAgIGdsb2JhbHMucGxheWVyTmFtZXMgPSBbXTtcbiAgICBnbG9iYWxzLnZhcmlhbnQgPSBudWxsO1xuICAgIGdsb2JhbHMucGxheWVyVXMgPSAtMTtcbiAgICBnbG9iYWxzLnNwZWN0YXRpbmcgPSBmYWxzZTtcbiAgICBnbG9iYWxzLnJlcGxheSA9IGZhbHNlOyAvLyBUcnVlIGlmIGEgc29sbyBvciBzaGFyZWQgcmVwbGF5XG4gICAgZ2xvYmFscy5zaGFyZWRSZXBsYXkgPSBmYWxzZTtcblxuICAgIC8vIE9wdGlvbmFsIGdhbWUgc2V0dGluZ3NcbiAgICAvLyAoc2VudCBpbiB0aGUgXCJpbml0XCIgbWVzc2FnZSBpbiBcIndlYnNvY2tldC5qc1wiKVxuICAgIGdsb2JhbHMudGltZWQgPSBmYWxzZTtcbiAgICBnbG9iYWxzLmJhc2VUaW1lID0gbnVsbDtcbiAgICBnbG9iYWxzLnRpbWVQZXJUdXJuID0gbnVsbDtcbiAgICBnbG9iYWxzLnNwZWVkcnVuID0gZmFsc2U7XG4gICAgZ2xvYmFscy5kZWNrUGxheXMgPSBmYWxzZTtcbiAgICBnbG9iYWxzLmVtcHR5Q2x1ZXMgPSBmYWxzZTtcbiAgICBnbG9iYWxzLmNoYXJhY3RlckFzc2lnbm1lbnRzID0gW107XG4gICAgLy8gVGhpcyBpcyB0aGUgXCJEZXRyaW1lbnRhbCBDaGFyYWN0ZXIgQXNzaWdubWVudHNcIiBmb3IgZWFjaCBwbGF5ZXIsIGlmIGVuYWJsZWRcbiAgICAvLyAoaXQgaXMgZWl0aGVyIGFuIGVtcHR5IGFycmF5IG9yIGFuIGFycmF5IG9mIGludGVnZXJzKVxuICAgIGdsb2JhbHMuY2hhcmFjdGVyTWV0YWRhdGEgPSBbXTtcbiAgICAvLyBUaGlzIGlzIGV4dHJhIGluZm9ybWF0aW9uIGFib3V0IGVhY2ggcGxheWVyJ3MgXCJEZXRyaW1lbnRhbCBDaGFyYWN0ZXIgQXNzaWdubWVudHNcIixcbiAgICAvLyBpZiBlbmFibGVkIChpdCBpcyBlaXRoZXIgYW4gZW1wdHkgYXJyYXkgb3IgYW4gYXJyYXkgb2YgaW50ZWdlcnMpXG5cbiAgICAvLyBHYW1lIHN0YXRlIHZhcmlhYmxlc1xuICAgIGdsb2JhbHMucmVhZHkgPSBmYWxzZTtcbiAgICBnbG9iYWxzLmRlY2sgPSBbXTtcbiAgICBnbG9iYWxzLmRlY2tTaXplID0gMDtcbiAgICBnbG9iYWxzLnR1cm4gPSAwO1xuICAgIGdsb2JhbHMuc2NvcmUgPSAwO1xuICAgIGdsb2JhbHMuY2x1ZXMgPSAwO1xuICAgIGdsb2JhbHMuc3BlY3RhdG9ycyA9IFtdO1xuXG4gICAgLy8gRWZmaWNpZW5jeSB2YXJpYWJsZXNcbiAgICBnbG9iYWxzLmNhcmRzR290dGVuID0gMDtcbiAgICBnbG9iYWxzLmNsdWVzU3BlbnRQbHVzU3RyaWtlcyA9IDA7XG5cbiAgICAvLyBSZXBsYXkgdmFyaWFibGVzXG4gICAgZ2xvYmFscy5pblJlcGxheSA9IGZhbHNlOyAvLyBXaGV0aGVyIG9yIG5vdCB0aGUgcmVwbGF5IGNvbnRyb2xzIGFyZSBjdXJyZW50bHkgc2hvd2luZ1xuICAgIGdsb2JhbHMucmVwbGF5TG9nID0gW107XG4gICAgZ2xvYmFscy5yZXBsYXlQb3MgPSAwO1xuICAgIGdsb2JhbHMucmVwbGF5VHVybiA9IDA7XG4gICAgZ2xvYmFscy5yZXBsYXlNYXggPSAwO1xuICAgIC8vIEluIHJlcGxheXMsIHdlIGNhbiBzaG93IGluZm9ybWF0aW9uIGFib3V0IGEgY2FyZCB0aGF0IHdhcyBub3Qga25vd24gYXQgdGhlIHRpbWUsXG4gICAgLy8gYnV0IGlzIGtub3duIG5vdzsgdGhlc2UgYXJlIGNhcmRzIHdlIGhhdmUgXCJsZWFybmVkXCJcbiAgICBnbG9iYWxzLmxlYXJuZWRDYXJkcyA9IFtdO1xuXG4gICAgLy8gU2hhcmVkIHJlcGxheSB2YXJpYWJsZXNcbiAgICBnbG9iYWxzLnNoYXJlZFJlcGxheUxlYWRlciA9ICcnOyAvLyBFcXVhbCB0byB0aGUgdXNlcm5hbWUgb2YgdGhlIGxlYWRlclxuICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5VHVybiA9IC0xO1xuICAgIGdsb2JhbHMudXNlU2hhcmVkVHVybnMgPSB0cnVlO1xuXG4gICAgLy8gVUkgZWxlbWVudHNcbiAgICBnbG9iYWxzLkltYWdlTG9hZGVyID0gbnVsbDtcbiAgICBnbG9iYWxzLnN0YWdlID0gbnVsbDtcbiAgICBnbG9iYWxzLmxheWVycyA9IHtcbiAgICAgICAgYmFja2dyb3VuZDogbnVsbCxcbiAgICAgICAgY2FyZDogbnVsbCxcbiAgICAgICAgVUk6IG51bGwsXG4gICAgICAgIG92ZXJ0b3A6IG51bGwsIC8vIEEgbGF5ZXIgZHJhd24gb3ZlcnRvcCBldmVyeXRoaW5nIGVsc2VcbiAgICAgICAgdGV4dDogbnVsbCxcbiAgICAgICAgdGltZXI6IG51bGwsXG4gICAgfTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzID0ge1xuICAgICAgICAvLyBUaGUgbWFpbiBzY3JlZW5cbiAgICAgICAgc3RhZ2VGYWRlOiBudWxsLFxuICAgICAgICBwbGF5QXJlYTogbnVsbCxcbiAgICAgICAgcGxheVN0YWNrczogbmV3IE1hcCgpLFxuICAgICAgICBzdWl0TGFiZWxUZXh0czogW10sXG4gICAgICAgIGRpc2NhcmRBcmVhOiBudWxsLFxuICAgICAgICBkaXNjYXJkU3RhY2tzOiBuZXcgTWFwKCksXG4gICAgICAgIHBsYXllckhhbmRzOiBbXSxcbiAgICAgICAgbmFtZUZyYW1lczogW10sXG4gICAgICAgIG1lc3NhZ2VQcm9tcHQ6IG51bGwsIC8vIFRoZSB0cnVuY2F0ZWQgYWN0aW9uIGxvZ1xuICAgICAgICByZXBsYXlCdXR0b246IG51bGwsXG4gICAgICAgIGNoYXRCdXR0b246IG51bGwsXG4gICAgICAgIGRyYXdEZWNrOiBudWxsLFxuICAgICAgICBkZWNrUGxheUF2YWlsYWJsZUxhYmVsOiBudWxsLFxuXG4gICAgICAgIC8vIEV4dHJhIGVsZW1lbnRzIG9uIHRoZSByaWdodC1oYW5kIHNpZGUgKyB0aGUgYm90dG9tXG4gICAgICAgIGNsdWVMb2c6IG51bGwsXG4gICAgICAgIHBhY2VOdW1iZXJMYWJlbDogbnVsbCxcbiAgICAgICAgZWZmaWNpZW5jeU51bWJlckxhYmVsOiBudWxsLFxuICAgICAgICBub0Rpc2NhcmRMYWJlbDogbnVsbCxcbiAgICAgICAgbm9Eb3VibGVEaXNjYXJkTGFiZWw6IG51bGwsXG4gICAgICAgIHNjb3JlQXJlYTogbnVsbCxcbiAgICAgICAgdHVybk51bWJlckxhYmVsOiBudWxsLFxuICAgICAgICBzY29yZU51bWJlckxhYmVsOiBudWxsLFxuICAgICAgICBjbHVlc051bWJlckxhYmVsOiBudWxsLFxuICAgICAgICBzdHJpa2VzOiBbXSxcbiAgICAgICAgc3BlY3RhdG9yc0xhYmVsOiBudWxsLFxuICAgICAgICBzcGVjdGF0b3JzTnVtTGFiZWw6IG51bGwsXG4gICAgICAgIHNoYXJlZFJlcGxheUxlYWRlckxhYmVsOiBudWxsLFxuICAgICAgICBzaGFyZWRSZXBsYXlMZWFkZXJMYWJlbFB1bHNlOiBudWxsLFxuXG4gICAgICAgIC8vIFRoZSBjbHVlIFVJXG4gICAgICAgIGNsdWVBcmVhOiBudWxsLFxuICAgICAgICBjbHVlVGFyZ2V0QnV0dG9uR3JvdXA6IG51bGwsXG4gICAgICAgIGNsdWVCdXR0b25Hcm91cDogbnVsbCxcbiAgICAgICAgcmFua0NsdWVCdXR0b25zOiBudWxsLFxuICAgICAgICBzdWl0Q2x1ZUJ1dHRvbnM6IG51bGwsXG4gICAgICAgIGdpdmVDbHVlQnV0dG9uOiBudWxsLFxuICAgICAgICBub0NsdWVCb3g6IG51bGwsXG4gICAgICAgIG5vQ2x1ZUxhYmVsOiBudWxsLFxuXG4gICAgICAgIC8vIFRoZSByZXBsYXkgc2NyZWVuXG4gICAgICAgIHJlcGxheUFyZWE6IG51bGwsXG4gICAgICAgIHJlcGxheVNodXR0bGVTaGFyZWQ6IG51bGwsXG4gICAgICAgIHJlcGxheUV4aXRCdXR0b246IG51bGwsXG5cbiAgICAgICAgLy8gT3RoZXIgc2NyZWVuc1xuICAgICAgICBtc2dMb2dHcm91cDogbnVsbCwgLy8gVGhlIGZ1bGwgYWN0aW9uIGxvZ1xuXG4gICAgICAgIC8vIE90aGVyIG9wdGlvbmFsIGVsZW1lbnRzXG4gICAgICAgIHRpbWVyMTogbnVsbCxcbiAgICAgICAgdGltZXIyOiBudWxsLFxuICAgIH07XG4gICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IG51bGw7IC8vIFRoZSBlbGVtZW50IHRoYXQgdGhlIG1vdXNlIGN1cnNvciBpcyBjdXJyZW50bHkgb3ZlclxuICAgIGdsb2JhbHMuY2FyZEltYWdlcyA9IHt9O1xuXG4gICAgLy8gUHJlLXBsYXkgZmVhdHVyZVxuICAgIGdsb2JhbHMub3VyVHVybiA9IGZhbHNlO1xuICAgIGdsb2JhbHMucXVldWVkQWN0aW9uID0gbnVsbDtcblxuICAgIC8vIE1pc2NlbGxhbmVvdXNcbiAgICBnbG9iYWxzLmFuaW1hdGVGYXN0ID0gdHJ1ZTtcbiAgICBnbG9iYWxzLnNhdmVkQWN0aW9uID0gbnVsbDsgLy8gVXNlZCB0byBzYXZlIG5ldyBhY3Rpb25zIHdoZW4gaW4gYW4gaW4tZ2FtZSByZXBsYXlcbiAgICBnbG9iYWxzLnBvc3RBbmltYXRpb25MYXlvdXQgPSBudWxsO1xuICAgIC8vIEEgZnVuY3Rpb24gY2FsbGVkIGFmdGVyIGFuIGFjdGlvbiBmcm9tIHRoZSBzZXJ2ZXIgbW92ZXMgY2FyZHNcbiAgICBnbG9iYWxzLmxhc3RBY3Rpb24gPSBudWxsOyAvLyBVc2VkIHdoZW4gcmVidWlsZGluZyB0aGUgZ2FtZSBzdGF0ZVxuICAgIGdsb2JhbHMuYWNjaWRlbnRhbENsdWVUaW1lciA9IERhdGUubm93KCk7XG4gICAgLy8gVXNlZCB0byBwcmV2ZW50IGdpdmluZyBhbiBhY2NpZGVudGFsIGNsdWUgYWZ0ZXIgY2xpY2tpbmcgdGhlIFwiRXhpdCBSZXBsYXlcIiBidXR0b25cbiAgICBnbG9iYWxzLmNoYXRVbnJlYWQgPSAwO1xufTtcbiIsIi8qXG4gICAgRnVuY3Rpb25zIGZvciBoYW5kbGluZyBhbGwgb2YgdGhlIGtleWJvYXJkIHNob3J0Y3V0c1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5jb25zdCBub3RlcyA9IHJlcXVpcmUoJy4vbm90ZXMnKTtcbmNvbnN0IHJlcGxheSA9IHJlcXVpcmUoJy4vcmVwbGF5Jyk7XG5cbi8vIENvbnN0YW50c1xuY29uc3QgeyBBQ1QgfSA9IGNvbnN0YW50cztcblxuLy8gVmFyaWFibGVzXG5jb25zdCBob3RrZXlNYXAgPSB7fTtcblxuZXhwb3J0cy5pbml0ID0gKCkgPT4ge1xuICAgIC8qXG4gICAgICAgIEJ1aWxkIG1hcHBpbmdzIG9mIGhvdGtleXMgdG8gZnVuY3Rpb25zXG4gICAgKi9cblxuICAgIGhvdGtleU1hcC5yZXBsYXkgPSB7XG4gICAgICAgICdBcnJvd0xlZnQnOiByZXBsYXkuYmFjayxcbiAgICAgICAgJ0Fycm93UmlnaHQnOiByZXBsYXkuZm9yd2FyZCxcblxuICAgICAgICAnWyc6IHJlcGxheS5iYWNrUm91bmQsXG4gICAgICAgICddJzogcmVwbGF5LmZvcndhcmRSb3VuZCxcblxuICAgICAgICAnSG9tZSc6IHJlcGxheS5iYWNrRnVsbCxcbiAgICAgICAgJ0VuZCc6IHJlcGxheS5mb3J3YXJkRnVsbCxcbiAgICB9O1xuXG4gICAgaG90a2V5TWFwLmNsdWUgPSB7fTtcblxuICAgIC8vIEFkZCBcIlRhYlwiIGZvciBwbGF5ZXIgc2VsZWN0aW9uXG4gICAgaG90a2V5TWFwLmNsdWUuVGFiID0gKCkgPT4ge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVUYXJnZXRCdXR0b25Hcm91cC5zZWxlY3ROZXh0VGFyZ2V0KCk7XG4gICAgfTtcblxuICAgIC8vIEFkZCBcIjFcIiwgXCIyXCIsIFwiM1wiLCBcIjRcIiwgYW5kIFwiNVwiIChmb3IgbnVtYmVyIGNsdWVzKVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5lbGVtZW50cy5yYW5rQ2x1ZUJ1dHRvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgLy8gVGhlIGJ1dHRvbiBmb3IgXCIxXCIgaXMgYXQgYXJyYXkgaW5kZXggMCwgZXRjLlxuICAgICAgICBob3RrZXlNYXAuY2x1ZVtpICsgMV0gPSBjbGljayhnbG9iYWxzLmVsZW1lbnRzLnJhbmtDbHVlQnV0dG9uc1tpXSk7XG4gICAgfVxuXG4gICAgLy8gQWRkIFwicVwiLCBcIndcIiwgXCJlXCIsIFwiclwiLCBcInRcIiwgYW5kIFwieVwiIChmb3IgY29sb3IgY2x1ZXMpXG4gICAgLy8gKHdlIHVzZSBxd2VydCBzaW5jZSB0aGV5IGFyZSBjb252ZW5pZW50bHkgbmV4dCB0byAxMjM0NSxcbiAgICAvLyBhbmQgYWxzbyBiZWNhdXNlIHRoZSBjbHVlIGNvbG9ycyBjYW4gY2hhbmdlIGJldHdlZW4gZGlmZmVyZW50IHZhcmlhbnRzKVxuICAgIGNvbnN0IGNsdWVLZXlSb3cgPSBbJ3EnLCAndycsICdlJywgJ3InLCAndCcsICd5J107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLmVsZW1lbnRzLnN1aXRDbHVlQnV0dG9ucy5sZW5ndGggJiYgaSA8IGNsdWVLZXlSb3cubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaG90a2V5TWFwLmNsdWVbY2x1ZUtleVJvd1tpXV0gPSBjbGljayhnbG9iYWxzLmVsZW1lbnRzLnN1aXRDbHVlQnV0dG9uc1tpXSk7XG4gICAgfVxuXG4gICAgLy8gKHRoZSBob3RrZXkgZm9yIGdpdmluZyBhIGNsdWUgaXMgZW5hYmxlZCBzZXBhcmF0ZWx5IGluIHRoZSBcImtleWRvd24oKVwiIGZ1bmN0aW9uKVxuXG4gICAgaG90a2V5TWFwLnBsYXkgPSB7XG4gICAgICAgICdhJzogcGxheSwgLy8gVGhlIG1haW4gcGxheSBob3RrZXlcbiAgICAgICAgJysnOiBwbGF5LCAvLyBGb3IgbnVtcGFkIHVzZXJzXG4gICAgfTtcbiAgICBob3RrZXlNYXAuZGlzY2FyZCA9IHtcbiAgICAgICAgJ2QnOiBkaXNjYXJkLCAvLyBUaGUgbWFpbiBkaXNjYXJkIGhvdGtleVxuICAgICAgICAnLSc6IGRpc2NhcmQsIC8vIEZvciBudW1wYWQgdXNlcnNcbiAgICB9O1xuXG4gICAgLy8gRW5hYmxlIGFsbCBvZiB0aGUga2V5Ym9hcmQgaG90a2V5c1xuICAgICQoZG9jdW1lbnQpLmtleWRvd24oa2V5ZG93bik7XG59O1xuXG5leHBvcnRzLmRlc3Ryb3kgPSAoKSA9PiB7XG4gICAgJChkb2N1bWVudCkudW5iaW5kKCdrZXlkb3duJywga2V5ZG93bik7XG59O1xuXG5jb25zdCBrZXlkb3duID0gKGV2ZW50KSA9PiB7XG4gICAgLy8gRGlzYWJsZSBob3RrZXlzIGlmIHdlIG5vdCBjdXJyZW50bHkgaW4gYSBnYW1lXG4gICAgLy8gKHRoaXMgc2hvdWxkIG5vdCBiZSBwb3NzaWJsZSwgYXMgdGhlIGhhbmRsZXIgZ2V0cyB1bnJlZ2lzdGVyZWQgdXBvbiBnb2luZyBiYWNrIHRvIHRoZSBsb2JieSxcbiAgICAvLyBidXQgZG91YmxlIGNoZWNrIGp1c3QgaW4gY2FzZSlcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5jdXJyZW50U2NyZWVuICE9PSAnZ2FtZScpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIERpc2FibGUga2V5Ym9hcmQgaG90a2V5cyBpZiB3ZSBhcmUgZWRpdGluZyBhIG5vdGVcbiAgICBpZiAobm90ZXMudmFycy5lZGl0aW5nICE9PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEaXNhYmxlIGtleWJvYXJkIGhvdGtleXMgaWYgd2UgYXJlIHR5cGluZyBpbiB0aGUgaW4tZ2FtZSBjaGF0XG4gICAgaWYgKCQoJyNnYW1lLWNoYXQtaW5wdXQnKS5pcygnOmZvY3VzJykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEdpdmUgYSBjbHVlXG4gICAgaWYgKGV2ZW50LmN0cmxLZXkgJiYgZXZlbnQua2V5ID09PSAnRW50ZXInKSB7IC8vIEN0cmwgKyBFbnRlclxuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmdpdmVDbHVlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEb24ndCBpbnRlcmZlcmUgd2l0aCBvdGhlciBraW5kcyBvZiBob3RrZXlzXG4gICAgaWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQuYWx0S2V5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBEZWxldGUgdGhlIG5vdGUgZnJvbSB0aGUgY2FyZCB0aGF0IHdlIGFyZSBjdXJyZW50bHkgaG92ZXJpbmctb3ZlciwgaWYgYW55XG4gICAgaWYgKFxuICAgICAgICBldmVudC5rZXkgPT09ICdEZWxldGUnXG4gICAgICAgICYmIGdsb2JhbHMuYWN0aXZlSG92ZXIgIT09IG51bGxcbiAgICAgICAgJiYgdHlwZW9mIGdsb2JhbHMuYWN0aXZlSG92ZXIub3JkZXIgIT09ICd1bmRlZmluZWQnXG4gICAgKSB7XG4gICAgICAgIC8vIE5vdGUgdGhhdCBcImFjdGl2ZUhvdmVyXCIgd2lsbCByZW1haW4gc2V0IGV2ZW4gaWYgd2UgbW92ZSB0aGUgbW91c2UgYXdheSBmcm9tIHRoZSBjYXJkLFxuICAgICAgICAvLyBzbyB0aGlzIG1lYW5zIHRoYXQgaWYgdGhlIG1vdXNlIGlzIG5vdCBob3ZlcmluZyBvdmVyIEFOWSBjYXJkLCB0aGVuIHRoZSBub3RlIHRoYXQgd2lsbCBiZVxuICAgICAgICAvLyBkZWxldGVkIHdpbGwgYmUgZnJvbSB0aGUgbGFzdCB0b29sdGlwIHNob3duXG4gICAgICAgIG5vdGVzLnNldChnbG9iYWxzLmFjdGl2ZUhvdmVyLm9yZGVyLCAnJyk7XG4gICAgICAgIG5vdGVzLnVwZGF0ZShnbG9iYWxzLmFjdGl2ZUhvdmVyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNlbmQgYSBzb3VuZFxuICAgIGlmIChldmVudC5rZXkgPT09ICdaJykgeyAvLyBTaGlmdCArIHpcbiAgICAgICAgLy8gVGhpcyBpcyB1c2VkIGZvciBmdW4gaW4gc2hhcmVkIHJlcGxheXNcbiAgICAgICAgc2hhcmVkUmVwbGF5U2VuZFNvdW5kKCdidXp6Jyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gJ1gnKSB7IC8vIFNoaWZ0ICsgeFxuICAgICAgICAvLyBUaGlzIGlzIHVzZWQgZm9yIGZ1biBpbiBzaGFyZWQgcmVwbGF5c1xuICAgICAgICBzaGFyZWRSZXBsYXlTZW5kU291bmQoJ2dvZCcpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldmVudC5rZXkgPT09ICdDJykgeyAvLyBTaGlmdCArIGNcbiAgICAgICAgLy8gVGhpcyBpcyB1c2VkIGFzIGEgc291bmQgdGVzdFxuICAgICAgICBnbG9iYWxzLmdhbWUuc291bmRzLnBsYXkoJ3R1cm5fdXMnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIERvbid0IGludGVyZmVyZSB3aXRoIG90aGVyIGtpbmRzIG9mIGhvdGtleXNcbiAgICBpZiAoZXZlbnQuc2hpZnRLZXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBrZXlib2FyZCBob3RrZXlzXG4gICAgbGV0IGhvdGtleUZ1bmN0aW9uO1xuICAgIGlmIChnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUFyZWEudmlzaWJsZSgpKSB7XG4gICAgICAgIGhvdGtleUZ1bmN0aW9uID0gaG90a2V5TWFwLnJlcGxheVtldmVudC5rZXldO1xuICAgIH0gZWxzZSBpZiAoZ2xvYmFscy5zYXZlZEFjdGlvbiAhPT0gbnVsbCkgeyAvLyBXZSBjYW4gdGFrZSBhbiBhY3Rpb25cbiAgICAgICAgaWYgKGdsb2JhbHMuc2F2ZWRBY3Rpb24uY2FuQ2x1ZSkge1xuICAgICAgICAgICAgaG90a2V5RnVuY3Rpb24gPSBob3RrZXlNYXAuY2x1ZVtldmVudC5rZXldO1xuICAgICAgICB9XG4gICAgICAgIGlmIChnbG9iYWxzLnNhdmVkQWN0aW9uLmNhbkRpc2NhcmQpIHtcbiAgICAgICAgICAgIGhvdGtleUZ1bmN0aW9uID0gaG90a2V5RnVuY3Rpb24gfHwgaG90a2V5TWFwLmRpc2NhcmRbZXZlbnQua2V5XTtcbiAgICAgICAgfVxuICAgICAgICBob3RrZXlGdW5jdGlvbiA9IGhvdGtleUZ1bmN0aW9uIHx8IGhvdGtleU1hcC5wbGF5W2V2ZW50LmtleV07XG4gICAgfVxuXG4gICAgaWYgKGhvdGtleUZ1bmN0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaG90a2V5RnVuY3Rpb24oKTtcbiAgICB9XG59O1xuXG5jb25zdCBzaGFyZWRSZXBsYXlTZW5kU291bmQgPSAoc291bmQpID0+IHtcbiAgICAvLyBPbmx5IGVuYWJsZSBzb3VuZCBlZmZlY3RzIGluIGEgc2hhcmVkIHJlcGxheVxuICAgIGlmICghZ2xvYmFscy5yZXBsYXkgfHwgIWdsb2JhbHMuc2hhcmVkUmVwbGF5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBPbmx5IGVuYWJsZSBzb3VuZCBlZmZlY3RzIGZvciBzaGFyZWQgcmVwbGF5IGxlYWRlcnNcbiAgICBpZiAoZ2xvYmFscy5zaGFyZWRSZXBsYXlMZWFkZXIgIT09IGdsb2JhbHMubG9iYnkudXNlcm5hbWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNlbmQgaXRcbiAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZCgncmVwbGF5QWN0aW9uJywge1xuICAgICAgICB0eXBlOiBjb25zdGFudHMuUkVQTEFZX0FDVElPTl9UWVBFLlNPVU5ELFxuICAgICAgICBzb3VuZCxcbiAgICB9KTtcblxuICAgIC8vIFBsYXkgdGhlIHNvdW5kIGVmZmVjdCBtYW51YWxseSBzbyB0aGF0XG4gICAgLy8gd2UgZG9uJ3QgaGF2ZSB0byB3YWl0IGZvciB0aGUgY2xpZW50IHRvIHNlcnZlciByb3VuZC10cmlwXG4gICAgZ2xvYmFscy5nYW1lLnNvdW5kcy5wbGF5KHNvdW5kKTtcbn07XG5cbi8qXG4gICAgSGVscGVyIGZ1bmN0aW9uc1xuKi9cblxuY29uc3QgcGxheSA9ICgpID0+IHtcbiAgICBhY3Rpb24odHJ1ZSk7XG59O1xuY29uc3QgZGlzY2FyZCA9ICgpID0+IHtcbiAgICBhY3Rpb24oZmFsc2UpO1xufTtcblxuLy8gSWYgaW50ZW5kZWRQbGF5IGlzIHRydWUsIGl0IHBsYXlzIGEgY2FyZFxuLy8gSWYgaW50ZW5kZWRQbGF5IGlzIGZhbHNlLCBpdCBkaXNjYXJkcyBhIGNhcmRcbmNvbnN0IGFjdGlvbiA9IChpbnRlbmRlZFBsYXkgPSB0cnVlKSA9PiB7XG4gICAgY29uc3QgY2FyZE9yZGVyID0gcHJvbXB0T3duSGFuZE9yZGVyKGludGVuZGVkUGxheSA/ICdwbGF5JyA6ICdkaXNjYXJkJyk7XG5cbiAgICBpZiAoY2FyZE9yZGVyID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGNhcmRPcmRlciA9PT0gJ2RlY2snICYmICEoaW50ZW5kZWRQbGF5ICYmIGdsb2JhbHMuc2F2ZWRBY3Rpb24uY2FuQmxpbmRQbGF5RGVjaykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICBpZiAoY2FyZE9yZGVyID09PSAnZGVjaycpIHtcbiAgICAgICAgZGF0YS50eXBlID0gQUNULkRFQ0tQTEFZO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRhdGEudHlwZSA9IGludGVuZGVkUGxheSA/IEFDVC5QTEFZIDogQUNULkRJU0NBUkQ7XG4gICAgICAgIGRhdGEudGFyZ2V0ID0gY2FyZE9yZGVyO1xuICAgIH1cblxuICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKCdhY3Rpb24nLCBkYXRhKTtcbiAgICBnbG9iYWxzLmxvYmJ5LnVpLnN0b3BBY3Rpb24oKTtcbiAgICBnbG9iYWxzLnNhdmVkQWN0aW9uID0gbnVsbDtcbn07XG5cbi8vIEtleWJvYXJkIGFjdGlvbnMgZm9yIHBsYXlpbmcgYW5kIGRpc2NhcmRpbmcgY2FyZHNcbmNvbnN0IHByb21wdE93bkhhbmRPcmRlciA9IChhY3Rpb25TdHJpbmcpID0+IHtcbiAgICBjb25zdCBwbGF5ZXJDYXJkcyA9IGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZ2xvYmFscy5wbGF5ZXJVc10uY2hpbGRyZW47XG4gICAgY29uc3QgbWF4U2xvdEluZGV4ID0gcGxheWVyQ2FyZHMubGVuZ3RoO1xuICAgIGNvbnN0IG1zZyA9IGBFbnRlciB0aGUgc2xvdCBudW1iZXIgKDEgdG8gJHttYXhTbG90SW5kZXh9KSBvZiB0aGUgY2FyZCB0byAke2FjdGlvblN0cmluZ30uYDtcbiAgICBjb25zdCByZXNwb25zZSA9IHdpbmRvdy5wcm9tcHQobXNnKTtcblxuICAgIGlmICgvXmRlY2skL2kudGVzdChyZXNwb25zZSkpIHtcbiAgICAgICAgcmV0dXJuICdkZWNrJztcbiAgICB9XG5cbiAgICBpZiAoIS9eXFxkKyQvLnRlc3QocmVzcG9uc2UpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG51bVJlc3BvbnNlID0gcGFyc2VJbnQocmVzcG9uc2UsIDEwKTtcbiAgICBpZiAobnVtUmVzcG9uc2UgPCAxIHx8IG51bVJlc3BvbnNlID4gbWF4U2xvdEluZGV4KSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBwbGF5ZXJDYXJkc1ttYXhTbG90SW5kZXggLSBudW1SZXNwb25zZV0uY2hpbGRyZW5bMF0ub3JkZXI7XG59O1xuXG5jb25zdCBjbGljayA9IGVsZW0gPT4gKCkgPT4ge1xuICAgIGVsZW0uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snKSk7XG59O1xuIiwiLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5cbmNvbnN0IExheW91dENoaWxkID0gZnVuY3Rpb24gTGF5b3V0Q2hpbGQoY29uZmlnKSB7XG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgICB0aGlzLnR3ZWVuID0gbnVsbDtcbn07XG5cbktpbmV0aWMuVXRpbC5leHRlbmQoTGF5b3V0Q2hpbGQsIEtpbmV0aWMuR3JvdXApO1xuXG5MYXlvdXRDaGlsZC5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKGNoaWxkKSB7XG4gICAgS2luZXRpYy5Hcm91cC5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgY2hpbGQpO1xuICAgIHRoaXMuc2V0V2lkdGgoY2hpbGQuZ2V0V2lkdGgoKSk7XG4gICAgdGhpcy5zZXRIZWlnaHQoY2hpbGQuZ2V0SGVpZ2h0KCkpO1xuXG4gICAgY2hpbGQub24oJ3dpZHRoQ2hhbmdlJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGlmIChldmVudC5vbGRWYWwgPT09IGV2ZW50Lm5ld1ZhbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0V2lkdGgoZXZlbnQubmV3VmFsKTtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgICAgICAgICB0aGlzLnBhcmVudC5kb0xheW91dCgpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjaGlsZC5vbignaGVpZ2h0Q2hhbmdlJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGlmIChldmVudC5vbGRWYWwgPT09IGV2ZW50Lm5ld1ZhbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0SGVpZ2h0KGV2ZW50Lm5ld1ZhbCk7XG4gICAgICAgIGlmICh0aGlzLnBhcmVudCkge1xuICAgICAgICAgICAgdGhpcy5wYXJlbnQuZG9MYXlvdXQoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVGhlIGNhcmQgc2xpZGluZyBhbmltYXRpb24gaXMgZmluaXNoZWQsIHNvIG1ha2UgdGhlIGNhcmQgZHJhZ2dhYmxlXG5MYXlvdXRDaGlsZC5wcm90b3R5cGUuY2hlY2tTZXREcmFnZ2FibGUgPSBmdW5jdGlvbiBjaGVja1NldERyYWdnYWJsZSgpIHtcbiAgICAvLyBDYXJkcyBzaG91bGQgb25seSBiZSBkcmFnZ2FibGUgaW4gc3BlY2lmaWMgY2lyY3Vtc3RhbmNlc1xuICAgIGNvbnN0IGNhcmQgPSB0aGlzLmNoaWxkcmVuWzBdO1xuICAgIGlmIChcbiAgICAgICAgLy8gSWYgaXQgaXMgbm90IG91ciB0dXJuLCB0aGVuIHRoZSBjYXJkIGRvZXMgbm90IG5lZWQgdG8gYmUgZHJhZ2dhYmxlIHlldFxuICAgICAgICAvLyAodW5sZXNzIHdlIGhhdmUgdGhlIFwiRW5hYmxlIHByZS1wbGF5aW5nIGNhcmRzXCIgZmVhdHVyZSBlbmFibGVkKVxuICAgICAgICAoIWdsb2JhbHMub3VyVHVybiAmJiAhZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zcGVlZHJ1blByZXBsYXkpXG4gICAgICAgIHx8IGdsb2JhbHMuc3BlZWRydW4gLy8gQ2FyZHMgc2hvdWxkIG5ldmVyIGJlIGRyYWdnYWJsZSB3aGlsZSBzcGVlZHJ1bm5pbmdcbiAgICAgICAgfHwgY2FyZC5ob2xkZXIgIT09IGdsb2JhbHMucGxheWVyVXMgLy8gT25seSBvdXIgY2FyZHMgc2hvdWxkIGJlIGRyYWdnYWJsZVxuICAgICAgICB8fCBjYXJkLmlzUGxheWVkIC8vIENhcmRzIG9uIHRoZSBzdGFja3Mgc2hvdWxkIG5vdCBiZSBkcmFnZ2FibGVcbiAgICAgICAgfHwgY2FyZC5pc0Rpc2NhcmRlZCAvLyBDYXJkcyBpbiB0aGUgZGlzY2FyZCBwaWxlIHNob3VsZCBub3QgYmUgZHJhZ2dhYmxlXG4gICAgICAgIHx8IGdsb2JhbHMucmVwbGF5IC8vIENhcmRzIHNob3VsZCBub3QgYmUgZHJhZ2dhYmxlIGluIHNvbG8gb3Igc2hhcmVkIHJlcGxheXNcbiAgICAgICAgfHwgZ2xvYmFscy5zcGVjdGF0aW5nIC8vIENhcmRzIHNob3VsZCBub3QgYmUgZHJhZ2dhYmxlIGlmIHdlIGFyZSBzcGVjdGF0aW5nIGFuIG9uZ29pbmcgZ2FtZVxuICAgICAgICAvLyBDYXJkcyBzaG91bGQgbm90IGJlIGRyYWdnYWJsZSBpZiB0aGV5IGFyZSBjdXJyZW50bHkgcGxheWluZyBhbiBhbmltYXRpb25cbiAgICAgICAgLy8gKHRoaXMgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYWdhaW4gdXBvbiB0aGUgY29tcGxldGlvbiBvZiB0aGUgYW5pbWF0aW9uKVxuICAgICAgICB8fCBjYXJkLnR3ZWVuaW5nXG4gICAgKSB7XG4gICAgICAgIHRoaXMuc2V0RHJhZ2dhYmxlKGZhbHNlKTtcbiAgICAgICAgdGhpcy5vZmYoJ2RyYWdlbmQucGxheScpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZXREcmFnZ2FibGUodHJ1ZSk7XG4gICAgdGhpcy5vbignZHJhZ2VuZC5wbGF5JywgdGhpcy5kcmFnZW5kUGxheSk7XG59O1xuXG5MYXlvdXRDaGlsZC5wcm90b3R5cGUuZHJhZ2VuZFBsYXkgPSBmdW5jdGlvbiBkcmFnZW5kUGxheSgpIHtcbiAgICBjb25zdCBwb3MgPSB0aGlzLmdldEFic29sdXRlUG9zaXRpb24oKTtcblxuICAgIHBvcy54ICs9IHRoaXMuZ2V0V2lkdGgoKSAqIHRoaXMuZ2V0U2NhbGVYKCkgLyAyO1xuICAgIHBvcy55ICs9IHRoaXMuZ2V0SGVpZ2h0KCkgKiB0aGlzLmdldFNjYWxlWSgpIC8gMjtcblxuICAgIGxldCBkcmFnZ2VkVG8gPSBudWxsO1xuICAgIGlmIChnbG9iYWxzLmVsZW1lbnRzLnBsYXlBcmVhLmlzT3Zlcihwb3MpKSB7XG4gICAgICAgIGRyYWdnZWRUbyA9ICdwbGF5QXJlYSc7XG4gICAgfSBlbHNlIGlmIChnbG9iYWxzLmVsZW1lbnRzLmRpc2NhcmRBcmVhLmlzT3Zlcihwb3MpICYmIGdsb2JhbHMuY2x1ZXMgIT09IDgpIHtcbiAgICAgICAgZHJhZ2dlZFRvID0gJ2Rpc2NhcmRBcmVhJztcbiAgICB9XG4gICAgaWYgKGRyYWdnZWRUbyA9PT0gbnVsbCkge1xuICAgICAgICAvLyBUaGUgY2FyZCB3YXMgZHJhZ2dlZCB0byBhbiBpbnZhbGlkIGxvY2F0aW9uOyB0d2VlbiBpdCBiYWNrIHRvIHRoZSBoYW5kXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZ2xvYmFscy5wbGF5ZXJVc10uZG9MYXlvdXQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGdsb2JhbHMubG9iYnkudWkuZW5kVHVybih7XG4gICAgICAgIHR5cGU6ICdhY3Rpb24nLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICB0eXBlOiAoZHJhZ2dlZFRvID09PSAncGxheUFyZWEnID8gY29uc3RhbnRzLkFDVC5QTEFZIDogY29uc3RhbnRzLkFDVC5ESVNDQVJEKSxcbiAgICAgICAgICAgIHRhcmdldDogdGhpcy5jaGlsZHJlblswXS5vcmRlcixcbiAgICAgICAgfSxcbiAgICB9KTtcbiAgICB0aGlzLnNldERyYWdnYWJsZShmYWxzZSk7XG5cbiAgICAvLyBXZSBoYXZlIHRvIHVucmVnaXN0ZXIgdGhlIGhhbmRsZXIgb3IgZWxzZSBpdCB3aWxsIHNlbmQgbXVsdGlwbGUgYWN0aW9ucyBmb3Igb25lIGRyYWdcbiAgICB0aGlzLm9mZignZHJhZ2VuZC5wbGF5Jyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IExheW91dENoaWxkO1xuIiwiY29uc3QgTG9hZGVyID0gZnVuY3Rpb24gTG9hZGVyKGZpbmlzaGVkQ2FsbGJhY2spIHtcbiAgICB0aGlzLmZpbmlzaGVkQ2FsbGJhY2sgPSBmaW5pc2hlZENhbGxiYWNrO1xuXG4gICAgdGhpcy5maWxlbWFwID0ge307XG5cbiAgICBjb25zdCBiYXNpYyA9IFtcbiAgICAgICAgJ3gnLFxuICAgICAgICAncmVwbGF5JyxcbiAgICAgICAgJ3JlcGxheS1iYWNrJyxcbiAgICAgICAgJ3JlcGxheS1iYWNrLWZ1bGwnLFxuICAgICAgICAncmVwbGF5LWZvcndhcmQnLFxuICAgICAgICAncmVwbGF5LWZvcndhcmQtZnVsbCcsXG4gICAgICAgICd0cmFzaGNhbicsXG4gICAgXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmFzaWMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy5maWxlbWFwW2Jhc2ljW2ldXSA9IGBwdWJsaWMvaW1nLyR7YmFzaWNbaV19LnBuZ2A7XG4gICAgfVxuXG4gICAgdGhpcy5maWxlbWFwLmJhY2tncm91bmQgPSAncHVibGljL2ltZy9iYWNrZ3JvdW5kLmpwZyc7XG59O1xuXG5Mb2FkZXIucHJvdG90eXBlLmFkZEltYWdlID0gZnVuY3Rpb24gYWRkSW1hZ2UobmFtZSwgZXh0KSB7XG4gICAgdGhpcy5maWxlbWFwW25hbWVdID0gYHB1YmxpYy9pbWcvJHtuYW1lfS4ke2V4dH1gO1xufTtcblxuTG9hZGVyLnByb3RvdHlwZS5hZGRBbGlhcyA9IGZ1bmN0aW9uIGFkZEFsaWFzKG5hbWUsIGFsaWFzLCBleHQpIHtcbiAgICB0aGlzLmZpbGVtYXBbbmFtZV0gPSBgcHVibGljL2ltZy8ke2FsaWFzfS4ke2V4dH1gO1xufTtcblxuTG9hZGVyLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIGNvbnN0IHRvdGFsID0gT2JqZWN0LmtleXModGhpcy5maWxlbWFwKS5sZW5ndGg7XG5cbiAgICB0aGlzLm1hcCA9IHt9O1xuICAgIHRoaXMubnVtTG9hZGVkID0gMDtcblxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBPYmplY3Qua2V5cyh0aGlzLmZpbGVtYXApKSB7XG4gICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xuXG4gICAgICAgIHRoaXMubWFwW25hbWVdID0gaW1nO1xuXG4gICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLm51bUxvYWRlZCArPSAxO1xuXG4gICAgICAgICAgICB0aGlzLnByb2dyZXNzKHRoaXMubnVtTG9hZGVkLCB0b3RhbCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm51bUxvYWRlZCA9PT0gdG90YWwpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbmlzaGVkQ2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBpbWcuc3JjID0gdGhpcy5maWxlbWFwW25hbWVdO1xuICAgIH1cblxuICAgIHRoaXMucHJvZ3Jlc3MoMCwgdG90YWwpO1xufTtcblxuTG9hZGVyLnByb3RvdHlwZS5wcm9ncmVzcyA9IGZ1bmN0aW9uIHByb2dyZXNzKGRvbmUsIHRvdGFsKSB7XG4gICAgaWYgKHRoaXMucHJvZ3Jlc3NDYWxsYmFjaykge1xuICAgICAgICB0aGlzLnByb2dyZXNzQ2FsbGJhY2soZG9uZSwgdG90YWwpO1xuICAgIH1cbn07XG5cbkxvYWRlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gZ2V0KG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5tYXBbbmFtZV07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IExvYWRlcjtcbiIsIi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcbmNvbnN0IE11bHRpRml0VGV4dCA9IHJlcXVpcmUoJy4vbXVsdGlGaXRUZXh0Jyk7XG5cbmNvbnN0IEhhbmFiaU1zZ0xvZyA9IGZ1bmN0aW9uIEhhbmFiaU1zZ0xvZyhjb25maWcpIHtcbiAgICBjb25zdCBiYXNlQ29uZmlnID0ge1xuICAgICAgICB4OiAwLjIgKiBnbG9iYWxzLnN0YWdlLmdldFdpZHRoKCksXG4gICAgICAgIHk6IDAuMDIgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICB3aWR0aDogMC40ICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBoZWlnaHQ6IDAuOTYgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICBjbGlwWDogMCxcbiAgICAgICAgY2xpcFk6IDAsXG4gICAgICAgIGNsaXBXaWR0aDogMC40ICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBjbGlwSGVpZ2h0OiAwLjk2ICogZ2xvYmFscy5zdGFnZS5nZXRIZWlnaHQoKSxcbiAgICAgICAgdmlzaWJsZTogZmFsc2UsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfTtcblxuICAgICQuZXh0ZW5kKGJhc2VDb25maWcsIGNvbmZpZyk7XG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGJhc2VDb25maWcpO1xuXG4gICAgY29uc3QgcmVjdCA9IG5ldyBLaW5ldGljLlJlY3Qoe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogMC40ICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBoZWlnaHQ6IDAuOTYgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBvcGFjaXR5OiAwLjksXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4wMSAqIGdsb2JhbHMuc3RhZ2UuZ2V0V2lkdGgoKSxcbiAgICB9KTtcblxuICAgIEtpbmV0aWMuR3JvdXAucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIHJlY3QpO1xuXG4gICAgY29uc3QgdGV4dG9wdGlvbnMgPSB7XG4gICAgICAgIGZvbnRTaXplOiAwLjAyNSAqIGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCksXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgZmlsbDogJ3doaXRlJyxcbiAgICAgICAgeDogMC4wNCAqIGdsb2JhbHMuc3RhZ2UuZ2V0V2lkdGgoKSxcbiAgICAgICAgeTogMC4wMSAqIGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCksXG4gICAgICAgIHdpZHRoOiAwLjM1ICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBoZWlnaHQ6IDAuOTQgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICBtYXhMaW5lczogMzgsXG4gICAgfTtcblxuICAgIHRoaXMubG9ndGV4dCA9IG5ldyBNdWx0aUZpdFRleHQodGV4dG9wdGlvbnMpO1xuICAgIEtpbmV0aWMuR3JvdXAucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIHRoaXMubG9ndGV4dCk7XG5cbiAgICBjb25zdCBudW1iZXJzb3B0aW9ucyA9IHtcbiAgICAgICAgZm9udFNpemU6IDAuMDI1ICogZ2xvYmFscy5zdGFnZS5nZXRIZWlnaHQoKSxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBmaWxsOiAnbGlnaHRncmV5JyxcbiAgICAgICAgeDogMC4wMSAqIGdsb2JhbHMuc3RhZ2UuZ2V0V2lkdGgoKSxcbiAgICAgICAgeTogMC4wMSAqIGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCksXG4gICAgICAgIHdpZHRoOiAwLjAzICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBoZWlnaHQ6IDAuOTQgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICBtYXhMaW5lczogMzgsXG4gICAgfTtcbiAgICB0aGlzLmxvZ251bWJlcnMgPSBuZXcgTXVsdGlGaXRUZXh0KG51bWJlcnNvcHRpb25zKTtcbiAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0aGlzLmxvZ251bWJlcnMpO1xuXG4gICAgdGhpcy5wbGF5ZXJMb2dzID0gW107XG4gICAgdGhpcy5wbGF5ZXJMb2dOdW1iZXJzID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLnBsYXllck5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRoaXMucGxheWVyTG9nc1tpXSA9IG5ldyBNdWx0aUZpdFRleHQodGV4dG9wdGlvbnMpO1xuICAgICAgICB0aGlzLnBsYXllckxvZ3NbaV0uaGlkZSgpO1xuICAgICAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0aGlzLnBsYXllckxvZ3NbaV0pO1xuXG4gICAgICAgIHRoaXMucGxheWVyTG9nTnVtYmVyc1tpXSA9IG5ldyBNdWx0aUZpdFRleHQobnVtYmVyc29wdGlvbnMpO1xuICAgICAgICB0aGlzLnBsYXllckxvZ051bWJlcnNbaV0uaGlkZSgpO1xuICAgICAgICBLaW5ldGljLkdyb3VwLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0aGlzLnBsYXllckxvZ051bWJlcnNbaV0pO1xuICAgIH1cbn07XG5cbktpbmV0aWMuVXRpbC5leHRlbmQoSGFuYWJpTXNnTG9nLCBLaW5ldGljLkdyb3VwKTtcblxuSGFuYWJpTXNnTG9nLnByb3RvdHlwZS5hZGRNZXNzYWdlID0gZnVuY3Rpb24gYWRkTWVzc2FnZShtc2cpIHtcbiAgICBjb25zdCBhcHBlbmRMaW5lID0gKGxvZywgbnVtYmVycywgbGluZSkgPT4ge1xuICAgICAgICBsb2cuc2V0TXVsdGlUZXh0KGxpbmUpO1xuICAgICAgICBudW1iZXJzLnNldE11bHRpVGV4dChnbG9iYWxzLmRlY2tTaXplLnRvU3RyaW5nKCkpO1xuICAgIH07XG5cbiAgICBhcHBlbmRMaW5lKHRoaXMubG9ndGV4dCwgdGhpcy5sb2dudW1iZXJzLCBtc2cpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAobXNnLnN0YXJ0c1dpdGgoZ2xvYmFscy5wbGF5ZXJOYW1lc1tpXSkpIHtcbiAgICAgICAgICAgIGFwcGVuZExpbmUodGhpcy5wbGF5ZXJMb2dzW2ldLCB0aGlzLnBsYXllckxvZ051bWJlcnNbaV0sIG1zZyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbkhhbmFiaU1zZ0xvZy5wcm90b3R5cGUuc2hvd1BsYXllckFjdGlvbnMgPSBmdW5jdGlvbiBzaG93UGxheWVyQWN0aW9ucyhwbGF5ZXJOYW1lKSB7XG4gICAgbGV0IHBsYXllcklEWDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdsb2JhbHMucGxheWVyTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGdsb2JhbHMucGxheWVyTmFtZXNbaV0gPT09IHBsYXllck5hbWUpIHtcbiAgICAgICAgICAgIHBsYXllcklEWCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5sb2d0ZXh0LmhpZGUoKTtcbiAgICB0aGlzLmxvZ251bWJlcnMuaGlkZSgpO1xuICAgIHRoaXMucGxheWVyTG9nc1twbGF5ZXJJRFhdLnNob3coKTtcbiAgICB0aGlzLnBsYXllckxvZ051bWJlcnNbcGxheWVySURYXS5zaG93KCk7XG5cbiAgICB0aGlzLnNob3coKTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlLnNob3coKTtcbiAgICBnbG9iYWxzLmxheWVycy5vdmVydG9wLmRyYXcoKTtcblxuICAgIGNvbnN0IHRoaXNsb2cgPSB0aGlzO1xuICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlLm9uKCdjbGljayB0YXAnLCAoKSA9PiB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuc3RhZ2VGYWRlLm9mZignY2xpY2sgdGFwJyk7XG4gICAgICAgIHRoaXNsb2cucGxheWVyTG9nc1twbGF5ZXJJRFhdLmhpZGUoKTtcbiAgICAgICAgdGhpc2xvZy5wbGF5ZXJMb2dOdW1iZXJzW3BsYXllcklEWF0uaGlkZSgpO1xuXG4gICAgICAgIHRoaXNsb2cubG9ndGV4dC5zaG93KCk7XG4gICAgICAgIHRoaXNsb2cubG9nbnVtYmVycy5zaG93KCk7XG4gICAgICAgIHRoaXNsb2cuaGlkZSgpO1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnN0YWdlRmFkZS5oaWRlKCk7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLm92ZXJ0b3AuZHJhdygpO1xuICAgIH0pO1xufTtcblxuSGFuYWJpTXNnTG9nLnByb3RvdHlwZS5yZWZyZXNoVGV4dCA9IGZ1bmN0aW9uIHJlZnJlc2hUZXh0KCkge1xuICAgIHRoaXMubG9ndGV4dC5yZWZyZXNoVGV4dCgpO1xuICAgIHRoaXMubG9nbnVtYmVycy5yZWZyZXNoVGV4dCgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLnBsYXllckxvZ3NbaV0ucmVmcmVzaFRleHQoKTtcbiAgICAgICAgdGhpcy5wbGF5ZXJMb2dOdW1iZXJzW2ldLnJlZnJlc2hUZXh0KCk7XG4gICAgfVxufTtcblxuSGFuYWJpTXNnTG9nLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uIHJlc2V0KCkge1xuICAgIHRoaXMubG9ndGV4dC5yZXNldCgpO1xuICAgIHRoaXMubG9nbnVtYmVycy5yZXNldCgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLnBsYXllckxvZ3NbaV0ucmVzZXQoKTtcbiAgICAgICAgdGhpcy5wbGF5ZXJMb2dOdW1iZXJzW2ldLnJlc2V0KCk7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIYW5hYmlNc2dMb2c7XG4iLCIvLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5jb25zdCBGaXRUZXh0ID0gcmVxdWlyZSgnLi9maXRUZXh0Jyk7XG5cbmNvbnN0IE11bHRpRml0VGV4dCA9IGZ1bmN0aW9uIE11bHRpRml0VGV4dChjb25maWcpIHtcbiAgICBLaW5ldGljLkdyb3VwLmNhbGwodGhpcywgY29uZmlnKTtcbiAgICB0aGlzLm1heExpbmVzID0gY29uZmlnLm1heExpbmVzO1xuICAgIHRoaXMuc21hbGxIaXN0b3J5ID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm1heExpbmVzOyBpKyspIHtcbiAgICAgICAgY29uc3QgbmV3Q29uZmlnID0gJC5leHRlbmQoe30sIGNvbmZpZyk7XG5cbiAgICAgICAgbmV3Q29uZmlnLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQgLyB0aGlzLm1heExpbmVzO1xuICAgICAgICBuZXdDb25maWcueCA9IDA7XG4gICAgICAgIG5ld0NvbmZpZy55ID0gaSAqIG5ld0NvbmZpZy5oZWlnaHQ7XG5cbiAgICAgICAgY29uc3QgY2hpbGRUZXh0ID0gbmV3IEZpdFRleHQobmV3Q29uZmlnKTtcbiAgICAgICAgS2luZXRpYy5Hcm91cC5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgY2hpbGRUZXh0KTtcbiAgICB9XG59O1xuS2luZXRpYy5VdGlsLmV4dGVuZChNdWx0aUZpdFRleHQsIEtpbmV0aWMuR3JvdXApO1xuXG5NdWx0aUZpdFRleHQucHJvdG90eXBlLnNldE11bHRpVGV4dCA9IGZ1bmN0aW9uIHNldE11bHRpVGV4dCh0ZXh0KSB7XG4gICAgaWYgKHRoaXMuc21hbGxIaXN0b3J5Lmxlbmd0aCA+PSB0aGlzLm1heExpbmVzKSB7XG4gICAgICAgIHRoaXMuc21hbGxIaXN0b3J5LnNoaWZ0KCk7XG4gICAgfVxuICAgIHRoaXMuc21hbGxIaXN0b3J5LnB1c2godGV4dCk7XG5cbiAgICAvLyBQZXJmb3JtYW5jZSBvcHRpbWl6YXRpb246IHNldFRleHQgb24gdGhlIGNoaWxkcmVuIGlzIHNsb3csXG4gICAgLy8gc28gZG9uJ3QgYWN0dWFsbHkgZG8gaXQgdW50aWwgaXRzIHRpbWUgdG8gZGlzcGxheSB0aGluZ3NcbiAgICAvLyBXZSBhbHNvIGhhdmUgdG8gY2FsbCByZWZyZXNoVGV4dCBhZnRlciBhbnkgdGltZSB3ZSBtYW5pcHVsYXRlIHJlcGxheSBwb3NpdGlvblxuICAgIGlmICghZ2xvYmFscy5pblJlcGxheSB8fCAhZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICB0aGlzLnJlZnJlc2hUZXh0KCk7XG4gICAgfVxufTtcblxuTXVsdGlGaXRUZXh0LnByb3RvdHlwZS5yZWZyZXNoVGV4dCA9IGZ1bmN0aW9uIHJlZnJlc2hUZXh0KCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICBsZXQgbXNnID0gdGhpcy5zbWFsbEhpc3RvcnlbaV07XG4gICAgICAgIGlmICghbXNnKSB7XG4gICAgICAgICAgICBtc2cgPSAnJztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoaWxkcmVuW2ldLnNldFRleHQobXNnKTtcbiAgICB9XG59O1xuXG5NdWx0aUZpdFRleHQucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gcmVzZXQoKSB7XG4gICAgdGhpcy5zbWFsbEhpc3RvcnkgPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlbltpXS5zZXRUZXh0KCcnKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpRml0VGV4dDtcbiIsIi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcbmNvbnN0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4uLy4uL2NvbnN0YW50cycpO1xuXG5jb25zdCBIYW5hYmlOYW1lRnJhbWUgPSBmdW5jdGlvbiBIYW5hYmlOYW1lRnJhbWUoY29uZmlnKSB7XG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgICB0aGlzLm5hbWUgPSBuZXcgS2luZXRpYy5UZXh0KHtcbiAgICAgICAgeDogY29uZmlnLndpZHRoIC8gMixcbiAgICAgICAgeTogMCxcbiAgICAgICAgaGVpZ2h0OiBjb25maWcuaGVpZ2h0LFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdWZXJkYW5hJyxcbiAgICAgICAgZm9udFNpemU6IGNvbmZpZy5oZWlnaHQsXG4gICAgICAgIHRleHQ6IGNvbmZpZy5uYW1lLFxuICAgICAgICBmaWxsOiAnI2Q4ZDVlZicsXG4gICAgICAgIHNoYWRvd0NvbG9yOiAnYmxhY2snLFxuICAgICAgICBzaGFkb3dCbHVyOiA1LFxuICAgICAgICBzaGFkb3dPZmZzZXQ6IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAzLFxuICAgICAgICB9LFxuICAgICAgICBzaGFkb3dPcGFjaXR5OiAwLjksXG4gICAgfSk7XG5cbiAgICBsZXQgdyA9IHRoaXMubmFtZS5nZXRXaWR0aCgpO1xuXG4gICAgd2hpbGUgKHcgPiAwLjY1ICogY29uZmlnLndpZHRoICYmIHRoaXMubmFtZS5nZXRGb250U2l6ZSgpID4gNSkge1xuICAgICAgICB0aGlzLm5hbWUuc2V0Rm9udFNpemUodGhpcy5uYW1lLmdldEZvbnRTaXplKCkgKiAwLjkpO1xuXG4gICAgICAgIHcgPSB0aGlzLm5hbWUuZ2V0V2lkdGgoKTtcbiAgICB9XG5cbiAgICB0aGlzLm5hbWUuc2V0T2Zmc2V0WCh3IC8gMik7XG4gICAgY29uc3QgbmFtZVRleHRPYmplY3QgPSB0aGlzLm5hbWU7XG5cbiAgICAvLyBMZWZ0LWNsaWNrIG9uIHRoZSBuYW1lIGZyYW1lIHRvIHNlZSBhIGxvZyBvZiBvbmx5IHRoZWlyIGFjdGlvbnNcbiAgICAvLyBSaWdodC1jbGljayBvbiB0aGUgbmFtZSBmcmFtZSB0byBwYXNzIHRoZSByZXBsYXkgbGVhZGVyIHRvIHRoZW1cbiAgICB0aGlzLm5hbWUub24oJ2NsaWNrIHRhcCcsIChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCB1c2VybmFtZSA9IG5hbWVUZXh0T2JqZWN0LmdldFRleHQoKTtcbiAgICAgICAgaWYgKGV2ZW50LmV2dC53aGljaCA9PT0gMSkgeyAvLyBMZWZ0LWNsaWNrXG4gICAgICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm1zZ0xvZ0dyb3VwLnNob3dQbGF5ZXJBY3Rpb25zKHVzZXJuYW1lKTtcbiAgICAgICAgfSBlbHNlIGlmIChldmVudC5ldnQud2hpY2ggPT09IDMpIHsgLy8gUmlnaHQtY2xpY2tcbiAgICAgICAgICAgIHRoaXMuZ2l2ZUxlYWRlcih1c2VybmFtZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLmFkZCh0aGlzLm5hbWUpO1xuXG4gICAgdyAqPSAxLjQ7XG5cbiAgICB0aGlzLmxlZnRsaW5lID0gbmV3IEtpbmV0aWMuTGluZSh7XG4gICAgICAgIHBvaW50czogW1xuICAgICAgICAgICAgMCxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICAgICAwLFxuICAgICAgICAgICAgY29uZmlnLmhlaWdodCAvIDIsXG4gICAgICAgICAgICBjb25maWcud2lkdGggLyAyIC0gdyAvIDIsXG4gICAgICAgICAgICBjb25maWcuaGVpZ2h0IC8gMixcbiAgICAgICAgXSxcbiAgICAgICAgc3Ryb2tlOiAnI2Q4ZDVlZicsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAxLFxuICAgICAgICBsaW5lSm9pbjogJ3JvdW5kJyxcbiAgICAgICAgc2hhZG93Q29sb3I6ICdibGFjaycsXG4gICAgICAgIHNoYWRvd0JsdXI6IDUsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDMsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAsXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZCh0aGlzLmxlZnRsaW5lKTtcblxuICAgIHRoaXMucmlnaHRsaW5lID0gbmV3IEtpbmV0aWMuTGluZSh7XG4gICAgICAgIHBvaW50czogW1xuICAgICAgICAgICAgY29uZmlnLndpZHRoIC8gMiArIHcgLyAyLFxuICAgICAgICAgICAgY29uZmlnLmhlaWdodCAvIDIsXG4gICAgICAgICAgICBjb25maWcud2lkdGgsXG4gICAgICAgICAgICBjb25maWcuaGVpZ2h0IC8gMixcbiAgICAgICAgICAgIGNvbmZpZy53aWR0aCxcbiAgICAgICAgICAgIDAsXG4gICAgICAgIF0sXG4gICAgICAgIHN0cm9rZTogJyNkOGQ1ZWYnLFxuICAgICAgICBzdHJva2VXaWR0aDogMSxcbiAgICAgICAgbGluZUpvaW46ICdyb3VuZCcsXG4gICAgICAgIHNoYWRvd0NvbG9yOiAnYmxhY2snLFxuICAgICAgICBzaGFkb3dCbHVyOiA1LFxuICAgICAgICBzaGFkb3dPZmZzZXQ6IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAzLFxuICAgICAgICB9LFxuICAgICAgICBzaGFkb3dPcGFjaXR5OiAwLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGQodGhpcy5yaWdodGxpbmUpO1xuXG4gICAgLy8gRHJhdyB0aGUgdG9vbHRpcHMgb24gdGhlIHBsYXllciBuYW1lcyB0aGF0IHNob3cgdGhlIHRpbWVcbiAgICB0aGlzLnBsYXllck51bSA9IGNvbmZpZy5wbGF5ZXJOdW07XG4gICAgdGhpcy5vbignbW91c2Vtb3ZlJywgZnVuY3Rpb24gbW91c2VNb3ZlKCkge1xuICAgICAgICBpZiAoZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGdsb2JhbHMuYWN0aXZlSG92ZXIgPSB0aGlzO1xuXG4gICAgICAgIGNvbnN0IHRvb2x0aXBYID0gdGhpcy5nZXRXaWR0aCgpIC8gMiArIHRoaXMuYXR0cnMueDtcbiAgICAgICAgY29uc3QgdG9vbHRpcCA9ICQoYCN0b29sdGlwLXBsYXllci0ke3RoaXMucGxheWVyTnVtfWApO1xuICAgICAgICB0b29sdGlwLmNzcygnbGVmdCcsIHRvb2x0aXBYKTtcbiAgICAgICAgdG9vbHRpcC5jc3MoJ3RvcCcsIHRoaXMuYXR0cnMueSk7XG4gICAgICAgIHRvb2x0aXAudG9vbHRpcHN0ZXIoJ29wZW4nKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgaWYgKGdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0b29sdGlwID0gJChgI3Rvb2x0aXAtcGxheWVyLSR7dGhpcy5wbGF5ZXJOdW19YCk7XG4gICAgICAgIHRvb2x0aXAudG9vbHRpcHN0ZXIoJ2Nsb3NlJyk7XG4gICAgfSk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKEhhbmFiaU5hbWVGcmFtZSwgS2luZXRpYy5Hcm91cCk7XG5cbi8vIFRyYW5zZmVyIGxlYWRlcnNoaXAgb2YgdGhlIHNoYXJlZCByZXBsYXkgdG8gYW5vdGhlciBwbGF5ZXJcbkhhbmFiaU5hbWVGcmFtZS5wcm90b3R5cGUuZ2l2ZUxlYWRlciA9IGZ1bmN0aW9uIGdpdmVMZWFkZXIodXNlcm5hbWUpIHtcbiAgICAvLyBPbmx5IHByb2NlZWQgaWYgd2UgYXJlIGluIGEgc2hhcmVkIHJlcGxheVxuICAgIGlmICghZ2xvYmFscy5zaGFyZWRSZXBsYXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIE9ubHkgcHJvY2VlZCBpZiB3ZSBhcmUgdGhlIHJlcGxheSBsZWFkZXJcbiAgICBpZiAoZ2xvYmFscy5zaGFyZWRSZXBsYXlMZWFkZXIgIT09IGdsb2JhbHMubG9iYnkudXNlcm5hbWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIE9ubHkgcHJvY2VlZCBpZiB3ZSBjaG9zZSBzb21lb25lIGVsc2VcbiAgICBpZiAodXNlcm5hbWUgPT09IGdsb2JhbHMubG9iYnkudXNlcm5hbWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKCdyZXBsYXlBY3Rpb24nLCB7XG4gICAgICAgIHR5cGU6IGNvbnN0YW50cy5SRVBMQVlfQUNUSU9OX1RZUEUuTEVBREVSX1RSQU5TRkVSLFxuICAgICAgICBuYW1lOiB1c2VybmFtZSxcbiAgICB9KTtcbn07XG5cbkhhbmFiaU5hbWVGcmFtZS5wcm90b3R5cGUuc2V0QWN0aXZlID0gZnVuY3Rpb24gc2V0QWN0aXZlKGFjdGl2ZSkge1xuICAgIHRoaXMubGVmdGxpbmUuc2V0U3Ryb2tlV2lkdGgoYWN0aXZlID8gMyA6IDEpO1xuICAgIHRoaXMucmlnaHRsaW5lLnNldFN0cm9rZVdpZHRoKGFjdGl2ZSA/IDMgOiAxKTtcblxuICAgIHRoaXMubmFtZS5zZXRTaGFkb3dPcGFjaXR5KGFjdGl2ZSA/IDAuNiA6IDApO1xuICAgIHRoaXMubGVmdGxpbmUuc2V0U2hhZG93T3BhY2l0eShhY3RpdmUgPyAwLjYgOiAwKTtcbiAgICB0aGlzLnJpZ2h0bGluZS5zZXRTaGFkb3dPcGFjaXR5KGFjdGl2ZSA/IDAuNiA6IDApO1xuXG4gICAgdGhpcy5uYW1lLnNldEZvbnRTdHlsZShhY3RpdmUgPyAnYm9sZCcgOiAnbm9ybWFsJyk7XG59O1xuXG5IYW5hYmlOYW1lRnJhbWUucHJvdG90eXBlLnNldENvbm5lY3RlZCA9IGZ1bmN0aW9uIHNldENvbm5lY3RlZChjb25uZWN0ZWQpIHtcbiAgICBjb25zdCBjb2xvciA9IGNvbm5lY3RlZCA/ICcjZDhkNWVmJyA6ICcjZTgyMzNkJztcblxuICAgIHRoaXMubGVmdGxpbmUuc2V0U3Ryb2tlKGNvbG9yKTtcbiAgICB0aGlzLnJpZ2h0bGluZS5zZXRTdHJva2UoY29sb3IpO1xuICAgIHRoaXMubmFtZS5zZXRGaWxsKGNvbG9yKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSGFuYWJpTmFtZUZyYW1lO1xuIiwiLypcbiAgICBVc2VycyBjYW4gcmlnaHQtY2xpY2sgY2FyZHMgdG8gcmVjb3JkIGluZm9ybWF0aW9uIG9uIHRoZW1cbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuLy8gVmFyaWFibGVzXG5sZXQgbm90ZXM7IC8vIEFuIGFycmF5IGNvbnRhaW5pbmcgYWxsIG9mIHRoZSBwbGF5ZXIncyBub3RlcywgaW5kZXhlZCBieSBjYXJkIG9yZGVyXG4vLyBTb21lIHZhcmlhYmxlcyBtdXN0IGJlIGluIGFuIG9iamVjdCBzbyB0aGF0IHRoZXkgYXJlIHBhc3NlZCBhcyBhIHJlZmVyZW5jZSBiZXR3ZWVuIGZpbGVzXG5jb25zdCB2YXJzID0ge307XG5leHBvcnRzLnZhcnMgPSB2YXJzO1xuXG5leHBvcnRzLmluaXQgPSAoKSA9PiB7XG4gICAgbm90ZXMgPSBbXTtcblxuICAgIC8vIFVzZWQgdG8ga2VlcCB0cmFjayBvZiB3aGljaCBjYXJkIHRoZSB1c2VyIGlzIGVkaXRpbmc7XG4gICAgLy8gdXNlcnMgY2FuIG9ubHkgdXBkYXRlIG9uZSBub3RlIGF0IGEgdGltZSB0byBwcmV2ZW50IGJ1Z3NcbiAgICAvLyBFcXVhbCB0byB0aGUgY2FyZCBvcmRlciBudW1iZXIgb3IgbnVsbFxuICAgIHZhcnMuZWRpdGluZyA9IG51bGw7XG4gICAgLy8gRXF1YWwgdG8gdHJ1ZSBpZiBzb21ldGhpbmcgaGFwcGVuZWQgd2hlbiB0aGUgbm90ZSBib3ggaGFwcGVucyB0byBiZSBvcGVuXG4gICAgdmFycy5hY3Rpb25PY2N1cmVkID0gZmFsc2U7XG4gICAgdmFycy5sYXN0Tm90ZSA9ICcnOyAvLyBFcXVhbCB0byB0aGUgbGFzdCBub3RlIGVudGVyZWRcbn07XG5cbmNvbnN0IGdldCA9IChvcmRlcikgPT4ge1xuICAgIGNvbnN0IG5vdGUgPSBub3Rlc1tvcmRlcl07XG4gICAgaWYgKHR5cGVvZiBub3RlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIG5vdGU7XG59O1xuZXhwb3J0cy5nZXQgPSBnZXQ7XG5cbmNvbnN0IHNldCA9IChvcmRlciwgbm90ZSwgc2VuZCA9IHRydWUpID0+IHtcbiAgICBpZiAobm90ZSA9PT0gJycpIHtcbiAgICAgICAgbm90ZSA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgbm90ZXNbb3JkZXJdID0gbm90ZTtcbiAgICB2YXJzLmxhc3ROb3RlID0gbm90ZTtcblxuICAgIC8vIFNlbmQgdGhlIG5vdGUgdG8gdGhlIHNlcnZlclxuICAgIGlmIChzZW5kICYmICFnbG9iYWxzLnJlcGxheSAmJiAhZ2xvYmFscy5zcGVjdGF0aW5nKSB7XG4gICAgICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKCdub3RlJywge1xuICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICBub3RlLFxuICAgICAgICB9KTtcbiAgICB9XG59O1xuZXhwb3J0cy5zZXQgPSBzZXQ7XG5cbmNvbnN0IHNob3cgPSAoY2FyZCkgPT4ge1xuICAgIGNvbnN0IHRvb2x0aXAgPSAkKGAjdG9vbHRpcC1jYXJkLSR7Y2FyZC5vcmRlcn1gKTtcbiAgICBjb25zdCB0b29sdGlwSW5zdGFuY2UgPSB0b29sdGlwLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpO1xuXG4gICAgLy8gRG8gbm90aGluZyBpZiB0aGUgdG9vbHRpcCBpcyBhbHJlYWR5IG9wZW5cbiAgICBpZiAodG9vbHRpcC50b29sdGlwc3Rlcignc3RhdHVzJykub3Blbikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gV2Ugd2FudCB0aGUgdG9vbHRpcCB0byBhcHBlYXIgYWJvdmUgdGhlIGNhcmQgYnkgZGVmYXVsdFxuICAgIGNvbnN0IHBvcyA9IGNhcmQuZ2V0QWJzb2x1dGVQb3NpdGlvbigpO1xuICAgIGxldCBwb3NYID0gcG9zLng7XG4gICAgbGV0IHBvc1kgPSBwb3MueSAtIChjYXJkLmdldEhlaWdodCgpICogY2FyZC5wYXJlbnQuc2NhbGUoKS55IC8gMik7XG4gICAgdG9vbHRpcEluc3RhbmNlLm9wdGlvbignc2lkZScsICd0b3AnKTtcblxuICAgIC8vIEZsaXAgdGhlIHRvb2x0aXAgaWYgaXQgaXMgdG9vIGNsb3NlIHRvIHRoZSB0b3Agb2YgdGhlIHNjcmVlblxuICAgIGlmIChwb3NZIDwgMjAwKSB7XG4gICAgICAgIC8vIDIwMCBpcyBqdXN0IGFuIGFyYml0cmFyeSB0aHJlc2hvbGQ7IDEwMCBpcyBub3QgYmlnIGVub3VnaCBmb3IgdGhlIEJHQSBsYXlvdXRcbiAgICAgICAgcG9zWSA9IHBvcy55ICsgKGNhcmQuZ2V0SGVpZ2h0KCkgKiBjYXJkLnBhcmVudC5zY2FsZSgpLnkgLyAyKTtcbiAgICAgICAgdG9vbHRpcEluc3RhbmNlLm9wdGlvbignc2lkZScsICdib3R0b20nKTtcbiAgICB9XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBjbHVlIGFycm93IHNob3dpbmcsIGl0IHdpbGwgb3ZlcmxhcCB3aXRoIHRoZSB0b29sdGlwIGFycm93LFxuICAgIC8vIHNvIG1vdmUgaXQgb3ZlciB0byB0aGUgcmlnaHQgYSBsaXR0bGUgYml0XG4gICAgaWYgKGNhcmQuaW5kaWNhdG9yQXJyb3cudmlzaWJsZSgpKSB7XG4gICAgICAgIHBvc1ggPSBwb3MueCArICgoY2FyZC5nZXRXaWR0aCgpICogY2FyZC5wYXJlbnQuc2NhbGUoKS54IC8gMikgLyAyLjUpO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSB0aGUgdG9vbHRpcCBhbmQgb3BlbiBpdFxuICAgIHRvb2x0aXAuY3NzKCdsZWZ0JywgcG9zWCk7XG4gICAgdG9vbHRpcC5jc3MoJ3RvcCcsIHBvc1kpO1xuICAgIGNvbnN0IG5vdGUgPSBnZXQoY2FyZC5vcmRlcikgfHwgJyc7XG4gICAgdG9vbHRpcEluc3RhbmNlLmNvbnRlbnQobm90ZSk7XG4gICAgdG9vbHRpcC50b29sdGlwc3Rlcignb3BlbicpO1xufTtcbmV4cG9ydHMuc2hvdyA9IHNob3c7XG5cbmV4cG9ydHMub3BlbkVkaXRUb29sdGlwID0gKGNhcmQpID0+IHtcbiAgICAvLyBEb24ndCBlZGl0IGFueSBub3RlcyBpbiBzaGFyZWQgcmVwbGF5c1xuICAgIGlmIChnbG9iYWxzLnNoYXJlZFJlcGxheSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ2xvc2UgYW55IGV4aXN0aW5nIG5vdGUgdG9vbHRpcHNcbiAgICBpZiAodmFycy5lZGl0aW5nICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRvb2x0aXAgPSAkKGAjdG9vbHRpcC1jYXJkLSR7dmFycy5lZGl0aW5nfWApO1xuICAgICAgICB0b29sdGlwLnRvb2x0aXBzdGVyKCdjbG9zZScpO1xuICAgIH1cblxuICAgIHNob3coY2FyZCk7XG5cbiAgICB2YXJzLmVkaXRpbmcgPSBjYXJkLm9yZGVyO1xuICAgIGxldCBub3RlID0gZ2V0KGNhcmQub3JkZXIpO1xuICAgIGlmIChub3RlID09PSBudWxsKSB7XG4gICAgICAgIG5vdGUgPSAnJztcbiAgICB9XG4gICAgY29uc3QgdG9vbHRpcCA9ICQoYCN0b29sdGlwLWNhcmQtJHtjYXJkLm9yZGVyfWApO1xuICAgIGNvbnN0IHRvb2x0aXBJbnN0YW5jZSA9IHRvb2x0aXAudG9vbHRpcHN0ZXIoJ2luc3RhbmNlJyk7XG4gICAgdG9vbHRpcEluc3RhbmNlLmNvbnRlbnQoYDxpbnB1dCBpZD1cInRvb2x0aXAtY2FyZC0ke2NhcmQub3JkZXJ9LWlucHV0XCIgdHlwZT1cInRleHRcIiB2YWx1ZT1cIiR7bm90ZX1cIi8+YCk7XG5cbiAgICAkKGAjdG9vbHRpcC1jYXJkLSR7Y2FyZC5vcmRlcn0taW5wdXRgKS5vbigna2V5ZG93bicsIChrZXlFdmVudCkgPT4ge1xuICAgICAgICBrZXlFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgaWYgKGtleUV2ZW50LmtleSAhPT0gJ0VudGVyJyAmJiBrZXlFdmVudC5rZXkgIT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXJzLmVkaXRpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmIChrZXlFdmVudC5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICBub3RlID0gZ2V0KGNhcmQub3JkZXIpO1xuICAgICAgICAgICAgaWYgKG5vdGUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBub3RlID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoa2V5RXZlbnQua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBub3RlID0gJChgI3Rvb2x0aXAtY2FyZC0ke2NhcmQub3JkZXJ9LWlucHV0YCkudmFsKCk7XG5cbiAgICAgICAgICAgIC8vIFN0cmlwIGFueSBIVE1MIGVsZW1lbnRzXG4gICAgICAgICAgICAvLyAodG8gYmUgdGhvcm91Z2gsIHRoZSBzZXJ2ZXIgd2lsbCBhbHNvIHBlcmZvcm0gdGhpcyB2YWxpZGF0aW9uKVxuICAgICAgICAgICAgbm90ZSA9IHN0cmlwSFRNTHRhZ3Mobm90ZSk7XG5cbiAgICAgICAgICAgIHNldChjYXJkLm9yZGVyLCBub3RlKTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgdG8gc2VlIGlmIGFuIGV2ZW50IGhhcHBlbmVkIHdoaWxlIHdlIHdlcmUgZWRpdGluZyB0aGlzIG5vdGVcbiAgICAgICAgICAgIGlmICh2YXJzLmFjdGlvbk9jY3VyZWQpIHtcbiAgICAgICAgICAgICAgICB2YXJzLmFjdGlvbk9jY3VyZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0b29sdGlwLnRvb2x0aXBzdGVyKCdjbG9zZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdXBkYXRlKGNhcmQpO1xuICAgIH0pO1xuXG4gICAgLy8gQXV0b21hdGljYWxseSBoaWdobGlnaHQgYWxsIG9mIHRoZSBleGlzdGluZyB0ZXh0IHdoZW4gYSBub3RlIGlucHV0IGJveCBpcyBmb2N1c2VkXG4gICAgJChgI3Rvb2x0aXAtY2FyZC0ke2NhcmQub3JkZXJ9LWlucHV0YCkuZm9jdXMoZnVuY3Rpb24gdG9vbHRpcENhcmRJbnB1dEZvY3VzKCkge1xuICAgICAgICAkKHRoaXMpLnNlbGVjdCgpO1xuICAgIH0pO1xuXG4gICAgLy8gQXV0b21hdGljYWxseSBmb2N1cyB0aGUgbmV3IHRleHQgaW5wdXQgYm94XG4gICAgJChgI3Rvb2x0aXAtY2FyZC0ke2NhcmQub3JkZXJ9LWlucHV0YCkuZm9jdXMoKTtcbn07XG5cbmNvbnN0IHVwZGF0ZSA9IChjYXJkKSA9PiB7XG4gICAgLy8gVXBkYXRlIHRoZSB0b29sdGlwIGFuZCB0aGUgY2FyZFxuICAgIGNvbnN0IHRvb2x0aXAgPSAkKGAjdG9vbHRpcC1jYXJkLSR7Y2FyZC5vcmRlcn1gKTtcbiAgICBjb25zdCB0b29sdGlwSW5zdGFuY2UgPSB0b29sdGlwLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpO1xuICAgIGNvbnN0IG5vdGUgPSBnZXQoY2FyZC5vcmRlcikgfHwgJyc7XG4gICAgdG9vbHRpcEluc3RhbmNlLmNvbnRlbnQobm90ZSk7XG4gICAgY2FyZC5ub3RlR2l2ZW4uc2V0VmlzaWJsZShub3RlLmxlbmd0aCA+IDApO1xuICAgIGlmIChub3RlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0b29sdGlwLnRvb2x0aXBzdGVyKCdjbG9zZScpO1xuICAgIH1cbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5kcmF3KCk7XG59O1xuZXhwb3J0cy51cGRhdGUgPSB1cGRhdGU7XG5cbi8qXG4gICAgTWlzYy4gZnVuY3Rpb25zXG4qL1xuXG5jb25zdCBzdHJpcEhUTUx0YWdzID0gKGlucHV0KSA9PiB7XG4gICAgY29uc3QgZG9jID0gbmV3IERPTVBhcnNlcigpLnBhcnNlRnJvbVN0cmluZyhpbnB1dCwgJ3RleHQvaHRtbCcpO1xuICAgIHJldHVybiBkb2MuYm9keS50ZXh0Q29udGVudCB8fCAnJztcbn07XG4iLCIvKlxuICAgIFwibm90aWZ5XCIgV2ViU29ja2V0IGNvbW1hbmRzIGNvbW11bmljYXRlIGEgY2hhbmdlIGluIHRoZSBnYW1lIHN0YXRlXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBjb25zdGFudHMgPSByZXF1aXJlKCcuLi8uLi9jb25zdGFudHMnKTtcbmNvbnN0IGNvbnZlcnQgPSByZXF1aXJlKCcuL2NvbnZlcnQnKTtcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcbmNvbnN0IEhhbmFiaUNhcmQgPSByZXF1aXJlKCcuL2NhcmQnKTtcbmNvbnN0IEhhbmFiaUNsdWVFbnRyeSA9IHJlcXVpcmUoJy4vY2x1ZUVudHJ5Jyk7XG5jb25zdCBMYXlvdXRDaGlsZCA9IHJlcXVpcmUoJy4vbGF5b3V0Q2hpbGQnKTtcbmNvbnN0IHJlcGxheSA9IHJlcXVpcmUoJy4vcmVwbGF5Jyk7XG5jb25zdCBzdGF0cyA9IHJlcXVpcmUoJy4vc3RhdHMnKTtcbmNvbnN0IHRpbWVyID0gcmVxdWlyZSgnLi90aW1lcicpO1xuXG4vLyBEZWZpbmUgYSBjb21tYW5kIGhhbmRsZXIgbWFwXG5jb25zdCBjb21tYW5kcyA9IHt9O1xuXG5jb21tYW5kcy5jbHVlID0gKGRhdGEpID0+IHtcbiAgICBnbG9iYWxzLmNsdWVzU3BlbnRQbHVzU3RyaWtlcyArPSAxO1xuICAgIHN0YXRzLnVwZGF0ZUVmZmljaWVuY3koMCk7XG5cbiAgICBjb25zdCBjbHVlID0gY29udmVydC5tc2dDbHVlVG9DbHVlKGRhdGEuY2x1ZSwgZ2xvYmFscy52YXJpYW50KTtcbiAgICBnbG9iYWxzLmxvYmJ5LnVpLnNob3dDbHVlTWF0Y2goLTEpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY2FyZCA9IGdsb2JhbHMuZGVja1tkYXRhLmxpc3RbaV1dO1xuICAgICAgICBpZiAoIWNhcmQuaXNDbHVlZCgpKSB7XG4gICAgICAgICAgICBzdGF0cy51cGRhdGVFZmZpY2llbmN5KDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhdHMudXBkYXRlRWZmaWNpZW5jeSgwKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY29sb3I7XG4gICAgICAgIGlmIChjbHVlLnR5cGUgPT09IDApIHtcbiAgICAgICAgICAgIC8vIE51bWJlciAocmFuaykgY2x1ZXNcbiAgICAgICAgICAgIGNvbG9yID0gY29uc3RhbnRzLklORElDQVRPUi5QT1NJVElWRTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENvbG9yIGNsdWVzXG4gICAgICAgICAgICBjb2xvciA9IGNsdWUudmFsdWUuaGV4Q29kZTtcbiAgICAgICAgfVxuICAgICAgICBjYXJkLnNldEluZGljYXRvcih0cnVlLCBjb2xvcik7XG4gICAgICAgIGNhcmQuY2x1ZWRCb3JkZXIuc2hvdygpO1xuICAgICAgICBjYXJkLmFwcGx5Q2x1ZShjbHVlLCB0cnVlKTtcbiAgICAgICAgY2FyZC5zZXRCYXJlSW1hZ2UoKTtcbiAgICB9XG5cbiAgICBjb25zdCBuZWdsaXN0ID0gW107XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZGF0YS50YXJnZXRdLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tkYXRhLnRhcmdldF0uY2hpbGRyZW5baV07XG5cbiAgICAgICAgY29uc3QgY2FyZCA9IGNoaWxkLmNoaWxkcmVuWzBdO1xuICAgICAgICBjb25zdCB7IG9yZGVyIH0gPSBjYXJkO1xuXG4gICAgICAgIGlmIChkYXRhLmxpc3QuaW5kZXhPZihvcmRlcikgPCAwKSB7XG4gICAgICAgICAgICBuZWdsaXN0LnB1c2gob3JkZXIpO1xuICAgICAgICAgICAgY2FyZC5hcHBseUNsdWUoY2x1ZSwgZmFsc2UpO1xuICAgICAgICAgICAgY2FyZC5zZXRCYXJlSW1hZ2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBjbHVlTmFtZTtcbiAgICBpZiAoZGF0YS5jbHVlLnR5cGUgPT09IGNvbnN0YW50cy5DTFVFX1RZUEUuUkFOSykge1xuICAgICAgICBjbHVlTmFtZSA9IGNsdWUudmFsdWUudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjbHVlTmFtZSA9IGNsdWUudmFsdWUubmFtZTtcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyeSA9IG5ldyBIYW5hYmlDbHVlRW50cnkoe1xuICAgICAgICB3aWR0aDogZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLmdldFdpZHRoKCksXG4gICAgICAgIGhlaWdodDogMC4wMTcgKiBnbG9iYWxzLnN0YWdlLmdldEhlaWdodCgpLFxuICAgICAgICBnaXZlcjogZ2xvYmFscy5wbGF5ZXJOYW1lc1tkYXRhLmdpdmVyXSxcbiAgICAgICAgdGFyZ2V0OiBnbG9iYWxzLnBsYXllck5hbWVzW2RhdGEudGFyZ2V0XSxcbiAgICAgICAgY2x1ZU5hbWUsXG4gICAgICAgIGxpc3Q6IGRhdGEubGlzdCxcbiAgICAgICAgbmVnbGlzdCxcbiAgICAgICAgdHVybjogZGF0YS50dXJuLFxuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLmFkZChlbnRyeSk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVMb2cuY2hlY2tFeHBpcnkoKTtcbn07XG5cbi8vIEF0IHRoZSBlbmQgb2YgYSBnYW1lLCB0aGUgc2VydmVyIHNlbmRzIGEgbGlzdCB0aGF0IHJldmVhbHMgd2hhdCB0aGUgZW50aXJlIGRlY2sgaXNcbmNvbW1hbmRzLmRlY2tPcmRlciA9ICgpID0+IHtcbiAgICAvLyBUT0RPXG59O1xuXG5jb21tYW5kcy5kaXNjYXJkID0gKGRhdGEpID0+IHtcbiAgICByZXZlYWxDYXJkKGRhdGEpO1xuXG4gICAgLy8gTG9jYWwgdmFyaWFibGVzXG4gICAgY29uc3Qgc3VpdCA9IGNvbnZlcnQubXNnU3VpdFRvU3VpdChkYXRhLndoaWNoLnN1aXQsIGdsb2JhbHMudmFyaWFudCk7XG4gICAgY29uc3QgY2FyZCA9IGdsb2JhbHMuZGVja1tkYXRhLndoaWNoLm9yZGVyXTtcbiAgICBjb25zdCBjaGlsZCA9IGNhcmQucGFyZW50OyAvLyBUaGlzIGlzIHRoZSBMYXlvdXRDaGlsZFxuXG4gICAgY2FyZC5pc0Rpc2NhcmRlZCA9IHRydWU7XG4gICAgY2FyZC50dXJuRGlzY2FyZGVkID0gZ2xvYmFscy50dXJuIC0gMTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMuZGlzY2FyZFN0YWNrcy5nZXQoc3VpdCkuYWRkKGNoaWxkKTtcblxuICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHRoZSBjYXJkIGlzIG9uIHRvcCBvZiB0aGUgcGxheSBzdGFja3MgPz8/IFRPRE8gQ0hFQ0sgVE8gU0VFIElGIFRISVMgSVMgVFJVRVxuICAgIGZvciAoY29uc3QgZGlzY2FyZFN0YWNrIG9mIGdsb2JhbHMuZWxlbWVudHMuZGlzY2FyZFN0YWNrcykge1xuICAgICAgICBpZiAoZGlzY2FyZFN0YWNrWzFdKSB7XG4gICAgICAgICAgICBkaXNjYXJkU3RhY2tbMV0ubW92ZVRvVG9wKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQdXQgdGhlIGRpc2NhcmQgcGlsZSBpbiBvcmRlciBmcm9tIDEgdG8gNVxuICAgIC8vICh0aGlzIGlzIGNvbW1lbnRlZCBvdXQgc28gdGhhdCB3ZSBjYW4gaW5zdGVhZCBzZWUgdGhlIG9yZGVyIGluIHdoaWNoIHRoaW5ncyBhcmUgZGlzY2FyZGVkKVxuICAgIC8qXG4gICAgbGV0IGZpbmlzaGVkID0gZmFsc2U7XG4gICAgZG8ge1xuICAgICAgICBjb25zdCBuID0gY2hpbGQuZ2V0WkluZGV4KCk7XG5cbiAgICAgICAgaWYgKCFuKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhLndoaWNoLnJhbmsgPCBjaGlsZC5wYXJlbnQuY2hpbGRyZW5bbiAtIDFdLmNoaWxkcmVuWzBdLnRydWVSYW5rKSB7XG4gICAgICAgICAgICBjaGlsZC5tb3ZlRG93bigpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmluaXNoZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfSB3aGlsZSAoIWZpbmlzaGVkKTtcbiAgICAqL1xuXG4gICAgaWYgKGNhcmQuaXNDbHVlZCgpKSB7XG4gICAgICAgIHN0YXRzLnVwZGF0ZUVmZmljaWVuY3koLTEpO1xuICAgICAgICBjYXJkLmhpZGVDbHVlcygpOyAvLyBUaGlzIG11c3QgYmUgYWZ0ZXIgdGhlIGVmZmljaWVuY3kgdXBkYXRlXG4gICAgfVxufTtcblxuLy8gQSBwbGF5ZXIganVzdCBkcmV3IGEgY2FyZCBmcm9tIHRoZSBkZWNrXG5jb21tYW5kcy5kcmF3ID0gKGRhdGEpID0+IHtcbiAgICBpZiAoZGF0YS5zdWl0ID09PSAtMSkge1xuICAgICAgICBkZWxldGUgZGF0YS5zdWl0O1xuICAgIH1cbiAgICBpZiAoZGF0YS5yYW5rID09PSAtMSkge1xuICAgICAgICBkZWxldGUgZGF0YS5yYW5rO1xuICAgIH1cbiAgICBjb25zdCBzdWl0ID0gY29udmVydC5tc2dTdWl0VG9TdWl0KGRhdGEuc3VpdCwgZ2xvYmFscy52YXJpYW50KTtcbiAgICBpZiAoIWdsb2JhbHMubGVhcm5lZENhcmRzW2RhdGEub3JkZXJdKSB7XG4gICAgICAgIGdsb2JhbHMubGVhcm5lZENhcmRzW2RhdGEub3JkZXJdID0ge1xuICAgICAgICAgICAgcG9zc2libGVTdWl0czogZ2xvYmFscy52YXJpYW50LnN1aXRzLnNsaWNlKCksXG4gICAgICAgICAgICBwb3NzaWJsZVJhbmtzOiBnbG9iYWxzLnZhcmlhbnQucmFua3Muc2xpY2UoKSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgZ2xvYmFscy5kZWNrW2RhdGEub3JkZXJdID0gbmV3IEhhbmFiaUNhcmQoe1xuICAgICAgICBzdWl0LFxuICAgICAgICByYW5rOiBkYXRhLnJhbmssXG4gICAgICAgIG9yZGVyOiBkYXRhLm9yZGVyLFxuICAgICAgICBzdWl0czogZ2xvYmFscy52YXJpYW50LnN1aXRzLnNsaWNlKCksXG4gICAgICAgIHJhbmtzOiBnbG9iYWxzLnZhcmlhbnQucmFua3Muc2xpY2UoKSxcbiAgICAgICAgaG9sZGVyOiBkYXRhLndobyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNoaWxkID0gbmV3IExheW91dENoaWxkKCk7XG4gICAgY2hpbGQuYWRkKGdsb2JhbHMuZGVja1tkYXRhLm9yZGVyXSk7XG5cbiAgICBjb25zdCBwb3MgPSBnbG9iYWxzLmVsZW1lbnRzLmRyYXdEZWNrLmNhcmRiYWNrLmdldEFic29sdXRlUG9zaXRpb24oKTtcblxuICAgIGNoaWxkLnNldEFic29sdXRlUG9zaXRpb24ocG9zKTtcbiAgICBjaGlsZC5zZXRSb3RhdGlvbigtZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tkYXRhLndob10uZ2V0Um90YXRpb24oKSk7XG5cbiAgICBjb25zdCBzY2FsZSA9IGdsb2JhbHMuZWxlbWVudHMuZHJhd0RlY2suY2FyZGJhY2suZ2V0V2lkdGgoKSAvIGNvbnN0YW50cy5DQVJEVztcbiAgICBjaGlsZC5zZXRTY2FsZSh7XG4gICAgICAgIHg6IHNjYWxlLFxuICAgICAgICB5OiBzY2FsZSxcbiAgICB9KTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZGF0YS53aG9dLmFkZChjaGlsZCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tkYXRhLndob10ubW92ZVRvVG9wKCk7XG59O1xuXG4vLyBBZnRlciBhIGNhcmQgaXMgZHJhd24sIHRoZSBzZXJ2ZXIgdGVsbHMgdXMgaG93IG1hbnkgY2FyZHMgYXJlIGxlZnQgaW4gdGhlIGRlY2tcbmNvbW1hbmRzLmRyYXdTaXplID0gKGRhdGEpID0+IHtcbiAgICBnbG9iYWxzLmRlY2tTaXplID0gZGF0YS5zaXplO1xuICAgIGdsb2JhbHMuZWxlbWVudHMuZHJhd0RlY2suc2V0Q291bnQoZGF0YS5zaXplKTtcbn07XG5cbmNvbW1hbmRzLmdhbWVPdmVyID0gKCkgPT4ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm5hbWVGcmFtZXNbaV0ub2ZmKCdtb3VzZW1vdmUnKTtcbiAgICB9XG5cbiAgICBpZiAoZ2xvYmFscy5lbGVtZW50cy50aW1lcjEpIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy50aW1lcjEuaGlkZSgpO1xuICAgIH1cblxuICAgIGdsb2JhbHMubGF5ZXJzLnRpbWVyLmRyYXcoKTtcbiAgICB0aW1lci5zdG9wKCk7XG5cbiAgICAvLyBJZiB0aGUgZ2FtZSBqdXN0IGZpbmlzaGVkIGZvciB0aGUgcGxheWVycyxcbiAgICAvLyBzdGFydCB0aGUgcHJvY2VzcyBvZiB0cmFuc2Zvcm1pbmcgaXQgaW50byBhIHNoYXJlZCByZXBsYXlcbiAgICBpZiAoIWdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgIGdsb2JhbHMucmVwbGF5ID0gdHJ1ZTtcbiAgICAgICAgZ2xvYmFscy5yZXBsYXlUdXJuID0gZ2xvYmFscy5yZXBsYXlNYXg7XG4gICAgICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5VHVybiA9IGdsb2JhbHMucmVwbGF5VHVybjtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlCdXR0b24uaGlkZSgpO1xuICAgICAgICAvLyBIaWRlIHRoZSBpbi1nYW1lIHJlcGxheSBidXR0b24gaW4gdGhlIGJvdHRvbS1sZWZ0LWhhbmQgY29ybmVyXG4gICAgfVxuXG4gICAgLy8gV2UgY291bGQgYmUgaW4gdGhlIG1pZGRsZSBvZiBhbiBpbi1nYW1lIHJlcGxheSB3aGVuIHRoZSBnYW1lIGVuZHMsXG4gICAgLy8gc28gZG9uJ3QgamVyayB0aGVtIG91dCBvZiB0aGUgaW4tZ2FtZSByZXBsYXlcbiAgICBpZiAoIWdsb2JhbHMuaW5SZXBsYXkpIHtcbiAgICAgICAgcmVwbGF5LmVudGVyKCk7XG4gICAgfVxuXG4gICAgaWYgKCFnbG9iYWxzLmFuaW1hdGVGYXN0KSB7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLlVJLmRyYXcoKTtcbiAgICB9XG59O1xuXG4vLyBBIG5ldyBsaW5lIG9mIHRleHQgaGFzIGFwcGVhcmVkIGluIHRoZSBhY3Rpb24gbG9nXG5jb21tYW5kcy50ZXh0ID0gKGRhdGEpID0+IHtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm1zZ0xvZ0dyb3VwLmFkZE1lc3NhZ2UoZGF0YS50ZXh0KTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMubWVzc2FnZVByb21wdC5zZXRNdWx0aVRleHQoZGF0YS50ZXh0KTtcbiAgICBpZiAoIWdsb2JhbHMuYW5pbWF0ZUZhc3QpIHtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuVUkuZHJhdygpO1xuICAgICAgICBnbG9iYWxzLmxheWVycy5vdmVydG9wLmRyYXcoKTtcbiAgICB9XG59O1xuXG5jb21tYW5kcy5wbGF5ID0gKGRhdGEpID0+IHtcbiAgICByZXZlYWxDYXJkKGRhdGEpO1xuXG4gICAgLy8gTG9jYWwgdmFyaWFibGVzXG4gICAgY29uc3Qgc3VpdCA9IGNvbnZlcnQubXNnU3VpdFRvU3VpdChkYXRhLndoaWNoLnN1aXQsIGdsb2JhbHMudmFyaWFudCk7XG4gICAgY29uc3QgY2FyZCA9IGdsb2JhbHMuZGVja1tkYXRhLndoaWNoLm9yZGVyXTtcbiAgICBjb25zdCBjaGlsZCA9IGNhcmQucGFyZW50OyAvLyBUaGlzIGlzIHRoZSBMYXlvdXRDaGlsZFxuXG4gICAgY2FyZC5pc1BsYXllZCA9IHRydWU7XG4gICAgY2FyZC50dXJuUGxheWVkID0gZ2xvYmFscy50dXJuIC0gMTtcblxuICAgIGdsb2JhbHMuZWxlbWVudHMucGxheVN0YWNrcy5nZXQoc3VpdCkuYWRkKGNoaWxkKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnBsYXlTdGFja3MuZ2V0KHN1aXQpLm1vdmVUb1RvcCgpO1xuXG4gICAgaWYgKGNhcmQuaXNDbHVlZCgpKSB7XG4gICAgICAgIGNhcmQuaGlkZUNsdWVzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdHMudXBkYXRlRWZmaWNpZW5jeSgxKTtcbiAgICB9XG59O1xuXG5jb21tYW5kcy5yZW9yZGVyID0gKGRhdGEpID0+IHtcbiAgICBjb25zdCBoYW5kID0gZ2xvYmFscy5lbGVtZW50cy5wbGF5ZXJIYW5kc1tkYXRhLnRhcmdldF07XG5cbiAgICAvLyBHZXQgdGhlIExheW91dENoaWxkIG9iamVjdHMgaW4gdGhlIGhhbmQgYW5kIHB1dCB0aGVtIGluIHRoZSByaWdodCBvcmRlciBpbiBhIHRlbXBvcmFyeSBhcnJheVxuICAgIGNvbnN0IG5ld0NoaWxkT3JkZXIgPSBbXTtcbiAgICBjb25zdCBoYW5kU2l6ZSA9IGhhbmQuY2hpbGRyZW4ubGVuZ3RoO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaGFuZFNpemU7IGkrKykge1xuICAgICAgICBjb25zdCBvcmRlciA9IGRhdGEuaGFuZE9yZGVyW2ldO1xuICAgICAgICBjb25zdCBjaGlsZCA9IGdsb2JhbHMuZGVja1tvcmRlcl0ucGFyZW50O1xuICAgICAgICBuZXdDaGlsZE9yZGVyLnB1c2goY2hpbGQpO1xuXG4gICAgICAgIC8vIFRha2UgdGhlbSBvdXQgb2YgdGhlIGhhbmQgaXRzZWxmXG4gICAgICAgIGNoaWxkLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIC8vIFB1dCB0aGVtIGJhY2sgaW50byB0aGUgaGFuZCBpbiB0aGUgbmV3IG9yZGVyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBoYW5kU2l6ZTsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gbmV3Q2hpbGRPcmRlcltpXTtcbiAgICAgICAgaGFuZC5hZGQoY2hpbGQpO1xuICAgIH1cbn07XG5cbi8qXG4gICAgSGFzIHRoZSBmb2xsb3dpbmcgZGF0YTpcbiAgICB7XG4gICAgICAgIHR5cGU6ICdyZXZlYWwnLFxuICAgICAgICB3aGljaDoge1xuICAgICAgICAgICAgb3JkZXI6IDUsXG4gICAgICAgICAgICByYW5rOiAyLFxuICAgICAgICAgICAgc3VpdDogMSxcbiAgICAgICAgfSxcbiAgICB9XG4qL1xuY29tbWFuZHMucmV2ZWFsID0gKGRhdGEpID0+IHtcbiAgICAvLyBMb2NhbCB2YXJpYWJsZXNcbiAgICBjb25zdCBzdWl0ID0gY29udmVydC5tc2dTdWl0VG9TdWl0KGRhdGEud2hpY2guc3VpdCwgZ2xvYmFscy52YXJpYW50KTtcbiAgICBjb25zdCBjYXJkID0gZ2xvYmFscy5kZWNrW2RhdGEud2hpY2gub3JkZXJdO1xuXG4gICAgY29uc3QgbGVhcm5lZENhcmQgPSBnbG9iYWxzLmxlYXJuZWRDYXJkc1tkYXRhLndoaWNoLm9yZGVyXTtcbiAgICBsZWFybmVkQ2FyZC5zdWl0ID0gc3VpdDtcbiAgICBsZWFybmVkQ2FyZC5yYW5rID0gZGF0YS53aGljaC5yYW5rO1xuICAgIGxlYXJuZWRDYXJkLnBvc3NpYmxlU3VpdHMgPSBbc3VpdF07XG4gICAgbGVhcm5lZENhcmQucG9zc2libGVSYW5rcyA9IFtkYXRhLndoaWNoLnJhbmtdO1xuICAgIGxlYXJuZWRDYXJkLnJldmVhbGVkID0gdHJ1ZTtcblxuICAgIGNhcmQuc2hvd09ubHlMZWFybmVkID0gZmFsc2U7XG4gICAgY2FyZC50cnVlU3VpdCA9IHN1aXQ7XG4gICAgY2FyZC50cnVlUmFuayA9IGRhdGEud2hpY2gucmFuaztcbiAgICBjYXJkLnNldEJhcmVJbWFnZSgpO1xuXG4gICAgY2FyZC5oaWRlQ2x1ZXMoKTtcbiAgICBjYXJkLnN1aXRQaXBzLmhpZGUoKTtcbiAgICBjYXJkLnJhbmtQaXBzLmhpZGUoKTtcblxuICAgIGlmICghZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICBnbG9iYWxzLmxheWVycy5jYXJkLmRyYXcoKTtcbiAgICB9XG59O1xuXG5jb21tYW5kcy5zdGFja0RpcmVjdGlvbnMgPSAoZGF0YSkgPT4ge1xuICAgIC8vIFVwZGF0ZSB0aGUgc3RhY2sgZGlyZWN0aW9ucyAob25seSBpbiBcIlVwIG9yIERvd25cIiB2YXJpYW50cylcbiAgICBpZiAoZ2xvYmFscy52YXJpYW50Lm5hbWUuc3RhcnRzV2l0aCgnVXAgb3IgRG93bicpKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5kaXJlY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBkYXRhLmRpcmVjdGlvbnNbaV07XG4gICAgICAgICAgICBsZXQgdGV4dDtcbiAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gPT09IDApIHtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gJyc7IC8vIFVuZGVjaWRlZFxuICAgICAgICAgICAgfSBlbHNlIGlmIChkaXJlY3Rpb24gPT09IDEpIHtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gJ1VwJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSAyKSB7XG4gICAgICAgICAgICAgICAgdGV4dCA9ICdEb3duJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSAzKSB7XG4gICAgICAgICAgICAgICAgdGV4dCA9ICdGaW5pc2hlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRleHQgPSAnVW5rbm93bic7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnN1aXRMYWJlbFRleHRzW2ldLnNldFRleHQodGV4dCk7XG4gICAgICAgICAgICBnbG9iYWxzLmxheWVycy50ZXh0LmRyYXcoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmNvbW1hbmRzLnN0YXR1cyA9IChkYXRhKSA9PiB7XG4gICAgLy8gVXBkYXRlIGludGVybmFsIHN0YXRlIHZhcmlhYmxlc1xuICAgIGdsb2JhbHMuY2x1ZXMgPSBkYXRhLmNsdWVzO1xuICAgIGlmIChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdDbHVlIFN0YXJ2ZWQnKSkge1xuICAgICAgICAvLyBJbiBcIkNsdWUgU3RhcnZlZFwiIHZhcmlhbnRzLCAxIGNsdWUgaXMgcmVwcmVzZW50ZWQgb24gdGhlIHNlcnZlciBieSAyXG4gICAgICAgIC8vIFRodXMsIGluIG9yZGVyIHRvIGdldCB0aGUgXCJyZWFsXCIgY2x1ZSBjb3VudCwgd2UgaGF2ZSB0byBkaXZpZGUgYnkgMlxuICAgICAgICBnbG9iYWxzLmNsdWVzIC89IDI7XG4gICAgfVxuICAgIGdsb2JhbHMuc2NvcmUgPSBkYXRhLnNjb3JlO1xuICAgIGdsb2JhbHMubWF4U2NvcmUgPSBkYXRhLm1heFNjb3JlO1xuXG4gICAgLy8gVXBkYXRlIHRoZSBudW1iZXIgb2YgY2x1ZXMgaW4gdGhlIGJvdHRvbS1yaWdodCBoYW5kIGNvcm5lciBvZiB0aGUgc2NyZWVuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlc051bWJlckxhYmVsLnNldFRleHQoZ2xvYmFscy5jbHVlcy50b1N0cmluZygpKTtcbiAgICBpZiAoZ2xvYmFscy5jbHVlcyA8IDEgfHwgZ2xvYmFscy5jbHVlcyA9PT0gOCkge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVzTnVtYmVyTGFiZWwuc2V0RmlsbCgnI2RmMWMyZCcpOyAvLyBSZWRcbiAgICB9IGVsc2UgaWYgKGdsb2JhbHMuY2x1ZXMgPj0gMSAmJiBnbG9iYWxzLmNsdWVzIDwgMikge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVzTnVtYmVyTGFiZWwuc2V0RmlsbCgnI2VmOGMxZCcpOyAvLyBPcmFuZ2VcbiAgICB9IGVsc2UgaWYgKGdsb2JhbHMuY2x1ZXMgPj0gMiAmJiBnbG9iYWxzLmNsdWVzIDwgMykge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVzTnVtYmVyTGFiZWwuc2V0RmlsbCgnI2VmZWYxZCcpOyAvLyBZZWxsb3dcbiAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVzTnVtYmVyTGFiZWwuc2V0RmlsbCgnI2Q4ZDVlZicpOyAvLyBXaGl0ZVxuICAgIH1cblxuICAgIGlmIChnbG9iYWxzLmNsdWVzID09PSA4KSB7XG4gICAgICAgIC8vIFNob3cgdGhlIHJlZCBib3JkZXIgYXJvdW5kIHRoZSBkaXNjYXJkIHBpbGVcbiAgICAgICAgLy8gKHRvIHJlaW5mb3JjZSB0aGUgZmFjdCB0aGF0IGJlaW5nIGF0IDggY2x1ZXMgaXMgYSBzcGVjaWFsIHNpdHVhdGlvbilcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5ub0Rpc2NhcmRMYWJlbC5zaG93KCk7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMubm9Eb3VibGVEaXNjYXJkTGFiZWwuaGlkZSgpO1xuICAgIH0gZWxzZSBpZiAoZGF0YS5kb3VibGVEaXNjYXJkKSB7XG4gICAgICAgIC8vIFNob3cgYSB5ZWxsb3cgYm9yZGVyIGFyb3VuZCB0aGUgZGlzY2FyZCBwaWxlXG4gICAgICAgIC8vICh0byByZWluZm9yY2UgdGhhdCB0aGlzIGlzIGEgXCJEb3VibGUgRGlzY2FyZFwiIHNpdHVhdGlvbilcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5ub0Rpc2NhcmRMYWJlbC5oaWRlKCk7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMubm9Eb3VibGVEaXNjYXJkTGFiZWwuc2hvdygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMubm9EaXNjYXJkTGFiZWwuaGlkZSgpO1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm5vRG91YmxlRGlzY2FyZExhYmVsLmhpZGUoKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgdGhlIHNjb3JlIChpbiB0aGUgYm90dG9tLXJpZ2h0LWhhbmQgY29ybmVyKVxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2NvcmVOdW1iZXJMYWJlbC5zZXRUZXh0KGdsb2JhbHMuc2NvcmUpO1xuXG4gICAgLy8gVXBkYXRlIHRoZSBzdGF0cyBvbiB0aGUgbWlkZGxlLWxlZnQtaGFuZCBzaWRlIG9mIHRoZSBzY3JlZW5cbiAgICBzdGF0cy51cGRhdGVQYWNlKCk7XG4gICAgc3RhdHMudXBkYXRlRWZmaWNpZW5jeSgwKTtcblxuICAgIGlmICghZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgfVxufTtcblxuY29tbWFuZHMuc3RyaWtlID0gKGRhdGEpID0+IHtcbiAgICBnbG9iYWxzLmNsdWVzU3BlbnRQbHVzU3RyaWtlcyArPSAxO1xuICAgIHN0YXRzLnVwZGF0ZUVmZmljaWVuY3koMCk7XG5cbiAgICBjb25zdCB4ID0gbmV3IEtpbmV0aWMuSW1hZ2Uoe1xuICAgICAgICB4OiAoMC4wMTUgKyAwLjA0ICogKGRhdGEubnVtIC0gMSkpICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICB5OiAwLjEyNSAqIGdsb2JhbHMuc3RhZ2UuZ2V0SGVpZ2h0KCksXG4gICAgICAgIHdpZHRoOiAwLjAyICogZ2xvYmFscy5zdGFnZS5nZXRXaWR0aCgpLFxuICAgICAgICBoZWlnaHQ6IDAuMDM2ICogZ2xvYmFscy5zdGFnZS5nZXRIZWlnaHQoKSxcbiAgICAgICAgaW1hZ2U6IGdsb2JhbHMuSW1hZ2VMb2FkZXIuZ2V0KCd4JyksXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgfSk7XG5cbiAgICAvLyBXZSBhbHNvIHJlY29yZCB0aGUgdHVybiB0aGF0IHRoZSBzdHJpa2UgaGFwcGVuZWRcbiAgICB4LnR1cm4gPSBnbG9iYWxzLnR1cm47XG5cbiAgICAvLyBDbGljayBvbiB0aGUgeCB0byBnbyB0byB0aGUgdHVybiB0aGF0IHRoZSBzdHJpa2UgaGFwcGVuZWRcbiAgICB4Lm9uKCdjbGljaycsIGZ1bmN0aW9uIHNxdWFyZUNsaWNrKCkge1xuICAgICAgICBpZiAoZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgICAgIHJlcGxheS5jaGVja0Rpc2FibGVTaGFyZWRUdXJucygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVwbGF5LmVudGVyKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGF5LmdvdG8odGhpcy50dXJuICsgMSwgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNjb3JlQXJlYS5hZGQoeCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5zdHJpa2VzW2RhdGEubnVtIC0gMV0gPSB4O1xuXG4gICAgaWYgKGdsb2JhbHMuYW5pbWF0ZUZhc3QpIHtcbiAgICAgICAgeC5zZXRPcGFjaXR5KDEuMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbmV3IEtpbmV0aWMuVHdlZW4oe1xuICAgICAgICAgICAgbm9kZTogeCxcbiAgICAgICAgICAgIG9wYWNpdHk6IDEuMCxcbiAgICAgICAgICAgIGR1cmF0aW9uOiBnbG9iYWxzLmFuaW1hdGVGYXN0ID8gMC4wMDEgOiAxLjAsXG4gICAgICAgICAgICBydW5vbmNlOiB0cnVlLFxuICAgICAgICB9KS5wbGF5KCk7XG4gICAgfVxufTtcblxuY29tbWFuZHMudHVybiA9IChkYXRhKSA9PiB7XG4gICAgLy8gU3RvcmUgdGhlIGN1cnJlbnQgdHVybiBpbiBtZW1vcnlcbiAgICBnbG9iYWxzLnR1cm4gPSBkYXRhLm51bTtcblxuICAgIC8vIEtlZXAgdHJhY2sgb2Ygd2hldGhlciBvciBub3QgaXQgaXMgb3VyIHR1cm4gKHNwZWVkcnVuKVxuICAgIGdsb2JhbHMub3VyVHVybiA9IChkYXRhLndobyA9PT0gZ2xvYmFscy5wbGF5ZXJVcyk7XG4gICAgaWYgKCFnbG9iYWxzLm91clR1cm4pIHtcbiAgICAgICAgLy8gQWRkaW5nIHRoaXMgaGVyZSB0byBhdm9pZCBidWdzIHdpdGggcHJlLW1vdmVzXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuaGlkZSgpO1xuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLm5hbWVGcmFtZXNbaV0uc2V0QWN0aXZlKGRhdGEud2hvID09PSBpKTtcbiAgICB9XG5cbiAgICBpZiAoIWdsb2JhbHMuYW5pbWF0ZUZhc3QpIHtcbiAgICAgICAgZ2xvYmFscy5sYXllcnMuVUkuZHJhdygpO1xuICAgIH1cblxuICAgIGdsb2JhbHMuZWxlbWVudHMudHVybk51bWJlckxhYmVsLnNldFRleHQoYCR7Z2xvYmFscy50dXJuICsgMX1gKTtcbn07XG5cbmNvbnN0IHJldmVhbENhcmQgPSAoZGF0YSkgPT4ge1xuICAgIC8vIExvY2FsIHZhcmlhYmxlc1xuICAgIGNvbnN0IHN1aXQgPSBjb252ZXJ0Lm1zZ1N1aXRUb1N1aXQoZGF0YS53aGljaC5zdWl0LCBnbG9iYWxzLnZhcmlhbnQpO1xuICAgIGNvbnN0IGNhcmQgPSBnbG9iYWxzLmRlY2tbZGF0YS53aGljaC5vcmRlcl07XG4gICAgY29uc3QgY2hpbGQgPSBjYXJkLnBhcmVudDsgLy8gVGhpcyBpcyB0aGUgTGF5b3V0Q2hpbGRcblxuICAgIC8vIEhpZGUgYWxsIG9mIHRoZSBleGlzdGluZyBhcnJvd3Mgb24gdGhlIGNhcmRzXG4gICAgZ2xvYmFscy5sb2JieS51aS5zaG93Q2x1ZU1hdGNoKC0xKTtcblxuICAgIGNvbnN0IGxlYXJuZWRDYXJkID0gZ2xvYmFscy5sZWFybmVkQ2FyZHNbZGF0YS53aGljaC5vcmRlcl07XG4gICAgbGVhcm5lZENhcmQuc3VpdCA9IHN1aXQ7XG4gICAgbGVhcm5lZENhcmQucmFuayA9IGRhdGEud2hpY2gucmFuaztcbiAgICBsZWFybmVkQ2FyZC5wb3NzaWJsZVN1aXRzID0gW3N1aXRdO1xuICAgIGxlYXJuZWRDYXJkLnBvc3NpYmxlUmFua3MgPSBbZGF0YS53aGljaC5yYW5rXTtcbiAgICBsZWFybmVkQ2FyZC5yZXZlYWxlZCA9IHRydWU7XG5cbiAgICBjYXJkLnNob3dPbmx5TGVhcm5lZCA9IGZhbHNlO1xuICAgIGNhcmQudHJ1ZVN1aXQgPSBzdWl0O1xuICAgIGNhcmQudHJ1ZVJhbmsgPSBkYXRhLndoaWNoLnJhbms7XG5cbiAgICBjb25zdCBwb3MgPSBjaGlsZC5nZXRBYnNvbHV0ZVBvc2l0aW9uKCk7XG4gICAgY2hpbGQuc2V0Um90YXRpb24oY2hpbGQucGFyZW50LmdldFJvdGF0aW9uKCkpO1xuICAgIGNhcmQuc3VpdFBpcHMuaGlkZSgpO1xuICAgIGNhcmQucmFua1BpcHMuaGlkZSgpO1xuICAgIGNoaWxkLnJlbW92ZSgpO1xuICAgIGNoaWxkLnNldEFic29sdXRlUG9zaXRpb24ocG9zKTtcbiAgICBjYXJkLnNldEJhcmVJbWFnZSgpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLmNoZWNrRXhwaXJ5KCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbW1hbmRzO1xuIiwiY29uc3QgTnVtYmVyQnV0dG9uID0gZnVuY3Rpb24gTnVtYmVyQnV0dG9uKGNvbmZpZykge1xuICAgIEtpbmV0aWMuR3JvdXAuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gICAgY29uc3QgdyA9IHRoaXMuZ2V0V2lkdGgoKTtcbiAgICBjb25zdCBoID0gdGhpcy5nZXRIZWlnaHQoKTtcblxuICAgIGNvbnN0IGJhY2tncm91bmQgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgbmFtZTogJ2JhY2tncm91bmQnLFxuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLFxuICAgICAgICB3aWR0aDogdyxcbiAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICBsaXN0ZW5pbmc6IHRydWUsXG4gICAgICAgIGNvcm5lclJhZGl1czogMC4xMiAqIGgsXG4gICAgICAgIGZpbGw6ICdibGFjaycsXG4gICAgICAgIG9wYWNpdHk6IDAuNixcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkKGJhY2tncm91bmQpO1xuXG4gICAgY29uc3QgdGV4dCA9IG5ldyBLaW5ldGljLlRleHQoe1xuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLjI3NSAqIGgsIC8vIDAuMjUgaXMgdG9vIGhpZ2ggZm9yIHNvbWUgcmVhc29uXG4gICAgICAgIHdpZHRoOiB3LFxuICAgICAgICBoZWlnaHQ6IDAuNSAqIGgsXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgICAgIGZvbnRTaXplOiAwLjUgKiBoLFxuICAgICAgICBmb250RmFtaWx5OiAnVmVyZGFuYScsXG4gICAgICAgIGZpbGw6ICd3aGl0ZScsXG4gICAgICAgIHN0cm9rZTogJ2JsYWNrJyxcbiAgICAgICAgc3Ryb2tlV2lkdGg6IDEsXG4gICAgICAgIGFsaWduOiAnY2VudGVyJyxcbiAgICAgICAgdGV4dDogY29uZmlnLm51bWJlci50b1N0cmluZygpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGQodGV4dCk7XG5cbiAgICB0aGlzLnByZXNzZWQgPSBmYWxzZTtcblxuICAgIHRoaXMuY2x1ZSA9IGNvbmZpZy5jbHVlO1xuXG4gICAgYmFja2dyb3VuZC5vbignbW91c2Vkb3duJywgKCkgPT4ge1xuICAgICAgICBiYWNrZ3JvdW5kLnNldEZpbGwoJyM4ODg4ODgnKTtcbiAgICAgICAgYmFja2dyb3VuZC5nZXRMYXllcigpLmRyYXcoKTtcblxuICAgICAgICBjb25zdCByZXNldEJ1dHRvbiA9ICgpID0+IHtcbiAgICAgICAgICAgIGJhY2tncm91bmQuc2V0RmlsbCgnYmxhY2snKTtcbiAgICAgICAgICAgIGJhY2tncm91bmQuZ2V0TGF5ZXIoKS5kcmF3KCk7XG5cbiAgICAgICAgICAgIGJhY2tncm91bmQub2ZmKCdtb3VzZXVwJyk7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kLm9mZignbW91c2VvdXQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBiYWNrZ3JvdW5kLm9uKCdtb3VzZW91dCcsICgpID0+IHtcbiAgICAgICAgICAgIHJlc2V0QnV0dG9uKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBiYWNrZ3JvdW5kLm9uKCdtb3VzZXVwJywgKCkgPT4ge1xuICAgICAgICAgICAgcmVzZXRCdXR0b24oKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKE51bWJlckJ1dHRvbiwgS2luZXRpYy5Hcm91cCk7XG5cbk51bWJlckJ1dHRvbi5wcm90b3R5cGUuc2V0UHJlc3NlZCA9IGZ1bmN0aW9uIHNldFByZXNzZWQocHJlc3NlZCkge1xuICAgIHRoaXMucHJlc3NlZCA9IHByZXNzZWQ7XG5cbiAgICB0aGlzLmdldCgnLmJhY2tncm91bmQnKVswXS5zZXRGaWxsKHByZXNzZWQgPyAnI2NjY2NjYycgOiAnYmxhY2snKTtcblxuICAgIHRoaXMuZ2V0TGF5ZXIoKS5iYXRjaERyYXcoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTnVtYmVyQnV0dG9uO1xuIiwiLypcbiAgICBGdW5jdGlvbnMgZm9yIHByb2dyZXNzaW5nIGZvcndhcmQgYW5kIGJhY2t3YXJkIHRocm91Z2ggdGltZVxuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vLi4vY29uc3RhbnRzJyk7XG5jb25zdCB0aW1lciA9IHJlcXVpcmUoJy4vdGltZXInKTtcblxuLypcbiAgICBNYWluIHJlcGxheSBmdW5jdGlvbnNcbiovXG5cbmNvbnN0IGVudGVyID0gKCkgPT4ge1xuICAgIGlmIChnbG9iYWxzLmluUmVwbGF5KSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBnbG9iYWxzLmluUmVwbGF5ID0gdHJ1ZTtcbiAgICBnbG9iYWxzLnJlcGxheVBvcyA9IGdsb2JhbHMucmVwbGF5TG9nLmxlbmd0aDtcbiAgICBnbG9iYWxzLnJlcGxheVR1cm4gPSBnbG9iYWxzLnJlcGxheU1heDtcbiAgICBhZGp1c3RTaHV0dGxlcygpO1xuICAgIGdsb2JhbHMubG9iYnkudWkuc3RvcEFjdGlvbigpO1xuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5QXJlYS5zaG93KCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLmRlY2subGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZ2xvYmFscy5kZWNrW2ldLnNldEJhcmVJbWFnZSgpO1xuICAgIH1cbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5kcmF3KCk7XG59O1xuZXhwb3J0cy5lbnRlciA9IGVudGVyO1xuXG5jb25zdCBleGl0ID0gKCkgPT4ge1xuICAgIGlmICghZ2xvYmFscy5pblJlcGxheSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZ290byhnbG9iYWxzLnJlcGxheU1heCwgdHJ1ZSk7XG4gICAgZ2xvYmFscy5pblJlcGxheSA9IGZhbHNlO1xuICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5QXJlYS5oaWRlKCk7XG5cbiAgICBpZiAoZ2xvYmFscy5zYXZlZEFjdGlvbikge1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmhhbmRsZUFjdGlvbihnbG9iYWxzLnNhdmVkQWN0aW9uKTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLmRlY2subGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZ2xvYmFscy5kZWNrW2ldLnNldEJhcmVJbWFnZSgpO1xuICAgIH1cbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5kcmF3KCk7XG59O1xuZXhwb3J0cy5leGl0ID0gZXhpdDtcblxuY29uc3QgZ290byA9ICh0YXJnZXQsIGZhc3QpID0+IHtcbiAgICBsZXQgcmV3aW5kID0gZmFsc2U7XG5cbiAgICBpZiAodGFyZ2V0IDwgMCkge1xuICAgICAgICB0YXJnZXQgPSAwO1xuICAgIH1cbiAgICBpZiAodGFyZ2V0ID4gZ2xvYmFscy5yZXBsYXlNYXgpIHtcbiAgICAgICAgdGFyZ2V0ID0gZ2xvYmFscy5yZXBsYXlNYXg7XG4gICAgfVxuXG4gICAgaWYgKHRhcmdldCA8IGdsb2JhbHMucmVwbGF5VHVybikge1xuICAgICAgICByZXdpbmQgPSB0cnVlO1xuICAgICAgICBnbG9iYWxzLmNhcmRzR290dGVuID0gMDtcbiAgICAgICAgZ2xvYmFscy5jbHVlc1NwZW50UGx1c1N0cmlrZXMgPSAwO1xuICAgIH1cblxuICAgIGlmIChnbG9iYWxzLnJlcGxheVR1cm4gPT09IHRhcmdldCkge1xuICAgICAgICByZXR1cm47IC8vIFdlIGFyZSBhbHJlYWR5IHRoZXJlLCBub3RoaW5nIHRvIGRvXG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgICBnbG9iYWxzLnNoYXJlZFJlcGxheVxuICAgICAgICAmJiBnbG9iYWxzLnNoYXJlZFJlcGxheUxlYWRlciA9PT0gZ2xvYmFscy5sb2JieS51c2VybmFtZVxuICAgICAgICAmJiBnbG9iYWxzLnVzZVNoYXJlZFR1cm5zXG4gICAgKSB7XG4gICAgICAgIHNoYXJlQ3VycmVudFR1cm4odGFyZ2V0KTtcbiAgICB9XG5cbiAgICBnbG9iYWxzLnJlcGxheVR1cm4gPSB0YXJnZXQ7XG5cbiAgICBhZGp1c3RTaHV0dGxlcygpO1xuICAgIGlmIChmYXN0KSB7XG4gICAgICAgIGdsb2JhbHMuYW5pbWF0ZUZhc3QgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXdpbmQpIHtcbiAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgZ2xvYmFscy5yZXBsYXlQb3MgPSAwO1xuICAgIH1cblxuICAgIC8vIEl0ZXJhdGUgb3ZlciB0aGUgcmVwbGF5IGFuZCBzdG9wIGF0IHRoZSBjdXJyZW50IHR1cm4gb3IgYXQgdGhlIGVuZCwgd2hpY2hldmVyIGNvbWVzIGZpcnN0XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgY29uc3QgbXNnID0gZ2xvYmFscy5yZXBsYXlMb2dbZ2xvYmFscy5yZXBsYXlQb3NdO1xuICAgICAgICBnbG9iYWxzLnJlcGxheVBvcyArPSAxO1xuXG4gICAgICAgIC8vIFN0b3AgYXQgdGhlIGVuZCBvZiB0aGUgcmVwbGF5XG4gICAgICAgIGlmICghbXNnKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlYnVpbGQgYWxsIG5vdGlmaWVzOyB0aGlzIHdpbGwgY29ycmVjdGx5IHBvc2l0aW9uIGNhcmRzIGFuZCB0ZXh0XG4gICAgICAgIGdsb2JhbHMubG9iYnkudWkuaGFuZGxlTm90aWZ5KG1zZyk7XG5cbiAgICAgICAgLy8gU3RvcCBpZiB5b3UncmUgYXQgdGhlIGN1cnJlbnQgdHVyblxuICAgICAgICBpZiAobXNnLnR5cGUgPT09ICd0dXJuJyAmJiBtc2cubnVtID09PSBnbG9iYWxzLnJlcGxheVR1cm4pIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2xvYmFscy5hbmltYXRlRmFzdCA9IGZhbHNlO1xuICAgIGdsb2JhbHMuZWxlbWVudHMubXNnTG9nR3JvdXAucmVmcmVzaFRleHQoKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm1lc3NhZ2VQcm9tcHQucmVmcmVzaFRleHQoKTtcbiAgICBnbG9iYWxzLmxheWVycy5jYXJkLmRyYXcoKTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG59O1xuZXhwb3J0cy5nb3RvID0gZ290bztcblxuY29uc3QgcmVzZXQgPSBmdW5jdGlvbiByZXNldCgpIHtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm1lc3NhZ2VQcm9tcHQuc2V0TXVsdGlUZXh0KCcnKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm1zZ0xvZ0dyb3VwLnJlc2V0KCk7XG5cbiAgICBjb25zdCB7IHN1aXRzIH0gPSBnbG9iYWxzLnZhcmlhbnQ7XG5cbiAgICBmb3IgKGNvbnN0IHN1aXQgb2Ygc3VpdHMpIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5wbGF5U3RhY2tzLmdldChzdWl0KS5yZW1vdmVDaGlsZHJlbigpO1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmRpc2NhcmRTdGFja3MuZ2V0KHN1aXQpLnJlbW92ZUNoaWxkcmVuKCk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLnBsYXllck5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbaV0ucmVtb3ZlQ2hpbGRyZW4oKTtcbiAgICB9XG5cbiAgICBnbG9iYWxzLmRlY2sgPSBbXTtcbiAgICBnbG9iYWxzLnBvc3RBbmltYXRpb25MYXlvdXQgPSBudWxsO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlTG9nLmNsZWFyKCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5tZXNzYWdlUHJvbXB0LnJlc2V0KCk7XG5cbiAgICAvLyBUaGlzIHNob3VsZCBhbHdheXMgYmUgb3ZlcnJpZGRlbiBiZWZvcmUgaXQgZ2V0cyBkaXNwbGF5ZWRcbiAgICBnbG9iYWxzLmVsZW1lbnRzLmRyYXdEZWNrLnNldENvdW50KDApO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxzLmVsZW1lbnRzLnN0cmlrZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5zdHJpa2VzW2ldLnJlbW92ZSgpO1xuICAgIH1cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnN0cmlrZXMgPSBbXTtcblxuICAgIGdsb2JhbHMuYW5pbWF0ZUZhc3QgPSB0cnVlO1xufTtcblxuLypcbiAgICBUaGUgNCByZXBsYXkgYnV0dG9uIGZ1bmN0aW9uc1xuKi9cblxuZXhwb3J0cy5iYWNrRnVsbCA9ICgpID0+IHtcbiAgICBjaGVja0Rpc2FibGVTaGFyZWRUdXJucygpO1xuICAgIGdvdG8oMCwgdHJ1ZSk7XG59O1xuXG5leHBvcnRzLmJhY2sgPSAoKSA9PiB7XG4gICAgY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMoKTtcbiAgICBnb3RvKGdsb2JhbHMucmVwbGF5VHVybiAtIDEsIHRydWUpO1xufTtcblxuZXhwb3J0cy5mb3J3YXJkID0gKCkgPT4ge1xuICAgIGNoZWNrRGlzYWJsZVNoYXJlZFR1cm5zKCk7XG4gICAgZ290byhnbG9iYWxzLnJlcGxheVR1cm4gKyAxKTtcbn07XG5cbmV4cG9ydHMuZm9yd2FyZEZ1bGwgPSAoKSA9PiB7XG4gICAgY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMoKTtcbiAgICBnb3RvKGdsb2JhbHMucmVwbGF5TWF4LCB0cnVlKTtcbn07XG5cbi8qXG4gICAgRXh0cmEgcmVwbGF5IGZ1bmN0aW9uc1xuKi9cblxuZXhwb3J0cy5iYWNrUm91bmQgPSAoKSA9PiB7XG4gICAgY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMoKTtcbiAgICBnb3RvKGdsb2JhbHMucmVwbGF5VHVybiAtIGdsb2JhbHMucGxheWVyTmFtZXMubGVuZ3RoLCB0cnVlKTtcbn07XG5cbmV4cG9ydHMuZm9yd2FyZFJvdW5kID0gKCkgPT4ge1xuICAgIGNoZWNrRGlzYWJsZVNoYXJlZFR1cm5zKCk7XG4gICAgZ290byhnbG9iYWxzLnJlcGxheVR1cm4gKyBnbG9iYWxzLnBsYXllck5hbWVzLmxlbmd0aCk7XG59O1xuXG5cbi8qXG4gICAgVGhlIFwiRXhpdCBSZXBsYXlcIiBidXR0b25cbiovXG5cbmV4cG9ydHMuZXhpdEJ1dHRvbiA9ICgpID0+IHtcbiAgICBpZiAoZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgZ2xvYmFscy5sb2JieS5jb25uLnNlbmQoJ2dhbWVVbmF0dGVuZCcpO1xuXG4gICAgICAgIHRpbWVyLnN0b3AoKTtcbiAgICAgICAgZ2xvYmFscy5nYW1lLmhpZGUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBNYXJrIHRoZSB0aW1lIHRoYXQgdGhlIHVzZXIgY2xpY2tlZCB0aGUgXCJFeGl0IFJlcGxheVwiIGJ1dHRvblxuICAgICAgICAvLyAoc28gdGhhdCB3ZSBjYW4gYXZvaWQgYW4gYWNjaWRlbnRhbCBcIkdpdmUgQ2x1ZVwiIGRvdWJsZS1jbGljaylcbiAgICAgICAgZ2xvYmFscy5hY2NpZGVudGFsQ2x1ZVRpbWVyID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBleGl0KCk7XG4gICAgfVxufTtcblxuLypcbiAgICBUaGUgcmVwbGF5IHNodXR0bGVcbiovXG5cbmV4cG9ydHMuYmFyQ2xpY2sgPSBmdW5jdGlvbiBiYXJDbGljayhldmVudCkge1xuICAgIGNvbnN0IHJlY3RYID0gZXZlbnQuZXZ0LnggLSB0aGlzLmdldEFic29sdXRlUG9zaXRpb24oKS54O1xuICAgIGNvbnN0IHcgPSB0aGlzLmdldFdpZHRoKCk7XG4gICAgY29uc3Qgc3RlcCA9IHcgLyBnbG9iYWxzLnJlcGxheU1heDtcbiAgICBjb25zdCBuZXdUdXJuID0gTWF0aC5mbG9vcigocmVjdFggKyBzdGVwIC8gMikgLyBzdGVwKTtcbiAgICBpZiAobmV3VHVybiAhPT0gZ2xvYmFscy5yZXBsYXlUdXJuKSB7XG4gICAgICAgIGNoZWNrRGlzYWJsZVNoYXJlZFR1cm5zKCk7XG4gICAgICAgIGdvdG8obmV3VHVybiwgdHJ1ZSk7XG4gICAgfVxufTtcblxuZXhwb3J0cy5iYXJEcmFnID0gZnVuY3Rpb24gYmFyRHJhZyhwb3MpIHtcbiAgICBjb25zdCBtaW4gPSB0aGlzLmdldFBhcmVudCgpLmdldEFic29sdXRlUG9zaXRpb24oKS54O1xuICAgIGNvbnN0IHcgPSB0aGlzLmdldFBhcmVudCgpLmdldFdpZHRoKCkgLSB0aGlzLmdldFdpZHRoKCk7XG4gICAgbGV0IHNodXR0bGVYID0gcG9zLnggLSBtaW47XG4gICAgY29uc3Qgc2h1dHRsZVkgPSB0aGlzLmdldEFic29sdXRlUG9zaXRpb24oKS55O1xuICAgIGlmIChzaHV0dGxlWCA8IDApIHtcbiAgICAgICAgc2h1dHRsZVggPSAwO1xuICAgIH1cbiAgICBpZiAoc2h1dHRsZVggPiB3KSB7XG4gICAgICAgIHNodXR0bGVYID0gdztcbiAgICB9XG4gICAgY29uc3Qgc3RlcCA9IHcgLyBnbG9iYWxzLnJlcGxheU1heDtcbiAgICBjb25zdCBuZXdUdXJuID0gTWF0aC5mbG9vcigoc2h1dHRsZVggKyBzdGVwIC8gMikgLyBzdGVwKTtcbiAgICBpZiAobmV3VHVybiAhPT0gZ2xvYmFscy5yZXBsYXlUdXJuKSB7XG4gICAgICAgIGNoZWNrRGlzYWJsZVNoYXJlZFR1cm5zKCk7XG4gICAgICAgIGdvdG8obmV3VHVybiwgdHJ1ZSk7XG4gICAgfVxuICAgIHNodXR0bGVYID0gbmV3VHVybiAqIHN0ZXA7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogbWluICsgc2h1dHRsZVgsXG4gICAgICAgIHk6IHNodXR0bGVZLFxuICAgIH07XG59O1xuXG5jb25zdCBwb3NpdGlvblJlcGxheVNodXR0bGUgPSAoc2h1dHRsZSwgdHVybikgPT4ge1xuICAgIGNvbnN0IHcgPSBzaHV0dGxlLmdldFBhcmVudCgpLmdldFdpZHRoKCkgLSBzaHV0dGxlLmdldFdpZHRoKCk7XG4gICAgc2h1dHRsZS5zZXRYKHR1cm4gKiB3IC8gZ2xvYmFscy5yZXBsYXlNYXgpO1xufTtcblxuY29uc3QgYWRqdXN0U2h1dHRsZXMgPSAoKSA9PiB7XG4gICAgcG9zaXRpb25SZXBsYXlTaHV0dGxlKGdsb2JhbHMuZWxlbWVudHMucmVwbGF5U2h1dHRsZSwgZ2xvYmFscy5yZXBsYXlUdXJuKTtcbiAgICBwb3NpdGlvblJlcGxheVNodXR0bGUoZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlTaHV0dGxlU2hhcmVkLCBnbG9iYWxzLnNoYXJlZFJlcGxheVR1cm4pO1xufTtcbmV4cG9ydHMuYWRqdXN0U2h1dHRsZXMgPSBhZGp1c3RTaHV0dGxlcztcblxuLypcbiAgICBSaWdodC1jbGlja2luZyB0aGUgZGVja1xuKi9cblxuZXhwb3J0cy5wcm9tcHRUdXJuID0gKGV2ZW50KSA9PiB7XG4gICAgLy8gRG8gbm90aGluZyBpZiB0aGlzIGlzIG5vdCBhIHJpZ2h0LWNsaWNrXG4gICAgaWYgKGV2ZW50LmV2dC53aGljaCAhPT0gMykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHR1cm4gPSB3aW5kb3cucHJvbXB0KCdXaGljaCB0dXJuIGRvIHlvdSB3YW50IHRvIGdvIHRvPycpO1xuICAgIGlmIChOdW1iZXIuaXNOYU4odHVybikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0dXJuIC09IDE7XG4gICAgLy8gV2UgbmVlZCB0byBkZWNyZW1lbnQgdGhlIHR1cm4gYmVjYXVzZVxuICAgIC8vIHRoZSB0dXJuIHNob3duIHRvIHRoZSB1c2VyIGlzIGFsd2F5cyBvbmUgZ3JlYXRlciB0aGFuIHRoZSByZWFsIHR1cm5cblxuICAgIGlmIChnbG9iYWxzLnJlcGxheSkge1xuICAgICAgICBjaGVja0Rpc2FibGVTaGFyZWRUdXJucygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGVudGVyKHRydWUpO1xuICAgIH1cbiAgICBnb3RvKHR1cm4sIHRydWUpO1xufTtcblxuLypcbiAgICBUaGUgXCJUb2dnbGUgU2hhcmVkIFR1cm5zXCIgYnV0dG9uXG4qL1xuXG5leHBvcnRzLnRvZ2dsZVNoYXJlZFR1cm5zID0gKCkgPT4ge1xuICAgIGdsb2JhbHMudXNlU2hhcmVkVHVybnMgPSAhZ2xvYmFscy51c2VTaGFyZWRUdXJucztcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheVNodXR0bGVTaGFyZWQuc2V0VmlzaWJsZSghZ2xvYmFscy51c2VTaGFyZWRUdXJucyk7XG4gICAgaWYgKGdsb2JhbHMudXNlU2hhcmVkVHVybnMpIHtcbiAgICAgICAgaWYgKGdsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyID09PSBnbG9iYWxzLmxvYmJ5LnVzZXJuYW1lKSB7XG4gICAgICAgICAgICBzaGFyZUN1cnJlbnRUdXJuKGdsb2JhbHMucmVwbGF5VHVybik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBnb3RvKGdsb2JhbHMuc2hhcmVkUmVwbGF5VHVybik7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vLyBOYXZpZ2F0aW5nIGFzIGEgZm9sbG93ZXIgaW4gYSBzaGFyZWQgcmVwbGF5IGRpc2FibGVzIHJlcGxheSBhY3Rpb25zXG5jb25zdCBjaGVja0Rpc2FibGVTaGFyZWRUdXJucyA9ICgpID0+IHtcbiAgICBpZiAoXG4gICAgICAgIGdsb2JhbHMucmVwbGF5XG4gICAgICAgICYmIGdsb2JhbHMuc2hhcmVkUmVwbGF5XG4gICAgICAgICYmIGdsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyICE9PSBnbG9iYWxzLmxvYmJ5LnVzZXJuYW1lXG4gICAgICAgICYmIGdsb2JhbHMudXNlU2hhcmVkVHVybnNcbiAgICApIHtcbiAgICAgICAgLy8gUmVwbGF5IGFjdGlvbnMgY3VycmVudGx5IGVuYWJsZWQsIHNvIGRpc2FibGUgdGhlbVxuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnRvZ2dsZVNoYXJlZFR1cm5CdXR0b24uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snKSk7XG4gICAgfVxufTtcbmV4cG9ydHMuY2hlY2tEaXNhYmxlU2hhcmVkVHVybnMgPSBjaGVja0Rpc2FibGVTaGFyZWRUdXJucztcblxuY29uc3Qgc2hhcmVDdXJyZW50VHVybiA9ICh0YXJnZXQpID0+IHtcbiAgICBpZiAoZ2xvYmFscy5zaGFyZWRSZXBsYXlUdXJuID09PSB0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKCdyZXBsYXlBY3Rpb24nLCB7XG4gICAgICAgIHR5cGU6IGNvbnN0YW50cy5SRVBMQVlfQUNUSU9OX1RZUEUuVFVSTixcbiAgICAgICAgdHVybjogdGFyZ2V0LFxuICAgIH0pO1xuICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5VHVybiA9IHRhcmdldDtcbiAgICBhZGp1c3RTaHV0dGxlcygpO1xufTtcbiIsIi8qXG4gICAgRnVuY3Rpb25zIGZvciB0aGUgc3RhdHMgb24gdGhlIG1pZGRsZS1yaWdodC1oYW5kIHNpZGVcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcblxuZXhwb3J0cy51cGRhdGVQYWNlID0gKCkgPT4ge1xuICAgIGNvbnN0IGFkanVzdGVkU2NvcmVQbHVzRGVjayA9IGdsb2JhbHMuc2NvcmUgKyBnbG9iYWxzLmRlY2tTaXplIC0gZ2xvYmFscy5tYXhTY29yZTtcblxuICAgIC8vIEZvcm11bGEgZGVyaXZlZCBieSBMaWJzdGVyO1xuICAgIC8vIHRoZSBudW1iZXIgb2YgZGlzY2FyZHMgdGhhdCBjYW4gaGFwcGVuIHdoaWxlIHN0aWxsIGdldHRpbmcgdGhlIG1heGltdW0gbnVtYmVyIG9mXG4gICAgLy8gcG9pbnRzICh0aGlzIGlzIHJlcHJlc2VudGVkIHRvIHRoZSB1c2VyIGFzIFwiUGFjZVwiIG9uIHRoZSB1c2VyIGludGVyZmFjZSlcbiAgICBjb25zdCBlbmRHYW1lVGhyZXNob2xkMSA9IGFkanVzdGVkU2NvcmVQbHVzRGVjayArIGdsb2JhbHMucGxheWVyTmFtZXMubGVuZ3RoO1xuXG4gICAgLy8gRm9ybXVsYSBkZXJpdmVkIGJ5IEZsb3JyYXQ7XG4gICAgLy8gYSBzdHJhdGVnaWNhbCBlc3RpbWF0ZSBvZiBcIkVuZC1HYW1lXCIgdGhhdCB0cmllcyB0byBhY2NvdW50IGZvciB0aGUgbnVtYmVyIG9mIHBsYXllcnNcbiAgICBjb25zdCBlbmRHYW1lVGhyZXNob2xkMiA9IGFkanVzdGVkU2NvcmVQbHVzRGVjayArIE1hdGguZmxvb3IoZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGggLyAyKTtcblxuICAgIC8vIEZvcm11bGEgZGVyaXZlZCBieSBIeXBoZW4tYXRlZDtcbiAgICAvLyBhIG1vcmUgY29uc2VydmF0aXZlIGVzdGltYXRlIG9mIFwiRW5kLUdhbWVcIiB0aGF0IGRvZXMgbm90IGFjY291bnQgZm9yXG4gICAgLy8gdGhlIG51bWJlciBvZiBwbGF5ZXJzXG4gICAgY29uc3QgZW5kR2FtZVRocmVzaG9sZDMgPSBhZGp1c3RlZFNjb3JlUGx1c0RlY2s7XG5cbiAgICAvLyBVcGRhdGUgdGhlIHBhY2VcbiAgICAvLyAocGFydCBvZiB0aGUgZWZmaWNpZW5jeSBzdGF0aXN0aWNzIG9uIHRoZSByaWdodC1oYW5kIHNpZGUgb2YgdGhlIHNjcmVlbilcbiAgICAvLyBJZiB0aGVyZSBhcmUgbm8gY2FyZHMgbGVmdCBpbiB0aGUgZGVjaywgcGFjZSBpcyBtZWFuaW5nbGVzc1xuICAgIGNvbnN0IGxhYmVsID0gZ2xvYmFscy5lbGVtZW50cy5wYWNlTnVtYmVyTGFiZWw7XG4gICAgaWYgKGdsb2JhbHMuZGVja1NpemUgPT09IDApIHtcbiAgICAgICAgbGFiZWwuc2V0VGV4dCgnLScpO1xuICAgICAgICBsYWJlbC5zZXRGaWxsKCcjZDhkNWVmJyk7IC8vIFdoaXRlXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHBhY2VUZXh0ID0gZW5kR2FtZVRocmVzaG9sZDEudG9TdHJpbmcoKTtcbiAgICAgICAgaWYgKGVuZEdhbWVUaHJlc2hvbGQxID4gMCkge1xuICAgICAgICAgICAgcGFjZVRleHQgPSBgKyR7ZW5kR2FtZVRocmVzaG9sZDF9YDtcbiAgICAgICAgfVxuICAgICAgICBsYWJlbC5zZXRUZXh0KHBhY2VUZXh0KTtcblxuICAgICAgICAvLyBDb2xvciB0aGUgcGFjZSBsYWJlbCBkZXBlbmRpbmcgb24gaG93IFwicmlza3lcIiBpdCB3b3VsZCBiZSB0byBkaXNjYXJkXG4gICAgICAgIC8vIChhcHByb3hpbWF0ZWx5KVxuICAgICAgICBpZiAoZW5kR2FtZVRocmVzaG9sZDEgPD0gMCkge1xuICAgICAgICAgICAgLy8gTm8gbW9yZSBkaXNjYXJkcyBjYW4gb2NjdXIgaW4gb3JkZXIgdG8gZ2V0IGEgbWF4aW11bSBzY29yZVxuICAgICAgICAgICAgbGFiZWwuc2V0RmlsbCgnI2RmMWMyZCcpOyAvLyBSZWRcbiAgICAgICAgfSBlbHNlIGlmIChlbmRHYW1lVGhyZXNob2xkMiA8IDApIHtcbiAgICAgICAgICAgIC8vIEl0IHdvdWxkIHByb2JhYmx5IGJlIHJpc2t5IHRvIGRpc2NhcmRcbiAgICAgICAgICAgIGxhYmVsLnNldEZpbGwoJyNlZjhjMWQnKTsgLy8gT3JhbmdlXG4gICAgICAgIH0gZWxzZSBpZiAoZW5kR2FtZVRocmVzaG9sZDMgPCAwKSB7XG4gICAgICAgICAgICAvLyBJdCBtaWdodCBiZSByaXNreSB0byBkaXNjYXJkXG4gICAgICAgICAgICBsYWJlbC5zZXRGaWxsKCcjZWZlZjFkJyk7IC8vIFllbGxvd1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBldmVuIGNsb3NlIHRvIHRoZSBcIkVuZC1HYW1lXCIsIHNvIGdpdmUgaXQgdGhlIGRlZmF1bHQgY29sb3JcbiAgICAgICAgICAgIGxhYmVsLnNldEZpbGwoJyNkOGQ1ZWYnKTsgLy8gV2hpdGVcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydHMudXBkYXRlRWZmaWNpZW5jeSA9IChjYXJkc0dvdHRlbkRlbHRhKSA9PiB7XG4gICAgZ2xvYmFscy5jYXJkc0dvdHRlbiArPSBjYXJkc0dvdHRlbkRlbHRhO1xuICAgIGNvbnN0IGVmZmljaWVuY3kgPSAoZ2xvYmFscy5jYXJkc0dvdHRlbiAvIGdsb2JhbHMuY2x1ZXNTcGVudFBsdXNTdHJpa2VzKS50b0ZpeGVkKDIpO1xuICAgIC8vIFJvdW5kIGl0IHRvIDIgZGVjaW1hbCBwbGFjZXNcblxuICAgIC8qXG4gICAgICAgIENhbGN1bGF0ZSB0aGUgbWluaW11bSBhbW91bnQgb2YgZWZmaWNpZW5jeSBuZWVkZWQgaW4gb3JkZXIgdG8gd2luIHRoaXMgdmFyaWFudFxuICAgICAgICBGaXJzdCwgY2FsY3VsYXRlIHRoZSBzdGFydGluZyBwYWNlIHdpdGggdGhlIGZvbGxvd2luZyBmb3JtdWxhOlxuICAgICAgICAgICAgdG90YWwgY2FyZHMgaW4gdGhlIGRlY2sgLVxuICAgICAgICAgICAgKChudW1iZXIgb2YgY2FyZHMgaW4gYSBwbGF5ZXIncyBoYW5kIC0gMSkgKiBudW1iZXIgb2YgcGxheWVycykgLVxuICAgICAgICAgICAgKDUgKiBudW1iZXIgb2Ygc3VpdHMpXG4gICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9aYW1pZWxsL2hhbmFiaS1jb252ZW50aW9ucy9ibG9iL21hc3Rlci9vdGhlci1jb252ZW50aW9ucy9FZmZpY2llbmN5Lm1kXG4gICAgKi9cbiAgICBsZXQgdG90YWxDYXJkc0luVGhlRGVjayA9IDA7XG4gICAgZm9yIChjb25zdCBzdWl0IG9mIGdsb2JhbHMudmFyaWFudC5zdWl0cykge1xuICAgICAgICB0b3RhbENhcmRzSW5UaGVEZWNrICs9IDEwO1xuICAgICAgICBpZiAoc3VpdC5vbmVPZkVhY2gpIHtcbiAgICAgICAgICAgIHRvdGFsQ2FyZHNJblRoZURlY2sgLT0gNTtcbiAgICAgICAgfSBlbHNlIGlmIChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdVcCBvciBEb3duJykpIHtcbiAgICAgICAgICAgIHRvdGFsQ2FyZHNJblRoZURlY2sgLT0gMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBudW1iZXJPZlBsYXllcnMgPSBnbG9iYWxzLnBsYXllck5hbWVzLmxlbmd0aDtcbiAgICBsZXQgY2FyZHNJbkhhbmQgPSA1O1xuICAgIGlmIChudW1iZXJPZlBsYXllcnMgPT09IDQgfHwgbnVtYmVyT2ZQbGF5ZXJzID09PSA1KSB7XG4gICAgICAgIGNhcmRzSW5IYW5kID0gNDtcbiAgICB9IGVsc2UgaWYgKG51bWJlck9mUGxheWVycyA9PT0gNikge1xuICAgICAgICBjYXJkc0luSGFuZCA9IDM7XG4gICAgfVxuICAgIGxldCBzdGFydGluZ1BhY2UgPSB0b3RhbENhcmRzSW5UaGVEZWNrO1xuICAgIHN0YXJ0aW5nUGFjZSAtPSAoY2FyZHNJbkhhbmQgLSAxKSAqIG51bWJlck9mUGxheWVycztcbiAgICBzdGFydGluZ1BhY2UgLT0gNSAqIGdsb2JhbHMudmFyaWFudC5zdWl0cy5sZW5ndGg7XG5cbiAgICAvKlxuICAgICAgICBTZWNvbmQsIHVzZSB0aGUgcGFjZSB0byBjYWxjdWxhdGUgdGhlIG1pbmltdW0gZWZmaWNpZW5jeSByZXF1aXJlZCB0byB3aW4gdGhlIGdhbWVcbiAgICAgICAgd2l0aCB0aGUgZm9sbG93aW5nIGZvcm11bGE6XG4gICAgICAgICAgICAoNSAqIG51bWJlciBvZiBzdWl0cykgL1xuICAgICAgICAgICAgKDggKyBmbG9vcigoc3RhcnRpbmcgcGFjZSArIG51bWJlciBvZiBzdWl0cyAtIHVudXNhYmxlIGNsdWVzKSAvIGRpc2NhcmRzIHBlciBjbHVlKSlcbiAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL1phbWllbGwvaGFuYWJpLWNvbnZlbnRpb25zL2Jsb2IvbWFzdGVyL290aGVyLWNvbnZlbnRpb25zL0VmZmljaWVuY3kubWRcbiAgICAqL1xuICAgIGNvbnN0IG1pbkVmZmljaWVuY3lOdW1lcmF0b3IgPSA1ICogZ2xvYmFscy52YXJpYW50LnN1aXRzLmxlbmd0aDtcbiAgICBsZXQgdW51c2FibGVDbHVlcyA9IDE7XG4gICAgaWYgKG51bWJlck9mUGxheWVycyA+PSA1KSB7XG4gICAgICAgIHVudXNhYmxlQ2x1ZXMgPSAyO1xuICAgIH1cbiAgICBsZXQgZGlzY2FyZHNQZXJDbHVlID0gMTtcbiAgICBpZiAoZ2xvYmFscy52YXJpYW50Lm5hbWUuc3RhcnRzV2l0aCgnQ2x1ZSBTdGFydmVkJykpIHtcbiAgICAgICAgZGlzY2FyZHNQZXJDbHVlID0gMjtcbiAgICB9XG4gICAgY29uc3QgbWluRWZmaWNpZW5jeURlbm9taW5hdG9yID0gOCArIE1hdGguZmxvb3IoXG4gICAgICAgIChzdGFydGluZ1BhY2UgKyBnbG9iYWxzLnZhcmlhbnQuc3VpdHMubGVuZ3RoIC0gdW51c2FibGVDbHVlcykgLyBkaXNjYXJkc1BlckNsdWUsXG4gICAgKTtcbiAgICBjb25zdCBtaW5FZmZpY2llbmN5ID0gKG1pbkVmZmljaWVuY3lOdW1lcmF0b3IgLyBtaW5FZmZpY2llbmN5RGVub21pbmF0b3IpLnRvRml4ZWQoMik7XG4gICAgLy8gUm91bmQgaXQgdG8gMiBkZWNpbWFsIHBsYWNlc1xuXG4gICAgaWYgKGdsb2JhbHMuY2x1ZXNTcGVudFBsdXNTdHJpa2VzID09PSAwKSB7XG4gICAgICAgIC8vIEZpcnN0LCBoYW5kbGUgdGhlIGNhc2UgaW4gd2hpY2ggMCBjbHVlcyBoYXZlIGJlZW4gZ2l2ZW5cbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5lZmZpY2llbmN5TnVtYmVyTGFiZWwuc2V0VGV4dChgLSAvICR7bWluRWZmaWNpZW5jeX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmVmZmljaWVuY3lOdW1iZXJMYWJlbC5zZXRUZXh0KGAke2VmZmljaWVuY3l9IC8gJHttaW5FZmZpY2llbmN5fWApO1xuICAgIH1cbn07XG4iLCIvKlxuICAgIEZ1bmN0aW9ucyBmb3IgdGltZWQgZ2FtZXNcbiAgICAoYW5kIHRoZSB0aW1lciB0aGF0IHRpY2tzIHVwIGluIHVudGltZWQgZ2FtZXMpXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5cbi8vIFZhcmlhYmxlc1xubGV0IHRpbWVySUQ7XG5sZXQgcGxheWVyVGltZXM7XG5sZXQgYWN0aXZlSW5kZXg7XG5sZXQgbGFzdFRpbWVyVXBkYXRlVGltZU1TO1xuXG5leHBvcnRzLmluaXQgPSAoKSA9PiB7XG4gICAgdGltZXJJRCA9IG51bGw7XG4gICAgcGxheWVyVGltZXMgPSBudWxsO1xuICAgIGFjdGl2ZUluZGV4ID0gbnVsbDtcbiAgICBsYXN0VGltZXJVcGRhdGVUaW1lTVMgPSBudWxsO1xufTtcblxuLy8gSGFzIHRoZSBmb2xsb3dpbmcgZGF0YTpcbi8qXG4gICAge1xuICAgICAgICAvLyBBIGxpc3Qgb2YgdGhlIHRpbWVzIGZvciBlYWNoIHBsYXllclxuICAgICAgICB0aW1lczogW1xuICAgICAgICAgICAgMTAwLFxuICAgICAgICAgICAgMjAwLFxuICAgICAgICBdLFxuICAgICAgICAvLyBUaGUgaW5kZXggb2YgdGhlIGFjdGl2ZSBwbGF5ZXJcbiAgICAgICAgYWN0aXZlOiAwLFxuICAgIH1cbiovXG5leHBvcnRzLnVwZGF0ZSA9IChkYXRhKSA9PiB7XG4gICAgc3RvcCgpO1xuXG4gICAgLy8gV2UgZG9uJ3QgbmVlZCB0byB1cGRhdGUgdGhlIHRpbWVycyBpZiB0aGV5IGFyZSBub3Qgc2hvd2luZ1xuICAgIGlmIChcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy50aW1lcjEgPT09IG51bGxcbiAgICAgICAgfHwgZ2xvYmFscy5lbGVtZW50cy50aW1lcjIgPT09IG51bGxcbiAgICApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFJlY29yZCB0aGUgZGF0YVxuICAgIHBsYXllclRpbWVzID0gZGF0YS50aW1lcztcbiAgICBhY3RpdmVJbmRleCA9IGRhdGEuYWN0aXZlO1xuXG4gICAgLy8gTWFyayB0aGUgdGltZSB0aGF0IHdlIHVwZGF0ZWQgdGhlIGxvY2FsIHBsYXllciB0aW1lc1xuICAgIGxhc3RUaW1lclVwZGF0ZVRpbWVNUyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgLy8gVXBkYXRlIG9uc2NyZWVuIHRpbWUgZGlzcGxheXNcbiAgICBpZiAoIWdsb2JhbHMuc3BlY3RhdGluZykge1xuICAgICAgICAvLyBUaGUgdmlzaWJpbHR5IG9mIHRoaXMgdGltZXIgZG9lcyBub3QgY2hhbmdlIGR1cmluZyBhIGdhbWVcbiAgICAgICAgbGV0IHRpbWUgPSBwbGF5ZXJUaW1lc1tnbG9iYWxzLnBsYXllclVzXTtcbiAgICAgICAgaWYgKCFnbG9iYWxzLnRpbWVkKSB7XG4gICAgICAgICAgICAvLyBJbnZlcnQgaXQgdG8gc2hvdyBob3cgbXVjaCB0aW1lIGVhY2ggcGxheWVyIGlzIHRha2luZ1xuICAgICAgICAgICAgdGltZSAqPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLnRpbWVyMS5zZXRUZXh0KG1pbGxpc2Vjb25kc1RvVGltZURpc3BsYXkodGltZSkpO1xuICAgIH1cblxuICAgIGNvbnN0IG91clR1cm4gPSBhY3RpdmVJbmRleCA9PT0gZ2xvYmFscy5wbGF5ZXJVcyAmJiAhZ2xvYmFscy5zcGVjdGF0aW5nO1xuICAgIGlmICghb3VyVHVybikge1xuICAgICAgICAvLyBVcGRhdGUgdGhlIFVJIHdpdGggdGhlIHZhbHVlIG9mIHRoZSB0aW1lciBmb3IgdGhlIGFjdGl2ZSBwbGF5ZXJcbiAgICAgICAgbGV0IHRpbWUgPSBwbGF5ZXJUaW1lc1thY3RpdmVJbmRleF07XG4gICAgICAgIGlmICghZ2xvYmFscy50aW1lZCkge1xuICAgICAgICAgICAgLy8gSW52ZXJ0IGl0IHRvIHNob3cgaG93IG11Y2ggdGltZSBlYWNoIHBsYXllciBpcyB0YWtpbmdcbiAgICAgICAgICAgIHRpbWUgKj0gLTE7XG4gICAgICAgIH1cbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy50aW1lcjIuc2V0VGV4dChtaWxsaXNlY29uZHNUb1RpbWVEaXNwbGF5KHRpbWUpKTtcbiAgICB9XG5cbiAgICBjb25zdCBzaG91ZFNob3dUaW1lcjIgPSAhb3VyVHVybiAmJiBhY3RpdmVJbmRleCAhPT0gLTE7XG4gICAgZ2xvYmFscy5lbGVtZW50cy50aW1lcjIuc2V0VmlzaWJsZShzaG91ZFNob3dUaW1lcjIpO1xuICAgIGdsb2JhbHMubGF5ZXJzLnRpbWVyLmRyYXcoKTtcblxuICAgIC8vIFVwZGF0ZSB0aGUgdGltZXIgdG9vbHRpcHMgZm9yIGVhY2ggcGxheWVyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGF5ZXJUaW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzZXRUaWNraW5nRG93blRpbWVUb29sdGlwKGkpO1xuICAgIH1cblxuICAgIC8vIFRoZSBzZXJ2ZXIgd2lsbCBzZW5kIGFuIGFjdGl2ZSB2YWx1ZSBvZiAtMSB3aGVuIHRoZSBnYW1lIGlzIG92ZXJcbiAgICBpZiAoYWN0aXZlSW5kZXggPT09IC0xKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTdGFydCB0aGUgbG9jYWwgdGltZXIgZm9yIHRoZSBhY3RpdmUgcGxheWVyXG4gICAgY29uc3QgYWN0aXZlVGltZXJVSVRleHQgPSAob3VyVHVybiA/IGdsb2JhbHMuZWxlbWVudHMudGltZXIxIDogZ2xvYmFscy5lbGVtZW50cy50aW1lcjIpO1xuICAgIHRpbWVySUQgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBzZXRUaWNraW5nRG93blRpbWUoYWN0aXZlVGltZXJVSVRleHQpO1xuICAgICAgICBzZXRUaWNraW5nRG93blRpbWVUb29sdGlwKGFjdGl2ZUluZGV4KTtcbiAgICB9LCAxMDAwKTtcbn07XG5cbmNvbnN0IHN0b3AgPSAoKSA9PiB7XG4gICAgaWYgKHRpbWVySUQgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93LmNsZWFySW50ZXJ2YWwodGltZXJJRCk7XG4gICAgICAgIHRpbWVySUQgPSBudWxsO1xuICAgIH1cbn07XG5leHBvcnRzLnN0b3AgPSBzdG9wO1xuXG5mdW5jdGlvbiBzZXRUaWNraW5nRG93blRpbWUodGV4dCkge1xuICAgIC8vIENvbXB1dGUgZWxhcHNlZCB0aW1lIHNpbmNlIGxhc3QgdGltZXIgdXBkYXRlXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgdGltZUVsYXBzZWQgPSBub3cgLSBsYXN0VGltZXJVcGRhdGVUaW1lTVM7XG4gICAgbGFzdFRpbWVyVXBkYXRlVGltZU1TID0gbm93O1xuICAgIGlmICh0aW1lRWxhcHNlZCA8IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSB0aGUgdGltZSBpbiBsb2NhbCBhcnJheSB0byBhcHByb3hpbWF0ZSBzZXJ2ZXIgdGltZXNcbiAgICBwbGF5ZXJUaW1lc1thY3RpdmVJbmRleF0gLT0gdGltZUVsYXBzZWQ7XG4gICAgaWYgKGdsb2JhbHMudGltZWQgJiYgcGxheWVyVGltZXNbYWN0aXZlSW5kZXhdIDwgMCkge1xuICAgICAgICAvLyBEb24ndCBsZXQgdGhlIHRpbWVyIGdvIGludG8gbmVnYXRpdmUgdmFsdWVzLCBvciBlbHNlIGl0IHdpbGwgbWVzcyB1cCB0aGUgZGlzcGxheVxuICAgICAgICAvLyAoYnV0IGluIG5vbi10aW1lZCBnYW1lcywgd2Ugd2FudCB0aGlzIHRvIGhhcHBlbilcbiAgICAgICAgcGxheWVyVGltZXNbYWN0aXZlSW5kZXhdID0gMDtcbiAgICB9XG5cbiAgICBsZXQgbWlsbGlzZWNvbmRzTGVmdCA9IHBsYXllclRpbWVzW2FjdGl2ZUluZGV4XTtcbiAgICBpZiAoIWdsb2JhbHMudGltZWQpIHtcbiAgICAgICAgLy8gSW52ZXJ0IGl0IHRvIHNob3cgaG93IG11Y2ggdGltZSBlYWNoIHBsYXllciBpcyB0YWtpbmdcbiAgICAgICAgbWlsbGlzZWNvbmRzTGVmdCAqPSAtMTtcbiAgICB9XG4gICAgY29uc3QgZGlzcGxheVN0cmluZyA9IG1pbGxpc2Vjb25kc1RvVGltZURpc3BsYXkobWlsbGlzZWNvbmRzTGVmdCk7XG5cbiAgICAvLyBVcGRhdGUgZGlzcGxheVxuICAgIHRleHQuc2V0VGV4dChkaXNwbGF5U3RyaW5nKTtcbiAgICB0ZXh0LmdldExheWVyKCkuYmF0Y2hEcmF3KCk7XG5cbiAgICAvLyBQbGF5IGEgc291bmQgdG8gaW5kaWNhdGUgdGhhdCB0aGUgY3VycmVudCBwbGF5ZXIgaXMgYWxtb3N0IG91dCBvZiB0aW1lXG4gICAgLy8gRG8gbm90IHBsYXkgaXQgbW9yZSBmcmVxdWVudGx5IHRoYW4gYWJvdXQgb25jZSBwZXIgc2Vjb25kXG4gICAgaWYgKFxuICAgICAgICBnbG9iYWxzLnRpbWVkXG4gICAgICAgICYmIGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2VuZFRpbWVyU291bmRcbiAgICAgICAgJiYgbWlsbGlzZWNvbmRzTGVmdCA+IDAgLy8gQmV0d2VlbiAwIGFuZCAxMCBzZWNvbmRzXG4gICAgICAgICYmIG1pbGxpc2Vjb25kc0xlZnQgPD0gMTAwMDBcbiAgICAgICAgJiYgdGltZUVsYXBzZWQgPiA5MDBcbiAgICAgICAgJiYgdGltZUVsYXBzZWQgPCAxMTAwXG4gICAgICAgICYmICFnbG9iYWxzLmxvYmJ5LmVycm9yT2NjdXJlZFxuICAgICkge1xuICAgICAgICBnbG9iYWxzLmdhbWUuc291bmRzLnBsYXkoJ3RvbmUnKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNldFRpY2tpbmdEb3duVGltZVRvb2x0aXAoaSkge1xuICAgIGxldCB0aW1lID0gcGxheWVyVGltZXNbaV07XG4gICAgaWYgKCFnbG9iYWxzLnRpbWVkKSB7XG4gICAgICAgIC8vIEludmVydCBpdCB0byBzaG93IGhvdyBtdWNoIHRpbWUgZWFjaCBwbGF5ZXIgaXMgdGFraW5nXG4gICAgICAgIHRpbWUgKj0gLTE7XG4gICAgfVxuXG4gICAgbGV0IGNvbnRlbnQgPSAnVGltZSAnO1xuICAgIGlmIChnbG9iYWxzLnRpbWVkKSB7XG4gICAgICAgIGNvbnRlbnQgKz0gJ3JlbWFpbmluZyc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29udGVudCArPSAndGFrZW4nO1xuICAgIH1cbiAgICBjb250ZW50ICs9ICc6PGJyIC8+PHN0cm9uZz4nO1xuICAgIGNvbnRlbnQgKz0gbWlsbGlzZWNvbmRzVG9UaW1lRGlzcGxheSh0aW1lKTtcbiAgICBjb250ZW50ICs9ICc8L3N0cm9uZz4nO1xuICAgICQoYCN0b29sdGlwLXBsYXllci0ke2l9YCkudG9vbHRpcHN0ZXIoJ2luc3RhbmNlJykuY29udGVudChjb250ZW50KTtcbn1cblxuLypcbiAgICBUaGUgVUkgdGltZXIgb2JqZWN0XG4qL1xuXG5jb25zdCBUaW1lckRpc3BsYXkgPSBmdW5jdGlvbiBUaW1lckRpc3BsYXkoY29uZmlnKSB7XG4gICAgS2luZXRpYy5Hcm91cC5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgICBjb25zdCByZWN0YW5nbGUgPSBuZXcgS2luZXRpYy5SZWN0KHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IGNvbmZpZy53aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBjb25maWcuaGVpZ2h0LFxuICAgICAgICBmaWxsOiAnYmxhY2snLFxuICAgICAgICBjb3JuZXJSYWRpdXM6IGNvbmZpZy5jb3JuZXJSYWRpdXMsXG4gICAgICAgIG9wYWNpdHk6IDAuMixcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZChyZWN0YW5nbGUpO1xuXG4gICAgY29uc3QgbGFiZWwgPSBuZXcgS2luZXRpYy5UZXh0KHtcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogNiAqIGNvbmZpZy5zcGFjZUgsXG4gICAgICAgIHdpZHRoOiBjb25maWcud2lkdGgsXG4gICAgICAgIGhlaWdodDogY29uZmlnLmhlaWdodCxcbiAgICAgICAgZm9udFNpemU6IGNvbmZpZy5sYWJlbEZvbnRTaXplIHx8IGNvbmZpZy5mb250U2l6ZSxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHRleHQ6IGNvbmZpZy5sYWJlbCxcbiAgICAgICAgZmlsbDogJyNkOGQ1ZWYnLFxuICAgICAgICBzaGFkb3dDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc2hhZG93Qmx1cjogMTAsXG4gICAgICAgIHNoYWRvd09mZnNldDoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgIH0sXG4gICAgICAgIHNoYWRvd09wYWNpdHk6IDAuOSxcbiAgICAgICAgbGlzdGVuaW5nOiBmYWxzZSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZChsYWJlbCk7XG5cbiAgICBjb25zdCB0ZXh0ID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IGNvbmZpZy5zcGFjZUgsXG4gICAgICAgIHdpZHRoOiBjb25maWcud2lkdGgsXG4gICAgICAgIGhlaWdodDogY29uZmlnLmhlaWdodCxcbiAgICAgICAgZm9udFNpemU6IGNvbmZpZy5mb250U2l6ZSxcbiAgICAgICAgZm9udEZhbWlseTogJ1ZlcmRhbmEnLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHRleHQ6ICc/Pzo/PycsXG4gICAgICAgIGZpbGw6ICcjZDhkNWVmJyxcbiAgICAgICAgc2hhZG93Q29sb3I6ICdibGFjaycsXG4gICAgICAgIHNoYWRvd0JsdXI6IDEwLFxuICAgICAgICBzaGFkb3dPZmZzZXQ6IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAwLFxuICAgICAgICB9LFxuICAgICAgICBzaGFkb3dPcGFjaXR5OiAwLjksXG4gICAgICAgIGxpc3RlbmluZzogZmFsc2UsXG4gICAgfSk7XG4gICAgdGhpcy5hZGQodGV4dCk7XG5cbiAgICB0aGlzLnNldFRleHQgPSBzID0+IHRleHQuc2V0VGV4dChzKTtcbn07XG5LaW5ldGljLlV0aWwuZXh0ZW5kKFRpbWVyRGlzcGxheSwgS2luZXRpYy5Hcm91cCk7XG5leHBvcnRzLlRpbWVyRGlzcGxheSA9IFRpbWVyRGlzcGxheTtcblxuLypcbiAgICBNaXNjLiBmdW5jdGlvbnNcbiovXG5cbmNvbnN0IG1pbGxpc2Vjb25kc1RvVGltZURpc3BsYXkgPSAobWlsbGlzZWNvbmRzKSA9PiB7XG4gICAgY29uc3Qgc2Vjb25kcyA9IE1hdGguY2VpbChtaWxsaXNlY29uZHMgLyAxMDAwKTtcbiAgICByZXR1cm4gYCR7TWF0aC5mbG9vcihzZWNvbmRzIC8gNjApfToke3BhZDIoc2Vjb25kcyAlIDYwKX1gO1xufTtcbmNvbnN0IHBhZDIgPSAobnVtKSA9PiB7XG4gICAgaWYgKG51bSA8IDEwKSB7XG4gICAgICAgIHJldHVybiBgMCR7bnVtfWA7XG4gICAgfVxuICAgIHJldHVybiBgJHtudW19YDtcbn07XG4iLCIvLyBJbXBvcnRzXG5jb25zdCBCdXR0b24gPSByZXF1aXJlKCcuL2J1dHRvbicpO1xuXG4vLyBBIHNpbXBsZSB0d28tc3RhdGUgYnV0dG9uIHdpdGggdGV4dCBmb3IgZWFjaCBzdGF0ZVxuY29uc3QgVG9nZ2xlQnV0dG9uID0gZnVuY3Rpb24gVG9nZ2xlQnV0dG9uKGNvbmZpZykge1xuICAgIEJ1dHRvbi5jYWxsKHRoaXMsIGNvbmZpZyk7XG4gICAgbGV0IHRvZ2dsZVN0YXRlID0gZmFsc2U7XG5cbiAgICBjb25zdCB0b2dnbGUgPSAoKSA9PiB7XG4gICAgICAgIHRvZ2dsZVN0YXRlID0gIXRvZ2dsZVN0YXRlO1xuICAgICAgICB0aGlzLnNldFRleHQodG9nZ2xlU3RhdGUgPyBjb25maWcuYWx0ZXJuYXRlVGV4dCA6IGNvbmZpZy50ZXh0KTtcbiAgICAgICAgaWYgKHRoaXMuZ2V0TGF5ZXIoKSkge1xuICAgICAgICAgICAgdGhpcy5nZXRMYXllcigpLmJhdGNoRHJhdygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMub24oJ2NsaWNrIHRhcCcsIHRvZ2dsZSk7XG5cbiAgICBpZiAoY29uZmlnLmluaXRpYWxTdGF0ZSkge1xuICAgICAgICB0b2dnbGUoKTtcbiAgICB9XG59O1xuXG5LaW5ldGljLlV0aWwuZXh0ZW5kKFRvZ2dsZUJ1dHRvbiwgQnV0dG9uKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUb2dnbGVCdXR0b247XG4iLCIvLyBJbXBvcnRzXG5jb25zdCBidWlsZFVJID0gcmVxdWlyZSgnLi9idWlsZFVJJyk7XG5jb25zdCBjYXJkRHJhdyA9IHJlcXVpcmUoJy4vY2FyZERyYXcnKTtcbmNvbnN0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4uLy4uL2NvbnN0YW50cycpO1xuY29uc3QgY29udmVydCA9IHJlcXVpcmUoJy4vY29udmVydCcpO1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuY29uc3QgZ2xvYmFsc0luaXQgPSByZXF1aXJlKCcuL2dsb2JhbHNJbml0Jyk7XG5jb25zdCBMb2FkZXIgPSByZXF1aXJlKCcuL2xvYWRlcicpO1xuY29uc3Qga2V5Ym9hcmQgPSByZXF1aXJlKCcuL2tleWJvYXJkJyk7XG5jb25zdCBub3RlcyA9IHJlcXVpcmUoJy4vbm90ZXMnKTtcbmNvbnN0IG5vdGlmeSA9IHJlcXVpcmUoJy4vbm90aWZ5Jyk7XG5jb25zdCB0aW1lciA9IHJlcXVpcmUoJy4vdGltZXInKTtcbmNvbnN0IHdlYnNvY2tldCA9IHJlcXVpcmUoJy4vd2Vic29ja2V0Jyk7XG5cbmZ1bmN0aW9uIEhhbmFiaVVJKGxvYmJ5LCBnYW1lKSB7XG4gICAgLy8gU2luY2UgdGhlIFwiSGFuYWJpVUlcIiBvYmplY3QgaXMgYmVpbmcgcmVpbnN0YW50aWF0ZWQsXG4gICAgLy8gd2UgbmVlZCB0byBleHBsaWNpdGx5IHJlaW5pdGlhbGl6ZSBhbGwgdmFyYWlibGVzIChvciBlbHNlIHRoZXkgd2lsbCByZXRhaW4gdGhlaXIgb2xkIHZhbHVlcylcbiAgICBnbG9iYWxzSW5pdCgpO1xuICAgIGNhcmREcmF3LmluaXQoKTtcbiAgICAvLyAodGhlIGtleWJvYXJkIGZ1bmN0aW9ucyBjYW4gb25seSBiZSBpbml0aWFsaXplZCBvbmNlIHRoZSBjbHVlIGJ1dHRvbnMgYXJlIGRyYXduKVxuICAgIG5vdGVzLmluaXQoKTtcbiAgICB0aW1lci5pbml0KCk7XG5cbiAgICAvLyBTdG9yZSByZWZlcmVuY2VzIHRvIHRoZSBwYXJlbnQgb2JqZWN0cyBmb3IgbGF0ZXIgdXNlXG4gICAgZ2xvYmFscy5sb2JieSA9IGxvYmJ5OyAvLyBUaGlzIGlzIHRoZSBcImdsb2JhbHMuanNcIiBpbiB0aGUgcm9vdCBvZiB0aGUgXCJzcmNcIiBkaXJlY3RvcnlcbiAgICAvLyBJdCB3ZSBuYW1lIGl0IFwibG9iYnlcIiBoZXJlIHRvIGRpc3Rpbmd1aXNoIGl0IGZyb20gdGhlIFVJIGdsb2JhbHM7XG4gICAgLy8gYWZ0ZXIgbW9yZSByZWZhY3RvcmluZywgd2Ugd2lsbCBldmVudHVhbGx5IG1lcmdlIHRoZXNlIG9iamVjdHMgdG8gbWFrZSBpdCBsZXNzIGNvbmZ1c2luZ1xuICAgIGdsb2JhbHMuZ2FtZSA9IGdhbWU7IC8vIFRoaXMgaXMgdGhlIFwiZ2FtZS5qc1wiIGluIHRoZSByb290IG9mIHRoZSBcImdhbWVcIiBkaXJlY3RvcnlcbiAgICAvLyBXZSBzaG91bGQgYWxzbyBjb21iaW5lIHRoaXMgd2l0aCB0aGUgVUkgb2JqZWN0IGluIHRoZSBmdXR1cmVcblxuICAgIC8vIEluaXRpYWxpemUgdGhlIHN0YWdlIGFuZCBzaG93IHRoZSBsb2FkaW5nIHNjcmVlblxuICAgIHRoaXMuaW5pdFN0YWdlKCk7XG4gICAgZ2xvYmFscy5JbWFnZUxvYWRlciA9IG5ldyBMb2FkZXIodGhpcy5maW5pc2hlZExvYWRpbmdJbWFnZXMpO1xuICAgIHRoaXMuc2hvd0xvYWRpbmdTY3JlZW4oKTtcbn1cblxuSGFuYWJpVUkucHJvdG90eXBlLmluaXRTdGFnZSA9IGZ1bmN0aW9uIGluaXRTdGFnZSgpIHtcbiAgICAvLyBJbml0aWFsaXplIGFuZCBzaXplIHRoZSBzdGFnZSBkZXBlbmRpbmcgb24gdGhlIHdpbmRvdyBzaXplXG4gICAgZ2xvYmFscy5zdGFnZSA9IG5ldyBLaW5ldGljLlN0YWdlKHtcbiAgICAgICAgY29udGFpbmVyOiAnZ2FtZScsXG4gICAgfSk7XG4gICAgbGV0IHd3ID0gd2luZG93LmlubmVyV2lkdGg7XG4gICAgbGV0IHdoID0gd2luZG93LmlubmVySGVpZ2h0O1xuXG4gICAgaWYgKHd3IDwgNjQwKSB7XG4gICAgICAgIHd3ID0gNjQwO1xuICAgIH1cbiAgICBpZiAod2ggPCAzNjApIHtcbiAgICAgICAgd2ggPSAzNjA7XG4gICAgfVxuXG4gICAgY29uc3QgcmF0aW8gPSAxLjc3NztcblxuICAgIGxldCBjdztcbiAgICBsZXQgY2g7XG4gICAgaWYgKHd3IDwgd2ggKiByYXRpbykge1xuICAgICAgICBjdyA9IHd3O1xuICAgICAgICBjaCA9IHd3IC8gcmF0aW87XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY2ggPSB3aDtcbiAgICAgICAgY3cgPSB3aCAqIHJhdGlvO1xuICAgIH1cblxuICAgIGN3ID0gTWF0aC5mbG9vcihjdyk7XG4gICAgY2ggPSBNYXRoLmZsb29yKGNoKTtcblxuICAgIGlmIChjdyA+IDAuOTggKiB3dykge1xuICAgICAgICBjdyA9IHd3O1xuICAgIH1cbiAgICBpZiAoY2ggPiAwLjk4ICogd2gpIHtcbiAgICAgICAgY2ggPSB3aDtcbiAgICB9XG4gICAgZ2xvYmFscy5zdGFnZS5zZXRXaWR0aChjdyk7XG4gICAgZ2xvYmFscy5zdGFnZS5zZXRIZWlnaHQoY2gpO1xufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLnNob3dMb2FkaW5nU2NyZWVuID0gZnVuY3Rpb24gc2hvd0xvYWRpbmdTY3JlZW4oKSB7XG4gICAgY29uc3Qgd2luVyA9IGdsb2JhbHMuc3RhZ2UuZ2V0V2lkdGgoKTtcbiAgICBjb25zdCB3aW5IID0gZ2xvYmFscy5zdGFnZS5nZXRIZWlnaHQoKTtcblxuICAgIGNvbnN0IGxvYWRpbmdsYXllciA9IG5ldyBLaW5ldGljLkxheWVyKCk7XG5cbiAgICBjb25zdCBsb2FkaW5nbGFiZWwgPSBuZXcgS2luZXRpYy5UZXh0KHtcbiAgICAgICAgZmlsbDogJyNkOGQ1ZWYnLFxuICAgICAgICBzdHJva2U6ICcjNzQ3Mjc4JyxcbiAgICAgICAgc3Ryb2tlV2lkdGg6IDEsXG4gICAgICAgIHRleHQ6ICdMb2FkaW5nLi4uJyxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICB4OiAwLFxuICAgICAgICB5OiAwLjcgKiB3aW5ILFxuICAgICAgICB3aWR0aDogd2luVyxcbiAgICAgICAgaGVpZ2h0OiAwLjA1ICogd2luSCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsJyxcbiAgICAgICAgZm9udFN0eWxlOiAnYm9sZCcsXG4gICAgICAgIGZvbnRTaXplOiAwLjA1ICogd2luSCxcbiAgICB9KTtcbiAgICBsb2FkaW5nbGF5ZXIuYWRkKGxvYWRpbmdsYWJlbCk7XG5cbiAgICBjb25zdCBwcm9ncmVzc2xhYmVsID0gbmV3IEtpbmV0aWMuVGV4dCh7XG4gICAgICAgIGZpbGw6ICcjZDhkNWVmJyxcbiAgICAgICAgc3Ryb2tlOiAnIzc0NzI3OCcsXG4gICAgICAgIHN0cm9rZVdpZHRoOiAxLFxuICAgICAgICB0ZXh0OiAnMCAvIDAnLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHg6IDAsXG4gICAgICAgIHk6IDAuOCAqIHdpbkgsXG4gICAgICAgIHdpZHRoOiB3aW5XLFxuICAgICAgICBoZWlnaHQ6IDAuMDUgKiB3aW5ILFxuICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwnLFxuICAgICAgICBmb250U3R5bGU6ICdib2xkJyxcbiAgICAgICAgZm9udFNpemU6IDAuMDUgKiB3aW5ILFxuICAgIH0pO1xuICAgIGxvYWRpbmdsYXllci5hZGQocHJvZ3Jlc3NsYWJlbCk7XG5cbiAgICBnbG9iYWxzLkltYWdlTG9hZGVyLnByb2dyZXNzQ2FsbGJhY2sgPSAoZG9uZSwgdG90YWwpID0+IHtcbiAgICAgICAgcHJvZ3Jlc3NsYWJlbC5zZXRUZXh0KGAke2RvbmV9LyR7dG90YWx9YCk7XG4gICAgICAgIGxvYWRpbmdsYXllci5kcmF3KCk7XG4gICAgfTtcbiAgICBnbG9iYWxzLnN0YWdlLmFkZChsb2FkaW5nbGF5ZXIpO1xufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLmZpbmlzaGVkTG9hZGluZ0ltYWdlcyA9IGZ1bmN0aW9uIGZpbmlzaGVkTG9hZGluZ0ltYWdlcygpIHtcbiAgICAvLyBCdWlsZCBpbWFnZXMgZm9yIGV2ZXJ5IGNhcmQgKHdpdGggcmVzcGVjdCB0byB0aGUgdmFyaWFudCB0aGF0IHdlIGFyZSBwbGF5aW5nKVxuICAgIGNhcmREcmF3LmJ1aWxkQ2FyZHMoKTtcblxuICAgIC8vIERyYXcgdGhlIHVzZXIgaW50ZXJmYWNlXG4gICAgYnVpbGRVSSgpO1xuXG4gICAgLy8gS2V5Ym9hcmQgaG90a2V5cyBjYW4gb25seSBiZSBpbml0aWFsaXplZCBvbmNlIHRoZSBjbHVlIGJ1dHRvbnMgYXJlIGRyYXduXG4gICAga2V5Ym9hcmQuaW5pdCgpO1xuXG4gICAgLy8gVGVsbCB0aGUgc2VydmVyIHRoYXQgd2UgYXJlIGZpbmlzaGVkIGxvYWRpbmdcbiAgICBnbG9iYWxzLnJlYWR5ID0gdHJ1ZTtcbiAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZCgncmVhZHknKTtcbn07XG5cbkhhbmFiaVVJLnByb3RvdHlwZS5lbmRUdXJuID0gZnVuY3Rpb24gZW5kVHVybihhY3Rpb24pIHtcbiAgICBpZiAoZ2xvYmFscy5vdXJUdXJuKSB7XG4gICAgICAgIGdsb2JhbHMub3VyVHVybiA9IGZhbHNlO1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LmNvbm4uc2VuZChhY3Rpb24udHlwZSwgYWN0aW9uLmRhdGEpO1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLnN0b3BBY3Rpb24oKTtcbiAgICAgICAgZ2xvYmFscy5zYXZlZEFjdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZ2xvYmFscy5xdWV1ZWRBY3Rpb24gPSBhY3Rpb247XG4gICAgfVxufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLmhhbmRsZUFjdGlvbiA9IGZ1bmN0aW9uIGhhbmRsZUFjdGlvbihkYXRhKSB7XG4gICAgZ2xvYmFscy5zYXZlZEFjdGlvbiA9IGRhdGE7XG5cbiAgICBpZiAoZ2xvYmFscy5pblJlcGxheSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGRhdGEuY2FuQ2x1ZSkge1xuICAgICAgICAvLyBTaG93IHRoZSBjbHVlIFVJXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuc2hvdygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMubm9DbHVlQm94LnNob3coKTtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5ub0NsdWVMYWJlbC5zaG93KCk7XG4gICAgICAgIGlmICghZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICAgICAgZ2xvYmFscy5sYXllcnMuVUkuZHJhdygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gV2UgaGF2ZSB0byByZWRyYXcgdGhlIFVJIGxheWVyIHRvIGF2b2lkIGEgYnVnIHdpdGggdGhlIGNsdWUgVUlcbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG5cbiAgICBpZiAoZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgLy8gRGVmYXVsdCB0aGUgY2x1ZSByZWNpcGllbnQgYnV0dG9uIHRvIHRoZSBvbmx5IG90aGVyIHBsYXllciBhdmFpbGFibGVcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlVGFyZ2V0QnV0dG9uR3JvdXAubGlzdFswXS5zZXRQcmVzc2VkKHRydWUpO1xuICAgIH1cblxuICAgIGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZ2xvYmFscy5wbGF5ZXJVc10ubW92ZVRvVG9wKCk7XG5cbiAgICAvLyBTZXQgb3VyIGhhbmQgdG8gYmVpbmcgZHJhZ2dhYmxlXG4gICAgaWYgKFxuICAgICAgICAvLyBUaGlzIGlzIHVubmVjZXNzYXJ5IGlmIHRoZSBwcmUtcGxheSBzZXR0aW5nIGlzIGVuYWJsZWQsXG4gICAgICAgIC8vIGFzIHRoZSBoYW5kIHdpbGwgYWxyZWFkeSBiZSBkcmFnZ2FibGVcbiAgICAgICAgIWdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc3BlZWRydW5QcmVwbGF5XG4gICAgICAgIC8vIFRoaXMgaXMgdW5uZWNlc3NhcnkgaWYgdGhpcyBhIHNwZWVkcnVuLFxuICAgICAgICAvLyBhcyBjbGlja2luZyBvbiBjYXJkcyB0YWtlcyBwcmlvcml0eSBvdmVyIGRyYWdnaW5nIGNhcmRzXG4gICAgICAgICYmICFnbG9iYWxzLnNwZWVkcnVuXG4gICAgKSB7XG4gICAgICAgIGNvbnN0IG91ckhhbmQgPSBnbG9iYWxzLmVsZW1lbnRzLnBsYXllckhhbmRzW2dsb2JhbHMucGxheWVyVXNdO1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG91ckhhbmQuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGNoaWxkLmNoZWNrU2V0RHJhZ2dhYmxlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ2xvYmFscy5kZWNrUGxheXMpIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5kcmF3RGVjay5jYXJkYmFjay5zZXREcmFnZ2FibGUoZGF0YS5jYW5CbGluZFBsYXlEZWNrKTtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5kZWNrUGxheUF2YWlsYWJsZUxhYmVsLnNldFZpc2libGUoZGF0YS5jYW5CbGluZFBsYXlEZWNrKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGhlIGRlY2sgaXMgYWJvdmUgb3RoZXIgY2FyZHMgYW5kIFVJIGVsZW1lbnRzXG4gICAgICAgIGlmIChkYXRhLmNhbkJsaW5kUGxheURlY2spIHtcbiAgICAgICAgICAgIGdsb2JhbHMuZWxlbWVudHMuZHJhd0RlY2subW92ZVRvVG9wKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjaGVja0NsdWVMZWdhbCA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZ2xvYmFscy5lbGVtZW50cy5jbHVlVGFyZ2V0QnV0dG9uR3JvdXAuZ2V0UHJlc3NlZCgpO1xuICAgICAgICBjb25zdCBjbHVlQnV0dG9uID0gZ2xvYmFscy5lbGVtZW50cy5jbHVlQnV0dG9uR3JvdXAuZ2V0UHJlc3NlZCgpO1xuXG4gICAgICAgIGlmICghdGFyZ2V0IHx8ICFjbHVlQnV0dG9uKSB7XG4gICAgICAgICAgICBnbG9iYWxzLmVsZW1lbnRzLmdpdmVDbHVlQnV0dG9uLnNldEVuYWJsZWQoZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgd2hvID0gdGFyZ2V0LnRhcmdldEluZGV4O1xuICAgICAgICBjb25zdCBtYXRjaCA9IGdsb2JhbHMubG9iYnkudWkuc2hvd0NsdWVNYXRjaCh3aG8sIGNsdWVCdXR0b24uY2x1ZSk7XG5cbiAgICAgICAgLy8gQnkgZGVmYXVsdCwgb25seSBlbmFibGUgdGhlIFwiR2l2ZSBDbHVlXCIgYnV0dG9uIGlmIHRoZSBjbHVlIFwidG91Y2hlZFwiXG4gICAgICAgIC8vIG9uZSBvciBtb3JlIGNhcmRzIGluIHRoZSBoYW5kXG4gICAgICAgIGNvbnN0IGVuYWJsZWQgPSBtYXRjaFxuICAgICAgICAgICAgLy8gTWFrZSBhbiBleGNlcHRpb24gaWYgdGhleSBoYXZlIHRoZSBvcHRpb25hbCBzZXR0aW5nIGZvciBcIkVtcHR5IENsdWVzXCIgdHVybmVkIG9uXG4gICAgICAgICAgICB8fCBnbG9iYWxzLmVtcHR5Q2x1ZXNcbiAgICAgICAgICAgIC8vIE1ha2UgYW4gZXhjZXB0aW9uIGZvciB0aGUgXCJDb2xvciBCbGluZFwiIHZhcmlhbnRzIChjb2xvciBjbHVlcyB0b3VjaCBubyBjYXJkcylcbiAgICAgICAgICAgIHx8IChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdDb2xvciBCbGluZCcpXG4gICAgICAgICAgICAgICAgJiYgY2x1ZUJ1dHRvbi5jbHVlLnR5cGUgPT09IGNvbnN0YW50cy5DTFVFX1RZUEUuQ09MT1IpXG4gICAgICAgICAgICAvLyBNYWtlIGFuIGV4Y2VwdGlvbiBmb3IgY2VydGFpbiBjaGFyYWN0ZXJzXG4gICAgICAgICAgICB8fCAoZ2xvYmFscy5jaGFyYWN0ZXJBc3NpZ25tZW50c1tnbG9iYWxzLnBsYXllclVzXSA9PT0gJ0JsaW5kIFNwb3QnXG4gICAgICAgICAgICAgICAgJiYgd2hvID09PSAoZ2xvYmFscy5wbGF5ZXJVcyArIDEpICUgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGgpXG4gICAgICAgICAgICB8fCAoZ2xvYmFscy5jaGFyYWN0ZXJBc3NpZ25tZW50c1tnbG9iYWxzLnBsYXllclVzXSA9PT0gJ09ibGl2aW91cydcbiAgICAgICAgICAgICAgICAmJiB3aG8gPT09IChnbG9iYWxzLnBsYXllclVzIC0gMSArIGdsb2JhbHMucGxheWVyTmFtZXMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICUgZ2xvYmFscy5wbGF5ZXJOYW1lcy5sZW5ndGgpO1xuXG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMuZ2l2ZUNsdWVCdXR0b24uc2V0RW5hYmxlZChlbmFibGVkKTtcbiAgICB9O1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlVGFyZ2V0QnV0dG9uR3JvdXAub24oJ2NoYW5nZScsIGNoZWNrQ2x1ZUxlZ2FsKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVCdXR0b25Hcm91cC5vbignY2hhbmdlJywgY2hlY2tDbHVlTGVnYWwpO1xufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLnN0b3BBY3Rpb24gPSBmdW5jdGlvbiBzdG9wQWN0aW9uKCkge1xuICAgIGdsb2JhbHMuZWxlbWVudHMuY2x1ZUFyZWEuaGlkZSgpO1xuICAgIGdsb2JhbHMuZWxlbWVudHMubm9DbHVlQm94LmhpZGUoKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm5vQ2x1ZUxhYmVsLmhpZGUoKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm5vRGlzY2FyZExhYmVsLmhpZGUoKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLm5vRG91YmxlRGlzY2FyZExhYmVsLmhpZGUoKTtcblxuICAgIGdsb2JhbHMubG9iYnkudWkuc2hvd0NsdWVNYXRjaCgtMSk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5jbHVlVGFyZ2V0QnV0dG9uR3JvdXAub2ZmKCdjaGFuZ2UnKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNsdWVCdXR0b25Hcm91cC5vZmYoJ2NoYW5nZScpO1xuXG4gICAgLy8gTWFrZSBhbGwgb2YgdGhlIGNhcmRzIGluIG91ciBoYW5kIG5vdCBkcmFnZ2FibGVcbiAgICAvLyAoYnV0IHdlIG5lZWQgdG8ga2VlcCB0aGVtIGRyYWdnYWJsZSBpZiB0aGUgcHJlLXBsYXkgc2V0dGluZyBpcyBlbmFibGVkKVxuICAgIGlmICghZ2xvYmFscy5sb2JieS5zZXR0aW5ncy5zcGVlZHJ1blByZXBsYXkpIHtcbiAgICAgICAgY29uc3Qgb3VySGFuZCA9IGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbZ2xvYmFscy5wbGF5ZXJVc107XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygb3VySGFuZC5jaGlsZHJlbikge1xuICAgICAgICAgICAgLy8gVGhpcyBpcyBhIExheW91dENoaWxkXG4gICAgICAgICAgICBjaGlsZC5vZmYoJ2RyYWdlbmQucGxheScpO1xuICAgICAgICAgICAgY2hpbGQuc2V0RHJhZ2dhYmxlKGZhbHNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdsb2JhbHMuZWxlbWVudHMuZHJhd0RlY2suY2FyZGJhY2suc2V0RHJhZ2dhYmxlKGZhbHNlKTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLmRlY2tQbGF5QXZhaWxhYmxlTGFiZWwuc2V0VmlzaWJsZShmYWxzZSk7XG59O1xuXG5IYW5hYmlVSS5wcm90b3R5cGUuc2hvd0NsdWVNYXRjaCA9IGZ1bmN0aW9uIHNob3dDbHVlTWF0Y2godGFyZ2V0LCBjbHVlKSB7XG4gICAgLy8gSGlkZSBhbGwgb2YgdGhlIGV4aXN0aW5nIGFycm93cyBvbiB0aGUgY2FyZHNcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdsb2JhbHMuZGVjay5sZW5ndGg7IGkrKykge1xuICAgICAgICBnbG9iYWxzLmRlY2tbaV0uc2V0SW5kaWNhdG9yKGZhbHNlKTtcbiAgICB9XG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5iYXRjaERyYXcoKTtcblxuICAgIC8vIFdlIHN1cHBseSB0aGlzIGZ1bmN0aW9uIHdpdGggYW4gYXJndW1lbnQgb2YgXCItMVwiIGlmIHdlIGp1c3Qgd2FudCB0b1xuICAgIC8vIGNsZWFyIHRoZSBleGlzdGluZyBhcnJvd3MgYW5kIG5vdGhpbmcgZWxzZVxuICAgIGlmICh0YXJnZXQgPCAwKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbdGFyZ2V0XS5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBjaGlsZCA9IGdsb2JhbHMuZWxlbWVudHMucGxheWVySGFuZHNbdGFyZ2V0XS5jaGlsZHJlbltpXTtcbiAgICAgICAgY29uc3QgY2FyZCA9IGNoaWxkLmNoaWxkcmVuWzBdO1xuXG4gICAgICAgIGxldCB0b3VjaGVkID0gZmFsc2U7XG4gICAgICAgIGxldCBjb2xvcjtcbiAgICAgICAgaWYgKGNsdWUudHlwZSA9PT0gY29uc3RhbnRzLkNMVUVfVFlQRS5SQU5LKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgY2x1ZS52YWx1ZSA9PT0gY2FyZC50cnVlUmFua1xuICAgICAgICAgICAgICAgIHx8IChnbG9iYWxzLnZhcmlhbnQubmFtZS5zdGFydHNXaXRoKCdNdWx0aS1GaXZlcycpICYmIGNhcmQudHJ1ZVJhbmsgPT09IDUpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICB0b3VjaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGNvbnN0YW50cy5JTkRJQ0FUT1IuUE9TSVRJVkU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY2x1ZS50eXBlID09PSBjb25zdGFudHMuQ0xVRV9UWVBFLkNPTE9SKSB7XG4gICAgICAgICAgICBjb25zdCBjbHVlQ29sb3IgPSBjbHVlLnZhbHVlO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGNhcmQudHJ1ZVN1aXQgPT09IGNvbnN0YW50cy5TVUlULlJBSU5CT1dcbiAgICAgICAgICAgICAgICB8fCBjYXJkLnRydWVTdWl0ID09PSBjb25zdGFudHMuU1VJVC5SQUlOQk9XMU9FXG4gICAgICAgICAgICAgICAgfHwgY2FyZC50cnVlU3VpdC5jbHVlQ29sb3JzLmluY2x1ZGVzKGNsdWVDb2xvcilcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHRvdWNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbG9yID0gY2x1ZUNvbG9yLmhleENvZGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodG91Y2hlZCkge1xuICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgY2FyZC5zZXRJbmRpY2F0b3IodHJ1ZSwgY29sb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FyZC5zZXRJbmRpY2F0b3IoZmFsc2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5iYXRjaERyYXcoKTtcblxuICAgIHJldHVybiBtYXRjaDtcbn07XG5cbkhhbmFiaVVJLnByb3RvdHlwZS5naXZlQ2x1ZSA9IGZ1bmN0aW9uIGdpdmVDbHVlKCkge1xuICAgIGlmICghZ2xvYmFscy5lbGVtZW50cy5naXZlQ2x1ZUJ1dHRvbi5nZXRFbmFibGVkKCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFByZXZlbnQgdGhlIHVzZXIgZnJvbSBhY2NpZGVudGFsbHkgZ2l2aW5nIGEgY2x1ZSBpbiBjZXJ0YWluIHNpdHVhdGlvbnNcbiAgICBpZiAoRGF0ZS5ub3coKSAtIGdsb2JhbHMuYWNjaWRlbnRhbENsdWVUaW1lciA8IDEwMDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldCA9IGdsb2JhbHMuZWxlbWVudHMuY2x1ZVRhcmdldEJ1dHRvbkdyb3VwLmdldFByZXNzZWQoKTtcbiAgICBpZiAoIXRhcmdldCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNsdWVCdXR0b24gPSBnbG9iYWxzLmVsZW1lbnRzLmNsdWVCdXR0b25Hcm91cC5nZXRQcmVzc2VkKCk7XG4gICAgaWYgKCFjbHVlQnV0dG9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBFcmFzZSB0aGUgYXJyb3dzXG4gICAgZ2xvYmFscy5sb2JieS51aS5zaG93Q2x1ZU1hdGNoKHRhcmdldC50YXJnZXRJbmRleCwge30pO1xuXG4gICAgLy8gU2V0IHRoZSBjbHVlIHRpbWVyIHRvIHByZXZlbnQgbXVsdGlwbGUgY2xpY2tzXG4gICAgZ2xvYmFscy5hY2NpZGVudGFsQ2x1ZVRpbWVyID0gRGF0ZS5ub3coKTtcblxuICAgIC8vIFNlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIHNlcnZlclxuICAgIGdsb2JhbHMubG9iYnkudWkuZW5kVHVybih7XG4gICAgICAgIHR5cGU6ICdhY3Rpb24nLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICB0eXBlOiBjb25zdGFudHMuQUNULkNMVUUsXG4gICAgICAgICAgICB0YXJnZXQ6IHRhcmdldC50YXJnZXRJbmRleCxcbiAgICAgICAgICAgIGNsdWU6IGNvbnZlcnQuY2x1ZVRvTXNnQ2x1ZShjbHVlQnV0dG9uLmNsdWUsIGdsb2JhbHMudmFyaWFudCksXG4gICAgICAgIH0sXG4gICAgfSk7XG59O1xuXG5IYW5hYmlVSS5wcm90b3R5cGUuaGFuZGxlV2Vic29ja2V0ID0gZnVuY3Rpb24gaGFuZGxlV2Vic29ja2V0KGNvbW1hbmQsIGRhdGEpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHdlYnNvY2tldCwgY29tbWFuZCkpIHtcbiAgICAgICAgd2Vic29ja2V0W2NvbW1hbmRdKGRhdGEpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYEEgV2ViU29ja2V0IGZ1bmN0aW9uIGZvciB0aGUgXCIke2NvbW1hbmR9XCIgaXMgbm90IGRlZmluZWQuYCk7XG4gICAgfVxufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLmhhbmRsZU5vdGlmeSA9IGZ1bmN0aW9uIGhhbmRsZU5vdGlmeShkYXRhKSB7XG4gICAgLy8gSWYgYSB1c2VyIGlzIGVkaXRpbmcgYSBub3RlIGFuZCBhbiBhY3Rpb24gaW4gdGhlIGdhbWUgaGFwcGVucyxcbiAgICAvLyBtYXJrIHRvIG1ha2UgdGhlIHRvb2x0aXAgZ28gYXdheSBhcyBzb29uIGFzIHRoZXkgYXJlIGZpbmlzaGVkIGVkaXRpbmcgdGhlIG5vdGVcbiAgICBpZiAobm90ZXMudmFycy5lZGl0aW5nICE9PSBudWxsKSB7XG4gICAgICAgIG5vdGVzLnZhcnMuYWN0aW9uT2NjdXJlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgLy8gQXV0b21hdGljYWxseSBkaXNhYmxlIGFueSB0b29sdGlwcyBvbmNlIGFuIGFjdGlvbiBpbiB0aGUgZ2FtZSBoYXBwZW5zXG4gICAgaWYgKGdsb2JhbHMuYWN0aXZlSG92ZXIpIHtcbiAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3Zlci5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW91dCcpKTtcbiAgICAgICAgZ2xvYmFscy5hY3RpdmVIb3ZlciA9IG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgeyB0eXBlIH0gPSBkYXRhO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobm90aWZ5LCB0eXBlKSkge1xuICAgICAgICBub3RpZnlbdHlwZV0oZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgQSBXZWJTb2NrZXQgbm90aWZ5IGZ1bmN0aW9uIGZvciB0aGUgXCIke3R5cGV9XCIgaXMgbm90IGRlZmluZWQuYCk7XG4gICAgfVxufTtcblxuSGFuYWJpVUkucHJvdG90eXBlLnVwZGF0ZUNoYXRMYWJlbCA9IGZ1bmN0aW9uIHVwZGF0ZUNoYXRMYWJlbCgpIHtcbiAgICBsZXQgdGV4dCA9ICdDaGF0JztcbiAgICBpZiAoZ2xvYmFscy5sb2JieS5jaGF0VW5yZWFkID4gMCkge1xuICAgICAgICB0ZXh0ICs9IGAgKCR7Z2xvYmFscy5sb2JieS5jaGF0VW5yZWFkfSlgO1xuICAgIH1cbiAgICBnbG9iYWxzLmVsZW1lbnRzLmNoYXRCdXR0b24uc2V0VGV4dCh0ZXh0KTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG59O1xuXG5IYW5hYmlVSS5wcm90b3R5cGUudG9nZ2xlQ2hhdCA9IGZ1bmN0aW9uIHRvZ2dsZUNoYXQoKSB7XG4gICAgZ2xvYmFscy5nYW1lLmNoYXQudG9nZ2xlKCk7XG59O1xuXG5IYW5hYmlVSS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uIGRlc3Ryb3koKSB7XG4gICAga2V5Ym9hcmQuZGVzdHJveSgpO1xuICAgIHRpbWVyLnN0b3AoKTtcbiAgICBnbG9iYWxzLnN0YWdlLmRlc3Ryb3koKTtcbiAgICAvLyB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplQ2FudmFzLCBmYWxzZSk7XG59O1xuXG4vLyBFeHBvc2UgdGhlIGdsb2JhbHMgdG8gZnVuY3Rpb25zIGluIHRoZSBcImdhbWVcIiBkaXJlY3RvcnlcbkhhbmFiaVVJLnByb3RvdHlwZS5nbG9iYWxzID0gZ2xvYmFscztcblxubW9kdWxlLmV4cG9ydHMgPSBIYW5hYmlVSTtcbiIsIi8qXG4gICAgV2Ugd2lsbCByZWNlaXZlIFdlYlNvY2tldCBtZXNzYWdlcyAvIGNvbW1hbmRzIGZyb20gdGhlIHNlcnZlciB0aGF0IHRlbGwgdXMgdG8gZG8gdGhpbmdzXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5jb25zdCBjb25zdGFudHMgPSByZXF1aXJlKCcuLi8uLi9jb25zdGFudHMnKTtcbmNvbnN0IG5vdGVzID0gcmVxdWlyZSgnLi9ub3RlcycpO1xuY29uc3Qgbm90aWZ5ID0gcmVxdWlyZSgnLi9ub3RpZnknKTtcbmNvbnN0IHJlcGxheSA9IHJlcXVpcmUoJy4vcmVwbGF5Jyk7XG5jb25zdCB0aW1lciA9IHJlcXVpcmUoJy4vdGltZXInKTtcblxuLy8gRGVmaW5lIGEgY29tbWFuZCBoYW5kbGVyIG1hcFxuY29uc3QgY29tbWFuZHMgPSB7fTtcblxuY29tbWFuZHMuYWN0aW9uID0gKGRhdGEpID0+IHtcbiAgICBnbG9iYWxzLmxhc3RBY3Rpb24gPSBkYXRhO1xuICAgIGdsb2JhbHMubG9iYnkudWkuaGFuZGxlQWN0aW9uLmNhbGwodGhpcywgZGF0YSk7XG5cbiAgICBpZiAoZ2xvYmFscy5hbmltYXRlRmFzdCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGdsb2JhbHMubG9iYnkuc2V0dGluZ3Muc2VuZFR1cm5Ob3RpZnkpIHtcbiAgICAgICAgZ2xvYmFscy5sb2JieS5zZW5kTm90aWZ5KCdJdFxcJ3MgeW91ciB0dXJuJywgJ3R1cm4nKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgcHJlLXBsYXlpbmcgLyBwcmUtZGlzY2FyZGluZyAvIHByZS1jbHVpbmdcbiAgICBpZiAoZ2xvYmFscy5xdWV1ZWRBY3Rpb24gIT09IG51bGwpIHtcbiAgICAgICAgLy8gUHJldmVudCBwcmUtY2x1aW5nIGlmIHRoZSB0ZWFtIGlzIG5vdyBhdCAwIGNsdWVzXG4gICAgICAgIGlmIChnbG9iYWxzLnF1ZXVlZEFjdGlvbi5kYXRhLnR5cGUgPT09IGNvbnN0YW50cy5BQ1QuQ0xVRSAmJiBnbG9iYWxzLmNsdWVzID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcmV2ZW50IGRpc2NhcmRpbmcgaWYgdGhlIHRlYW0gaXMgbm93IGF0IDggY2x1ZXNcbiAgICAgICAgaWYgKGdsb2JhbHMucXVldWVkQWN0aW9uLmRhdGEudHlwZSA9PT0gY29uc3RhbnRzLkFDVC5ESVNDQVJEICYmIGdsb2JhbHMuY2x1ZXMgPT09IDgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc2VuZCB0aGUgcXVldWVkIGFjdGlvbiByaWdodCBhd2F5LCBvciBlbHNlIGl0IGludHJvZHVjZXMgYnVnc1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGdsb2JhbHMubG9iYnkuY29ubi5zZW5kKGdsb2JhbHMucXVldWVkQWN0aW9uLnR5cGUsIGdsb2JhbHMucXVldWVkQWN0aW9uLmRhdGEpO1xuICAgICAgICAgICAgZ2xvYmFscy5sb2JieS51aS5zdG9wQWN0aW9uKCk7XG4gICAgICAgICAgICBnbG9iYWxzLnF1ZXVlZEFjdGlvbiA9IG51bGw7XG4gICAgICAgIH0sIDI1MCk7XG4gICAgfVxufTtcblxuLy8gVGhpcyBpcyBzZW50IHRvIHRoZSBjbGllbnQgdXBvbiBnYW1lIGluaXRpYWxpemF0aW9uIChpbiB0aGUgXCJjb21tYW5kUmVhZHkuZ29cIiBmaWxlKVxuY29tbWFuZHMuYWR2YW5jZWQgPSAoKSA9PiB7XG4gICAgZ2xvYmFscy5hbmltYXRlRmFzdCA9IGZhbHNlO1xuXG4gICAgaWYgKGdsb2JhbHMuaW5SZXBsYXkpIHtcbiAgICAgICAgcmVwbGF5LmdvdG8oMCk7XG4gICAgfVxuXG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5kcmF3KCk7XG4gICAgZ2xvYmFscy5sYXllcnMuVUkuZHJhdygpOyAvLyBXZSBuZWVkIHRvIHJlLWRyYXcgdGhlIFVJIG9yIGVsc2UgdGhlIGFjdGlvbiB0ZXh0IHdpbGwgbm90IGFwcGVhclxufTtcblxuLy8gVGhpcyBpcyBzZW50IGJ5IHRoZSBzZXJ2ZXIgdG8gZm9yY2UgdGhlIGNsaWVudCB0byBnbyBiYWNrIHRvIHRoZSBsb2JieVxuY29tbWFuZHMuYm9vdCA9ICgpID0+IHtcbiAgICB0aW1lci5zdG9wKCk7XG4gICAgZ2xvYmFscy5nYW1lLmhpZGUoKTtcbn07XG5cbi8vIFVwZGF0ZSB0aGUgY2xvY2tzIHRvIHNob3cgaG93IG11Y2ggdGltZSBwZW9wbGUgYXJlIHRha2luZ1xuLy8gb3IgaG93IG11Y2ggdGltZSBwZW9wbGUgaGF2ZSBsZWZ0XG5jb21tYW5kcy5jbG9jayA9IChkYXRhKSA9PiB7XG4gICAgdGltZXIudXBkYXRlKGRhdGEpO1xufTtcblxuY29tbWFuZHMuY29ubmVjdGVkID0gKGRhdGEpID0+IHtcbiAgICBpZiAoIWdsb2JhbHMucmVhZHkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5saXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMubmFtZUZyYW1lc1tpXS5zZXRDb25uZWN0ZWQoZGF0YS5saXN0W2ldKTtcbiAgICB9XG5cbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG59O1xuXG5jb21tYW5kcy5pbml0ID0gKGRhdGEpID0+IHtcbiAgICAvLyBHYW1lIHNldHRpbmdzXG4gICAgZ2xvYmFscy5wbGF5ZXJOYW1lcyA9IGRhdGEubmFtZXM7XG4gICAgZ2xvYmFscy52YXJpYW50ID0gY29uc3RhbnRzLlZBUklBTlRTW2RhdGEudmFyaWFudF07XG4gICAgZ2xvYmFscy5wbGF5ZXJVcyA9IGRhdGEuc2VhdDtcbiAgICBnbG9iYWxzLnNwZWN0YXRpbmcgPSBkYXRhLnNwZWN0YXRpbmc7XG4gICAgZ2xvYmFscy5yZXBsYXkgPSBkYXRhLnJlcGxheTtcbiAgICBnbG9iYWxzLnNoYXJlZFJlcGxheSA9IGRhdGEuc2hhcmVkUmVwbGF5O1xuXG4gICAgLy8gT3B0aW9uYWwgc2V0dGluZ3NcbiAgICBnbG9iYWxzLnRpbWVkID0gZGF0YS50aW1lZDtcbiAgICBnbG9iYWxzLmJhc2VUaW1lID0gZGF0YS5iYXNlVGltZTtcbiAgICBnbG9iYWxzLnRpbWVQZXJUdXJuID0gZGF0YS50aW1lUGVyVHVybjtcbiAgICBnbG9iYWxzLnNwZWVkcnVuID0gZGF0YS5zcGVlZHJ1bjtcbiAgICBnbG9iYWxzLmRlY2tQbGF5cyA9IGRhdGEuZGVja1BsYXlzO1xuICAgIGdsb2JhbHMuZW1wdHlDbHVlcyA9IGRhdGEuZW1wdHlDbHVlcztcbiAgICBnbG9iYWxzLmNoYXJhY3RlckFzc2lnbm1lbnRzID0gZGF0YS5jaGFyYWN0ZXJBc3NpZ25tZW50cztcbiAgICBnbG9iYWxzLmNoYXJhY3Rlck1ldGFkYXRhID0gZGF0YS5jaGFyYWN0ZXJNZXRhZGF0YTtcblxuICAgIGdsb2JhbHMuaW5SZXBsYXkgPSBnbG9iYWxzLnJlcGxheTtcbiAgICBpZiAoZ2xvYmFscy5yZXBsYXkpIHtcbiAgICAgICAgZ2xvYmFscy5yZXBsYXlUdXJuID0gLTE7XG4gICAgfVxuXG4gICAgLy8gQmVnaW4gdG8gbG9hZCBhbGwgb2YgdGhlIGNhcmQgaW1hZ2VzXG4gICAgZ2xvYmFscy5JbWFnZUxvYWRlci5zdGFydCgpO1xufTtcblxuLy8gVXNlZCB3aGVuIHRoZSBnYW1lIHN0YXRlIGNoYW5nZXNcbmNvbW1hbmRzLm5vdGlmeSA9IChkYXRhKSA9PiB7XG4gICAgLy8gV2UgbmVlZCB0byBzYXZlIHRoaXMgZ2FtZSBzdGF0ZSBjaGFuZ2UgZm9yIHRoZSBwdXJwb3NlcyBvZiB0aGUgaW4tZ2FtZSByZXBsYXlcbiAgICBnbG9iYWxzLnJlcGxheUxvZy5wdXNoKGRhdGEpO1xuICAgIGlmIChkYXRhLnR5cGUgPT09ICd0dXJuJykge1xuICAgICAgICBnbG9iYWxzLnJlcGxheU1heCA9IGRhdGEubnVtO1xuICAgIH1cbiAgICBpZiAoZGF0YS50eXBlID09PSAnZ2FtZU92ZXInKSB7XG4gICAgICAgIGdsb2JhbHMucmVwbGF5TWF4ICs9IDE7XG4gICAgfVxuICAgIGlmICghZ2xvYmFscy5yZXBsYXkgJiYgZ2xvYmFscy5yZXBsYXlNYXggPiAwKSB7XG4gICAgICAgIGdsb2JhbHMuZWxlbWVudHMucmVwbGF5QnV0dG9uLnNob3coKTtcbiAgICB9XG4gICAgaWYgKGdsb2JhbHMuaW5SZXBsYXkpIHtcbiAgICAgICAgcmVwbGF5LmFkanVzdFNodXR0bGVzKCk7XG4gICAgICAgIGdsb2JhbHMubGF5ZXJzLlVJLmRyYXcoKTtcbiAgICB9XG5cbiAgICAvLyBOb3cgdGhhdCBpdCBpcyByZWNvcmRlZCwgY2hhbmdlIHRoZSBhY3R1YWwgYWN0aXZlIGdhbWUgc3RhdGVcbiAgICAvLyAodW5sZXNzIHdlIGFyZSBpbiBhbiBpbi1nYW1lIHJlcGxheSlcbiAgICBpZiAoIWdsb2JhbHMuaW5SZXBsYXkgfHwgZGF0YS50eXBlID09PSAncmV2ZWFsJykge1xuICAgICAgICBnbG9iYWxzLmxvYmJ5LnVpLmhhbmRsZU5vdGlmeShkYXRhKTtcbiAgICB9XG59O1xuXG4vKlxuICAgIFJlY2lldmVkIGJ5IHRoZSBjbGllbnQgd2hlbiBzcGVjdGF0aW5nIGEgZ2FtZVxuICAgIEhhcyB0aGUgZm9sbG93aW5nIGRhdGE6XG4gICAge1xuICAgICAgICBvcmRlcjogMTYsXG4gICAgICAgIG5vdGU6ICc8c3Ryb25nPlphbWllbDo8L3N0cm9uZz4gbm90ZTE8YnIgLz48c3Ryb25nPkR1bmVhdWdodDo8L3N0cm9uZz4gbm90ZTI8YnIgLz4nLFxuICAgIH1cbiovXG5jb21tYW5kcy5ub3RlID0gKGRhdGEpID0+IHtcbiAgICAvLyBTZXQgdGhlIG5vdGVcbiAgICAvLyAod2hpY2ggaXMgdGhlIGNvbWJpbmVkIG5vdGVzIGZyb20gYWxsIG9mIHRoZSBwbGF5ZXJzLCBmb3JtYXR0ZWQgYnkgdGhlIHNlcnZlcilcbiAgICBub3Rlcy5zZXQoZGF0YS5vcmRlciwgZGF0YS5ub3RlcywgZmFsc2UpO1xuXG4gICAgLy8gRHJhdyAob3IgaGlkZSkgdGhlIG5vdGUgaW5kaWNhdG9yXG4gICAgY29uc3QgY2FyZCA9IGdsb2JhbHMuZGVja1tkYXRhLm9yZGVyXTtcbiAgICBpZiAoIWNhcmQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNob3cgb3IgaGlkZSB0aGUgbm90ZSBpbmRpY2F0b3JcbiAgICBpZiAoZGF0YS5ub3Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNhcmQubm90ZUdpdmVuLnNob3coKTtcbiAgICAgICAgaWYgKCFjYXJkLm5vdGVHaXZlbi5yb3RhdGVkKSB7XG4gICAgICAgICAgICBjYXJkLm5vdGVHaXZlbi5yb3RhdGUoMTUpO1xuICAgICAgICAgICAgY2FyZC5ub3RlR2l2ZW4ucm90YXRlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBjYXJkLm5vdGVHaXZlbi5oaWRlKCk7XG4gICAgfVxuXG4gICAgZ2xvYmFscy5sYXllcnMuY2FyZC5iYXRjaERyYXcoKTtcbn07XG5cbi8qXG4gICAgUmVjaWV2ZWQgYnkgdGhlIGNsaWVudCB3aGVuOlxuICAgIC0gam9pbmluZyBhIHJlcGxheSAod2lsbCBnZXQgYWxsIG5vdGVzKVxuICAgIC0gam9pbmluZyBhIHNoYXJlZCByZXBsYXkgKHdpbGwgZ2V0IGFsbCBub3RlcylcbiAgICAtIGpvaW5pbmcgYW4gZXhpc3RpbmcgZ2FtZSBhcyBhIHNwZWN0YXRvciAod2lsbCBnZXQgYWxsIG5vdGVzKVxuICAgIC0gcmVjb25uZWN0aW5nIGFuIGV4aXN0aW5nIGdhbWUgYXMgYSBwbGF5ZXIgKHdpbGwgb25seSBnZXQgeW91ciBvd24gbm90ZXMpXG5cbiAgICBIYXMgdGhlIGZvbGxvd2luZyBkYXRhOlxuICAgIHtcbiAgICAgICAgbm90ZXM6IFtcbiAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgIHphbWllbDogJ2cxXFxuc2Fua2FsYTogZzEvZzInLFxuICAgICAgICBdLFxuICAgIH1cbiovXG5jb21tYW5kcy5ub3RlcyA9IChkYXRhKSA9PiB7XG4gICAgZm9yIChsZXQgb3JkZXIgPSAwOyBvcmRlciA8IGRhdGEubm90ZXMubGVuZ3RoOyBvcmRlcisrKSB7XG4gICAgICAgIGNvbnN0IG5vdGUgPSBkYXRhLm5vdGVzW29yZGVyXTtcblxuICAgICAgICAvLyBTZXQgdGhlIG5vdGVcbiAgICAgICAgbm90ZXMuc2V0KG9yZGVyLCBub3RlLCBmYWxzZSk7XG5cbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBjb2RlIGlzIG1vc2x5IGNvcGllZCBmcm9tIHRoZSBcImNvbW1hbmQubm90ZSgpXCIgZnVuY3Rpb25cbiAgICAgICAgLy8gRHJhdyAob3IgaGlkZSkgdGhlIG5vdGUgaW5kaWNhdG9yXG4gICAgICAgIGNvbnN0IGNhcmQgPSBnbG9iYWxzLmRlY2tbb3JkZXJdO1xuICAgICAgICBpZiAoIWNhcmQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub3RlICE9PSBudWxsICYmIG5vdGUgIT09ICcnKSB7XG4gICAgICAgICAgICBjYXJkLm5vdGUgPSBub3RlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub3RlICE9PSBudWxsICYmIG5vdGUgIT09ICcnKSB7XG4gICAgICAgICAgICBjYXJkLm5vdGVHaXZlbi5zaG93KCk7XG4gICAgICAgICAgICBpZiAoZ2xvYmFscy5zcGVjdGF0aW5nICYmICFjYXJkLm5vdGVHaXZlbi5yb3RhdGVkKSB7XG4gICAgICAgICAgICAgICAgY2FyZC5ub3RlR2l2ZW4ucm90YXRlKDE1KTtcbiAgICAgICAgICAgICAgICBjYXJkLm5vdGVHaXZlbi5yb3RhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdsb2JhbHMubGF5ZXJzLmNhcmQuYmF0Y2hEcmF3KCk7XG59O1xuXG5jb21tYW5kcy5ub3RpZnlMaXN0ID0gKGRhdGFMaXN0KSA9PiB7XG4gICAgZm9yIChjb25zdCBkYXRhIG9mIGRhdGFMaXN0KSB7XG4gICAgICAgIGNvbW1hbmRzLm5vdGlmeShkYXRhKTtcbiAgICB9XG59O1xuXG4vLyBUaGlzIGlzIHVzZWQgaW4gc2hhcmVkIHJlcGxheXMgdG8gaGlnaGxpZ2h0IGEgc3BlY2lmaWMgY2FyZFxuY29tbWFuZHMucmVwbGF5SW5kaWNhdG9yID0gKGRhdGEpID0+IHtcbiAgICBpZiAoZ2xvYmFscy5zaGFyZWRSZXBsYXlMZWFkZXIgPT09IGdsb2JhbHMubG9iYnkudXNlcm5hbWUpIHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgaGF2ZSB0byBkcmF3IGFueSBpbmRpY2F0b3IgYXJyb3dzO1xuICAgICAgICAvLyB3ZSBhbHJlYWR5IGRpZCBpdCBtYW51YWxseSBpbW1lZGlhdGVseSBhZnRlciBzZW5kaW5nIHRoZSBcInJlcGxheUFjdGlvblwiIG1lc3NhZ2VcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBjYXJkIGV4aXN0cyBhcyBhIHNhbml0eS1jaGVja1xuICAgIGNvbnN0IGNhcmQgPSBnbG9iYWxzLmRlY2tbZGF0YS5vcmRlcl07XG4gICAgaWYgKCFjYXJkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYXJkLnRvZ2dsZVNoYXJlZFJlcGxheUluZGljYXRvcigpO1xufTtcblxuLy8gVGhpcyBpcyB1c2VkIGluIHNoYXJlZCByZXBsYXlzIHRvIHNwZWNpZnkgd2hvIHRoZSBsZWFkZXIgaXNcbmNvbW1hbmRzLnJlcGxheUxlYWRlciA9IChkYXRhKSA9PiB7XG4gICAgLy8gV2UgbWlnaHQgYmUgZW50ZXJpbmcgdGhpcyBmdW5jdGlvbiBhZnRlciBhIGdhbWUganVzdCBlbmRlZFxuICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5ID0gdHJ1ZTtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnJlcGxheUV4aXRCdXR0b24uaGlkZSgpO1xuXG4gICAgLy8gVXBkYXRlIHRoZSBzdG9yZWQgcmVwbGF5IGxlYWRlclxuICAgIGdsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyID0gZGF0YS5uYW1lO1xuXG4gICAgLy8gVXBkYXRlIHRoZSBVSVxuICAgIGdsb2JhbHMuZWxlbWVudHMuc2hhcmVkUmVwbGF5TGVhZGVyTGFiZWwuc2hvdygpO1xuICAgIGxldCBjb250ZW50ID0gYDxzdHJvbmc+TGVhZGVyOjwvc3Ryb25nPiAke2dsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyfWA7XG4gICAgaWYgKCFnbG9iYWxzLnNwZWN0YXRvcnMuaW5jbHVkZXMoZ2xvYmFscy5zaGFyZWRSZXBsYXlMZWFkZXIpKSB7XG4gICAgICAgIC8vIENoZWNrIHRvIHNlZSBpZiB0aGUgbGVhZGVyIGlzIGF3YXlcbiAgICAgICAgY29udGVudCArPSAnIChhd2F5KSc7XG4gICAgfVxuICAgICQoJyN0b29sdGlwLWxlYWRlcicpLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpLmNvbnRlbnQoY29udGVudCk7XG5cbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNoYXJlZFJlcGxheUxlYWRlckxhYmVsUHVsc2UucGxheSgpO1xuXG4gICAgZ2xvYmFscy5lbGVtZW50cy50b2dnbGVTaGFyZWRUdXJuQnV0dG9uLnNob3coKTtcbiAgICBnbG9iYWxzLmxheWVycy5VSS5kcmF3KCk7XG59O1xuXG4vLyBUaGlzIGlzIHVzZWQgaW4gc2hhcmVkIHJlcGxheXMgdG8gbWFrZSBoeXBvdGhldGljYWwgZ2FtZSBzdGF0ZXNcbmNvbW1hbmRzLnJlcGxheU1vcnBoID0gKGRhdGEpID0+IHtcbiAgICBub3RpZnkucmV2ZWFsKHtcbiAgICAgICAgd2hpY2g6IHtcbiAgICAgICAgICAgIG9yZGVyOiBkYXRhLm9yZGVyLFxuICAgICAgICAgICAgcmFuazogZGF0YS5yYW5rLFxuICAgICAgICAgICAgc3VpdDogZGF0YS5zdWl0LFxuICAgICAgICB9LFxuICAgIH0pO1xufTtcblxuLy8gVGhpcyBpcyB1c2VkIGluIHNoYXJlZCByZXBsYXlzIHRvIG1ha2UgZnVuIHNvdW5kc1xuY29tbWFuZHMucmVwbGF5U291bmQgPSAoZGF0YSkgPT4ge1xuICAgIGlmIChnbG9iYWxzLnNoYXJlZFJlcGxheUxlYWRlciA9PT0gZ2xvYmFscy5sb2JieS51c2VybmFtZSkge1xuICAgICAgICAvLyBXZSBkb24ndCBoYXZlIHRvIHBsYXkgYW55dGhpbmc7XG4gICAgICAgIC8vIHdlIGFscmVhZHkgZGlkIGl0IG1hbnVhbGx5IGFmdGVyIHNlbmRpbmcgdGhlIFwicmVwbGF5QWN0aW9uXCIgbWVzc2FnZVxuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZ2xvYmFscy5nYW1lLnNvdW5kcy5wbGF5KGRhdGEuc291bmQpO1xufTtcblxuLy8gVGhpcyBpcyB1c2VkIGluIHNoYXJlZCByZXBsYXlzIHRvIGNoYW5nZSB0aGUgdHVyblxuY29tbWFuZHMucmVwbGF5VHVybiA9IChkYXRhKSA9PiB7XG4gICAgZ2xvYmFscy5zaGFyZWRSZXBsYXlUdXJuID0gZGF0YS50dXJuO1xuICAgIHJlcGxheS5hZGp1c3RTaHV0dGxlcygpO1xuICAgIGlmIChnbG9iYWxzLnVzZVNoYXJlZFR1cm5zKSB7XG4gICAgICAgIHJlcGxheS5nb3RvKGdsb2JhbHMuc2hhcmVkUmVwbGF5VHVybik7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5yZXBsYXlTaHV0dGxlU2hhcmVkLmdldExheWVyKCkuYmF0Y2hEcmF3KCk7XG4gICAgfVxufTtcblxuLy8gVGhpcyBpcyB1c2VkIHRvIHVwZGF0ZSB0aGUgbmFtZXMgb2YgdGhlIHBlb3BsZSBjdXJyZW50bHkgc3BlY3RhdGluZyB0aGUgZ2FtZVxuY29tbWFuZHMuc3BlY3RhdG9ycyA9IChkYXRhKSA9PiB7XG4gICAgaWYgKCFnbG9iYWxzLmVsZW1lbnRzLnNwZWN0YXRvcnNMYWJlbCkge1xuICAgICAgICAvLyBTb21ldGltZXMgd2UgY2FuIGdldCBoZXJlIHdpdGhvdXQgdGhlIHNwZWN0YXRvcnMgbGFiZWwgYmVpbmcgaW5pdGlhdGVkIHlldFxuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtZW1iZXIgdGhlIGN1cnJlbnQgbGlzdCBvZiBzcGVjdGF0b3JzXG4gICAgZ2xvYmFscy5zcGVjdGF0b3JzID0gZGF0YS5uYW1lcztcblxuICAgIGNvbnN0IHNob3VsZFNob3dMYWJlbCA9IGRhdGEubmFtZXMubGVuZ3RoID4gMDtcbiAgICBnbG9iYWxzLmVsZW1lbnRzLnNwZWN0YXRvcnNMYWJlbC5zZXRWaXNpYmxlKHNob3VsZFNob3dMYWJlbCk7XG4gICAgZ2xvYmFscy5lbGVtZW50cy5zcGVjdGF0b3JzTnVtTGFiZWwuc2V0VmlzaWJsZShzaG91bGRTaG93TGFiZWwpO1xuICAgIGlmIChzaG91bGRTaG93TGFiZWwpIHtcbiAgICAgICAgZ2xvYmFscy5lbGVtZW50cy5zcGVjdGF0b3JzTnVtTGFiZWwuc2V0VGV4dChkYXRhLm5hbWVzLmxlbmd0aCk7XG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIHN0cmluZyB0aGF0IHNob3dzIGFsbCB0aGUgbmFtZXNcbiAgICAgICAgY29uc3QgbmFtZUVudHJpZXMgPSBkYXRhLm5hbWVzLm1hcChuYW1lID0+IGA8bGk+JHtuYW1lfTwvbGk+YCkuam9pbignJyk7XG4gICAgICAgIGxldCBjb250ZW50ID0gJzxzdHJvbmc+JztcbiAgICAgICAgaWYgKGdsb2JhbHMucmVwbGF5KSB7XG4gICAgICAgICAgICBjb250ZW50ICs9ICdTaGFyZWQgUmVwbGF5IFZpZXdlcnMnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29udGVudCArPSAnU3BlY3RhdG9ycyc7XG4gICAgICAgIH1cbiAgICAgICAgY29udGVudCArPSBgOjwvc3Ryb25nPjxvbCBjbGFzcz1cImdhbWUtdG9vbHRpcHMtb2xcIj4ke25hbWVFbnRyaWVzfTwvb2w+YDtcbiAgICAgICAgJCgnI3Rvb2x0aXAtc3BlY3RhdG9ycycpLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpLmNvbnRlbnQoY29udGVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgJCgnI3Rvb2x0aXAtc3BlY3RhdG9ycycpLnRvb2x0aXBzdGVyKCdjbG9zZScpO1xuICAgIH1cblxuICAgIC8vIFdlIG1pZ2h0IGFsc28gbmVlZCB0byB1cGRhdGUgdGhlIGNvbnRlbnQgb2YgcmVwbGF5IGxlYWRlciBpY29uXG4gICAgaWYgKGdsb2JhbHMuc2hhcmVkUmVwbGF5KSB7XG4gICAgICAgIGxldCBjb250ZW50ID0gYDxzdHJvbmc+TGVhZGVyOjwvc3Ryb25nPiAke2dsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyfWA7XG4gICAgICAgIGlmICghZ2xvYmFscy5zcGVjdGF0b3JzLmluY2x1ZGVzKGdsb2JhbHMuc2hhcmVkUmVwbGF5TGVhZGVyKSkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgdG8gc2VlIGlmIHRoZSBsZWFkZXIgaXMgYXdheVxuICAgICAgICAgICAgY29udGVudCArPSAnIChhd2F5KSc7XG4gICAgICAgIH1cbiAgICAgICAgJCgnI3Rvb2x0aXAtbGVhZGVyJykudG9vbHRpcHN0ZXIoJ2luc3RhbmNlJykuY29udGVudChjb250ZW50KTtcbiAgICB9XG5cbiAgICBnbG9iYWxzLmxheWVycy5VSS5iYXRjaERyYXcoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY29tbWFuZHM7XG4iLCIvKlxuICAgIFdlYlNvY2tldCBjb21tYW5kIGhhbmRsZXJzIGZvciBpbi1nYW1lIGV2ZW50c1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcblxuY29uc3QgZ2FtZUNvbW1hbmRzID0gW1xuICAgICdhY3Rpb24nLFxuICAgICdhZHZhbmNlZCcsXG4gICAgJ2Jvb3QnLFxuICAgICdjbG9jaycsXG4gICAgJ2Nvbm5lY3RlZCcsXG4gICAgJ2luaXQnLFxuICAgICdub3RlJyxcbiAgICAnbm90ZXMnLFxuICAgICdub3RpZnlMaXN0JyxcbiAgICAnbm90aWZ5JyxcbiAgICAncmVwbGF5SW5kaWNhdG9yJyxcbiAgICAncmVwbGF5TGVhZGVyJyxcbiAgICAncmVwbGF5TW9ycGgnLFxuICAgICdyZXBsYXlTb3VuZCcsXG4gICAgJ3JlcGxheVR1cm4nLFxuICAgICdzcGVjdGF0b3JzJyxcbl07XG5cbmV4cG9ydHMuaW5pdCA9ICgpID0+IHtcbiAgICBmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2FtZUNvbW1hbmRzKSB7XG4gICAgICAgIGdsb2JhbHMuY29ubi5vbihjb21tYW5kLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKGdsb2JhbHMuY3VycmVudFNjcmVlbiA9PT0gJ2dhbWUnICYmIGdsb2JhbHMudWkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxzLnVpLmhhbmRsZVdlYnNvY2tldChjb21tYW5kLCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufTtcbiIsIi8vIENvbmZpZ3VyYXRpb25cbmNvbnN0IGRlYnVnID0gdHJ1ZTtcbmNvbnN0IGZhZGVUaW1lID0gMzUwO1xuXG4vLyBFeHBvcnRlZCBnbG9iYWwgdmFyaWFibGVzXG5jb25zdCBnbG9iYWxzID0ge1xuICAgIGRlYnVnLFxuICAgIGZhZGVUaW1lLFxuICAgIGJyb3dzZXJJc0ZpcmVmb3g6IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5pbmRleE9mKCdmaXJlZm94JykgPiAtMSxcblxuICAgIHVzZXJuYW1lOiBudWxsLFxuICAgIHBhc3N3b3JkOiBudWxsLFxuXG4gICAgY29ubjogbnVsbCwgLy8gVGhlIHdlYnNvY2tldCBjb25uZWN0aW9uIChzZXQgaW4gXCJ3ZWJzb2NrZXQuanNcIilcblxuICAgIHVzZXJMaXN0OiB7fSwgLy8gU2V0IHVwb24gbG9naW5cbiAgICB0YWJsZUxpc3Q6IHt9LCAvLyBTZXQgdXBvbiBsb2dpblxuICAgIGhpc3RvcnlMaXN0OiB7fSwgLy8gU2V0IHVwb24gbG9naW5cbiAgICBoaXN0b3J5RGV0YWlsTGlzdDogW10sIC8vIFNldCB1cG9uIGNsaWNraW5nIHRoZSBcIkhpc3RvcnkgRGV0YWlsc1wiIGJ1dHRvblxuICAgIGhpc3RvcnlDbGlja2VkOiBmYWxzZSxcbiAgICAvLyBVc2VkIHRvIGtlZXAgdHJhY2sgb2Ygd2hldGhlciB0aGUgdXNlciBjbGlja2VkIG9uIHRoZSBcIlNob3cgTW9yZSBIaXN0b3J5XCIgYnV0dG9uXG4gICAgdG90YWxHYW1lczogMCwgLy8gU2V0IHVwb24gbG9naW5cbiAgICByYW5kb21OYW1lOiAnJywgLy8gU2V0IHVwb24gbG9naW5cblxuICAgIC8vIFRoZSBsb2JieSBzZXR0aW5ncyBmb3VuZCBpbiB0aGUgZ2VhciBzdWItbWVudVxuICAgIHNldHRpbmdzOiB7XG4gICAgICAgIHNlbmRUdXJuTm90aWZ5OiBmYWxzZSxcbiAgICAgICAgc2VuZFR1cm5Tb3VuZDogdHJ1ZSwgLy8gV2Ugd2FudCBzb3VuZHMgYnkgZGVmYXVsdFxuICAgICAgICBzZW5kVGltZXJTb3VuZDogdHJ1ZSwgLy8gV2Ugd2FudCBzb3VuZHMgYnkgZGVmYXVsdFxuICAgICAgICBzZW5kQ2hhdE5vdGlmeTogZmFsc2UsXG4gICAgICAgIHNlbmRDaGF0U291bmQ6IGZhbHNlLFxuICAgICAgICBzaG93QkdBVUk6IGZhbHNlLFxuICAgICAgICBzaG93Q29sb3JibGluZFVJOiBmYWxzZSxcbiAgICAgICAgc2hvd1RpbWVySW5VbnRpbWVkOiBmYWxzZSxcbiAgICAgICAgcmV2ZXJzZUhhbmRzOiBmYWxzZSxcbiAgICAgICAgc3BlZWRydW5QcmVwbGF5OiBmYWxzZSxcbiAgICB9LFxuXG4gICAgZ2FtZUlEOiBudWxsLFxuICAgIGdhbWU6IHt9LCAvLyBFcXVhbCB0byB0aGUgZGF0YSBmb3IgdGhlIFwiZ2FtZVwiIGNvbW1hbmRcbiAgICBpbml0OiB7fSwgLy8gRXF1YWwgdG8gdGhlIGRhdGEgZm9yIHRoZSBcImluaXRcIiBjb21tYW5kXG4gICAgc3RhdGU6IHsgLy8gVmFyaWFibGVzIHRoYXQgcmVwcmVzZW50IHRoZSBjdXJyZW50IGdhbWUgc3RhdGVcbiAgICAgICAgYWN0aXZlSW5kZXg6IDAsXG4gICAgICAgIGRlY2s6IFtdLFxuICAgIH0sXG5cbiAgICBjdXJyZW50U2NyZWVuOiAnbG9naW4nLFxuICAgIGVycm9yT2NjdXJlZDogZmFsc2UsXG5cbiAgICAvKlxuICAgIGFwcDogbnVsbCwgLy8gVGhpcyBpcyB0aGUgY2FudmFzIGNvbnRhaW5lciBpbml0aWFsaXplZCBpbiBcImdhbWUvaW5pdC5qc1wiXG4gICAgcmVzb3VyY2VzOiBudWxsLCAvLyBUaGlzIGNvbnRhaW5zIHRoZSBsb2FkZWQgZ3JhcGhpY3MsIGluaXRpYWxpemVkIGluIFwiZ2FtZS9pbml0LmpzXCJcbiAgICB1aTogbnVsbCwgLy8gVGhpcyBjb250YWlucyBVSSB2YXJpYWJsZXMgYW5kIG9iamVjdHMsIGluaXRpYWxpemVkIGluIFwiZ2FtZS9pbml0LmpzXCJcbiAgICAqL1xuICAgIHVpOiBudWxsLCAvLyBUaGlzIGNvbnRhaW5zIHRoZSBIYW5hYmlVSSBvYmplY3QgKGxlZ2FjeSlcblxuICAgIGNoYXRVbnJlYWQ6IDAsIC8vIFVzZWQgdG8ga2VlcCB0cmFjayBvZiBob3cgbWFueSBpbi1nYW1lIGNoYXQgbWVzc2FnZXMgYXJlIGN1cnJlbnRseSB1bnJlYWRcbn07XG5tb2R1bGUuZXhwb3J0cyA9IGdsb2JhbHM7XG5cbi8vIEFsc28gbWFrZSBpdCBhdmFpbGFibGUgdG8gdGhlIHdpbmRvdyBzbyB0aGF0IHdlIGNhbiBhY2Nlc3MgZ2xvYmFsIHZhcmlhYmxlc1xuLy8gZnJvbSB0aGUgSmF2YVNjcmlwdCBjb25zb2xlIChmb3IgZGVidWdnaW5nIHB1cnBvc2VzKVxud2luZG93Lmdsb2JhbHMgPSBnbG9iYWxzO1xuIiwiLypcbiAgICBUaGUgXCJDcmVhdGUgR2FtZVwiIG5hdiBidXR0b25cbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuLi9nbG9iYWxzJyk7XG5jb25zdCBjb25zdGFudHMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMnKTtcbmNvbnN0IG1pc2MgPSByZXF1aXJlKCcuLi9taXNjJyk7XG5cbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcbiAgICAvLyBQb3B1bGF0ZSB0aGUgdmFyaWFudCBkcm9wZG93biBpbiB0aGUgXCJDcmVhdGUgR2FtZVwiIHRvb2x0aXBcbiAgICBmb3IgKGNvbnN0IHZhcmlhbnQgb2YgT2JqZWN0LmtleXMoY29uc3RhbnRzLlZBUklBTlRTKSkge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBuZXcgT3B0aW9uKHZhcmlhbnQsIHZhcmlhbnQpO1xuICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdmFyaWFudCcpLmFwcGVuZCgkKG9wdGlvbikpO1xuICAgIH1cblxuICAgIC8vIE1ha2UgdGhlIGV4dHJhIHRpbWUgZmllbGRzIGFwcGVhciBhbmQgZGlzYXBwZWFyIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBjaGVja2JveCBpcyBjaGVja2VkXG4gICAgJCgnI2NyZWF0ZS1nYW1lLXRpbWVkJykuY2hhbmdlKCgpID0+IHtcbiAgICAgICAgaWYgKCQoJyNjcmVhdGUtZ2FtZS10aW1lZCcpLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgJCgnI2NyZWF0ZS1nYW1lLXRpbWVkLWxhYmVsJykucmVtb3ZlQ2xhc3MoJ2NvbC0zJyk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtbGFiZWwnKS5hZGRDbGFzcygnY29sLTInKTtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1vcHRpb24tMScpLnNob3coKTtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1vcHRpb24tMicpLnNob3coKTtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1vcHRpb24tMycpLnNob3coKTtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1vcHRpb24tNCcpLnNob3coKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1sYWJlbCcpLmFkZENsYXNzKCdjb2wtMycpO1xuICAgICAgICAgICAgJCgnI2NyZWF0ZS1nYW1lLXRpbWVkLWxhYmVsJykucmVtb3ZlQ2xhc3MoJ2NvbC0yJyk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtb3B0aW9uLTEnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtb3B0aW9uLTInKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtb3B0aW9uLTMnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtb3B0aW9uLTQnKS5oaWRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZWRyYXcgdGhlIHRvb2x0aXAgc28gdGhhdCB0aGUgbmV3IGVsZW1lbnRzIHdpbGwgZml0IGJldHRlclxuICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtZ2FtZXMtY3JlYXRlLWdhbWUnKS50b29sdGlwc3RlcigncmVwb3NpdGlvbicpO1xuICAgIH0pO1xuICAgICQoJyNjcmVhdGUtZ2FtZS1zcGVlZHJ1bicpLmNoYW5nZSgoKSA9PiB7XG4gICAgICAgIGlmICgkKCcjY3JlYXRlLWdhbWUtc3BlZWRydW4nKS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICQoJyNjcmVhdGUtZ2FtZS10aW1lZC1yb3cnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtcm93LXNwYWNpbmcnKS5oaWRlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQtcm93Jykuc2hvdygpO1xuICAgICAgICAgICAgJCgnI2NyZWF0ZS1nYW1lLXRpbWVkLXJvdy1zcGFjaW5nJykuc2hvdygpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAkKCcjY3JlYXRlLWdhbWUtdG9vbHRpcCcpLm9uKCdrZXlwcmVzcycsIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnI2NyZWF0ZS1nYW1lLXN1Ym1pdCcpLmNsaWNrKCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgICQoJyNjcmVhdGUtZ2FtZS1zdWJtaXQnKS5vbignY2xpY2snLCBzdWJtaXQpO1xufSk7XG5cbmNvbnN0IHN1Ym1pdCA9IChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICBjb25zdCBuYW1lID0gJCgnI2NyZWF0ZS1nYW1lLW5hbWUnKS52YWwoKTtcblxuICAgIGNvbnN0IHZhcmlhbnQgPSAkKCcjY3JlYXRlLWdhbWUtdmFyaWFudCcpLnZhbCgpO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjcmVhdGVUYWJsZVZhcmlhbnQnLCB2YXJpYW50KTtcblxuICAgIGNvbnN0IHRpbWVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NyZWF0ZS1nYW1lLXRpbWVkJykuY2hlY2tlZDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3JlYXRlVGFibGVUaW1lZCcsIHRpbWVkKTtcblxuICAgIGNvbnN0IGJhc2VUaW1lTWludXRlcyA9ICQoJyNiYXNlLXRpbWUtbWludXRlcycpLnZhbCgpO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjcmVhdGVUYWJsZUJhc2VUaW1lTWludXRlcycsIGJhc2VUaW1lTWludXRlcyk7XG5cbiAgICBjb25zdCB0aW1lUGVyVHVyblNlY29uZHMgPSAkKCcjdGltZS1wZXItdHVybi1zZWNvbmRzJykudmFsKCk7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NyZWF0ZVRhYmxlVGltZVBlclR1cm5TZWNvbmRzJywgdGltZVBlclR1cm5TZWNvbmRzKTtcblxuICAgIGNvbnN0IHNwZWVkcnVuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NyZWF0ZS1nYW1lLXNwZWVkcnVuJykuY2hlY2tlZDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3JlYXRlVGFibGVTcGVlZHJ1bicsIHNwZWVkcnVuKTtcblxuICAgIGNvbnN0IGRlY2tQbGF5cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtZ2FtZS1kZWNrLXBsYXlzJykuY2hlY2tlZDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3JlYXRlVGFibGVEZWNrUGxheXMnLCBkZWNrUGxheXMpO1xuXG4gICAgY29uc3QgZW1wdHlDbHVlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtZ2FtZS1lbXB0eS1jbHVlcycpLmNoZWNrZWQ7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NyZWF0ZVRhYmxlRW1wdHlDbHVlcycsIGVtcHR5Q2x1ZXMpO1xuXG4gICAgY29uc3QgY2hhcmFjdGVyQXNzaWdubWVudHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3JlYXRlLWdhbWUtY2hhcmFjdGVyLWFzc2lnbm1lbnRzJykuY2hlY2tlZDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3JlYXRlVGFibGVDaGFyYWN0ZXJBc3NpZ25tZW50cycsIGNoYXJhY3RlckFzc2lnbm1lbnRzKTtcblxuICAgIGxldCBwYXNzd29yZCA9ICQoJyNjcmVhdGUtZ2FtZS1wYXNzd29yZCcpLnZhbCgpO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjcmVhdGVUYWJsZVBhc3N3b3JkJywgcGFzc3dvcmQpO1xuICAgIGlmIChwYXNzd29yZCAhPT0gJycpIHtcbiAgICAgICAgcGFzc3dvcmQgPSBoZXhfc2hhMjU2KGBIYW5hYmkgZ2FtZSBwYXNzd29yZCAke3Bhc3N3b3JkfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGFsZXJ0V2FpdGVycyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcmVhdGUtZ2FtZS1hbGVydC13YWl0ZXJzJykuY2hlY2tlZDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3JlYXRlVGFibGVBbGVydFdhaXRlcnMnLCBhbGVydFdhaXRlcnMpO1xuXG4gICAgZ2xvYmFscy5jb25uLnNlbmQoJ2dhbWVDcmVhdGUnLCB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIHZhcmlhbnQsXG4gICAgICAgIHRpbWVkLFxuICAgICAgICBiYXNlVGltZTogTWF0aC5yb3VuZChiYXNlVGltZU1pbnV0ZXMgKiA2MCksIC8vIFRoZSBzZXJ2ZXIgZXhwZWN0cyB0aGlzIGluIHNlY29uZHNcbiAgICAgICAgdGltZVBlclR1cm46IHBhcnNlSW50KHRpbWVQZXJUdXJuU2Vjb25kcywgMTApLCAvLyBUaGUgc2VydmVyIGV4cGVjdHMgdGhpcyBpbiBzZWNvbmRzXG4gICAgICAgIHNwZWVkcnVuLFxuICAgICAgICBkZWNrUGxheXMsXG4gICAgICAgIGVtcHR5Q2x1ZXMsXG4gICAgICAgIGNoYXJhY3RlckFzc2lnbm1lbnRzLFxuICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgYWxlcnRXYWl0ZXJzLFxuICAgIH0pO1xuXG4gICAgbWlzYy5jbG9zZUFsbFRvb2x0aXBzKCk7XG59O1xuXG4vLyBUaGlzIGZ1bmN0aW9uIGlzIGV4ZWN1dGVkIGV2ZXJ5IHRpbWUgdGhlIFwiQ3JlYXRlIEdhbWVcIiBidXR0b24gaXMgY2xpY2tlZFxuLy8gKGFmdGVyIHRoZSB0b29sdGlwIGlzIGFkZGVkIHRvIHRoZSBET00pXG5leHBvcnRzLnJlYWR5ID0gKCkgPT4ge1xuICAgIC8vIEZpbGwgaW4gdGhlIFwiTmFtZVwiIGJveFxuICAgICQoJyNjcmVhdGUtZ2FtZS1uYW1lJykudmFsKGdsb2JhbHMucmFuZG9tTmFtZSk7XG5cbiAgICAvLyBHZXQgYSBuZXcgcmFuZG9tIG5hbWUgZnJvbSB0aGUgc2VydmVyIGZvciB0aGUgbmV4dCB0aW1lIHdlIGNsaWNrIHRoZSBidXR0b25cbiAgICBnbG9iYWxzLmNvbm4uc2VuZCgnZ2V0TmFtZScpO1xuXG4gICAgaWYgKGdsb2JhbHMudXNlcm5hbWUuc3RhcnRzV2l0aCgndGVzdCcpKSB7XG4gICAgICAgICQoJyNjcmVhdGUtZ2FtZS1uYW1lJykudmFsKCd0ZXN0IGdhbWUnKTtcbiAgICB9XG5cbiAgICAvLyBGaWxsIGluIHRoZSBcIlZhcmlhbnRcIiBkcm9wZG93blxuICAgIGxldCB2YXJpYW50ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NyZWF0ZVRhYmxlVmFyaWFudCcpO1xuICAgIGlmICh0eXBlb2YgdmFyaWFudCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdmFyaWFudCA9ICdObyBWYXJpYW50JztcbiAgICB9XG4gICAgJCgnI2NyZWF0ZS1nYW1lLXZhcmlhbnQnKS52YWwodmFyaWFudCk7XG5cbiAgICAvLyBGaWxsIGluIHRoZSBcIlRpbWVkXCIgY2hlY2tib3hcbiAgICBsZXQgdGltZWQ7XG4gICAgdHJ5IHtcbiAgICAgICAgdGltZWQgPSBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjcmVhdGVUYWJsZVRpbWVkJykpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aW1lZCA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRpbWVkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGltZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgJCgnI2NyZWF0ZS1nYW1lLXRpbWVkJykucHJvcCgnY2hlY2tlZCcsIHRpbWVkKTtcbiAgICAkKCcjY3JlYXRlLWdhbWUtdGltZWQnKS5jaGFuZ2UoKTtcblxuICAgIC8vIEZpbGwgaW4gdGhlIFwiQmFzZSBUaW1lXCIgYm94XG4gICAgbGV0IGJhc2VUaW1lTWludXRlcyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdiYXNlVGltZU1pbnV0ZXMnKTtcbiAgICAvLyAod2UgZG9uJ3Qgd2FudCB0byBkbyBcIkpTT04ucGFyc2UoKVwiIGhlcmUgYmVjYXVzZSBpdCBtYXkgbm90IGJlIGEgd2hvbGUgbnVtYmVyKVxuICAgIGlmIChiYXNlVGltZU1pbnV0ZXMgPT09IG51bGwgfHwgYmFzZVRpbWVNaW51dGVzIDwgMCkge1xuICAgICAgICBiYXNlVGltZU1pbnV0ZXMgPSAyO1xuICAgIH1cbiAgICAkKCcjYmFzZS10aW1lLW1pbnV0ZXMnKS52YWwoYmFzZVRpbWVNaW51dGVzKTtcblxuICAgIC8vIEZpbGwgaW4gdGhlIFwiVGltZSBQZXIgVHVyblwiIGJveFxuICAgIGxldCB0aW1lUGVyVHVyblNlY29uZHM7XG4gICAgdHJ5IHtcbiAgICAgICAgdGltZVBlclR1cm5TZWNvbmRzID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGltZVBlclR1cm5TZWNvbmRzJykpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aW1lUGVyVHVyblNlY29uZHMgPSAyMDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aW1lUGVyVHVyblNlY29uZHMgIT09ICdudW1iZXInIHx8IHRpbWVQZXJUdXJuU2Vjb25kcyA8IDApIHtcbiAgICAgICAgdGltZVBlclR1cm5TZWNvbmRzID0gMjA7XG4gICAgfVxuICAgICQoJyN0aW1lLXBlci10dXJuLXNlY29uZHMnKS52YWwodGltZVBlclR1cm5TZWNvbmRzKTtcblxuICAgIC8vIEZpbGwgaW4gdGhlIFwiU3BlZWRydW5cIiBjaGVja2JveFxuICAgIGxldCBzcGVlZHJ1bjtcbiAgICB0cnkge1xuICAgICAgICBzcGVlZHJ1biA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3NwZWVkcnVuJykpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBzcGVlZHJ1biA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHNwZWVkcnVuICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgc3BlZWRydW4gPSBmYWxzZTtcbiAgICB9XG4gICAgJCgnI2NyZWF0ZS1nYW1lLXNwZWVkcnVuJykucHJvcCgnY2hlY2tlZCcsIHNwZWVkcnVuKTtcbiAgICAkKCcjY3JlYXRlLWdhbWUtc3BlZWRydW4nKS5jaGFuZ2UoKTtcblxuICAgIC8vIEZpbGwgaW4gdGhlIFwiQWxsb3cgQm90dG9tLURlY2sgQmxpbmQgUGxheXNcIiBjaGVja2JveFxuICAgIGxldCBkZWNrUGxheXM7XG4gICAgdHJ5IHtcbiAgICAgICAgZGVja1BsYXlzID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3JlYXRlVGFibGVEZWNrUGxheXMnKSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGRlY2tQbGF5cyA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlY2tQbGF5cyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIGRlY2tQbGF5cyA9IGZhbHNlO1xuICAgIH1cbiAgICAkKCcjY3JlYXRlLWdhbWUtZGVjay1wbGF5cycpLnByb3AoJ2NoZWNrZWQnLCBkZWNrUGxheXMpO1xuXG4gICAgLy8gRmlsbCBpbiB0aGUgXCJBbGxvdyBFbXB0eSBDbHVlc1wiIGNoZWNrYm94XG4gICAgbGV0IGVtcHR5Q2x1ZXM7XG4gICAgdHJ5IHtcbiAgICAgICAgZW1wdHlDbHVlcyA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NyZWF0ZVRhYmxlRW1wdHlDbHVlcycpKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgZW1wdHlDbHVlcyA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtcHR5Q2x1ZXMgIT09ICdib29sZWFuJykge1xuICAgICAgICBlbXB0eUNsdWVzID0gZmFsc2U7XG4gICAgfVxuICAgICQoJyNjcmVhdGUtZ2FtZS1lbXB0eS1jbHVlcycpLnByb3AoJ2NoZWNrZWQnLCBlbXB0eUNsdWVzKTtcblxuICAgIC8vIEZpbGwgaW4gdGhlIFwiRGV0cmltZW50YWwgQ2hhcmFjdGVyIEFzc2lnbm1lbnRzXCIgY2hlY2tib3hcbiAgICBsZXQgY2hhcmFjdGVyQXNzaWdubWVudHM7XG4gICAgdHJ5IHtcbiAgICAgICAgY2hhcmFjdGVyQXNzaWdubWVudHMgPSBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjcmVhdGVUYWJsZUNoYXJhY3RlckFzc2lnbm1lbnRzJykpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjaGFyYWN0ZXJBc3NpZ25tZW50cyA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGNoYXJhY3RlckFzc2lnbm1lbnRzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgY2hhcmFjdGVyQXNzaWdubWVudHMgPSBmYWxzZTtcbiAgICB9XG4gICAgJCgnI2NyZWF0ZS1nYW1lLWNoYXJhY3Rlci1hc3NpZ25tZW50cycpLnByb3AoJ2NoZWNrZWQnLCBjaGFyYWN0ZXJBc3NpZ25tZW50cyk7XG5cbiAgICAvLyBGaWxsIGluIHRoZSBcIlBhc3N3b3JkXCIgYm94XG4gICAgY29uc3QgcGFzc3dvcmQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3JlYXRlVGFibGVQYXNzd29yZCcpO1xuICAgICQoJyNjcmVhdGUtZ2FtZS1wYXNzd29yZCcpLnZhbChwYXNzd29yZCk7XG5cbiAgICAvLyBGaWxsIGluIHRoZSBcIkFsZXJ0IHBlb3BsZVwiIGJveFxuICAgIGxldCBhbGVydFdhaXRlcnM7XG4gICAgdHJ5IHtcbiAgICAgICAgYWxlcnRXYWl0ZXJzID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3JlYXRlVGFibGVBbGVydFdhaXRlcnMnKSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGFsZXJ0V2FpdGVycyA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFsZXJ0V2FpdGVycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIGFsZXJ0V2FpdGVycyA9IGZhbHNlO1xuICAgIH1cbiAgICAkKCcjY3JlYXRlLWdhbWUtYWxlcnQtd2FpdGVycycpLnByb3AoJ2NoZWNrZWQnLCBhbGVydFdhaXRlcnMpO1xuXG4gICAgLy8gRm9jdXMgdGhlIFwiTmFtZVwiIGJveFxuICAgIC8vICh3ZSBoYXZlIHRvIHdhaXQgMSBtaWxsaXNlY29uZCBvciBpdCB3b24ndCB3b3JrIGR1ZSB0byB0aGUgbmF0dXJlIG9mIHRoZSBhYm92ZSBjb2RlKVxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAkKCcjY3JlYXRlLWdhbWUtbmFtZScpLmZvY3VzKCk7XG4gICAgfSwgMSk7XG59O1xuIiwiLypcbiAgICBUaGUgc2NyZWVucyB0aGF0IHNob3cgcGFzdCBnYW1lcyBhbmQgb3RoZXIgc2NvcmVzXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi4vZ2xvYmFscycpO1xuY29uc3QgY29uc3RhbnRzID0gcmVxdWlyZSgnLi4vY29uc3RhbnRzJyk7XG5jb25zdCBsb2JieSA9IHJlcXVpcmUoJy4vbWFpbicpO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgJCgnI2xvYmJ5LWhpc3Rvcnktc2hvdy1tb3JlJykub24oJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGdsb2JhbHMuaGlzdG9yeUNsaWNrZWQgPSB0cnVlO1xuICAgICAgICBnbG9iYWxzLmNvbm4uc2VuZCgnaGlzdG9yeUdldCcsIHtcbiAgICAgICAgICAgIG9mZnNldDogT2JqZWN0LmtleXMoZ2xvYmFscy5oaXN0b3J5TGlzdCkubGVuZ3RoLFxuICAgICAgICAgICAgYW1vdW50OiAxMCxcbiAgICAgICAgfSk7XG4gICAgfSk7XG59KTtcblxuZXhwb3J0cy5zaG93ID0gKCkgPT4ge1xuICAgICQoJyNsb2JieS1oaXN0b3J5Jykuc2hvdygpO1xuICAgICQoJyNsb2JieS10b3AtaGFsZicpLmhpZGUoKTtcbiAgICAkKCcjbG9iYnktc2VwYXJhdG9yJykuaGlkZSgpO1xuICAgICQoJyNsb2JieS1ib3R0b20taGFsZicpLmhpZGUoKTtcbiAgICBsb2JieS5uYXYuc2hvdygnaGlzdG9yeScpO1xuICAgIGxvYmJ5Lmhpc3RvcnkuZHJhdygpO1xufTtcblxuZXhwb3J0cy5oaWRlID0gKCkgPT4ge1xuICAgICQoJyNsb2JieS1oaXN0b3J5JykuaGlkZSgpO1xuICAgICQoJyNsb2JieS1oaXN0b3J5LWRldGFpbHMnKS5oaWRlKCk7XG4gICAgJCgnI2xvYmJ5LXRvcC1oYWxmJykuc2hvdygpO1xuICAgICQoJyNsb2JieS1zZXBhcmF0b3InKS5zaG93KCk7XG4gICAgJCgnI2xvYmJ5LWJvdHRvbS1oYWxmJykuc2hvdygpO1xuICAgIGxvYmJ5Lm5hdi5zaG93KCdnYW1lcycpO1xufTtcblxuZXhwb3J0cy5kcmF3ID0gKCkgPT4ge1xuICAgIGNvbnN0IHRib2R5ID0gJCgnI2xvYmJ5LWhpc3RvcnktdGFibGUtdGJvZHknKTtcblxuICAgIC8vIENsZWFyIGFsbCBvZiB0aGUgZXhpc3Rpbmcgcm93c1xuICAgIHRib2R5Lmh0bWwoJycpO1xuXG4gICAgLy8gSGFuZGxlIGlmIHRoZSB1c2VyIGhhcyBubyBoaXN0b3J5XG4gICAgY29uc3QgaWRzID0gT2JqZWN0LmtleXMoZ2xvYmFscy5oaXN0b3J5TGlzdCkubWFwKGkgPT4gcGFyc2VJbnQoaSwgMTApKTtcbiAgICAvLyBKYXZhU2NyaXB0IGtleXMgY29tZSBhcyBzdHJpbmdzLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgdGhlbSB0byBpbnRlZ2Vyc1xuXG4gICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgJCgnI2xvYmJ5LWhpc3Rvcnktbm8nKS5zaG93KCk7XG4gICAgICAgICQoJyNsb2JieS1oaXN0b3J5JykuYWRkQ2xhc3MoJ2FsaWduLWNlbnRlci12Jyk7XG4gICAgICAgICQoJyNsb2JieS1oaXN0b3J5LXRhYmxlLWNvbnRhaW5lcicpLmhpZGUoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAkKCcjbG9iYnktaGlzdG9yeS1ubycpLmhpZGUoKTtcbiAgICAkKCcjbG9iYnktaGlzdG9yeScpLnJlbW92ZUNsYXNzKCdhbGlnbi1jZW50ZXItdicpO1xuICAgICQoJyNsb2JieS1oaXN0b3J5LXRhYmxlLWNvbnRhaW5lcicpLnNob3coKTtcblxuICAgIC8vIFNvcnQgdGhlIGdhbWUgSURzIGluIHJldmVyc2Ugb3JkZXIgKHNvIHRoYXQgdGhlIG1vc3QgcmVjZW50IG9uZXMgYXJlIG5lYXIgdGhlIHRvcClcbiAgICBpZHMuc29ydCgpO1xuICAgIGlkcy5yZXZlcnNlKCk7XG5cbiAgICAvLyBBZGQgYWxsIG9mIHRoZSBoaXN0b3J5XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZ2FtZURhdGEgPSBnbG9iYWxzLmhpc3RvcnlMaXN0W2lkc1tpXV07XG4gICAgICAgIGNvbnN0IHsgbWF4U2NvcmUgfSA9IGNvbnN0YW50cy5WQVJJQU5UU1tnYW1lRGF0YS52YXJpYW50XTtcblxuICAgICAgICBjb25zdCByb3cgPSAkKCc8dHI+Jyk7XG5cbiAgICAgICAgLy8gQ29sdW1uIDEgLSBHYW1lIElEXG4gICAgICAgICQoJzx0ZD4nKS5odG1sKGAjJHtpZHNbaV19YCkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gMiAtICMgb2YgUGxheWVyc1xuICAgICAgICAkKCc8dGQ+JykuaHRtbChnYW1lRGF0YS5udW1QbGF5ZXJzKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiAzIC0gU2NvcmVcbiAgICAgICAgJCgnPHRkPicpLmh0bWwoYCR7Z2FtZURhdGEuc2NvcmV9LyR7bWF4U2NvcmV9YCkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gNCAtIFZhcmlhbnRcbiAgICAgICAgJCgnPHRkPicpLmh0bWwoZ2FtZURhdGEudmFyaWFudCkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gNSAtIFRpbWUgQ29tcGxldGVkXG4gICAgICAgIGNvbnN0IHRpbWVDb21wbGV0ZWQgPSBkYXRlVGltZUZvcm1hdHRlci5mb3JtYXQobmV3IERhdGUoZ2FtZURhdGEuZGF0ZXRpbWUpKTtcbiAgICAgICAgJCgnPHRkPicpLmh0bWwodGltZUNvbXBsZXRlZCkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gNiAtIFdhdGNoIFJlcGxheVxuICAgICAgICBjb25zdCB3YXRjaFJlcGxheUJ1dHRvbiA9IG1ha2VSZXBsYXlCdXR0b24oaWRzW2ldLCAnV2F0Y2ggUmVwbGF5JywgJ3JlcGxheUNyZWF0ZScsIGZhbHNlKTtcbiAgICAgICAgJCgnPHRkPicpLmh0bWwod2F0Y2hSZXBsYXlCdXR0b24pLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgLy8gQ29sdW1uIDcgLSBTaGFyZSBSZXBsYXlcbiAgICAgICAgY29uc3Qgc2hhcmVSZXBsYXlCdXR0b24gPSBtYWtlUmVwbGF5QnV0dG9uKGlkc1tpXSwgJ1NoYXJlIFJlcGxheScsICdzaGFyZWRSZXBsYXlDcmVhdGUnLCB0cnVlKTtcbiAgICAgICAgJCgnPHRkPicpLmh0bWwoc2hhcmVSZXBsYXlCdXR0b24pLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgLy8gQ29sdW1uIDggLSBPdGhlciBTY29yZXNcbiAgICAgICAgY29uc3Qgb3RoZXJTY29yZXNCdXR0b24gPSBtYWtlSGlzdG9yeURldGFpbHNCdXR0b24oaWRzW2ldLCBnYW1lRGF0YS5udW1TaW1pbGFyKTtcbiAgICAgICAgJCgnPHRkPicpLmh0bWwob3RoZXJTY29yZXNCdXR0b24pLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgLy8gQ29sdW1uIDkgLSBPdGhlciBQbGF5ZXJzXG4gICAgICAgICQoJzx0ZD4nKS5odG1sKGdhbWVEYXRhLm90aGVyUGxheWVyTmFtZXMpLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgcm93LmFwcGVuZFRvKHRib2R5KTtcbiAgICB9XG5cbiAgICAvLyBEb24ndCBzaG93IHRoZSBcIlNob3cgTW9yZSBIaXN0b3J5XCIgaWYgd2UgZG9uJ3QgaGF2ZSAxMCBnYW1lcyBwbGF5ZWRcbiAgICAvLyAodGhlcmUgaXMgYSBzbWFsbCBidWcgaGVyZSB3aGVyZSBpZiBhIHVzZXIgaGFzIGV4YWN0bHkgMTAgZ2FtZXMgcGxheWVkXG4gICAgLy8gdGhlbiB0aGUgYnV0dG9uIHdpbGwgZXJyb25lb3VzbHkgc2hvdyBhbmQgbm90IGRvIGFueXRoaW5nIHdoZW4gY2xpY2tlZClcbiAgICBpZiAoaWRzLmxlbmd0aCA8IDEwKSB7XG4gICAgICAgICQoJyNsb2JieS1oaXN0b3J5LXNob3ctbW9yZScpLmhpZGUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAkKCcjbG9iYnktaGlzdG9yeS1zaG93LW1vcmUnKS5zaG93KCk7XG4gICAgfVxufTtcblxuY29uc3QgbWFrZVJlcGxheUJ1dHRvbiA9IChpZCwgdGV4dCwgbXNnVHlwZSwgcmV0dXJuc1RvTG9iYnkpID0+IHtcbiAgICBjb25zdCBidXR0b24gPSAkKCc8YnV0dG9uPicpLmF0dHIoJ3R5cGUnLCAnYnV0dG9uJykuYWRkQ2xhc3MoJ2J1dHRvbiBmaXQgbWFyZ2luMCcpO1xuICAgIGlmICh0ZXh0ID09PSAnV2F0Y2ggUmVwbGF5Jykge1xuICAgICAgICB0ZXh0ID0gJzxpIGNsYXNzPVwiZmFzIGZhLWV5ZSBsb2JieS1idXR0b24taWNvblwiPjwvaT4nO1xuICAgIH0gZWxzZSBpZiAodGV4dCA9PT0gJ1NoYXJlIFJlcGxheScpIHtcbiAgICAgICAgdGV4dCA9ICc8aSBjbGFzcz1cImZhcyBmYS11c2VycyBsb2JieS1idXR0b24taWNvblwiPjwvaT4nO1xuICAgIH1cbiAgICBidXR0b24uaHRtbCh0ZXh0KTtcbiAgICBidXR0b24uYWRkQ2xhc3MoJ2hpc3RvcnktdGFibGUnKTtcbiAgICBidXR0b24uYWRkQ2xhc3MoJ2VudGVyLWhpc3RvcnktZ2FtZScpO1xuICAgIGJ1dHRvbi5hdHRyKCdpZCcsIGByZXBsYXktJHtpZH1gKTtcblxuICAgIGJ1dHRvbi5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgZ2xvYmFscy5nYW1lSUQgPSBpZDtcbiAgICAgICAgZ2xvYmFscy5jb25uLnNlbmQobXNnVHlwZSwge1xuICAgICAgICAgICAgZ2FtZUlEOiBnbG9iYWxzLmdhbWVJRCxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChyZXR1cm5zVG9Mb2JieSkge1xuICAgICAgICAgICAgbG9iYnkuaGlzdG9yeS5oaWRlKCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBidXR0b247XG59O1xuXG5jb25zdCBtYWtlSGlzdG9yeURldGFpbHNCdXR0b24gPSAoaWQsIGdhbWVDb3VudCkgPT4ge1xuICAgIGNvbnN0IGJ1dHRvbiA9ICQoJzxidXR0b24+JykuYXR0cigndHlwZScsICdidXR0b24nKS5hZGRDbGFzcygnYnV0dG9uIGZpdCBtYXJnaW4wJyk7XG4gICAgYnV0dG9uLmh0bWwoYDxpIGNsYXNzPVwiZmFzIGZhLWNoYXJ0LWJhciBsb2JieS1idXR0b24taWNvblwiPjwvaT4mbmJzcDsgJHtnYW1lQ291bnQgLSAxfWApO1xuICAgIGlmIChnYW1lQ291bnQgLSAxID09PSAwKSB7XG4gICAgICAgIGJ1dHRvbi5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICB9XG4gICAgYnV0dG9uLmF0dHIoJ2lkJywgYGhpc3RvcnktZGV0YWlscy0ke2lkfWApO1xuXG4gICAgYnV0dG9uLm9uKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBnbG9iYWxzLmdhbWVJRCA9IGlkO1xuICAgICAgICBnbG9iYWxzLmNvbm4uc2VuZCgnaGlzdG9yeURldGFpbHMnLCB7XG4gICAgICAgICAgICBnYW1lSUQ6IGdsb2JhbHMuZ2FtZUlELFxuICAgICAgICB9KTtcbiAgICAgICAgbG9iYnkuaGlzdG9yeS5zaG93RGV0YWlscygpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGJ1dHRvbjtcbn07XG5cbmV4cG9ydHMuc2hvd0RldGFpbHMgPSAoKSA9PiB7XG4gICAgJCgnI2xvYmJ5LWhpc3RvcnknKS5oaWRlKCk7XG4gICAgJCgnI2xvYmJ5LWhpc3RvcnktZGV0YWlscycpLnNob3coKTtcbiAgICBsb2JieS5uYXYuc2hvdygnaGlzdG9yeS1kZXRhaWxzJyk7XG5cbiAgICAvLyBUaGUgc2VydmVyIHdpbGwgc2VuZCB1cyBtZXNzYWdlcyB0byBwb3B1bGF0ZSB0aGlzIGFycmF5IG1vbWVudGFyaWx5XG4gICAgZ2xvYmFscy5oaXN0b3J5RGV0YWlsTGlzdCA9IFtdO1xufTtcblxuZXhwb3J0cy5oaWRlRGV0YWlscyA9ICgpID0+IHtcbiAgICAkKCcjbG9iYnktaGlzdG9yeScpLnNob3coKTtcbiAgICAkKCcjbG9iYnktaGlzdG9yeS1kZXRhaWxzJykuaGlkZSgpO1xuICAgIGxvYmJ5Lm5hdi5zaG93KCdoaXN0b3J5Jyk7XG59O1xuXG4vLyBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBvbmNlIGZvciBlYWNoIG5ldyBoaXN0b3J5IGVsZW1lbnQgcmVjZWl2ZWQgZnJvbSB0aGUgc2VydmVyXG4vLyBUaGUgbGFzdCBtZXNzYWdlIGlzIG5vdCBtYXJrZWQsIHNvIGVhY2ggaXRlcmF0aW9uIHJlZHJhd3MgYWxsIGhpc3RvcnlEZXRhaWxMaXN0IGl0ZW1zXG5leHBvcnRzLmRyYXdEZXRhaWxzID0gKCkgPT4ge1xuICAgIGNvbnN0IHRib2R5ID0gJCgnI2xvYmJ5LWhpc3RvcnktZGV0YWlscy10YWJsZS10Ym9keScpO1xuXG4gICAgaWYgKCFnbG9iYWxzLmhpc3RvcnlEZXRhaWxMaXN0Lmxlbmd0aCkge1xuICAgICAgICB0Ym9keS50ZXh0KCdMb2FkaW5nLi4uJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDbGVhciBhbGwgb2YgdGhlIGV4aXN0aW5nIHJvd3NcbiAgICB0Ym9keS5odG1sKCcnKTtcblxuICAgIC8vIFRoZSBnYW1lIHBsYXllZCBieSB0aGUgdXNlciB3aWxsIGFsc28gaW5jbHVkZSBpdHMgdmFyaWFudFxuICAgIGNvbnN0IHZhcmlhbnQgPSBnbG9iYWxzLmhpc3RvcnlEZXRhaWxMaXN0XG4gICAgICAgIC5maWx0ZXIoZyA9PiBnLmlkIGluIGdsb2JhbHMuaGlzdG9yeUxpc3QpXG4gICAgICAgIC5tYXAoZyA9PiBnbG9iYWxzLmhpc3RvcnlMaXN0W2cuaWRdLnZhcmlhbnQpXG4gICAgICAgIC5tYXAodiA9PiBjb25zdGFudHMuVkFSSUFOVFNbdl0pWzBdO1xuXG4gICAgLy8gVGhlIGdhbWUgcGxheWVkIGJ5IHRoZSB1c2VyIG1pZ2h0IG5vdCBoYXZlIGJlZW4gc2VudCBieSB0aGUgc2VydmVyIHlldFxuICAgIGlmICh2YXJpYW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gSWYgbm90LCB0aGUgdmFyaWFudCBpcyBub3Qga25vd24geWV0LCBzbyBkZWZlciBkcmF3aW5nXG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBBZGQgYWxsIG9mIHRoZSBnYW1lc1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFscy5oaXN0b3J5RGV0YWlsTGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBnYW1lRGF0YSA9IGdsb2JhbHMuaGlzdG9yeURldGFpbExpc3RbaV07XG5cbiAgICAgICAgY29uc3Qgcm93ID0gJCgnPHRyPicpO1xuXG4gICAgICAgIC8vIENvbHVtbiAxIC0gR2FtZSBJRFxuICAgICAgICBsZXQgaWQgPSBgIyR7Z2FtZURhdGEuaWR9YDtcbiAgICAgICAgaWYgKGdhbWVEYXRhLnlvdSkge1xuICAgICAgICAgICAgaWQgPSBgPHN0cm9uZz4ke2lkfTwvc3Ryb25nPmA7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHRkPicpLmh0bWwoaWQpLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgLy8gQ29sdW1uIDIgLSBTY29yZVxuICAgICAgICBsZXQgc2NvcmUgPSBgJHtnYW1lRGF0YS5zY29yZX0vJHt2YXJpYW50Lm1heFNjb3JlfWA7XG4gICAgICAgIGlmIChnYW1lRGF0YS55b3UpIHtcbiAgICAgICAgICAgIHNjb3JlID0gYDxzdHJvbmc+JHtzY29yZX08L3N0cm9uZz5gO1xuICAgICAgICB9XG4gICAgICAgICQoJzx0ZD4nKS5odG1sKHNjb3JlKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiAzIC0gVGltZSBDb21wbGV0ZWRcbiAgICAgICAgbGV0IGRhdGVUaW1lID0gZGF0ZVRpbWVGb3JtYXR0ZXIuZm9ybWF0KG5ldyBEYXRlKGdhbWVEYXRhLmRhdGV0aW1lKSk7XG4gICAgICAgIGlmIChnYW1lRGF0YS55b3UpIHtcbiAgICAgICAgICAgIGRhdGVUaW1lID0gYDxzdHJvbmc+JHtkYXRlVGltZX08L3N0cm9uZz5gO1xuICAgICAgICB9XG4gICAgICAgICQoJzx0ZD4nKS5odG1sKGRhdGVUaW1lKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA0IC0gV2F0Y2ggUmVwbGF5XG4gICAgICAgIGNvbnN0IHdhdGNoUmVwbGF5QnV0dG9uID0gbWFrZVJlcGxheUJ1dHRvbihnYW1lRGF0YS5pZCwgJ1dhdGNoIFJlcGxheScsICdyZXBsYXlDcmVhdGUnLCBmYWxzZSk7XG4gICAgICAgICQoJzx0ZD4nKS5odG1sKHdhdGNoUmVwbGF5QnV0dG9uKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA1IC0gU2hhcmUgUmVwbGF5XG4gICAgICAgIGNvbnN0IHNoYXJlUmVwbGF5QnV0dG9uID0gbWFrZVJlcGxheUJ1dHRvbihnYW1lRGF0YS5pZCwgJ1NoYXJlIFJlcGxheScsICdzaGFyZWRSZXBsYXlDcmVhdGUnLCBmYWxzZSk7XG4gICAgICAgICQoJzx0ZD4nKS5odG1sKHNoYXJlUmVwbGF5QnV0dG9uKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA2IC0gT3RoZXIgUGxheWVyc1xuICAgICAgICBsZXQgb3RoZXJQbGF5ZXJzID0gZ2FtZURhdGEub3RoZXJQbGF5ZXJOYW1lcztcbiAgICAgICAgaWYgKGdhbWVEYXRhLnlvdSkge1xuICAgICAgICAgICAgb3RoZXJQbGF5ZXJzID0gYDxzdHJvbmc+JHtnbG9iYWxzLnVzZXJuYW1lfSwgJHtvdGhlclBsYXllcnN9PC9zdHJvbmc+YDtcbiAgICAgICAgfVxuICAgICAgICAkKCc8dGQ+JykuaHRtbChvdGhlclBsYXllcnMpLmFwcGVuZFRvKHJvdyk7XG5cbiAgICAgICAgcm93LmFwcGVuZFRvKHRib2R5KTtcbiAgICB9XG59O1xuXG5jb25zdCBkYXRlVGltZUZvcm1hdHRlciA9IG5ldyBJbnRsLkRhdGVUaW1lRm9ybWF0KFxuICAgIHVuZGVmaW5lZCxcbiAgICB7XG4gICAgICAgIHllYXI6ICdudW1lcmljJyxcbiAgICAgICAgbW9udGg6ICcyLWRpZ2l0JyxcbiAgICAgICAgZGF5OiAnMi1kaWdpdCcsXG4gICAgfSxcbik7XG4iLCIvKlxuICAgIExvYmJ5IGtleWJvYXJkIHNob3J0Y3V0c1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcblxuJChkb2N1bWVudCkua2V5ZG93bigoZXZlbnQpID0+IHtcbiAgICBpZiAoZ2xvYmFscy5jdXJyZW50U2NyZWVuICE9PSAnbG9iYnknKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQuYWx0S2V5ICYmIGV2ZW50LmtleSA9PT0gJ2MnKSB7IC8vIEFsdCArIGNcbiAgICAgICAgLy8gQ2xpY2sgdGhlIFwiQ3JlYXRlIEdhbWVcIiBidXR0b25cbiAgICAgICAgJCgnI25hdi1idXR0b25zLWdhbWVzLWNyZWF0ZS1nYW1lJykuY2xpY2soKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LmFsdEtleSAmJiBldmVudC5rZXkgPT09ICdoJykgeyAvLyBBbHQgKyBoXG4gICAgICAgIC8vIENsaWNrIHRoZSBcIlNob3cgSGlzdG9yeVwiIGJ1dHRvblxuICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtZ2FtZXMtaGlzdG9yeScpLmNsaWNrKCk7XG4gICAgfSBlbHNlIGlmIChldmVudC5hbHRLZXkgJiYgZXZlbnQua2V5ID09PSAnbycpIHsgLy8gQWx0ICsgb1xuICAgICAgICAvLyBDbGljayB0aGUgXCJTaWduIE91dFwiIGJ1dHRvblxuICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtZ2FtZXMtc2lnbi1vdXQnKS5jbGljaygpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQuYWx0S2V5ICYmIGV2ZW50LmtleSA9PT0gJ3MnKSB7IC8vIEFsdCArIHNcbiAgICAgICAgLy8gQ2xpY2sgb24gdGhlIFwiU3RhcnQgR2FtZVwiIGJ1dHRvblxuICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtZ2FtZS1zdGFydCcpLmNsaWNrKCk7XG4gICAgfSBlbHNlIGlmIChldmVudC5hbHRLZXkgJiYgZXZlbnQua2V5ID09PSAnbCcpIHsgLy8gQWx0ICsgbFxuICAgICAgICAvLyBDbGljayBvbiB0aGUgXCJMZWF2ZSBHYW1lXCIgYnV0dG9uXG4gICAgICAgICQoJyNuYXYtYnV0dG9ucy1wcmVnYW1lLWxlYXZlJykuY2xpY2soKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LmFsdEtleSAmJiBldmVudC5rZXkgPT09ICdyJykgeyAvLyBBbHQgKyByXG4gICAgICAgIC8vIENsaWNrIG9uIHRoZSBcIlJldHVybiB0byBMb2JieVwiIGJ1dHRvblxuICAgICAgICAvLyAoZWl0aGVyIGF0IHRoZSBcImdhbWVcIiBzY3JlZW4gb3IgdGhlIFwiaGlzdG9yeVwiIHNjcmVlbiBvciB0aGUgXCJzY29yZXNcIiBzY3JlZW4pXG4gICAgICAgIGlmICgkKCcjbmF2LWJ1dHRvbnMtcHJlZ2FtZS11bmF0dGVuZCcpLmlzKCc6dmlzaWJsZScpKSB7XG4gICAgICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtcHJlZ2FtZS11bmF0dGVuZCcpLmNsaWNrKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoJCgnI25hdi1idXR0b25zLWhpc3RvcnktcmV0dXJuJykuaXMoJzp2aXNpYmxlJykpIHtcbiAgICAgICAgICAgICQoJyNuYXYtYnV0dG9ucy1oaXN0b3J5LXJldHVybicpLmNsaWNrKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoJCgnI25hdi1idXR0b25zLWhpc3RvcnktZGV0YWlscy1yZXR1cm4nKS5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAgICAgJCgnI25hdi1idXR0b25zLWhpc3RvcnktZGV0YWlscy1yZXR1cm4nKS5jbGljaygpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChldmVudC5hbHRLZXkgJiYgZXZlbnQua2V5ID09PSAndycpIHsgLy8gQWx0ICsgd1xuICAgICAgICAvLyBDbGljayBvbiB0aGUgXCJXYXRjaCBSZXBsYXkgYnkgSURcIiBidXR0b25cbiAgICAgICAgJCgnYS5uYXYtYnV0dG9ucy1oaXN0b3J5LWJ5LWlkW2RhdGEtcmVwbGF5VHlwZT1cInJlcGxheUNyZWF0ZVwiXScpLmNsaWNrKCk7XG4gICAgfSBlbHNlIGlmIChldmVudC5hbHRLZXkgJiYgZXZlbnQua2V5ID09PSAnZScpIHsgLy8gQWx0ICsgZVxuICAgICAgICAvLyBDbGljayBvbiB0aGUgXCJTaGFyZSBSZXBsYXkgYnkgSURcIiBidXR0b25cbiAgICAgICAgJCgnYS5uYXYtYnV0dG9ucy1oaXN0b3J5LWJ5LWlkW2RhdGEtcmVwbGF5VHlwZT1cInNoYXJlZFJlcGxheUNyZWF0ZVwiXScpLmNsaWNrKCk7XG4gICAgfVxufSk7XG4iLCIvKlxuICAgIFRoZSBpbml0aWFsIGxvZ2luIHBhZ2VcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuLi9nbG9iYWxzJyk7XG5jb25zdCB3ZWJzb2NrZXQgPSByZXF1aXJlKCcuLi93ZWJzb2NrZXQnKTtcbmNvbnN0IGxvYmJ5ID0gcmVxdWlyZSgnLi9tYWluJyk7XG5cbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcbiAgICAkKCcjbG9naW4tYnV0dG9uJykuY2xpY2soKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICQoJyNsb2dpbi1mb3JtJykuc3VibWl0KCk7XG4gICAgfSk7XG4gICAgJCgnI2xvZ2luLWZvcm0nKS5vbigna2V5cHJlc3MnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICQoJyNsb2dpbi1mb3JtJykuc3VibWl0KCk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICAkKCcjbG9naW4tZm9ybScpLnN1Ym1pdChzdWJtaXQpO1xuXG4gICAgLy8gTWFrZSB0aGUgdG9vbHRpcCBmb3IgdGhlIERpc2NvcmQgaWNvbiBhdCB0aGUgYm90dG9tIG9mIHRoZSBzY3JlZW5cbiAgICBsZXQgZGlzY29yZENvbnRlbnQgPSAnRGlzY29yZCBpcyBhIHZvaWNlIGFuZCB0ZXh0IGNoYXQgYXBwbGljYXRpb24gdGhhdCB5b3UgY2FuIHJ1biBpbiBhJztcbiAgICBkaXNjb3JkQ29udGVudCArPSAnYnJvd3Nlci48YnIgLz5JZiB0aGUgc2VydmVyIGlzIGRvd24sIHlvdSBjYW4gcHJvYmFibHkgZmluZCBvdXQgd2h5IGluIHRoZSc7XG4gICAgZGlzY29yZENvbnRlbnQgKz0gJ0hhbmFiaSBzZXJ2ZXIgLyBjaGF0IHJvb20uJztcbiAgICAkKCcjdGl0bGUtZGlzY29yZCcpLnRvb2x0aXBzdGVyKHtcbiAgICAgICAgdGhlbWU6ICd0b29sdGlwc3Rlci1zaGFkb3cnLFxuICAgICAgICBkZWxheTogMCxcbiAgICAgICAgY29udGVudDogZGlzY29yZENvbnRlbnQsXG4gICAgICAgIGNvbnRlbnRBc0hUTUw6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0byBzZWUgaWYgd2UgaGF2ZSBhY2NlcHRlZCB0aGUgRmlyZWZveCB3YXJuaW5nXG4gICAgLy8gKGNvb2tpZXMgYXJlIHN0cmluZ3MsIHNvIHdlIGNhbm5vdCBjaGVjayBmb3IgZXF1YWxpdHkpXG4gICAgaWYgKGdsb2JhbHMuYnJvd3NlcklzRmlyZWZveCAmJiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnYWNjZXB0ZWRGaXJlZm94V2FybmluZycpICE9PSAndHJ1ZScpIHtcbiAgICAgICAgJCgnI3NpZ24taW4nKS5oaWRlKCk7XG4gICAgICAgICQoJyNmaXJlZm94LXdhcm5pbmcnKS5zaG93KCk7XG4gICAgfVxuICAgICQoJyNmaXJlZm94LXdhcm5pbmctYnV0dG9uJykuY2xpY2soKCkgPT4ge1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnYWNjZXB0ZWRGaXJlZm94V2FybmluZycsICd0cnVlJyk7XG4gICAgICAgICQoJyNmaXJlZm94LXdhcm5pbmcnKS5oaWRlKCk7XG4gICAgICAgICQoJyNzaWduLWluJykuc2hvdygpO1xuICAgIH0pO1xuXG4gICAgYXV0b21hdGljTG9naW4oKTtcbn0pO1xuXG5jb25zdCBzdWJtaXQgPSAoZXZlbnQpID0+IHtcbiAgICAvLyBCeSBkZWZhdWx0LCB0aGUgZm9ybSB3aWxsIHJlbG9hZCB0aGUgcGFnZSwgc28gc3RvcCB0aGlzIGZyb20gaGFwcGVuaW5nXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGNvbnN0IHVzZXJuYW1lID0gJCgnI2xvZ2luLXVzZXJuYW1lJykudmFsKCk7XG4gICAgY29uc3QgcGFzc3dvcmRQbGFpbnRleHQgPSAkKCcjbG9naW4tcGFzc3dvcmQnKS52YWwoKTtcblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgICAgZm9ybUVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgdXNlcm5hbWUuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFwYXNzd29yZFBsYWludGV4dCkge1xuICAgICAgICBmb3JtRXJyb3IoJ1lvdSBtdXN0IHByb3ZpZGUgYSBwYXNzd29yZC4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFdlIHNhbHQgdGhlIHBhc3N3b3JkIHdpdGggYSBwcmVmaXggb2YgXCJIYW5hYmkgcGFzc3dvcmQgXCJcbiAgICAvLyBhbmQgdGhlbiBoYXNoIGl0IHdpdGggU0hBMjU2IGJlZm9yZSBzZW5kaW5nIGl0IHRvIHRoZSBzZXJ2ZXJcbiAgICBjb25zdCBwYXNzd29yZCA9IGhleF9zaGEyNTYoYEhhbmFiaSBwYXNzd29yZCAke3Bhc3N3b3JkUGxhaW50ZXh0fWApO1xuXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2hhbmFiaXVzZXInLCB1c2VybmFtZSk7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2hhbmFiaXBhc3MnLCBwYXNzd29yZCk7XG5cbiAgICBnbG9iYWxzLnVzZXJuYW1lID0gdXNlcm5hbWU7XG4gICAgZ2xvYmFscy5wYXNzd29yZCA9IHBhc3N3b3JkO1xuXG4gICAgc2VuZCgpO1xufTtcblxuY29uc3QgZm9ybUVycm9yID0gKG1zZykgPT4ge1xuICAgIC8vIEZvciBzb21lIHJlYXNvbiB0aGlzIGhhcyB0byBiZSBpbnZva2VkIGFzeWNucm9ub3VzbHkgaW4gb3JkZXIgdG8gd29yayBwcm9wZXJseVxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAkKCcjbG9naW4tYWpheCcpLmhpZGUoKTtcbiAgICAgICAgJCgnI2xvZ2luLWJ1dHRvbicpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuICAgICAgICAkKCcjbG9naW4tYWxlcnQnKS5odG1sKG1zZyk7XG4gICAgICAgICQoJyNsb2dpbi1hbGVydCcpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICB9LCAwKTtcbn07XG5cbmNvbnN0IHNlbmQgPSAoKSA9PiB7XG4gICAgJCgnI2xvZ2luLWJ1dHRvbicpLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuICAgICQoJyNsb2dpbi1leHBsYW5hdGlvbicpLmhpZGUoKTtcbiAgICAkKCcjbG9naW4tYWpheCcpLnNob3coKTtcblxuICAgIC8vIFNlbmQgYSBsb2dpbiByZXF1ZXN0IHRvIHRoZSBzZXJ2ZXI7IGlmIHN1Y2Nlc3NmdWwsIHdlIHdpbGwgZ2V0IGEgY29va2llIGJhY2tcbiAgICBsZXQgdXJsID0gYCR7d2luZG93LmxvY2F0aW9uLnByb3RvY29sfS8vJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9YDtcbiAgICBpZiAod2luZG93LmxvY2F0aW9uLnBvcnQgIT09ICcnKSB7XG4gICAgICAgIHVybCArPSBgOiR7d2luZG93LmxvY2F0aW9uLnBvcnR9YDtcbiAgICB9XG4gICAgdXJsICs9ICcvbG9naW4nO1xuICAgIGNvbnN0IHBvc3REYXRhID0ge1xuICAgICAgICB1c2VybmFtZTogZ2xvYmFscy51c2VybmFtZSxcbiAgICAgICAgcGFzc3dvcmQ6IGdsb2JhbHMucGFzc3dvcmQsXG4gICAgfTtcbiAgICBjb25zdCByZXF1ZXN0ID0gJC5hamF4KHtcbiAgICAgICAgdXJsLFxuICAgICAgICB0eXBlOiAnUE9TVCcsXG4gICAgICAgIGRhdGE6IHBvc3REYXRhLFxuICAgIH0pO1xuICAgIGNvbnNvbGUubG9nKGBTZW50IGEgbG9naW4gcmVxdWVzdCB0bzogJHt1cmx9YCk7XG5cbiAgICByZXF1ZXN0LmRvbmUoKCkgPT4ge1xuICAgICAgICAvLyBXZSBzdWNjZXNzZnVsbHkgZ290IGEgY29va2llOyBhdHRlbXB0IHRvIGVzdGFibGlzaCBhIFdlYlNvY2tldCBjb25uZWN0aW9uXG4gICAgICAgIHdlYnNvY2tldC5zZXQoKTtcbiAgICB9KTtcbiAgICByZXF1ZXN0LmZhaWwoKGpxWEhSKSA9PiB7XG4gICAgICAgIGZvcm1FcnJvcihgTG9naW4gZmFpbGVkOiAke2dldEFqYXhFcnJvcihqcVhIUil9YCk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBnZXRBamF4RXJyb3IgPSAoanFYSFIpID0+IHtcbiAgICBpZiAoanFYSFIucmVhZHlTdGF0ZSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gJ0EgbmV0d29yayBlcnJvciBvY2N1cmVkLiBUaGUgc2VydmVyIG1pZ2h0IGJlIGRvd24hJztcbiAgICB9XG4gICAgaWYgKGpxWEhSLnJlc3BvbnNlVGV4dCA9PT0gJycpIHtcbiAgICAgICAgcmV0dXJuICdBbiB1bmtub3duIGVycm9yIG9jY3VyZWQuJztcbiAgICB9XG4gICAgcmV0dXJuIGpxWEhSLnJlc3BvbnNlVGV4dDtcbn07XG5cbmNvbnN0IGF1dG9tYXRpY0xvZ2luID0gKCkgPT4ge1xuICAgIC8vIERvbid0IGF1dG9tYXRpY2FsbHkgbG9naW4gaWYgdGhleSBhcmUgb24gRmlyZWZveCBhbmQgaGF2ZSBub3QgY29uZmlybWVkIHRoZSB3YXJuaW5nIGRpYWxvZ1xuICAgIC8vIChjb29raWVzIGFyZSBzdHJpbmdzLCBzbyB3ZSBjYW5ub3QgY2hlY2sgZm9yIGVxdWFsaXR5KVxuICAgIGlmIChnbG9iYWxzLmJyb3dzZXJJc0ZpcmVmb3ggJiYgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2FjY2VwdGVkRmlyZWZveFdhcm5pbmcnKSAhPT0gJ3RydWUnKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBBdXRvbWF0aWNhbGx5IHNpZ24gaW4gdG8gdGhlIFdlYlNvY2tldCBzZXJ2ZXIgaWYgd2UgaGF2ZSBjYWNoZWQgY3JlZGVudGlhbHNcbiAgICBnbG9iYWxzLnVzZXJuYW1lID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2hhbmFiaXVzZXInKTtcbiAgICBnbG9iYWxzLnBhc3N3b3JkID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2hhbmFiaXBhc3MnKTtcbiAgICBpZiAoZ2xvYmFscy51c2VybmFtZSkge1xuICAgICAgICAkKCcjbG9naW4tdXNlcm5hbWUnKS52YWwoZ2xvYmFscy51c2VybmFtZSk7XG4gICAgICAgICQoJyNsb2dpbi1wYXNzd29yZCcpLmZvY3VzKCk7XG4gICAgfVxuXG4gICAgaWYgKCFnbG9iYWxzLnVzZXJuYW1lIHx8ICFnbG9iYWxzLnBhc3N3b3JkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc29sZS5sb2coJ0F1dG9tYXRpY2FsbHkgbG9nZ2luZyBpbiBmcm9tIGNvb2tpZSBjcmVkZW50aWFscy4nKTtcbiAgICBzZW5kKCk7XG59O1xuXG5leHBvcnRzLmhpZGUgPSAoZmlyc3RUaW1lVXNlcikgPT4ge1xuICAgIC8vIEhpZGUgdGhlIGxvZ2luIHNjcmVlblxuICAgICQoJyNsb2dpbicpLmhpZGUoKTtcblxuICAgIGlmIChmaXJzdFRpbWVVc2VyKSB7XG4gICAgICAgICQoJyN0dXRvcmlhbCcpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNob3cgdGhlIGxvYmJ5XG4gICAgZ2xvYmFscy5jdXJyZW50U2NyZWVuID0gJ2xvYmJ5JztcbiAgICAkKCcjbG9iYnknKS5zaG93KCk7XG4gICAgJCgnI2xvYmJ5LWhpc3RvcnknKS5oaWRlKCk7XG4gICAgLy8gV2UgY2FuJ3QgaGlkZSB0aGlzIGVsZW1lbnQgYnkgZGVmYXVsdCBpbiBcImluZGV4Lmh0bWxcIiBvciBlbHNlIHRoZSBcIk5vIGdhbWUgaGlzdG9yeVwiIHRleHRcbiAgICAvLyB3aWxsIG5vdCBiZSBjZW50ZXJlZFxuICAgIGxvYmJ5Lm5hdi5zaG93KCdnYW1lcycpO1xuICAgIGxvYmJ5LnVzZXJzLmRyYXcoKTtcbiAgICBsb2JieS50YWJsZXMuZHJhdygpO1xuICAgICQoJyNsb2JieS1jaGF0LWlucHV0JykuZm9jdXMoKTtcbn07XG4iLCIvKlxuICAgIFRoZSBsb2JieSBpcyBjb21wb3NlZCBvZiBhbGwgb2YgdGhlIFVJIGVsZW1lbnRzIHRoYXQgZG9uJ3QgaGF2ZSB0byBkbyB3aXRoIHRoZSBnYW1lIGl0c2VsZlxuKi9cblxuZXhwb3J0cy5jcmVhdGVHYW1lID0gcmVxdWlyZSgnLi9jcmVhdGVHYW1lJyk7XG5leHBvcnRzLmhpc3RvcnkgPSByZXF1aXJlKCcuL2hpc3RvcnknKTtcbmV4cG9ydHMua2V5Ym9hcmQgPSByZXF1aXJlKCcuL2tleWJvYXJkJyk7XG5leHBvcnRzLmxvZ2luID0gcmVxdWlyZSgnLi9sb2dpbicpO1xuZXhwb3J0cy5uYXYgPSByZXF1aXJlKCcuL25hdicpO1xuZXhwb3J0cy5wcmVnYW1lID0gcmVxdWlyZSgnLi9wcmVnYW1lJyk7XG5leHBvcnRzLnNldHRpbmdzID0gcmVxdWlyZSgnLi9zZXR0aW5ncycpO1xuZXhwb3J0cy50YWJsZXMgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xucmVxdWlyZSgnLi90dXRvcmlhbCcpO1xuZXhwb3J0cy51c2VycyA9IHJlcXVpcmUoJy4vdXNlcnMnKTtcblxuLy8gQWxzbyBtYWtlIGl0IGF2YWlsYWJsZSB0byB0aGUgd2luZG93IHNvIHRoYXQgd2UgY2FuIGFjY2VzcyBnbG9iYWwgdmFyaWFibGVzXG4vLyBmcm9tIHRoZSBKYXZhU2NyaXB0IGNvbnNvbGUgKGZvciBkZWJ1Z2dpbmcgcHVycG9zZXMpXG53aW5kb3cubG9iYnkgPSBleHBvcnRzO1xuIiwiLypcbiAgICBUaGUgbmF2aWdhdGlvbiBiYXIgYXQgdGhlIHRvcCBvZiB0aGUgbG9iYnlcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuLi9nbG9iYWxzJyk7XG5jb25zdCBtaXNjID0gcmVxdWlyZSgnLi4vbWlzYycpO1xuY29uc3QgbW9kYWxzID0gcmVxdWlyZSgnLi4vbW9kYWxzJyk7XG5jb25zdCBsb2JieSA9IHJlcXVpcmUoJy4vbWFpbicpO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgLy8gSW5pdGlhbGl6ZSBhbGwgb2YgdGhlIG5hdmlnYXRpb24gdG9vbHRpcHMgdXNpbmcgVG9vbHRpcHN0ZXJcbiAgICBpbml0VG9vbHRpcHMoKTtcblxuICAgIC8vIFRoZSBcIkNyZWF0ZSBHYW1lXCIgYnV0dG9uXG4gICAgJCgnI25hdi1idXR0b25zLWdhbWVzLWNyZWF0ZS1nYW1lJykudG9vbHRpcHN0ZXIoJ29wdGlvbicsICdmdW5jdGlvblJlYWR5JywgbG9iYnkuY3JlYXRlR2FtZS5yZWFkeSk7XG5cbiAgICAvLyBUaGUgXCJTaG93IEhpc3RvcnlcIiBidXR0b25cbiAgICAkKCcjbmF2LWJ1dHRvbnMtZ2FtZXMtaGlzdG9yeScpLm9uKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsb2JieS5oaXN0b3J5LnNob3coKTtcbiAgICB9KTtcblxuICAgIC8vIFRoZSBcIkhlbHBcIiBidXR0b25cbiAgICAvLyAodGhpcyBpcyBqdXN0IGEgc2ltcGxlIGxpbmspXG5cbiAgICAvLyBUaGUgXCJSZXNvdXJjZXNcIiBidXR0b25cbiAgICAvLyAoaW5pdGlhbGl6ZWQgaW4gdGhlIFwiaW5pdFRvb2x0aXBzKClcIiBmdW5jdGlvbilcblxuICAgIC8vIFRoZSBcIlNldHRpbmdzXCIgYnV0dG9uXG4gICAgLy8gKGluaXRpYWxpemVkIGluIHRoZSBcImluaXRUb29sdGlwcygpXCIgZnVuY3Rpb24pXG5cbiAgICAvLyBUaGUgXCJTaWduIE91dFwiIGJ1dHRvblxuICAgICQoJyNuYXYtYnV0dG9ucy1nYW1lcy1zaWduLW91dCcpLm9uKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnaGFuYWJpdXNlcicpO1xuICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnaGFuYWJpcGFzcycpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgXCJTdGFydCBHYW1lXCIgYnV0dG9uXG4gICAgJCgnI25hdi1idXR0b25zLXByZWdhbWUtc3RhcnQnKS5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKCQoJyNuYXYtYnV0dG9ucy1wcmVnYW1lLXN0YXJ0JykuaGFzQ2xhc3MoJ2Rpc2FibGVkJykpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzLmNvbm4uc2VuZCgnZ2FtZVN0YXJ0Jyk7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgXCJSZXR1cm4gdG8gTG9iYnlcIiBidXR0b24gKGZyb20gdGhlIFwiUHJlZ2FtZVwiIHNjcmVlbilcbiAgICAkKCcjbmF2LWJ1dHRvbnMtcHJlZ2FtZS11bmF0dGVuZCcpLm9uKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsb2JieS5wcmVnYW1lLmhpZGUoKTtcbiAgICAgICAgZ2xvYmFscy5jb25uLnNlbmQoJ2dhbWVVbmF0dGVuZCcpO1xuICAgIH0pO1xuXG4gICAgLy8gVGhlIFwiTGVhdmUgR2FtZVwiIGJ1dHRvblxuICAgICQoJyNuYXYtYnV0dG9ucy1wcmVnYW1lLWxlYXZlJykub24oJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGdsb2JhbHMuY29ubi5zZW5kKCdnYW1lTGVhdmUnKTtcbiAgICB9KTtcblxuICAgIC8vIFwiV2F0Y2ggUmVwbGF5IGJ5IElEXCIgYW5kIFwiU2hhcmUgUmVwbGF5IGJ5IElEXCIgYnV0dG9uc1xuICAgICQoJy5uYXYtYnV0dG9ucy1oaXN0b3J5LWJ5LWlkJykub24oJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IHN1YnR5cGUgPSBldmVudC5jdXJyZW50VGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1kaXNwbGF5Jyk7XG4gICAgICAgIGNvbnN0IHJlcGxheUlEID0gd2luZG93LnByb21wdChgV2hhdCBpcyB0aGUgSUQgb2YgdGhlIGdhbWUgeW91IHdhbnQgdG8gJHtzdWJ0eXBlfT9gKTtcbiAgICAgICAgaWYgKHJlcGxheUlEID09PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBjbGlja2VkIHRoZSBcImNhbmNlbFwiIGJ1dHRvbiwgc28gZG8gbm90aGluZyBlbHNlXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBnbG9iYWxzLmNvbm4uc2VuZChldmVudC5jdXJyZW50VGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZXBsYXlUeXBlJyksIHtcbiAgICAgICAgICAgIGdhbWVJRDogcGFyc2VJbnQocmVwbGF5SUQsIDEwKSxcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgXCJSZXR1cm4gdG8gTG9iYnlcIiBidXR0b24gKGZyb20gdGhlIFwiSGlzdG9yeVwiIHNjcmVlbilcbiAgICAkKCcjbmF2LWJ1dHRvbnMtaGlzdG9yeS1yZXR1cm4nKS5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgbG9iYnkuaGlzdG9yeS5oaWRlKCk7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgXCJSZXR1cm4gdG8gSGlzdG9yeVwiIGJ1dHRvbiAoZnJvbSB0aGUgXCJIaXN0b3J5IERldGFpbHNcIiBzY3JlZW4pXG4gICAgJCgnI25hdi1idXR0b25zLWhpc3RvcnktZGV0YWlscy1yZXR1cm4nKS5vbignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgbG9iYnkuaGlzdG9yeS5oaWRlRGV0YWlscygpO1xuICAgIH0pO1xufSk7XG5cbmNvbnN0IGluaXRUb29sdGlwcyA9ICgpID0+IHtcbiAgICBjb25zdCB0b29sdGlwcyA9IFtcbiAgICAgICAgJ2NyZWF0ZS1nYW1lJyxcbiAgICAgICAgJ3Jlc291cmNlcycsXG4gICAgICAgICdzZXR0aW5ncycsXG4gICAgXTtcblxuICAgIGNvbnN0IHRvb2x0aXBzdGVyT3B0aW9ucyA9IHtcbiAgICAgICAgdGhlbWU6ICd0b29sdGlwc3Rlci1zaGFkb3cnLFxuICAgICAgICB0cmlnZ2VyOiAnY2xpY2snLFxuICAgICAgICBpbnRlcmFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgZGVsYXk6IDAsXG4gICAgICAgIC8qXG4gICAgICAgICAgICBUaGUgXCJjcmVhdGUtZ2FtZVwiIHRvb2x0aXAgaXMgdG9vIGxhcmdlIGZvciB2ZXJ5IHNtYWxsIHJlc29sdXRpb25zIGFuZCB3aWxsIHdyYXAgb2ZmIHRoZVxuICAgICAgICAgICAgc2NyZWVuLiBXZSBjYW4gdXNlIGEgVG9vbHRpcHN0ZXIgcGx1Z2luIHRvIGF1dG9tYXRpY2FsbHkgY3JlYXRlIGEgc2Nyb2xsIGJhciBmb3IgaXQuXG4gICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vbG91aXNhbWVsaW5lL3Rvb2x0aXBzdGVyLXNjcm9sbGFibGVUaXBcbiAgICAgICAgKi9cbiAgICAgICAgcGx1Z2luczogWydzaWRlVGlwJywgJ3Njcm9sbGFibGVUaXAnXSxcbiAgICAgICAgZnVuY3Rpb25CZWZvcmU6ICgpID0+IHtcbiAgICAgICAgICAgICQoJyNsb2JieScpLmZhZGVUbyhnbG9iYWxzLmZhZGVUaW1lLCAwLjQpO1xuICAgICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCB0b29sdGlwc3RlckNsb3NlID0gKCkgPT4ge1xuICAgICAgICAvKlxuICAgICAgICAgICAgV2Ugd2FudCB0byBmYWRlIGluIHRoZSBiYWNrZ3JvdW5kIGFzIHNvb24gYXMgd2Ugc3RhcnQgdGhlIHRvb2x0aXAgY2xvc2luZyBhbmltYXRpb24sXG4gICAgICAgICAgICBzbyB3ZSBoYXZlIHRvIGhvb2sgdG8gdGhlIFwiY2xvc2VcIiBldmVudC4gRnVydGhlcm1vcmUsIHdlIGRvbid0IHdhbnQgdG8gZmFkZSBpbiB0aGVcbiAgICAgICAgICAgIGJhY2tncm91bmQgaWYgd2UgY2xpY2sgZnJvbSBvbmUgdG9vbHRpcCB0byB0aGUgb3RoZXIsIHNvIHdlIGhhdmUgdG8gY2hlY2sgdG8gc2VlIGhvd1xuICAgICAgICAgICAgbWFueSB0b29sdGlwcyBhcmUgb3Blbi4gSWYgb25lIHRvb2x0aXAgaXMgb3BlbiwgdGhlbiBpdCBpcyB0aGUgb25lIGN1cnJlbnRseSBjbG9zaW5nLlxuICAgICAgICAgICAgSWYgdHdvIHRvb2x0aXBzIGFyZSBvcGVuLCB0aGVuIHdlIGFyZSBjbGlja2luZyBmcm9tIG9uZSB0byB0aGUgbmV4dC5cbiAgICAgICAgKi9cbiAgICAgICAgbGV0IHRvb2x0aXBzT3BlbiA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgdG9vbHRpcCBvZiB0b29sdGlwcykge1xuICAgICAgICAgICAgaWYgKCQoYCNuYXYtYnV0dG9ucy1nYW1lcy0ke3Rvb2x0aXB9YCkudG9vbHRpcHN0ZXIoJ3N0YXR1cycpLm9wZW4pIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwc09wZW4gKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodG9vbHRpcHNPcGVuIDw9IDEpIHtcbiAgICAgICAgICAgICQoJyNsb2JieScpLmZhZGVUbyhnbG9iYWxzLmZhZGVUaW1lLCAxKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBNYXAgdGhlIGVzY2FwZSBrZXkgdG8gY2xvc2UgYWxsIHRvb2x0aXBzIC8gbW9kYWxzXG4gICAgJChkb2N1bWVudCkua2V5ZG93bigoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBtaXNjLmNsb3NlQWxsVG9vbHRpcHMoKTtcbiAgICAgICAgICAgIG1vZGFscy5jbG9zZUFsbCgpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgXCJjbG9zZVwiIGV2ZW50IHdpbGwgbm90IGZpcmUgaWYgd2UgaW5pdGlhbGl6ZSB0aGlzIG9uIHRoZSB0b29sdGlwIGNsYXNzIGZvciBzb21lIHJlYXNvbixcbiAgICAvLyBzbyB3ZSBpbml0aWFsaXplIGFsbCAzIGluZGl2aWR1YWxseVxuICAgIGZvciAoY29uc3QgdG9vbHRpcCBvZiB0b29sdGlwcykge1xuICAgICAgICAkKGAjbmF2LWJ1dHRvbnMtZ2FtZXMtJHt0b29sdGlwfWApXG4gICAgICAgICAgICAudG9vbHRpcHN0ZXIodG9vbHRpcHN0ZXJPcHRpb25zKVxuICAgICAgICAgICAgLnRvb2x0aXBzdGVyKCdpbnN0YW5jZScpXG4gICAgICAgICAgICAub24oJ2Nsb3NlJywgdG9vbHRpcHN0ZXJDbG9zZSk7XG4gICAgfVxufTtcblxuZXhwb3J0cy5zaG93ID0gKHRhcmdldCkgPT4ge1xuICAgIGNvbnN0IG5hdlR5cGVzID0gW1xuICAgICAgICAnZ2FtZXMnLFxuICAgICAgICAncHJlZ2FtZScsXG4gICAgICAgICdoaXN0b3J5JyxcbiAgICAgICAgJ2hpc3RvcnktZGV0YWlscycsXG4gICAgXTtcbiAgICBmb3IgKGNvbnN0IG5hdlR5cGUgb2YgbmF2VHlwZXMpIHtcbiAgICAgICAgJChgI25hdi1idXR0b25zLSR7bmF2VHlwZX1gKS5oaWRlKCk7XG4gICAgfVxuICAgIGlmICh0YXJnZXQgIT09ICdub3RoaW5nJykge1xuICAgICAgICAkKGAjbmF2LWJ1dHRvbnMtJHt0YXJnZXR9YCkuc2hvdygpO1xuICAgIH1cbn07XG4iLCIvKlxuICAgVGhlIGxvYmJ5IGFyZWEgdGhhdCBzaG93cyBhbGwgb2YgdGhlIHBsYXllcnMgaW4gdGhlIGN1cnJlbnQgdW5zdGFydGVkIGdhbWVcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuLi9nbG9iYWxzJyk7XG5jb25zdCBjb25zdGFudHMgPSByZXF1aXJlKCcuLi9jb25zdGFudHMnKTtcbmNvbnN0IG1pc2MgPSByZXF1aXJlKCcuLi9taXNjJyk7XG5jb25zdCBsb2JieSA9IHJlcXVpcmUoJy4vbWFpbicpO1xuXG5leHBvcnRzLnNob3cgPSAoKSA9PiB7XG4gICAgLy8gUmVwbGFjZSB0aGUgbGlzdCBvZiBjdXJyZW50IGdhbWVzIHdpdGggYSBsaXN0IG9mIHRoZSBjdXJyZW50IHBsYXllcnNcbiAgICAkKCcjbG9iYnktcHJlZ2FtZScpLnNob3coKTtcbiAgICAkKCcjbG9iYnktZ2FtZXMnKS5oaWRlKCk7XG5cbiAgICAvLyBBZGQgYW4gZXh0cmEgY2hhdCBib3hcbiAgICAkKCcjbG9iYnktY2hhdC1jb250YWluZXInKS5yZW1vdmVDbGFzcygnY29sLTgnKTtcbiAgICAkKCcjbG9iYnktY2hhdC1jb250YWluZXInKS5hZGRDbGFzcygnY29sLTQnKTtcbiAgICAkKCcjbG9iYnktY2hhdC1wcmVnYW1lLWNvbnRhaW5lcicpLnNob3coKTtcblxuICAgIC8vIENsZWFyIHRoZSBwcmVnYW1lIGNoYXQgYm94IG9mIGFueSBwcmV2aW91cyBjb250ZW50XG4gICAgJCgnI2xvYmJ5LWNoYXQtcHJlZ2FtZS10ZXh0JykuaHRtbCgnJyk7XG5cbiAgICAvLyBTY3JvbGwgdG8gdGhlIGJvdHRvbSBvZiBib3RoIHRoZSBsb2JieSBjaGF0IGFuZCB0aGUgcHJlZ2FtZSBjaGF0XG4gICAgLy8gKGV2ZW4gaWYgdGhlIGxvYmJ5IGNoYXQgaXMgYWxyZWFkeSBhdCB0aGUgYm90dG9tLCBpdCB3aWxsIGNoYW5nZSBzaXplIGFuZCBjYXVzZSBpdCB0byBub3RcbiAgICAvLyBiZSBzY3JvbGxlZCBhbGwgdGhlIHdheSBkb3duKVxuICAgIGNvbnN0IGNoYXQxID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYmJ5LWNoYXQtdGV4dCcpO1xuICAgIGNoYXQxLnNjcm9sbFRvcCA9IGNoYXQxLnNjcm9sbEhlaWdodDtcbiAgICBjb25zdCBjaGF0MiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieS1jaGF0LXByZWdhbWUtdGV4dCcpO1xuICAgIGNoYXQyLnNjcm9sbFRvcCA9IGNoYXQyLnNjcm9sbEhlaWdodDtcblxuICAgIC8vIEZvY3VzIHRoZSBwcmVnYW1lIGNoYXRcbiAgICAkKCcjbG9iYnktY2hhdC1wcmVnYW1lLWlucHV0JykuZm9jdXMoKTtcblxuICAgIC8vIEFkanVzdCB0aGUgdG9wIG5hdmlnYXRpb24gYmFyXG4gICAgbG9iYnkubmF2LnNob3coJ3ByZWdhbWUnKTtcbiAgICAkKCcjbmF2LWJ1dHRvbnMtcHJlZ2FtZS1zdGFydCcpLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuICAgIC8vICh0aGUgc2VydmVyIHdpbGwgc2VuZCB1cyBhIFwidGFibGVSZWFkeVwiIG1lc3NhZ2UgbW9tZW50YXJpbHkgaWZcbiAgICAvLyB3ZSBuZWVkIHRvIGVuYWJsZSB0aGUgXCJTdGFydCBHYW1lXCIgYnV0dG9uKVxufTtcblxuZXhwb3J0cy5oaWRlID0gKCkgPT4ge1xuICAgIC8vIFJlcGxhY2UgdGhlIGxpc3Qgb2YgY3VycmVudCBwbGF5ZXJzIHdpdGggYSBsaXN0IG9mIHRoZSBjdXJyZW50IGdhbWVzXG4gICAgJCgnI2xvYmJ5LXByZWdhbWUnKS5oaWRlKCk7XG4gICAgJCgnI2xvYmJ5LWdhbWVzJykuc2hvdygpO1xuXG4gICAgLy8gUmVtb3ZlIHRoZSBleHRyYSBjaGF0IGJveFxuICAgICQoJyNsb2JieS1jaGF0LWNvbnRhaW5lcicpLmFkZENsYXNzKCdjb2wtOCcpO1xuICAgICQoJyNsb2JieS1jaGF0LWNvbnRhaW5lcicpLnJlbW92ZUNsYXNzKCdjb2wtNCcpO1xuICAgICQoJyNsb2JieS1jaGF0LXByZWdhbWUtY29udGFpbmVyJykuaGlkZSgpO1xuXG4gICAgLy8gQWRqdXN0IHRoZSBuYXZpZ2F0aW9uIGJhclxuICAgIGxvYmJ5Lm5hdi5zaG93KCdnYW1lcycpO1xufTtcblxuZXhwb3J0cy5kcmF3ID0gKCkgPT4ge1xuICAgIC8vIFVwZGF0ZSB0aGUgXCJTdGFydCBHYW1lXCIgYnV0dG9uXG4gICAgJCgnI25hdi1idXR0b25zLWdhbWUtc3RhcnQnKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblxuICAgIC8vIFVwZGF0ZSB0aGUgaW5mb3JtYXRpb24gb24gdGhlIGxlZnQtaGFuZCBzaWRlIG9mIHRoZSBzY3JlZW5cbiAgICAkKCcjbG9iYnktcHJlZ2FtZS1uYW1lJykudGV4dChnbG9iYWxzLmdhbWUubmFtZSk7XG4gICAgJCgnI2xvYmJ5LXByZWdhbWUtdmFyaWFudCcpLnRleHQoZ2xvYmFscy5nYW1lLnZhcmlhbnQpO1xuXG4gICAgY29uc3Qgb3B0aW9uc1RpdGxlID0gJCgnI2xvYmJ5LXByZWdhbWUtb3B0aW9ucy10aXRsZScpO1xuICAgIG9wdGlvbnNUaXRsZS50ZXh0KCdPcHRpb25zOicpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSAkKCcjbG9iYnktcHJlZ2FtZS1vcHRpb25zJyk7XG4gICAgb3B0aW9ucy50ZXh0KCcnKTtcbiAgICBpZiAoZ2xvYmFscy5nYW1lLnRpbWVkKSB7XG4gICAgICAgIGxldCB0ZXh0ID0gJ1RpbWVkICgnO1xuICAgICAgICB0ZXh0ICs9IG1pc2MudGltZXJGb3JtYXR0ZXIoZ2xvYmFscy5nYW1lLmJhc2VUaW1lKTtcbiAgICAgICAgdGV4dCArPSAnICsgJztcbiAgICAgICAgdGV4dCArPSBtaXNjLnRpbWVyRm9ybWF0dGVyKGdsb2JhbHMuZ2FtZS50aW1lUGVyVHVybik7XG4gICAgICAgIHRleHQgKz0gJyknO1xuICAgICAgICAkKCc8bGk+JykuaHRtbCh0ZXh0KS5hcHBlbmRUbyhvcHRpb25zKTtcbiAgICB9XG4gICAgaWYgKGdsb2JhbHMuZ2FtZS5kZWNrUGxheXMpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9ICdCb3R0b20tZGVjayBCbGluZCBQbGF5cyc7XG4gICAgICAgICQoJzxsaT4nKS5odG1sKHRleHQpLmFwcGVuZFRvKG9wdGlvbnMpO1xuICAgIH1cbiAgICBpZiAoZ2xvYmFscy5nYW1lLmVtcHR5Q2x1ZXMpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9ICdFbXB0eSBDbHVlcyc7XG4gICAgICAgICQoJzxsaT4nKS5odG1sKHRleHQpLmFwcGVuZFRvKG9wdGlvbnMpO1xuICAgIH1cbiAgICBpZiAoZ2xvYmFscy5nYW1lLmNoYXJhY3RlckFzc2lnbm1lbnRzKSB7XG4gICAgICAgIGNvbnN0IHRleHQgPSAnQ2hhcmFjdGVyIEFzc2lnbm1lbnRzJztcbiAgICAgICAgJCgnPGxpPicpLmh0bWwodGV4dCkuYXBwZW5kVG8ob3B0aW9ucyk7XG4gICAgfVxuICAgIGlmIChnbG9iYWxzLmdhbWUucGFzc3dvcmQpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9ICdQYXNzd29yZC1wcm90ZWN0ZWQnO1xuICAgICAgICAkKCc8bGk+JykuaHRtbCh0ZXh0KS5hcHBlbmRUbyhvcHRpb25zKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudGV4dCgpID09PSAnJykge1xuICAgICAgICBvcHRpb25zVGl0bGUudGV4dCgnJyk7XG4gICAgfVxuXG4gICAgLy8gRHJhdyB0aGUgcGxheWVyIGJveGVzXG4gICAgY29uc3QgbnVtUGxheWVycyA9IGdsb2JhbHMuZ2FtZS5wbGF5ZXJzLmxlbmd0aDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSA1OyBpKyspIHtcbiAgICAgICAgY29uc3QgZGl2ID0gJChgI2xvYmJ5LXByZWdhbWUtcGxheWVyLSR7KGkgKyAxKX1gKTtcblxuICAgICAgICBjb25zdCBwbGF5ZXIgPSBnbG9iYWxzLmdhbWUucGxheWVyc1tpXTtcbiAgICAgICAgaWYgKCFwbGF5ZXIpIHtcbiAgICAgICAgICAgIGRpdi5odG1sKCcnKTtcbiAgICAgICAgICAgIGRpdi5oaWRlKCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRpdi5zaG93KCk7XG5cbiAgICAgICAgbGV0IGh0bWwgPSBgXG4gICAgICAgICAgICA8cCBjbGFzcz1cIm1hcmdpbjAgcGFkZGluZzBwNVwiPlxuICAgICAgICAgICAgICAgIDxzdHJvbmc+JHtwbGF5ZXIubmFtZX08L3N0cm9uZz5cbiAgICAgICAgICAgIDwvcD5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBUaGVyZSBpcyBub3QgZW5vdWdoIHJvb20gdG8gZHJhdyB0aGUgZnVsbCBib3ggZm9yIDYgcGxheWVyc1xuICAgICAgICBpZiAobnVtUGxheWVycyA9PT0gNikge1xuICAgICAgICAgICAgZGl2LnJlbW92ZUNsYXNzKCdjb2wtMicpO1xuICAgICAgICAgICAgZGl2LmFkZENsYXNzKCdsb2JieS1wcmVnYW1lLWNvbCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGl2LmFkZENsYXNzKCdjb2wtMicpO1xuICAgICAgICAgICAgZGl2LnJlbW92ZUNsYXNzKCdsb2JieS1wcmVnYW1lLWNvbCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHNvbWUgc3RhdHNcbiAgICAgICAgY29uc3QgYXZlcmFnZVNjb3JlID0gTWF0aC5yb3VuZChwbGF5ZXIuc3RhdHMuYXZlcmFnZVNjb3JlICogMTAwKSAvIDEwMDtcbiAgICAgICAgLy8gKHJvdW5kIGl0IHRvIDIgZGVjaW1hbCBwbGFjZXMpXG4gICAgICAgIGxldCBzdHJpa2VvdXRSYXRlID0gcGxheWVyLnN0YXRzLnN0cmlrZW91dFJhdGUgKiAxMDA7XG4gICAgICAgIC8vICh0dXJuIGl0IGludG8gYSBwZXJjZW50KVxuICAgICAgICBzdHJpa2VvdXRSYXRlID0gTWF0aC5yb3VuZChzdHJpa2VvdXRSYXRlICogMTAwKSAvIDEwMDtcbiAgICAgICAgLy8gKHJvdW5kIGl0IHRvIDIgZGVjaW1hbCBwbGFjZXMpXG4gICAgICAgIGNvbnN0IG1heFNjb3JlID0gNSAqIGNvbnN0YW50cy5WQVJJQU5UU1tnbG9iYWxzLmdhbWUudmFyaWFudF0uc3VpdHMubGVuZ3RoO1xuXG4gICAgICAgIGh0bWwgKz0gYFxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtMTBcIj5cbiAgICAgICAgICAgICAgICAgICAgVG90YWwgZ2FtZXM6XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC0yIGFsaWduLXJpZ2h0IHBhZGRpbmcwXCI+XG4gICAgICAgICAgICAgICAgICAgICR7cGxheWVyLnN0YXRzLm51bVBsYXllZEFsbH1cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtMTBcIj5cbiAgICAgICAgICAgICAgICAgICAgLi4ub2YgdGhpcyB2YXJpYW50OlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtMiBhbGlnbi1yaWdodCBwYWRkaW5nMFwiPlxuICAgICAgICAgICAgICAgICAgICAke3BsYXllci5zdGF0cy5udW1QbGF5ZWR9XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLTEwXCI+XG4gICAgICAgICAgICAgICAgICAgIEF2ZXJhZ2Ugc2NvcmU6XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC0yIGFsaWduLXJpZ2h0IHBhZGRpbmcwXCI+XG4gICAgICAgICAgICAgICAgICAgICR7YXZlcmFnZVNjb3JlfVxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC0xMFwiPlxuICAgICAgICAgICAgICAgICAgICBTdHJpa2VvdXQgcmF0ZTpcbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLTIgYWxpZ24tcmlnaHQgcGFkZGluZzBcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtzdHJpa2VvdXRSYXRlfSVcbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgICBpZiAobnVtUGxheWVycyA+IDEpIHtcbiAgICAgICAgICAgIGh0bWwgKz0gYFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC0xMFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgJHtudW1QbGF5ZXJzfS1wbGF5ZXIgYmVzdCBzY29yZTpcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtMiBhbGlnbi1yaWdodCBwYWRkaW5nMFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgJHtwbGF5ZXIuc3RhdHMuYmVzdFNjb3Jlc1tudW1QbGF5ZXJzIC0gMl0uc2NvcmV9XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfVxuICAgICAgICBodG1sICs9IGBcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLTEwXCI+XG4gICAgICAgICAgICAgICAgICAgICR7bnVtUGxheWVycyA9PT0gMSA/ICdCJyA6ICdPdGhlciBiJ31lc3Qgc2NvcmVzOlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtMiBhbGlnbi1yaWdodCBwYWRkaW5nMFwiPlxuICAgICAgICAgICAgICAgICAgICA8aSBpZD1cImxvYmJ5LXByZWdhbWUtcGxheWVyLSR7aSArIDF9LXNjb3Jlcy1pY29uXCIgY2xhc3M9XCJmYXMgZmEtY2hhcnQtYXJlYSBncmVlblwiIGRhdGEtdG9vbHRpcC1jb250ZW50PVwiI2xvYmJ5LXByZWdhbWUtcGxheWVyLSR7aSArIDF9LXRvb2x0aXBcIj48L2k+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoaWRkZW5cIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwibG9iYnktcHJlZ2FtZS1wbGF5ZXItJHtpICsgMX0tdG9vbHRpcFwiIGNsYXNzPVwibG9iYnktcHJlZ2FtZS10b29sdGlwXCI+XG4gICAgICAgIGA7XG4gICAgICAgIGZvciAobGV0IGogPSAyOyBqIDw9IDY7IGorKykge1xuICAgICAgICAgICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cInJvd1wiPic7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwiY29sLTZcIj4ke2p9LXBsYXllcjo8L2Rpdj5gO1xuICAgICAgICAgICAgY29uc3QgYmVzdFNjb3JlT2JqZWN0ID0gcGxheWVyLnN0YXRzLmJlc3RTY29yZXNbaiAtIDJdO1xuICAgICAgICAgICAgY29uc3QgYmVzdFNjb3JlID0gYmVzdFNjb3JlT2JqZWN0LnNjb3JlO1xuICAgICAgICAgICAgY29uc3QgYmVzdFNjb3JlTW9kID0gYmVzdFNjb3JlT2JqZWN0Lm1vZGlmaWVyO1xuICAgICAgICAgICAgaHRtbCArPSAnPGRpdiBjbGFzcz1cImNvbC02XCI+JztcbiAgICAgICAgICAgIGlmIChiZXN0U2NvcmUgPT09IG1heFNjb3JlKSB7XG4gICAgICAgICAgICAgICAgaHRtbCArPSAnPHN0cm9uZz4nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaHRtbCArPSBgICR7YmVzdFNjb3JlfSAvICR7bWF4U2NvcmV9YDtcbiAgICAgICAgICAgIGlmIChiZXN0U2NvcmUgPT09IG1heFNjb3JlKSB7XG4gICAgICAgICAgICAgICAgaHRtbCArPSAnPC9zdHJvbmc+ICZuYnNwOyAnO1xuICAgICAgICAgICAgICAgIGlmIChiZXN0U2NvcmVNb2QgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaHRtbCArPSAnPGkgY2xhc3M9XCJmYXMgZmEtY2hlY2sgc2NvcmUtbW9kaWZpZXIgZ3JlZW5cIj48L2k+JztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBodG1sICs9ICc8aSBjbGFzcz1cImZhcyBmYS10aW1lcyBzY29yZS1tb2RpZmllciByZWRcIj48L2k+JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBodG1sICs9ICc8L2Rpdj48L2Rpdj4nO1xuICAgICAgICB9XG4gICAgICAgIGh0bWwgKz0gYFxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG4gICAgICAgIGlmICghcGxheWVyLnByZXNlbnQpIHtcbiAgICAgICAgICAgIGh0bWwgKz0gJzxwIGNsYXNzPVwibG9iYnktcHJlZ2FtZS1wbGF5ZXItYXdheVwiPjxzdHJvbmc+QVdBWTwvc3Ryb25nPjwvcD4nO1xuICAgICAgICB9XG5cbiAgICAgICAgZGl2Lmh0bWwoaHRtbCk7XG5cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgdG9vbHRpcFxuICAgICAgICAkKGAjbG9iYnktcHJlZ2FtZS1wbGF5ZXItJHtpICsgMX0tc2NvcmVzLWljb25gKS50b29sdGlwc3Rlcih7XG4gICAgICAgICAgICBhbmltYXRpb246ICdncm93JyxcbiAgICAgICAgICAgIGNvbnRlbnRBc0hUTUw6IHRydWUsXG4gICAgICAgICAgICBkZWxheTogMCxcbiAgICAgICAgICAgIHRoZW1lOiBbXG4gICAgICAgICAgICAgICAgJ3Rvb2x0aXBzdGVyLXNoYWRvdycsXG4gICAgICAgICAgICAgICAgJ3Rvb2x0aXBzdGVyLXNoYWRvdy1iaWcnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgfVxufTtcbiIsIi8qXG4gICAgVGhlIFwiU2V0dGluZ3NcIiBuYXYgYnV0dG9uXG4qL1xuXG4vLyBJbXBvcnRzXG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi4vZ2xvYmFscycpO1xuY29uc3Qgbm90aWZpY2F0aW9ucyA9IHJlcXVpcmUoJy4uL25vdGlmaWNhdGlvbnMnKTtcblxuLy8gRWxlbWVudCAwIGlzIHRoZSBIVE1MIElEXG4vLyBFbGVtZW50IDEgaXMgdGhlIGNvb2tpZSBrZXlcbmNvbnN0IHNldHRpbmdzTGlzdCA9IFtcbiAgICBbXG4gICAgICAgIC8vIFNob3cgZGVza3RvcCBub3RpZmljYXRpb25zIHdoZW4gaXQgcmVhY2hlcyB5b3VyIHR1cm5cbiAgICAgICAgJ3NlbmQtdHVybi1ub3RpZmljYXRpb24nLFxuICAgICAgICAnc2VuZFR1cm5Ob3RpZnknLFxuICAgIF0sXG4gICAgW1xuICAgICAgICAvLyBQbGF5IHNvdW5kcyB3aGVuIGEgbW92ZSBpcyBtYWRlXG4gICAgICAgICdzZW5kLXR1cm4tc291bmQnLFxuICAgICAgICAnc2VuZFR1cm5Tb3VuZCcsXG4gICAgXSxcbiAgICBbXG4gICAgICAgIC8vIFBsYXkgdGlja2luZyBzb3VuZHMgd2hlbiB0aW1lcnMgYXJlIGJlbG93IDUgc2Vjb25kc1xuICAgICAgICAnc2VuZC10aW1lci1zb3VuZCcsXG4gICAgICAgICdzZW5kVGltZXJTb3VuZCcsXG4gICAgXSxcbiAgICBbXG4gICAgICAgIC8vIEVuYWJsZSBCb2FyZCBHYW1lIEFyZW5hIG1vZGUgKGhhbmRzIGdyb3VwZWQgdG9nZXRoZXIpXG4gICAgICAgICdzaG93LWJnYS11aScsXG4gICAgICAgICdzaG93QkdBVUknLFxuICAgIF0sXG4gICAgW1xuICAgICAgICAvLyBFbmFibGUgY29sb3JibGluZCBtb2RlXG4gICAgICAgICdzaG93LWNvbG9yYmxpbmQtdWknLFxuICAgICAgICAnc2hvd0NvbG9yYmxpbmRVSScsXG4gICAgXSxcbiAgICBbXG4gICAgICAgIC8vIFNob3cgdHVybiB0aW1lcnMgaW4gdW50aW1lZCBnYW1lc1xuICAgICAgICAnc2hvdy10aW1lci1pbi11bnRpbWVkJyxcbiAgICAgICAgJ3Nob3dUaW1lckluVW50aW1lZCcsXG4gICAgXSxcbiAgICBbXG4gICAgICAgIC8vIFJldmVyc2UgaGFuZCBkaXJlY3Rpb24gKG5ldyBjYXJkcyBnbyBvbiB0aGUgcmlnaHQpXG4gICAgICAgICdyZXZlcnNlLWhhbmRzJyxcbiAgICAgICAgJ3JldmVyc2VIYW5kcycsXG4gICAgXSxcbiAgICBbXG4gICAgICAgIC8vIEVuYWJsZSBwcmUtcGxheWluZyBjYXJkc1xuICAgICAgICAnc3BlZWRydW4tcHJlcGxheScsXG4gICAgICAgICdzcGVlZHJ1blByZXBsYXknLFxuICAgIF0sXG5dO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZXR0aW5nc0xpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgaHRtbElEID0gc2V0dGluZ3NMaXN0W2ldWzBdO1xuICAgICAgICBjb25zdCBjb29raWVLZXkgPSBzZXR0aW5nc0xpc3RbaV1bMV07XG5cbiAgICAgICAgLy8gR2V0IHRoaXMgc2V0dGluZyBmcm9tIGxvY2FsIHN0b3JhZ2VcbiAgICAgICAgbGV0IGNvb2tpZVZhbHVlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oY29va2llS2V5KTtcblxuICAgICAgICBpZiAodHlwZW9mIGNvb2tpZVZhbHVlID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgY29va2llVmFsdWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgY29va2llIGRvZXNuJ3QgZXhpc3QgKG9yIGl0IGlzIGNvcnJ1cHQpLCB3cml0ZSBhIGRlZmF1bHQgdmFsdWVcbiAgICAgICAgICAgIGNvb2tpZVZhbHVlID0gZ2xvYmFscy5zZXR0aW5nc1tjb29raWVLZXldO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oY29va2llS2V5LCBjb29raWVWYWx1ZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgV3JvdGUgYSBicmFuZCBuZXcgXCIke2Nvb2tpZUtleX1cIiBjb29raWUgb2Y6ICR7Y29va2llVmFsdWV9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDb252ZXJ0IGl0IGZyb20gYSBzdHJpbmcgdG8gYSBib29sZWFuXG4gICAgICAgICAgICAvLyAoYWxsIHZhbHVlcyBpbiBjb29raWVzIGFyZSBzdHJpbmdzKVxuICAgICAgICAgICAgY29va2llVmFsdWUgPSAoY29va2llVmFsdWUgPT09ICd0cnVlJyk7XG5cbiAgICAgICAgICAgIC8vIFdyaXRlIHRoZSB2YWx1ZSBvZiB0aGUgY29va2llIHRvIG91ciBsb2NhbCB2YXJpYWJsZVxuICAgICAgICAgICAgZ2xvYmFscy5zZXR0aW5nc1tjb29raWVLZXldID0gY29va2llVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgJChgIyR7aHRtbElEfWApLmF0dHIoJ2NoZWNrZWQnLCBjb29raWVWYWx1ZSk7XG5cbiAgICAgICAgJChgIyR7aHRtbElEfWApLmNoYW5nZShjaGFuZ2VTZXR0aW5nKTtcbiAgICB9XG59KTtcblxuZnVuY3Rpb24gY2hhbmdlU2V0dGluZygpIHtcbiAgICAvLyBGaW5kIHRoZSBsb2NhbCB2YXJpYWJsZSBuYW1lIHRoYXQgaXMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgSFRNTCBJRFxuICAgIGZvciAobGV0IGogPSAwOyBqIDwgc2V0dGluZ3NMaXN0Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGNvbnN0IHRoaXNIdG1sSUQgPSBzZXR0aW5nc0xpc3Rbal1bMF07XG4gICAgICAgIGNvbnN0IHRoaXNDb29raWVLZXkgPSBzZXR0aW5nc0xpc3Rbal1bMV07XG4gICAgICAgIGlmICh0aGlzSHRtbElEID09PSAkKHRoaXMpLmF0dHIoJ2lkJykpIHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAkKHRoaXMpLmlzKCc6Y2hlY2tlZCcpO1xuXG4gICAgICAgICAgICAvLyBXcml0ZSB0aGUgbmV3IHZhbHVlIHRvIG91ciBsb2NhbCB2YXJpYWJsZVxuICAgICAgICAgICAgZ2xvYmFscy5zZXR0aW5nc1t0aGlzQ29va2llS2V5XSA9IGNoZWNrZWQ7XG5cbiAgICAgICAgICAgIC8vIEFsc28gc3RvcmUgdGhlIG5ldyB2YWx1ZSBpbiBsb2NhbHN0b3JhZ2VcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKHRoaXNDb29raWVLZXksIGNoZWNrZWQpO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgV3JvdGUgYSBcIiR7dGhpc0Nvb2tpZUtleX1cIiBjb29raWUgb2Y6ICR7Y2hlY2tlZH1gKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGdsb2JhbHMuc2V0dGluZ3Muc2VuZFR1cm5Ob3RpZnkpIHtcbiAgICAgICAgbm90aWZpY2F0aW9ucy50ZXN0KCk7XG4gICAgfVxufVxuIiwiLypcbiAgIFRoZSBsb2JieSBhcmVhIHRoYXQgc2hvd3MgYWxsIG9mIHRoZSBjdXJyZW50IHRhYmxlc1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcbmNvbnN0IG1pc2MgPSByZXF1aXJlKCcuLi9taXNjJyk7XG5jb25zdCBtb2RhbHMgPSByZXF1aXJlKCcuLi9tb2RhbHMnKTtcbmNvbnN0IGxvYmJ5ID0gcmVxdWlyZSgnLi9tYWluJyk7XG5cbmV4cG9ydHMuZHJhdyA9ICgpID0+IHtcbiAgICBjb25zdCB0Ym9keSA9ICQoJyNsb2JieS1nYW1lcy10YWJsZS10Ym9keScpO1xuXG4gICAgLy8gQ2xlYXIgYWxsIG9mIHRoZSBleGlzdGluZyByb3dzXG4gICAgdGJvZHkuaHRtbCgnJyk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoZ2xvYmFscy50YWJsZUxpc3QpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAkKCcjbG9iYnktZ2FtZXMtbm8nKS5zaG93KCk7XG4gICAgICAgICQoJyNsb2JieS1nYW1lcycpLmFkZENsYXNzKCdhbGlnbi1jZW50ZXItdicpO1xuICAgICAgICAkKCcjbG9iYnktZ2FtZXMtdGFibGUtY29udGFpbmVyJykuaGlkZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgICQoJyNsb2JieS1nYW1lcy1ubycpLmhpZGUoKTtcbiAgICAkKCcjbG9iYnktZ2FtZXMnKS5yZW1vdmVDbGFzcygnYWxpZ24tY2VudGVyLXYnKTtcbiAgICAkKCcjbG9iYnktZ2FtZXMtdGFibGUtY29udGFpbmVyJykuc2hvdygpO1xuXG4gICAgLy8gQWRkIGFsbCBvZiB0aGUgZ2FtZXNcbiAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIE9iamVjdC52YWx1ZXMoZ2xvYmFscy50YWJsZUxpc3QpKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9ICQoJzx0cj4nKTtcblxuICAgICAgICAvLyBDb2x1bW4gMSAtIE5hbWVcbiAgICAgICAgJCgnPHRkPicpLmh0bWwodGFibGUubmFtZSkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gMiAtICMgb2YgUGxheWVyc1xuICAgICAgICAkKCc8dGQ+JykuaHRtbCh0YWJsZS5udW1QbGF5ZXJzKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiAzIC0gVmFyaWFudFxuICAgICAgICAkKCc8dGQ+JykuaHRtbCh0YWJsZS52YXJpYW50KS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA0IC0gVGltZWRcbiAgICAgICAgbGV0IHRpbWVkID0gJ05vJztcbiAgICAgICAgaWYgKHRhYmxlLnRpbWVkKSB7XG4gICAgICAgICAgICB0aW1lZCA9IGAke21pc2MudGltZXJGb3JtYXR0ZXIodGFibGUuYmFzZVRpbWUpfSArICR7bWlzYy50aW1lckZvcm1hdHRlcih0YWJsZS50aW1lUGVyVHVybil9YDtcbiAgICAgICAgfVxuICAgICAgICAkKCc8dGQ+JykuaHRtbCh0aW1lZCkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gNSAtIFN0YXR1c1xuICAgICAgICBsZXQgc3RhdHVzO1xuICAgICAgICBpZiAodGFibGUuc2hhcmVkUmVwbGF5KSB7XG4gICAgICAgICAgICBzdGF0dXMgPSAnU2hhcmVkIFJlcGxheSc7XG4gICAgICAgIH0gZWxzZSBpZiAodGFibGUucnVubmluZyAmJiB0YWJsZS5qb2luZWQpIHtcbiAgICAgICAgICAgIGlmICh0YWJsZS5vdXJUdXJuKSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzID0gJzxzdHJvbmc+WW91ciBUdXJuPC9zdHJvbmc+JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzID0gJ1dhaXRpbmcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRhYmxlLnJ1bm5pbmcpIHtcbiAgICAgICAgICAgIHN0YXR1cyA9ICdSdW5uaW5nJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXR1cyA9ICdOb3QgU3RhcnRlZCc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0YXR1cyAhPT0gJ05vdCBTdGFydGVkJykge1xuICAgICAgICAgICAgc3RhdHVzICs9IGAgKCR7dGFibGUucHJvZ3Jlc3N9JSlgO1xuICAgICAgICB9XG4gICAgICAgICQoJzx0ZD4nKS5odG1sKHN0YXR1cykuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICAvLyBDb2x1bW4gNiAtIEFjdGlvblxuICAgICAgICBjb25zdCBidXR0b24gPSAkKCc8YnV0dG9uPicpLmF0dHIoJ3R5cGUnLCAnYnV0dG9uJykuYWRkQ2xhc3MoJ2J1dHRvbiBzbWFsbCBtYXJnaW4wJyk7XG4gICAgICAgIGlmICh0YWJsZS5zaGFyZWRSZXBsYXkgfHwgKCF0YWJsZS5qb2luZWQgJiYgdGFibGUucnVubmluZykpIHtcbiAgICAgICAgICAgIGJ1dHRvbi5odG1sKCc8aSBjbGFzcz1cImZhcyBmYS1leWUgbG9iYnktYnV0dG9uLWljb25cIj48L2k+Jyk7XG4gICAgICAgICAgICBidXR0b24uYXR0cignaWQnLCBgc3BlY3RhdGUtJHt0YWJsZS5pZH1gKTtcbiAgICAgICAgICAgIGJ1dHRvbi5vbignY2xpY2snLCB0YWJsZVNwZWN0YXRlQnV0dG9uKHRhYmxlKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoIXRhYmxlLmpvaW5lZCkge1xuICAgICAgICAgICAgYnV0dG9uLmh0bWwoJzxpIGNsYXNzPVwiZmFzIGZhLXNpZ24taW4tYWx0IGxvYmJ5LWJ1dHRvbi1pY29uXCI+PC9pPicpO1xuICAgICAgICAgICAgYnV0dG9uLmF0dHIoJ2lkJywgYGpvaW4tJHt0YWJsZS5pZH1gKTtcbiAgICAgICAgICAgIGlmICh0YWJsZS5udW1QbGF5ZXJzID49IDYpIHtcbiAgICAgICAgICAgICAgICBidXR0b24uYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBidXR0b24ub24oJ2NsaWNrJywgdGFibGVKb2luQnV0dG9uKHRhYmxlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBidXR0b24uaHRtbCgnPGkgY2xhc3M9XCJmYXMgZmEtcGxheSBsb2JieS1idXR0b24taWNvblwiPjwvaT4nKTtcbiAgICAgICAgICAgIGJ1dHRvbi5hdHRyKCdpZCcsIGByZXN1bWUtJHt0YWJsZS5pZH1gKTtcbiAgICAgICAgICAgIGJ1dHRvbi5vbignY2xpY2snLCB0YWJsZVJlYXR0ZW5kQnV0dG9uKHRhYmxlKSk7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHRkPicpLmh0bWwoYnV0dG9uKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA3IC0gQWJhbmRvblxuICAgICAgICBsZXQgYnV0dG9uMiA9ICduL2EnO1xuICAgICAgICBpZiAodGFibGUuam9pbmVkICYmICh0YWJsZS5vd25lZCB8fCB0YWJsZS5ydW5uaW5nKSAmJiAhdGFibGUuc2hhcmVkUmVwbGF5KSB7XG4gICAgICAgICAgICBidXR0b24yID0gJCgnPGJ1dHRvbj4nKS5hdHRyKCd0eXBlJywgJ2J1dHRvbicpLmFkZENsYXNzKCdidXR0b24gc21hbGwgbWFyZ2luMCcpO1xuICAgICAgICAgICAgYnV0dG9uMi5odG1sKCc8aSBjbGFzcz1cImZhcyBmYS10aW1lcyBsb2JieS1idXR0b24taWNvblwiPjwvaT4nKTtcbiAgICAgICAgICAgIGJ1dHRvbjIuYXR0cignaWQnLCBgYWJhbmRvbi0ke3RhYmxlLmlkfWApO1xuICAgICAgICAgICAgYnV0dG9uMi5vbignY2xpY2snLCB0YWJsZUFiYW5kb25CdXR0b24odGFibGUpKTtcbiAgICAgICAgfVxuICAgICAgICAkKCc8dGQ+JykuaHRtbChidXR0b24yKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA4IC0gUGxheWVyc1xuICAgICAgICAkKCc8dGQ+JykuaHRtbCh0YWJsZS5wbGF5ZXJzKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIC8vIENvbHVtbiA5IC0gU3BlY3RhdG9yc1xuICAgICAgICAkKCc8dGQ+JykuaHRtbCh0YWJsZS5zcGVjdGF0b3JzKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIHJvdy5hcHBlbmRUbyh0Ym9keSk7XG4gICAgfVxufTtcblxuY29uc3QgdGFibGVTcGVjdGF0ZUJ1dHRvbiA9IHRhYmxlID0+IChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZ2xvYmFscy5nYW1lSUQgPSB0YWJsZS5pZDtcbiAgICBnbG9iYWxzLmNvbm4uc2VuZCgnZ2FtZVNwZWN0YXRlJywge1xuICAgICAgICBnYW1lSUQ6IHRhYmxlLmlkLFxuICAgIH0pO1xuICAgIGxvYmJ5LnRhYmxlcy5kcmF3KCk7XG59O1xuXG5jb25zdCB0YWJsZUpvaW5CdXR0b24gPSB0YWJsZSA9PiAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgaWYgKHRhYmxlLnBhc3N3b3JkKSB7XG4gICAgICAgIG1vZGFscy5wYXNzd29yZFNob3codGFibGUuaWQpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZ2xvYmFscy5nYW1lSUQgPSB0YWJsZS5pZDtcbiAgICBnbG9iYWxzLmNvbm4uc2VuZCgnZ2FtZUpvaW4nLCB7XG4gICAgICAgIGdhbWVJRDogdGFibGUuaWQsXG4gICAgfSk7XG4gICAgbG9iYnkudGFibGVzLmRyYXcoKTtcbn07XG5cbmNvbnN0IHRhYmxlUmVhdHRlbmRCdXR0b24gPSB0YWJsZSA9PiAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGdsb2JhbHMuZ2FtZUlEID0gdGFibGUuaWQ7XG4gICAgZ2xvYmFscy5jb25uLnNlbmQoJ2dhbWVSZWF0dGVuZCcsIHtcbiAgICAgICAgZ2FtZUlEOiB0YWJsZS5pZCxcbiAgICB9KTtcbiAgICBsb2JieS50YWJsZXMuZHJhdygpO1xufTtcblxuY29uc3QgdGFibGVBYmFuZG9uQnV0dG9uID0gdGFibGUgPT4gKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGlmICh0YWJsZS5ydW5uaW5nKSB7XG4gICAgICAgIGlmICghd2luZG93LmNvbmZpcm0oJ0FyZSB5b3Ugc3VyZT8gVGhpcyB3aWxsIGNhbmNlbCB0aGUgZ2FtZSBmb3IgYWxsIHBsYXllcnMuJykpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdsb2JhbHMuZ2FtZUlEID0gbnVsbDtcbiAgICBnbG9iYWxzLmNvbm4uc2VuZCgnZ2FtZUFiYW5kb24nLCB7XG4gICAgICAgIGdhbWVJRDogdGFibGUuaWQsXG4gICAgfSk7XG59O1xuIiwiLypcbiAgICBBIHNob3J0IHR1dG9yaWFsIGlzIHNob3duIHRvIGJyYW5kLW5ldyB1c2Vyc1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcbmNvbnN0IGxvZ2luID0gcmVxdWlyZSgnLi9sb2dpbicpO1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgJCgnI3R1dG9yaWFsLXllcycpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTEnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC0yJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICAkKCcjdHV0b3JpYWwtbm8nKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICQoJyN0dXRvcmlhbCcpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgbG9naW4uaGlkZShmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJCgnI3R1dG9yaWFsLTIteWVzJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAkKCcjdHV0b3JpYWwtMicpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgJCgnI3R1dG9yaWFsLTItMScpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgJCgnI3R1dG9yaWFsLTItbm8nKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICQoJyN0dXRvcmlhbC0yJykuZmFkZU91dChnbG9iYWxzLmZhZGVUaW1lLCAoKSA9PiB7XG4gICAgICAgICAgICAkKCcjdHV0b3JpYWwtMi0yJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICQoJyN0dXRvcmlhbC0yLTEtb2snKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICQoJyN0dXRvcmlhbC0yLTEnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC0zJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICAkKCcjdHV0b3JpYWwtMi0yLW9rJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAkKCcjdHV0b3JpYWwtMi0yJykuZmFkZU91dChnbG9iYWxzLmZhZGVUaW1lLCAoKSA9PiB7XG4gICAgICAgICAgICAkKCcjdHV0b3JpYWwtMycpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAkKCcjdHV0b3JpYWwtMy15ZXMnKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICQoJyN0dXRvcmlhbC0zJykuZmFkZU91dChnbG9iYWxzLmZhZGVUaW1lLCAoKSA9PiB7XG4gICAgICAgICAgICAkKCcjdHV0b3JpYWwtMy0xJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICAkKCcjdHV0b3JpYWwtMy1ubycpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTMnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC00JykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICQoJyN0dXRvcmlhbC0zLTEtb2snKS5vbignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICQoJyN0dXRvcmlhbC0zLTEnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC01JykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICQoJyN0dXRvcmlhbC00LWNhc3VhbCcpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC00LTEnKS5mYWRlSW4oZ2xvYmFscy5mYWRlVGltZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgICQoJyN0dXRvcmlhbC00LWV4cGVydCcpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgICQoJyN0dXRvcmlhbC00LTInKS5mYWRlSW4oZ2xvYmFscy5mYWRlVGltZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJCgnI3R1dG9yaWFsLTQtMS1sb2JieScpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQtMScpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgbG9naW4uaGlkZShmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJCgnI3R1dG9yaWFsLTQtMi1vaycpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQtMicpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgJCgnI3R1dG9yaWFsLTQtMycpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgJCgnI3R1dG9yaWFsLTQtMi1sb2JieScpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQtMicpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgbG9naW4uaGlkZShmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJCgnI3R1dG9yaWFsLTQtMy1vaycpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTQtMycpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSwgKCkgPT4ge1xuICAgICAgICAgICAgJCgnI3R1dG9yaWFsLTQtNCcpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAkKCcjdHV0b3JpYWwtNC00LW9rJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAkKCcjdHV0b3JpYWwtNC00JykuZmFkZU91dChnbG9iYWxzLmZhZGVUaW1lLCAoKSA9PiB7XG4gICAgICAgICAgICAkKCcjdHV0b3JpYWwtNScpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAkKCcjdHV0b3JpYWwtNS1sb2JieScpLm9uKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgJCgnI3R1dG9yaWFsLTUnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUsICgpID0+IHtcbiAgICAgICAgICAgIGxvZ2luLmhpZGUoZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn0pO1xuIiwiLypcbiAgIFRoZSBsb2JieSBhcmVhIHRoYXQgc2hvd3MgYWxsIG9mIHRoZSBjdXJyZW50IGxvZ2dlZC1pbiB1c2Vyc1xuKi9cblxuLy8gSW1wb3J0c1xuY29uc3QgZ2xvYmFscyA9IHJlcXVpcmUoJy4uL2dsb2JhbHMnKTtcblxuZXhwb3J0cy5kcmF3ID0gKCkgPT4ge1xuICAgICQoJyNsb2JieS11c2Vycy1udW0nKS50ZXh0KE9iamVjdC5rZXlzKGdsb2JhbHMudXNlckxpc3QpLmxlbmd0aCk7XG5cbiAgICBjb25zdCB0Ym9keSA9ICQoJyNsb2JieS11c2Vycy10YWJsZS10Ym9keScpO1xuXG4gICAgLy8gQ2xlYXIgYWxsIG9mIHRoZSBleGlzdGluZyByb3dzXG4gICAgdGJvZHkuaHRtbCgnJyk7XG5cbiAgICAvLyBBZGQgYWxsIG9mIHRoZSB1c2Vyc1xuICAgIGZvciAoY29uc3QgdXNlciBvZiBPYmplY3QudmFsdWVzKGdsb2JhbHMudXNlckxpc3QpKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9ICQoJzx0cj4nKTtcblxuICAgICAgICBsZXQgeyBuYW1lIH0gPSB1c2VyO1xuICAgICAgICBuYW1lID0gYDxhIGhyZWY9XCIvc2NvcmVzLyR7bmFtZX1cIiB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+JHtuYW1lfTwvYT5gO1xuICAgICAgICBpZiAodXNlci5uYW1lID09PSBnbG9iYWxzLnVzZXJuYW1lKSB7XG4gICAgICAgICAgICBuYW1lID0gYDxzdHJvbmc+JHtuYW1lfTwvc3Ryb25nPmA7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHRkPicpLmh0bWwobmFtZSkuYXBwZW5kVG8ocm93KTtcblxuICAgICAgICBjb25zdCB7IHN0YXR1cyB9ID0gdXNlcjtcbiAgICAgICAgJCgnPHRkPicpLmh0bWwoc3RhdHVzKS5hcHBlbmRUbyhyb3cpO1xuXG4gICAgICAgIHJvdy5hcHBlbmRUbyh0Ym9keSk7XG4gICAgfVxufTtcbiIsIi8qXG4gICAgVGhlIG1haW4gZW50cnkgcG9pbnQgZm9yIHRoZSBIYW5hYmkgY2xpZW50IGNvZGVcbiovXG5cbi8vIEJyb3dzZXJpZnkgaXMgdXNlZCB0byBoYXZlIE5vZGUuanMtc3R5bGUgaW1wb3J0c1xuLy8gKGFsbG93aW5nIHRoZSBjbGllbnQgY29kZSB0byBiZSBzcGxpdCB1cCBpbnRvIG11bHRpcGxlIGZpbGVzKVxucmVxdWlyZSgnLi9nYW1lL21haW4nKTtcbnJlcXVpcmUoJy4vbG9iYnkvbWFpbicpO1xucmVxdWlyZSgnLi9tb2RhbHMnKTtcbiIsIi8qXG4gICAgQSBjb2xsZWN0aW9uIG9mIG1pc2NlbGxhbmVvdXMgZnVuY3Rpb25zXG4qL1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG4gICAgLy8gRGV0ZWN0IGlmIGFuIGVsZW1lbnQgaXMgb2ZmIHNjcmVlblxuICAgIC8vIGUuZy4gaWYgKCQoJyNhc2RmJykuaXMoJzpvZmZzY3JlZW4nKSlcbiAgICBqUXVlcnkuZXhwci5maWx0ZXJzLm9mZnNjcmVlbiA9IChlbCkgPT4ge1xuICAgICAgICBjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHJldHVybiByZWN0LnRvcCA8IDEgLy8gQWJvdmUgdGhlIHRvcFxuICAgICAgICAgICAgfHwgcmVjdC5ib3R0b20gPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSA1IC8vIEJlbG93IHRoZSBib3R0b21cbiAgICAgICAgICAgIHx8IHJlY3QubGVmdCA8IDEgLy8gTGVmdCBvZiB0aGUgbGVmdCBlZGdlXG4gICAgICAgICAgICB8fCByZWN0LnJpZ2h0ID4gd2luZG93LmlubmVyV2lkdGggLSA1OyAvLyBSaWdodCBvZiB0aGUgcmlnaHQgZWRnZVxuICAgICAgICAvLyBXZSBtb2RpZnkgdGhlIHRvcC9sZWZ0IGJ5IDEgYW5kIHRoZSBib3R0b20vcmlnaHQgYnkgNVxuICAgICAgICAvLyB0byBwcmV2ZW50IHNjcm9sbCBiYXJzIGZyb20gYXBwZWFyaW5nXG4gICAgfTtcbn0pO1xuXG5leHBvcnRzLmNsb3NlQWxsVG9vbHRpcHMgPSAoKSA9PiB7XG4gICAgLy8gRnJvbTogaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjc3MDk0ODkvanF1ZXJ5LXRvb2x0aXBzdGVyLXBsdWdpbi1oaWRlLWFsbC10aXBzXG4gICAgY29uc3QgaW5zdGFuY2VzID0gJC50b29sdGlwc3Rlci5pbnN0YW5jZXMoKTtcbiAgICAkLmVhY2goaW5zdGFuY2VzLCAoaSwgaW5zdGFuY2UpID0+IHtcbiAgICAgICAgaWYgKGluc3RhbmNlLnN0YXR1cygpLm9wZW4pIHtcbiAgICAgICAgICAgIGluc3RhbmNlLmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn07XG5cbmV4cG9ydHMudGltZXJGb3JtYXR0ZXIgPSAobWlsbGlzZWNvbmRzKSA9PiB7XG4gICAgaWYgKCFtaWxsaXNlY29uZHMpIHtcbiAgICAgICAgbWlsbGlzZWNvbmRzID0gMDtcbiAgICB9XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKCk7XG4gICAgdGltZS5zZXRIb3VycygwLCAwLCAwLCBtaWxsaXNlY29uZHMpO1xuICAgIGNvbnN0IG1pbnV0ZXMgPSB0aW1lLmdldE1pbnV0ZXMoKTtcbiAgICBjb25zdCBzZWNvbmRzID0gdGltZS5nZXRTZWNvbmRzKCk7XG4gICAgY29uc3Qgc2Vjb25kc0Zvcm1hdHRlZCA9IHNlY29uZHMgPCAxMCA/IGAwJHtzZWNvbmRzfWAgOiBzZWNvbmRzO1xuICAgIHJldHVybiBgJHttaW51dGVzfToke3NlY29uZHNGb3JtYXR0ZWR9YDtcbn07XG4iLCIvKlxuICAgIE1vZGFscyAoYm94ZXMgdGhhdCBob3ZlciBvdmVydG9wIHRoZSBVSSlcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdsb2JhbHMgPSByZXF1aXJlKCcuL2dsb2JhbHMnKTtcbmNvbnN0IG1pc2MgPSByZXF1aXJlKCcuL21pc2MnKTtcbmNvbnN0IGxvYmJ5ID0gcmVxdWlyZSgnLi9sb2JieS9tYWluJyk7XG5jb25zdCBnYW1lID0gcmVxdWlyZSgnLi9nYW1lL21haW4nKTtcblxuLy8gVGhlIGxpc3Qgb2YgYWxsIG9mIHRoZSBtb2RhbHNcbmNvbnN0IG1vZGFscyA9IFtcbiAgICAncGFzc3dvcmQnLFxuICAgIC8vIFwid2FybmluZ1wiIGFuZCBcImVycm9yXCIgYXJlIGludGVudGlvbmFsbHkgb21pdHRlZCwgYXMgdGhleSBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5XG5dO1xuXG4vLyBJbml0aWFsaXplIHRoZSBtb2RhbHNcbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcbiAgICAvLyBBbGwgbW9kYWxzXG4gICAgZm9yIChjb25zdCBtb2RhbCBvZiBtb2RhbHMpIHtcbiAgICAgICAgJChgIyR7bW9kYWx9LW1vZGFsLWNhbmNlbGApLmNsaWNrKGNsb3NlQWxsKTtcbiAgICB9XG5cbiAgICAvLyBQYXNzd29yZFxuICAgICQoJyNwYXNzd29yZC1tb2RhbC1wYXNzd29yZCcpLm9uKCdrZXlwcmVzcycsIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJCgnI3Bhc3N3b3JkLW1vZGFsLXN1Ym1pdCcpLmNsaWNrKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICAkKCcjcGFzc3dvcmQtbW9kYWwtc3VibWl0JykuY2xpY2socGFzc3dvcmRTdWJtaXQpO1xuXG4gICAgLy8gV2FybmluZ1xuICAgICQoJyN3YXJuaW5nLW1vZGFsLWJ1dHRvbicpLmNsaWNrKCgpID0+IHtcbiAgICAgICAgJCgnI3dhcm5pbmctbW9kYWwnKS5mYWRlT3V0KGdsb2JhbHMuZmFkZVRpbWUpO1xuICAgICAgICBpZiAoJCgnI2xvYmJ5JykuaXMoJzp2aXNpYmxlJykpIHtcbiAgICAgICAgICAgICQoJyNsb2JieScpLmZhZGVUbyhnbG9iYWxzLmZhZGVUaW1lLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoJCgnI2dhbWUnKS5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAgICAgJCgnI2dhbWUnKS5mYWRlVG8oZ2xvYmFscy5mYWRlVGltZSwgMSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEVycm9yXG4gICAgJCgnI2Vycm9yLW1vZGFsLWJ1dHRvbicpLmNsaWNrKCgpID0+IHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0pO1xufSk7XG5cbmV4cG9ydHMucGFzc3dvcmRTaG93ID0gKGdhbWVJRCkgPT4ge1xuICAgICQoJyNsb2JieScpLmZhZGVUbyhnbG9iYWxzLmZhZGVUaW1lLCAwLjI1KTtcbiAgICBtaXNjLmNsb3NlQWxsVG9vbHRpcHMoKTtcblxuICAgICQoJyNwYXNzd29yZC1tb2RhbC1pZCcpLnZhbChnYW1lSUQpO1xuICAgICQoJyNwYXNzd29yZC1tb2RhbCcpLmZhZGVJbihnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICAkKCcjcGFzc3dvcmQtbW9kYWwtcGFzc3dvcmQnKS5mb2N1cygpO1xufTtcblxuY29uc3QgcGFzc3dvcmRTdWJtaXQgPSAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICQoJyNwYXNzd29yZC1tb2RhbCcpLmZhZGVPdXQoZ2xvYmFscy5mYWRlVGltZSk7XG4gICAgJCgnI2xvYmJ5JykuZmFkZVRvKGdsb2JhbHMuZmFkZVRpbWUsIDEpO1xuICAgIGNvbnN0IGdhbWVJRCA9IHBhcnNlSW50KCQoJyNwYXNzd29yZC1tb2RhbC1pZCcpLnZhbCgpLCAxMCk7IC8vIFRoZSBzZXJ2ZXIgZXhwZWN0cyB0aGlzIGFzIGEgbnVtYmVyXG4gICAgY29uc3QgcGFzc3dvcmRQbGFpbnRleHQgPSAkKCcjcGFzc3dvcmQtbW9kYWwtcGFzc3dvcmQnKS52YWwoKTtcbiAgICBjb25zdCBwYXNzd29yZCA9IGhleF9zaGEyNTYoYEhhbmFiaSBnYW1lIHBhc3N3b3JkICR7cGFzc3dvcmRQbGFpbnRleHR9YCk7XG4gICAgZ2xvYmFscy5jb25uLnNlbmQoJ2dhbWVKb2luJywge1xuICAgICAgICBnYW1lSUQsXG4gICAgICAgIHBhc3N3b3JkLFxuICAgIH0pO1xufTtcblxuZXhwb3J0cy53YXJuaW5nU2hvdyA9IChtc2cpID0+IHtcbiAgICBpZiAoJCgnI2xvYmJ5JykuaXMoJzp2aXNpYmxlJykpIHtcbiAgICAgICAgJCgnI2xvYmJ5JykuZmFkZVRvKGdsb2JhbHMuZmFkZVRpbWUsIDAuMjUpO1xuICAgIH1cbiAgICBpZiAoJCgnI2dhbWUnKS5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAkKCcjZ2FtZScpLmZhZGVUbyhnbG9iYWxzLmZhZGVUaW1lLCAwLjI1KTtcbiAgICB9XG4gICAgbWlzYy5jbG9zZUFsbFRvb2x0aXBzKCk7XG4gICAgZ2FtZS5jaGF0LmhpZGUoKTtcblxuICAgICQoJyN3YXJuaW5nLW1vZGFsLWRlc2NyaXB0aW9uJykuaHRtbChtc2cpO1xuICAgICQoJyN3YXJuaW5nLW1vZGFsJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xufTtcblxuZXhwb3J0cy5lcnJvclNob3cgPSAobXNnKSA9PiB7XG4gICAgLy8gRG8gbm90aGluZyBpZiB3ZSBhcmUgYWxyZWFkeSBzaG93aW5nIHRoZSBlcnJvciBtb2RhbFxuICAgIGlmIChnbG9iYWxzLmVycm9yT2NjdXJlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGdsb2JhbHMuZXJyb3JPY2N1cmVkID0gdHJ1ZTtcblxuICAgIGlmICgkKCcjbG9iYnknKS5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAkKCcjbG9iYnknKS5mYWRlVG8oZ2xvYmFscy5mYWRlVGltZSwgMC4xKTtcbiAgICB9XG4gICAgaWYgKCQoJyNnYW1lJykuaXMoJzp2aXNpYmxlJykpIHtcbiAgICAgICAgJCgnI2dhbWUnKS5mYWRlVG8oZ2xvYmFscy5mYWRlVGltZSwgMC4xKTtcbiAgICB9XG4gICAgbWlzYy5jbG9zZUFsbFRvb2x0aXBzKCk7XG4gICAgZ2FtZS5jaGF0LmhpZGUoKTtcblxuICAgIC8vIENsZWFyIG91dCB0aGUgdG9wIG5hdmlnYXRpb24gYnV0dG9uc1xuICAgIGxvYmJ5Lm5hdi5zaG93KCdub3RoaW5nJyk7XG5cbiAgICAkKCcjZXJyb3ItbW9kYWwtZGVzY3JpcHRpb24nKS5odG1sKG1zZyk7XG4gICAgJCgnI2Vycm9yLW1vZGFsJykuZmFkZUluKGdsb2JhbHMuZmFkZVRpbWUpO1xufTtcblxuY29uc3QgY2xvc2VBbGwgPSAoKSA9PiB7XG4gICAgZm9yIChjb25zdCBtb2RhbCBvZiBtb2RhbHMpIHtcbiAgICAgICAgJChgIyR7bW9kYWx9LW1vZGFsYCkuZmFkZU91dChnbG9iYWxzLmZhZGVUaW1lKTtcbiAgICB9XG4gICAgJCgnI2xvYmJ5JykuZmFkZVRvKGdsb2JhbHMuZmFkZVRpbWUsIDEpO1xufTtcbmV4cG9ydHMuY2xvc2VBbGwgPSBjbG9zZUFsbDtcbiIsIi8qXG4gICAgVGhlIHNpdGUgaGFzIHRoZSBhYmlsaXR5IHRvIHNlbmQgKG9wdGlvbmFsKSBub3RpZmljYXRpb25zXG4qL1xuXG5leHBvcnRzLnRlc3QgPSAoKSA9PiB7XG4gICAgaWYgKCEoJ05vdGlmaWNhdGlvbicgaW4gd2luZG93KSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChOb3RpZmljYXRpb24ucGVybWlzc2lvbiAhPT0gJ2RlZmF1bHQnKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBOb3RpZmljYXRpb24ucmVxdWVzdFBlcm1pc3Npb24oKTtcbn07XG5cbmV4cG9ydHMuc2VuZCA9IChtc2csIHRhZykgPT4ge1xuICAgIGlmICghKCdOb3RpZmljYXRpb24nIGluIHdpbmRvdykpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gIT09ICdncmFudGVkJykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbmV3IE5vdGlmaWNhdGlvbihgSGFuYWJpOiAke21zZ31gLCB7IC8qIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tbmV3ICovXG4gICAgICAgIHRhZyxcbiAgICB9KTtcbn07XG4iLCIvKlxuICAgIENvbW11bmljYXRpb24gd2l0aCB0aGUgc2VydmVyIGlzIGRvbmUgdGhyb3VnaCB0aGUgV2ViU29ja2V0IHByb3RvY29sXG4gICAgVGhlIGNsaWVudCB1c2VzIGEgc2xpZ2h0bHkgbW9kaWZpZWQgdmVyc2lvbiBvZiB0aGUgR29sZW0gV2ViU29ja2V0IGxpYnJhcnlcbiovXG5cbi8vIEltcG9ydHNcbmNvbnN0IGdvbGVtID0gcmVxdWlyZSgnLi4vbGliL2dvbGVtJyk7XG5jb25zdCBnbG9iYWxzID0gcmVxdWlyZSgnLi9nbG9iYWxzJyk7XG5jb25zdCBtb2RhbHMgPSByZXF1aXJlKCcuL21vZGFscycpO1xuY29uc3QgY2hhdCA9IHJlcXVpcmUoJy4vY2hhdCcpO1xuY29uc3QgbG9iYnkgPSByZXF1aXJlKCcuL2xvYmJ5L21haW4nKTtcbmNvbnN0IGdhbWUgPSByZXF1aXJlKCcuL2dhbWUvbWFpbicpO1xuXG5leHBvcnRzLnNldCA9ICgpID0+IHtcbiAgICAvLyBDb25uZWN0IHRvIHRoZSBXZWJTb2NrZXQgc2VydmVyXG4gICAgbGV0IHdlYnNvY2tldFVSTCA9ICd3cyc7XG4gICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2h0dHBzOicpIHtcbiAgICAgICAgd2Vic29ja2V0VVJMICs9ICdzJztcbiAgICB9XG4gICAgd2Vic29ja2V0VVJMICs9ICc6Ly8nO1xuICAgIHdlYnNvY2tldFVSTCArPSB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWU7XG4gICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5wb3J0ICE9PSAnJykge1xuICAgICAgICB3ZWJzb2NrZXRVUkwgKz0gJzonO1xuICAgICAgICB3ZWJzb2NrZXRVUkwgKz0gd2luZG93LmxvY2F0aW9uLnBvcnQ7XG4gICAgfVxuICAgIHdlYnNvY2tldFVSTCArPSAnL3dzJztcbiAgICBjb25zb2xlLmxvZygnQ29ubmVjdGluZyB0byB3ZWJzb2NrZXQgVVJMOicsIHdlYnNvY2tldFVSTCk7XG4gICAgZ2xvYmFscy5jb25uID0gbmV3IGdvbGVtLkNvbm5lY3Rpb24od2Vic29ja2V0VVJMLCB0cnVlKTtcbiAgICAvLyBUaGlzIHdpbGwgYXV0b21hdGljYWxseSB1c2UgdGhlIGNvb2tpZSB0aGF0IHdlIHJlY2lldmVkIGVhcmxpZXIgZnJvbSB0aGUgUE9TVFxuICAgIC8vIElmIHRoZSBzZWNvbmQgYXJndW1lbnQgaXMgdHJ1ZSwgZGVidWdnaW5nIGlzIHR1cm5lZCBvblxuXG4gICAgLy8gRGVmaW5lIGV2ZW50IGhhbmRsZXJzXG4gICAgZ2xvYmFscy5jb25uLm9uKCdvcGVuJywgKCkgPT4ge1xuICAgICAgICAvLyBXZSB3aWxsIHNob3cgdGhlIGxvYmJ5IHVwb24gcmVjaWV2aW5nIHRoZSBcImhlbGxvXCIgY29tbWFuZCBmcm9tIHRoZSBzZXJ2ZXJcbiAgICAgICAgY29uc29sZS5sb2coJ1dlYlNvY2tldCBjb25uZWN0aW9uIGVzdGFibGlzaGVkLicpO1xuICAgIH0pO1xuICAgIGdsb2JhbHMuY29ubi5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdXZWJTb2NrZXQgY29ubmVjdGlvbiBkaXNjb25uZWN0ZWQgLyBjbG9zZWQuJyk7XG4gICAgICAgIG1vZGFscy5lcnJvclNob3coJ0Rpc2Nvbm5lY3RlZCBmcm9tIHRoZSBzZXJ2ZXIuIEVpdGhlciB5b3VyIEludGVybmV0IGhpY2N1cGVkIG9yIHRoZSBzZXJ2ZXIgcmVzdGFydGVkLicpO1xuICAgIH0pO1xuICAgIGdsb2JhbHMuY29ubi5vbignc29ja2V0RXJyb3InLCAoZXZlbnQpID0+IHtcbiAgICAgICAgLy8gXCJzb2NrZXRFcnJvclwiIGlzIGRlZmluZWQgaW4gXCJnb2xlbS5qc1wiIGFzIG1hcHBpbmcgdG8gdGhlIFdlYlNvY2tldCBcIm9uZXJyb3JcIiBldmVudFxuICAgICAgICBjb25zb2xlLmVycm9yKCdXZWJTb2NrZXQgZXJyb3I6JywgZXZlbnQpO1xuXG4gICAgICAgIGlmICgkKCcjbG9naW5ib3gnKS5pcygnOnZpc2libGUnKSkge1xuICAgICAgICAgICAgbG9iYnkubG9naW4uZm9ybUVycm9yKCdGYWlsZWQgdG8gY29ubmVjdCB0byB0aGUgV2ViU29ja2V0IHNlcnZlci4gVGhlIHNlcnZlciBtaWdodCBiZSBkb3duIScpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBbGwgb2YgdGhlIG5vcm1hbCBjb21tYW5kcy9tZXNzYWdlcyB0aGF0IHdlIGV4cGVjdCBmcm9tIHRoZSBzZXJ2ZXIgYXJlIGRlZmluZWQgaW4gdGhlXG4gICAgLy8gXCJpbml0Q29tbWFuZHMoKVwiIGZ1bmN0aW9uXG4gICAgaW5pdENvbW1hbmRzKCk7XG5cbiAgICBnbG9iYWxzLmNvbm4uc2VuZCA9IChjb21tYW5kLCBkYXRhKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGRhdGEgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ2xvYmFscy5kZWJ1Zykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCVjU2VudCAke2NvbW1hbmR9OmAsICdjb2xvcjogZ3JlZW47Jyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhkYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBnbG9iYWxzLmNvbm4uZW1pdChjb21tYW5kLCBkYXRhKTtcbiAgICB9O1xuXG4gICAgLy8gU2VuZCBhbnkgY2xpZW50IGVycm9ycyB0byB0aGUgc2VydmVyIGZvciB0cmFja2luZyBwdXJwb3Nlc1xuICAgIHdpbmRvdy5vbmVycm9yID0gKG1lc3NhZ2UsIHVybCwgbGluZW5vLCBjb2xubykgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHJlcG9ydCBlcnJvcnMgaWYgc29tZW9uZSBpcyBkb2luZyBsb2NhbCBkZXZlbG9wbWVudFxuICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLmhvc3RuYW1lID09PSAnbG9jYWxob3N0Jykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGdsb2JhbHMuY29ubi5lbWl0KCdjbGllbnRFcnJvcicsIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgICAgICAgIHVybCxcbiAgICAgICAgICAgICAgICBsaW5lbm8sXG4gICAgICAgICAgICAgICAgY29sbm8sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gdHJhbnNtaXQgdGhlIGVycm9yIHRvIHRoZSBzZXJ2ZXI6JywgZXJyKTtcbiAgICAgICAgfVxuICAgIH07XG59O1xuXG4vLyBUaGlzIGlzIGFsbCBvZiB0aGUgbm9ybWFsIGNvbW1hbmRzL21lc3NhZ2VzIHRoYXQgd2UgZXhwZWN0IHRvIHJlY2VpdmUgZnJvbSB0aGUgc2VydmVyXG5jb25zdCBpbml0Q29tbWFuZHMgPSAoKSA9PiB7XG4gICAgZ2xvYmFscy5jb25uLm9uKCdoZWxsbycsIChkYXRhKSA9PiB7XG4gICAgICAgIGdsb2JhbHMudXNlcm5hbWUgPSBkYXRhLnVzZXJuYW1lO1xuICAgICAgICBnbG9iYWxzLnRvdGFsR2FtZXMgPSBkYXRhLnRvdGFsR2FtZXM7XG4gICAgICAgICQoJyNuYXYtYnV0dG9ucy1oaXN0b3J5LXRvdGFsLWdhbWVzJykuaHRtbChnbG9iYWxzLnRvdGFsR2FtZXMpO1xuICAgICAgICBsb2JieS5sb2dpbi5oaWRlKGRhdGEuZmlyc3RUaW1lVXNlcik7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ3VzZXInLCAoZGF0YSkgPT4ge1xuICAgICAgICBnbG9iYWxzLnVzZXJMaXN0W2RhdGEuaWRdID0gZGF0YTtcbiAgICAgICAgbG9iYnkudXNlcnMuZHJhdygpO1xuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCd1c2VyTGVmdCcsIChkYXRhKSA9PiB7XG4gICAgICAgIGRlbGV0ZSBnbG9iYWxzLnVzZXJMaXN0W2RhdGEuaWRdO1xuICAgICAgICBsb2JieS51c2Vycy5kcmF3KCk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ3RhYmxlJywgKGRhdGEpID0+IHtcbiAgICAgICAgLy8gVGhlIGJhc2VUaW1lIGFuZCB0aW1lUGVyVHVybiBjb21lIGluIHNlY29uZHMsIHNvIGNvbnZlcnQgdGhlbSB0byBtaWxsaXNlY29uZHNcbiAgICAgICAgZGF0YS5iYXNlVGltZSAqPSAxMDAwO1xuICAgICAgICBkYXRhLnRpbWVQZXJUdXJuICo9IDEwMDA7XG5cbiAgICAgICAgZ2xvYmFscy50YWJsZUxpc3RbZGF0YS5pZF0gPSBkYXRhO1xuICAgICAgICBsb2JieS50YWJsZXMuZHJhdygpO1xuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCd0YWJsZUdvbmUnLCAoZGF0YSkgPT4ge1xuICAgICAgICBkZWxldGUgZ2xvYmFscy50YWJsZUxpc3RbZGF0YS5pZF07XG4gICAgICAgIGxvYmJ5LnRhYmxlcy5kcmF3KCk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ2NoYXQnLCAoZGF0YSkgPT4ge1xuICAgICAgICBjaGF0LmFkZChkYXRhLCBmYWxzZSk7IC8vIFRoZSBzZWNvbmQgYXJndW1lbnQgaXMgXCJmYXN0XCJcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgZGF0YS5yb29tID09PSAnZ2FtZSdcbiAgICAgICAgICAgICYmIGdsb2JhbHMudWkgIT09IG51bGxcbiAgICAgICAgICAgICYmICEkKCcjZ2FtZS1jaGF0LW1vZGFsJykuaXMoJzp2aXNpYmxlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBpZiAoZ2xvYmFscy51aS5nbG9iYWxzLnNwZWN0YXRpbmcgJiYgIWdsb2JhbHMudWkuZ2xvYmFscy5zaGFyZWRSZXBsYXkpIHtcbiAgICAgICAgICAgICAgICAvLyBQb3AgdXAgdGhlIGNoYXQgd2luZG93IGV2ZXJ5IHRpbWUgZm9yIHNwZWN0YXRvcnNcbiAgICAgICAgICAgICAgICBnbG9iYWxzLnVpLnRvZ2dsZUNoYXQoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90IHBvcCB1cCB0aGUgY2hhdCB3aW5kb3cgYnkgZGVmYXVsdDtcbiAgICAgICAgICAgICAgICAvLyBpbnN0ZWFkLCBjaGFuZ2UgdGhlIFwiQ2hhdFwiIGJ1dHRvbiB0byBzYXkgXCJDaGF0ICgxKVwiXG4gICAgICAgICAgICAgICAgZ2xvYmFscy5jaGF0VW5yZWFkICs9IDE7XG4gICAgICAgICAgICAgICAgZ2xvYmFscy51aS51cGRhdGVDaGF0TGFiZWwoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gVGhlIFwiY2hhdExpc3RcIiBjb21tYW5kIGlzIHNlbnQgdXBvbiBpbml0aWFsIGNvbm5lY3Rpb25cbiAgICAvLyB0byBnaXZlIHRoZSBjbGllbnQgYSBsaXN0IG9mIHBhc3QgbG9iYnkgY2hhdCBtZXNzYWdlc1xuICAgIC8vIEl0IGlzIGFsc28gc2VudCB1cG9uIGNvbm5lY3RpbmcgdG8gYSBnYW1lIHRvIGdpdmUgYSBsaXN0IG9mIHBhc3QgaW4tZ2FtZSBjaGF0IG1lc3NhZ2VzXG4gICAgZ2xvYmFscy5jb25uLm9uKCdjaGF0TGlzdCcsIChkYXRhKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBkYXRhLmxpc3QpIHtcbiAgICAgICAgICAgIGNoYXQuYWRkKGxpbmUsIHRydWUpOyAvLyBUaGUgc2Vjb25kIGFyZ3VtZW50IGlzIFwiZmFzdFwiXG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgLy8gSWYgdGhlIFVJIGlzIG9wZW4sIHdlIGFzc3VtZSB0aGF0IHRoaXMgaXMgYSBsaXN0IG9mIGluLWdhbWUgY2hhdCBtZXNzYWdlc1xuICAgICAgICAgICAgZ2xvYmFscy51aSAhPT0gbnVsbFxuICAgICAgICAgICAgJiYgISQoJyNnYW1lLWNoYXQtbW9kYWwnKS5pcygnOnZpc2libGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIGdsb2JhbHMuY2hhdFVucmVhZCArPSBkYXRhLnVucmVhZDtcbiAgICAgICAgICAgIGdsb2JhbHMudWkudXBkYXRlQ2hhdExhYmVsKCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGdsb2JhbHMuY29ubi5vbignam9pbmVkJywgKGRhdGEpID0+IHtcbiAgICAgICAgLy8gV2Ugam9pbmVkIGEgbmV3IGdhbWUsIHNvIHRyYW5zaXRpb24gYmV0d2VlbiBzY3JlZW5zXG4gICAgICAgIGdsb2JhbHMuZ2FtZUlEID0gZGF0YS5nYW1lSUQ7XG4gICAgICAgIGxvYmJ5LnRhYmxlcy5kcmF3KCk7XG4gICAgICAgIGxvYmJ5LnByZWdhbWUuc2hvdygpO1xuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCdsZWZ0JywgKCkgPT4ge1xuICAgICAgICAvLyBXZSBsZWZ0IGEgdGFibGUsIHNvIHRyYW5zaXRpb24gYmV0d2VlbiBzY3JlZW5zXG4gICAgICAgIGdsb2JhbHMuZ2FtZUlEID0gbnVsbDtcbiAgICAgICAgbG9iYnkudGFibGVzLmRyYXcoKTtcbiAgICAgICAgbG9iYnkucHJlZ2FtZS5oaWRlKCk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ2dhbWUnLCAoZGF0YSkgPT4ge1xuICAgICAgICBnbG9iYWxzLmdhbWUgPSBkYXRhO1xuXG4gICAgICAgIC8vIFRoZSBiYXNlVGltZSBhbmQgdGltZVBlclR1cm4gY29tZSBpbiBzZWNvbmRzLCBzbyBjb252ZXJ0IHRoZW0gdG8gbWlsbGlzZWNvbmRzXG4gICAgICAgIGdsb2JhbHMuZ2FtZS5iYXNlVGltZSAqPSAxMDAwO1xuICAgICAgICBnbG9iYWxzLmdhbWUudGltZVBlclR1cm4gKj0gMTAwMDtcblxuICAgICAgICBsb2JieS5wcmVnYW1lLmRyYXcoKTtcbiAgICB9KTtcblxuICAgIGdsb2JhbHMuY29ubi5vbigndGFibGVSZWFkeScsIChkYXRhKSA9PiB7XG4gICAgICAgIGlmIChkYXRhLnJlYWR5KSB7XG4gICAgICAgICAgICAkKCcjbmF2LWJ1dHRvbnMtcHJlZ2FtZS1zdGFydCcpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJCgnI25hdi1idXR0b25zLXByZWdhbWUtc3RhcnQnKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCdnYW1lU3RhcnQnLCAoZGF0YSkgPT4ge1xuICAgICAgICBpZiAoIWRhdGEucmVwbGF5KSB7XG4gICAgICAgICAgICBsb2JieS5wcmVnYW1lLmhpZGUoKTtcbiAgICAgICAgfVxuICAgICAgICBnYW1lLnNob3coZGF0YS5yZXBsYXkpO1xuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCdnYW1lSGlzdG9yeScsIChkYXRhQXJyYXkpID0+IHtcbiAgICAgICAgLy8gZGF0YSB3aWxsIGJlIGFuIGFycmF5IG9mIGFsbCBvZiB0aGUgZ2FtZXMgdGhhdCB3ZSBoYXZlIHByZXZpb3VzbHkgcGxheWVkXG4gICAgICAgIGZvciAoY29uc3QgZGF0YSBvZiBkYXRhQXJyYXkpIHtcbiAgICAgICAgICAgIGdsb2JhbHMuaGlzdG9yeUxpc3RbZGF0YS5pZF0gPSBkYXRhO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5pbmNyZW1lbnROdW1HYW1lcykge1xuICAgICAgICAgICAgICAgIGdsb2JhbHMudG90YWxHYW1lcyArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlIHNlcnZlciBzZW50IHVzIG1vcmUgZ2FtZXMgYmVjYXVzZVxuICAgICAgICAvLyB3ZSBjbGlja2VkIG9uIHRoZSBcIlNob3cgTW9yZSBIaXN0b3J5XCIgYnV0dG9uXG4gICAgICAgIGlmIChnbG9iYWxzLmhpc3RvcnlDbGlja2VkKSB7XG4gICAgICAgICAgICBnbG9iYWxzLmhpc3RvcnlDbGlja2VkID0gZmFsc2U7XG4gICAgICAgICAgICBsb2JieS5oaXN0b3J5LmRyYXcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNob3duR2FtZXMgPSBPYmplY3Qua2V5cyhnbG9iYWxzLmhpc3RvcnlMaXN0KS5sZW5ndGg7XG4gICAgICAgICQoJyNuYXYtYnV0dG9ucy1oaXN0b3J5LXNob3duLWdhbWVzJykuaHRtbChzaG93bkdhbWVzKTtcbiAgICAgICAgJCgnI25hdi1idXR0b25zLWhpc3RvcnktdG90YWwtZ2FtZXMnKS5odG1sKGdsb2JhbHMudG90YWxHYW1lcyk7XG4gICAgICAgIGlmIChzaG93bkdhbWVzID09PSBnbG9iYWxzLnRvdGFsR2FtZXMpIHtcbiAgICAgICAgICAgICQoJyNsb2JieS1oaXN0b3J5LXNob3ctbW9yZScpLmhpZGUoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZ2xvYmFscy5jb25uLm9uKCdoaXN0b3J5RGV0YWlsJywgKGRhdGEpID0+IHtcbiAgICAgICAgZ2xvYmFscy5oaXN0b3J5RGV0YWlsTGlzdC5wdXNoKGRhdGEpO1xuICAgICAgICBsb2JieS5oaXN0b3J5LmRyYXdEZXRhaWxzKCk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ3NvdW5kJywgKGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGdsb2JhbHMuc2V0dGluZ3Muc2VuZFR1cm5Tb3VuZCAmJiBnbG9iYWxzLmN1cnJlbnRTY3JlZW4gPT09ICdnYW1lJykge1xuICAgICAgICAgICAgZ2FtZS5zb3VuZHMucGxheShkYXRhLmZpbGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ25hbWUnLCAoZGF0YSkgPT4ge1xuICAgICAgICBnbG9iYWxzLnJhbmRvbU5hbWUgPSBkYXRhLm5hbWU7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ3dhcm5pbmcnLCAoZGF0YSkgPT4ge1xuICAgICAgICBjb25zb2xlLndhcm4oZGF0YS53YXJuaW5nKTtcbiAgICAgICAgbW9kYWxzLndhcm5pbmdTaG93KGRhdGEud2FybmluZyk7XG4gICAgfSk7XG5cbiAgICBnbG9iYWxzLmNvbm4ub24oJ2Vycm9yJywgKGRhdGEpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihkYXRhLmVycm9yKTtcbiAgICAgICAgbW9kYWxzLmVycm9yU2hvdyhkYXRhLmVycm9yKTtcblxuICAgICAgICAvLyBEaXNjb25uZWN0IGZyb20gdGhlIHNlcnZlciwgaWYgY29ubmVjdGVkXG4gICAgICAgIGlmICghZ2xvYmFscy5jb25uKSB7XG4gICAgICAgICAgICBnbG9iYWxzLmNvbm4uY2xvc2UoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gVGhlcmUgYXJlIHlldCBtb3JlIGNvbW1hbmQgaGFuZGxlcnMgZm9yIGV2ZW50cyB0aGF0IGhhcHBlbiBpbi1nYW1lXG4gICAgLy8gVGhlc2Ugd2lsbCBvbmx5IGhhdmUgYW4gZWZmZWN0IGlmIHRoZSBjdXJyZW50IHNjcmVlbiBpcyBlcXVhbCB0byBcImdhbWVcIlxuICAgIGdhbWUud2Vic29ja2V0LmluaXQoKTtcbn07XG4iXX0=
