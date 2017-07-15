"use strict";

var MHGA_show_debug_messages = true;
var MHGA_show_more_log = true;
var MHGA_show_log_numbers = true;
var MHGA_show_faces_in_replay = true;
var MHGA_highlight_non_hand_cards = true;
var MHGA_show_slot_nums = false;
var MHGA_show_no_clues_box = true;

function HanabiUI(lobby, game_id) {

this.lobby = lobby;
this.game_id = game_id;

var cardw = 286;
var cardh = 406;

var ui = this;

var ACT = constants.ACT;
var CLUE = constants.CLUE;
var VARIANT = constants.VARIANT;

this.deck = [];

this.player_us = -1;
this.player_names = [];
this.variant = 0;
this.replay = false;
this.replay_only = false;
this.spectating = false;
this.replay_max = 0;
this.animate_fast = true;
this.ready = false;
//in replays, we can show a grayed-out version of a card face if it was not known at the time, but we know it now.
//these are cards we have "learned"
this.learned_cards = [];

this.activeHover = null;

this.timed_game = false;
this.timebank_seconds = 0; // Unused
this.timebank_overtime = 0; // Unused
this.last_timer_update_time_ms = new Date().getTime();

this.player_times = [];
this.timerId = null;

/*
    Keyboard shortcuts
*/

this.keyboard_action = null;
this.keyboard_clue_player = null;

function keyboard_do_action(ui, slot) {
    if (ui.keyboard_action === 'play') {
        keyboard_play(ui, slot);
        ui.keyboard_action = null;

    } else if (ui.keyboard_action === 'discard') {
        keyboard_discard(ui, slot);
        ui.keyboard_action = null;

    } else if (ui.keyboard_action === 'clue') {
        ui.keyboard_action = 'clue_player';
        ui.keyboard_clue_player = slot;

    } else if (ui.keyboard_action === 'clue_player') {
        keyboard_clue(ui, slot);
    }
}

function keyboard_play(ui, slot) {
    let ourHand = player_hands[ui.player_us].children;
    let cardIndex = ourHand.length - slot;
    let cardOrder = ourHand[cardIndex].children[0].order;

    ui.send_msg({
        type: "action",
        resp: {
            type: ACT.PLAY,
            target: cardOrder,
        },
    });
    ui.stop_action();
}

function keyboard_discard(ui, slot) {
    let ourHand = player_hands[ui.player_us].children;
    let cardIndex = ourHand.length - slot;
    let cardOrder = ourHand[cardIndex].children[0].order;

    ui.send_msg({
        type: "action",
        resp: {
            type: ACT.DISCARD,
            target: cardOrder,
        },
    });
    ui.stop_action();
}

function keyboard_clue(ui, clue_type) {
    ui.send_msg({
        type: "action",
        resp: {
            type: ACT.CLUE,
            target: ui.keyboard_clue_player - 1,
            clue: {
                type: 0,
                value: clue_type,
            },
        },
    });
    ui.stop_action();
}

$(document).keydown(function(event) {
    //console.log(event.which); // Uncomment this to find out which number corresponds to the desired key

    if (event.which === 49) { // "1"
        keyboard_do_action(ui, 1);

    } else if (event.which === 50) { // "2"
        keyboard_do_action(ui, 2);

    } else if (event.which === 51) { // "3"
        keyboard_do_action(ui, 3);

    } else if (event.which === 52) { // "4"
        keyboard_do_action(ui, 4);

    } else if (event.which === 53) { // "5"
        keyboard_do_action(ui, 5);

    } else if (event.which === 65) { // "a"
        ui.keyboard_action = 'play';

    } else if (event.which === 67) { // "c"
        ui.keyboard_action = 'clue';

    } else if (event.which === 68) { // "d"
        ui.keyboard_action = 'discard';
    }
});

/*
    Misc. functions
*/

function pad2(num) {
    if (num < 10) {
        return "0" + num;
    }
    return "" + num;
}

function milliseconds_to_time_display(milliseconds) {
    let seconds = Math.ceil(milliseconds / 1000);
    return Math.floor(seconds / 60) + ":" + pad2(seconds % 60);
}

// textObjects are expected to be on the timerlayer or tiplayer
function setTickingDownTime(textObjects, active_index) {
    // Compute elapsed time since last timer update
    let now = new Date().getTime();
    let time_elapsed = now - ui.last_timer_update_time_ms;
    ui.last_timer_update_time_ms = now;
    if (time_elapsed < 0) {
        return;
    }

    // Update the time in local array to approximate server times
    ui.player_times[active_index] -= time_elapsed;
    if (ui.player_times[active_index] < 0) {
        ui.player_times[active_index] = 0;
    }

    let milliseconds_left = ui.player_times[active_index];
    let display_string = milliseconds_to_time_display(milliseconds_left);

    // Update displays
    textObjects.forEach(function (textHolder) {
        textHolder.setText(display_string);
    });
    timerlayer.draw();
    tiplayer.draw();

    // Play a sound to indicate that the current player is almost out of time
    // Do not play it more frequently than about once per second
    if (lobby.send_turn_sound && milliseconds_left <= 5000 && time_elapsed > 900 && time_elapsed < 1100) {
        lobby.play_sound('tone');
    }
}

function image_name(card) {
    if (!card.unknown) {
        let name = "card-";
        name += card.suit + "-";
        name += card.rank;
        return name;
    }

    var learned = ui.learned_cards[card.order];
    if (MHGA_show_faces_in_replay && learned && ui.replay) {
        let name = "card-";
        if (learned.suit === undefined) {
            name += 6;
        } else {
            name += learned.suit;
        }
        name += "-";
        if (learned.rank === undefined) {
            name += 6;
        } else {
            name += learned.rank;
        }
        return name;
    }

    return "card-back";
}

var scale_card_image = function(context, name) {
    var width = this.getWidth();
    var height = this.getHeight();
    var am = this.getAbsoluteTransform();
    var src = card_images[name];

    if (!src) {
        return;
    }

    var dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
    var dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

    if (dw < 1 || dh < 1) {
        return;
    }

    var sw = width, sh = height;
    var scale_cvs, scale_ctx;
    var steps = 0;

    if (!scale_card_images[name]) {
        scale_card_images[name] = [];
    }

    while (dw < sw / 2)
    {
        scale_cvs = scale_card_images[name][steps];
        sw = Math.floor(sw / 2);
        sh = Math.floor(sh / 2);

        if (!scale_cvs)
        {
            scale_cvs = document.createElement("canvas");
            scale_cvs.width = sw;
            scale_cvs.height = sh;

            scale_ctx = scale_cvs.getContext("2d");

            scale_ctx.drawImage(src, 0, 0, sw, sh);

            scale_card_images[name][steps] = scale_cvs;
        }

        src = scale_cvs;

        steps++;
    }

    context.drawImage(src, 0, 0, width, height);
};

var FitText = function(config) {
    Kinetic.Text.call(this, config);

    this.origFontSize = this.getFontSize();
    this.needs_resize = true;

    this.setDrawFunc(function(context) {
        if (this.needs_resize) {
            this.resize();
        }
        Kinetic.Text.prototype._sceneFunc.call(this, context);
    });
};

Kinetic.Util.extend(FitText, Kinetic.Text);

FitText.prototype.resize = function() {
    this.setFontSize(this.origFontSize);

    while (this._getTextSize(this.getText()).width > this.getWidth() && this.getFontSize() > 5)
    {
        this.setFontSize(this.getFontSize() * 0.9);
    }

    this.needs_resize = false;
};

FitText.prototype.setText = function(text) {
    Kinetic.Text.prototype.setText.call(this, text);

    this.needs_resize = true;
};

var MultiFitText = function(config) {
    Kinetic.Group.call(this, config);
    this.maxLines = config.maxLines;
    this.smallHistory = [];
    for (var i = 0; i < this.maxLines; ++i) {
        var newConfig = $.extend({}, config);

        newConfig.height = config.height / this.maxLines;
        newConfig.x = 0;
        newConfig.y = i * newConfig.height;

        var childText = new FitText(newConfig);
        Kinetic.Group.prototype.add.call(this, childText);
    }
};

Kinetic.Util.extend(MultiFitText, Kinetic.Group);

MultiFitText.prototype.setMultiText = function(text) {
    if (this.smallHistory.length >= this.maxLines) {
        this.smallHistory.shift();
    }
    this.smallHistory.push(text);
    // performance optimization: setText on the children is slow, so don't actually do it until its time to display things.
    // we also have to call refresh_text after any time we manipulate replay position
    if (!ui.replay || !ui.animate_fast) {
        this.refresh_text();
    }
};

MultiFitText.prototype.refresh_text = function() {
    for (var i = 0; i < this.children.length; ++i) {
        var msg = this.smallHistory[i];
        if (!msg) {
            msg = "";
        }
        this.children[i].setText(msg);
    }
};

MultiFitText.prototype.reset = function() {
    this.smallHistory = [];
    for (var i = 0; i < this.children.length; ++i) {
        this.children[i].setText("");
    }
};

var HanabiMsgLog = function(config) {
    var baseConfig = {
        x: 0.2 * win_w,
        y: 0.02 * win_h,
        width: 0.4 * win_w,
        height: 0.96 * win_h,
        clipX: 0,
        clipY: 0,
        clipWidth: 0.4 * win_w,
        clipHeight: 0.96 * win_h,
        visible: false,
        listening: false,
     };

    $.extend(baseConfig, config);
    Kinetic.Group.call(this, baseConfig);

    var rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: 0.4 * win_w,
        height: 0.96 * win_h,
        fill: "black",
        opacity: 0.9,
        cornerRadius: 0.01 * win_w,
    });

    Kinetic.Group.prototype.add.call(this, rect);

    var textoptions = {
        fontSize: 0.025 * win_h,
        fontFamily: "Verdana",
        fill: "white",
        x: (MHGA_show_log_numbers? 0.04 : 0.01) * win_w,
        y: 0.01 * win_h,
        width: (MHGA_show_log_numbers? 0.35 : 0.38) * win_w,
        height: 0.94 * win_h,
        maxLines: 38,
    };

    this.logtext = new MultiFitText(textoptions);
    Kinetic.Group.prototype.add.call(this, this.logtext);

    var numbersoptions = {
        fontSize: 0.025 * win_h,
        fontFamily: "Verdana",
        fill: "lightgrey",
        x: 0.01 * win_w,
        y: 0.01 * win_h,
        width: 0.03 * win_w,
        height: 0.94 * win_h,
        maxLines: 38,
    };
    this.lognumbers = new MultiFitText(numbersoptions);
    if (! MHGA_show_log_numbers) {
        this.lognumbers.hide();
    }
    Kinetic.Group.prototype.add.call(this, this.lognumbers);


    this.player_logs = [];
    this.player_lognumbers = [];
    for (var i = 0; i < ui.player_names.length; i++) {
        this.player_logs[i] = new MultiFitText(textoptions);
        this.player_logs[i].hide();
        Kinetic.Group.prototype.add.call(this, this.player_logs[i]);


        this.player_lognumbers[i] = new MultiFitText(numbersoptions);
        this.player_lognumbers[i].hide();
        Kinetic.Group.prototype.add.call(this, this.player_lognumbers[i]);
    }

};

Kinetic.Util.extend(HanabiMsgLog, Kinetic.Group);

HanabiMsgLog.prototype.add_message = function(msg) {
    var append_line = function (log, numbers, line) {
        log.setMultiText(line);
        numbers.setMultiText(drawdeck.getCount());
    };

    append_line(this.logtext, this.lognumbers, msg);
    for (var i = 0; i < ui.player_names.length; i++) {
        if (msg.startsWith(ui.player_names[i])) {
            append_line(this.player_logs[i], this.player_lognumbers[i], msg);
            break;
        }
    }
};

HanabiMsgLog.prototype.show_player_actions = function(player_name) {
    var player_idx;
    for (var i = 0; i < ui.player_names.length; i++) {
        if (ui.player_names[i] === player_name) {
            player_idx = i;
        }
    }
    this.logtext.hide();
    this.lognumbers.hide();
    this.player_logs[player_idx].show();
    if (MHGA_show_log_numbers) {
        this.player_lognumbers[player_idx].show();
    }

    this.show();

    overback.show();
    overlayer.draw();

    var thislog = this;
    overback.on("click tap", function() {
        overback.off("click tap");
        thislog.player_logs[player_idx].hide();
        thislog.player_lognumbers[player_idx].hide();

        thislog.logtext.show();
        if (MHGA_show_log_numbers) {
            thislog.lognumbers.show();
        }
        thislog.hide();
        overback.hide();
        overlayer.draw();
    });
};

HanabiMsgLog.prototype.refresh_text = function() {
    this.logtext.refresh_text();
    this.lognumbers.refresh_text();
    for (var i = 0; i < ui.player_names.length; i++) {
        this.player_logs[i].refresh_text();
        this.player_lognumbers[i].refresh_text();
    }
};

HanabiMsgLog.prototype.reset = function() {
    this.logtext.reset();
    this.lognumbers.reset();
    for (var i = 0; i < ui.player_names.length; i++) {
        this.player_logs[i].reset();
        this.player_lognumbers[i].reset();
    }
};


var HanabiCard = function(config) {
    var self = this;

    config.width = cardw;
    config.height = cardh;
    config.x = cardw / 2;
    config.y = cardh / 2;
    config.offset = {
        x: cardw / 2,
        y: cardh / 2,
    };

    Kinetic.Group.call(this, config);

    this.bare = new Kinetic.Image({
        width: config.width,
        height: config.height,
    });

    this.bare.setDrawFunc(function(context) {
        scale_card_image.call(this, context, self.barename);
    });

    this.add(this.bare);

    this.unknown = (config.suit === undefined);
    this.suit = config.suit || 0;
    this.rank = config.rank || 0;
    this.order = config.order;

    if (!this.unknown) {
        ui.learned_cards[this.order] = {
            suit: this.suit,
            rank: this.rank,
        };
    }

    this.barename = "";

    this.setBareImage();

    //unknownRect is a transparent white overlay box we can draw over the card.
    //The point is that when they're in a replay, and they know things in the PRESENT about the card they're viewing
    //in the PAST, we show them a card face. If that card face is just implied by clues, it gets a white box. If it's known
    //by seeing the true card face in the present, we show no white box. This way people won't be mislead as much
    //if the card is multi.
    var replayPartialPresentKnowledge = MHGA_show_faces_in_replay &&
                                        ui.replay &&
                                        this.unknown &&
                                        ui.learned_cards[this.order] !== undefined &&
                                        !ui.learned_cards[this.order].revealed;
    this.unknownRect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        cornerRadius: 20,
        fill: "#cccccc",
        opacity: 0.4,
        visible: replayPartialPresentKnowledge,
    });
    this.add(this.unknownRect);

    this.indicateRect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        cornerRadius: 6,
        strokeWidth: 12,
        stroke: "#ccccee",
        visible: false,
        listening: false,
    });

    this.add(this.indicateRect);

    this.color_clue_group = new Kinetic.Group({
        x: 0.3 * config.width,
        y: 0.1 * config.height,
        width: 0.4 * config.width,
        height: 0.282 * config.height,
        visible: false,
    });

    this.add(this.color_clue_group);

    this.color_clue = new Kinetic.Rect({
        width: 0.4 * config.width,
        height: 0.282 * config.height,
        stroke: "black",
        strokeWidth: 12,
        cornerRadius: 12,
        fillLinearGradientStartPoint: {
            x: 0,
            y: 0,
        },
        fillLinearGradientEndPoint: {
            x: 0.4 * config.width,
            y: 0.282 * config.height,
        },
        fillLinearGradientColorStops: [
            0,
            "black",
        ],
    });

    this.color_clue_group.add(this.color_clue);

    this.color_clue_letter = new Kinetic.Text({
        width: 0.4 * config.width,
        height: 0.282 * config.height,
        align: "center",
        fontFamily: "Verdana",
        fontSize: 0.25 * config.height,
        fill: "#d8d5ef",
        stroke: "black",
        strokeWidth: 4,
        shadowOpacity: 0.9,
        shadowColor: "black",
        shadowOffset: {
            x: 0,
            y: 1,
        },
        shadowBlur: 2,
        text: "",
        visible: lobby.show_colorblind_ui,
    });
    this.color_clue_group.add(this.color_clue_letter);

    this.number_clue = new Kinetic.Text({
        x: 0.3 * config.width,
        y: 0.5 * config.height,
        width: 0.4 * config.width,
        height: 0.282 * config.height,
        align: "center",
        fontFamily: "Verdana",
        fontSize: 0.282 * config.height,
        fill: "#d8d5ef",
        stroke: "black",
        strokeWidth: 4,
        shadowOpacity: 0.9,
        shadowColor: "black",
        shadowOffset: {
            x: 0,
            y: 1,
        },
        shadowBlur: 2,
        text: "?",
        visible: false,
    });

    this.add(this.number_clue);

    this.clue_given = new Kinetic.Circle({
        x: 0.9 * config.width,
        y: 0.1 * config.height,
        radius: 0.05 * config.width,
        fill: "white",
        stroke: "black",
        strokeWidth: 4,
        visible: false,
    });

    this.add(this.clue_given);

    this.note_given = new Kinetic.Rect({
        x: 0.854 * config.width,
        y: 0.165 * config.height,
        width: 0.09 * config.width,
        height: 0.09 * config.width,
        fill: "white",
        stroke: "black",
        strokeWidth: 4,
        visible: false,
    });

    this.add(this.note_given);


    //there's some bug i cant figure out where it permanently draws a copy of the tag at this location, so i'll
    //work around it by setting the starting location to this
    this.tooltip = new Kinetic.Label({
        x: -1000,
        y: -1000,
    });

    this.tooltip.add(new Kinetic.Tag({
        fill: '#3E4345',
        pointerDirection: 'left',
        pointerWidth: 0.02 * win_w,
        pointerHeight: 0.015 * win_h,
        lineJoin: 'round',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 3,
            y: 3,
        },
        shadowOpacity: 0.6,
    }));

    this.tooltip.add(new FitText({
        fill: "white",
        align: "left",
        padding: 0.01 * win_h,
        fontSize: 0.04 * win_h,
        minFontSize: 0.02 * win_h,
        width: 0.12 * win_w,
        fontFamily: "Verdana",
        text: "",
    }));

    tiplayer.add(this.tooltip);

    this.on("mousemove", function() {
        if (self.note_given.visible()) {
            var mousePos = stage.getPointerPosition();
            self.tooltip.setX(mousePos.x + 15);
            self.tooltip.setY(mousePos.y + 5);

            self.tooltip.show();
            tiplayer.draw();
        }
        ui.activeHover = this;
    });

    this.on("mouseout", function() {
        self.tooltip.hide();
        tiplayer.draw();
    });

    this.reset();
};

Kinetic.Util.extend(HanabiCard, Kinetic.Group);

HanabiCard.prototype.reset = function() {
    this.hide_clues();
    if (notes_written.hasOwnProperty(this.order)) {
        var note = notes_written[this.order];
        if (note) {
            this.tooltip.getText().setText(note);
            this.tooltip.getTag().setWidth();
            this.note_given.show();
        }
    }
    this.add_listeners();
};

HanabiCard.prototype.add_listeners = function() {
    var self = this;

    this.on("mousemove tap", function() {
        clue_log.showMatches(self);
        uilayer.draw();
    });

    this.on("mouseout", function() {
        clue_log.showMatches(null);
        uilayer.draw();
    });

    this.on("click", function(e) {
        if (e.evt.which === 3) { // right click
            var note = ui.getNote(self.order);
            var newNote = prompt("Note on card:", note);
            if (newNote !== null) {
                self.tooltip.getText().setText(newNote);
                ui.setNote(self.order, newNote);
                note = newNote;
            }

            if (note) {
                self.note_given.show();
            } else {
                self.note_given.hide();
                self.tooltip.hide();
                tiplayer.draw();
            }
            uilayer.draw();
            cardlayer.draw();
        }
    });
};

HanabiCard.prototype.setBareImage = function() {
    if (this.unknownRect !== undefined) {
        var learned = ui.learned_cards[this.order];
        //if we're in a replay, we have knowledge about the card, but we don't know the ACTUAL card
        if (MHGA_show_faces_in_replay &&
            ui.replay &&
            this.unknown &&
            learned &&
            !learned.revealed) {

            this.unknownRect.setVisible(true);
        } else {
            this.unknownRect.setVisible(false);
        }
    }

    this.barename = image_name(this);
};

HanabiCard.prototype.setIndicator = function(indicate, negative) {
    if (negative)
    {
        this.indicateRect.setStroke("#ff7777");
    }
    else
    {
        this.indicateRect.setStroke("#ddeecc");
    }
    this.indicateRect.setVisible(indicate);
    this.getLayer().batchDraw();
};

HanabiCard.prototype.add_clue = function(clue) {
    var i;

    if (!ui.learned_cards[this.order]) {
        ui.learned_cards[this.order] = {};
    }

    if (clue.type === CLUE.SUIT)
    {
        var grad = this.color_clue.getFillLinearGradientColorStops();
        if (grad.length === 2)
        {
            this.color_clue.setFillLinearGradientColorStops([
                0,
                suit_colors[clue.value],
                1,
                suit_colors[clue.value],
            ]);
            this.color_clue_letter.setText(suit_abbreviations[clue.value]);
        }
        else if (grad[1] === grad[3])
        {
            grad[3] = suit_colors[clue.value];
            this.color_clue.setFillLinearGradientColorStops(grad);

            if (grad[i] !== suit_colors[clue.value]) {
                this.color_clue_letter.setText("M");
            }
        }
        else
        {
            if (grad[grad.length - 1] === suit_colors[clue.value])
            {
                return;
            }

            for (i = 0; i < grad.length; i += 2)
            {
                grad[i] = 1.0 * (i / 2) / (grad.length / 2);
            }
            grad.push(1);
            grad.push(suit_colors[clue.value]);
            this.color_clue.setFillLinearGradientColorStops(grad);
            this.color_clue_letter.setText("M");
        }

        this.color_clue_group.show();

        if (ui.learned_cards[this.order].suit === undefined) {
            ui.learned_cards[this.order].suit = clue.value;
        } else if (ui.learned_cards[this.order].suit !== clue.value) {
            ui.learned_cards[this.order].suit = 5;
        }

    }
    else
    {
        this.number_clue.setText(clue.value.toString());
        this.number_clue.show();
        ui.learned_cards[this.order].rank = clue.value;
    }
};

HanabiCard.prototype.hide_clues = function() {
    this.color_clue_group.hide();
    this.number_clue.hide();
    this.clue_given.hide();
    this.note_given.hide();
    if (!MHGA_highlight_non_hand_cards) {
        this.off("mouseover tap");
        this.off("mouseout");
        clue_log.showMatches(null);
    }
};

var LayoutChild = function(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function(child) {
    var self = this;

    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on("widthChange", function(evt) {
        if (evt.oldVal === evt.newVal) {
            return;
        }
        self.setWidth(evt.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });

    child.on("heightChange", function(evt) {
        if (evt.oldVal === evt.newVal) {
            return;
        }
        self.setHeight(evt.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });
};

var CardLayout = function(config) {
    Kinetic.Group.call(this, config);

    this.align = (config.align || "left");
    this.reverse = (config.reverse || false);
};

Kinetic.Util.extend(CardLayout, Kinetic.Group);

CardLayout.prototype.add = function(child) {
    var pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardLayout.prototype._setChildrenIndices = function() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

CardLayout.prototype.doLayout = function() {
    var lw, lh;
    var i, n, node, scale;
    var uw = 0, dist = 0, x = 0;

    lw = this.getWidth();
    lh = this.getHeight();

    n = this.children.length;

    for (i = 0; i < n; i++)
    {
        node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        scale = lh / node.getHeight();

        uw += scale * node.getWidth();
    }

    if (n > 1) {
        dist = (lw - uw) / (n - 1);
    }

    if (dist > 10) {
        dist = 10;
    }

    uw += dist * (n - 1);

    if (this.align === "center" && uw < lw) {
        x = (lw - uw) / 2;
    }

    if (this.reverse) {
        x = lw - x;
    }

    for (i = 0; i < n; i++) {
        node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        scale = lh / node.getHeight();

        if (node.tween) {
            node.tween.destroy();
        }

        if (!node.isDragging()) {
            if (ui.animate_fast) {
                node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);

            } else {
                node.tween = new Kinetic.Tween({
                    node: node,
                    duration: 0.5,
                    x: x - (this.reverse ? scale * node.getWidth() : 0),
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    runonce: true,
                }).play();
            }
        }

        x += (scale * node.getWidth() + dist) * (this.reverse ? -1 : 1);
    }
};

var CardDeck = function(config) {
    Kinetic.Group.call(this, config);

    this.cardback = new Kinetic.Image({
        x: 0,
        y: 0,
        width: this.getWidth(),
        height: this.getHeight(),
        image: card_images[config.cardback],
    });

    this.add(this.cardback);

    this.count = new Kinetic.Text({
        fill: "white",
        stroke: "black",
        strokeWidth: 1,
        align: "center",
        x: 0,
        y: 0.3 * this.getHeight(),
        width: this.getWidth(),
        height: 0.4 * this.getHeight(),
        fontSize: 0.4 * this.getHeight(),
        fontFamily: "Verdana",
        fontStyle: "bold",
        text: "0",
    });

    this.add(this.count);
};

Kinetic.Util.extend(CardDeck, Kinetic.Group);

CardDeck.prototype.add = function(child) {
    var self = this;

    Kinetic.Group.prototype.add.call(this, child);

    if (child instanceof LayoutChild)
    {
        if (ui.animate_fast)
        {
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

        child.tween.onFinish = function() {
            if (child.parent === self)
            {
                child.remove();
            }
        };
    }
};

CardDeck.prototype.setCardBack = function(cardback) {
    this.cardback.setImage(ImageLoader.get(cardback));
};

CardDeck.prototype.setCount = function(count) {
    this.count.setText(count.toString());

    this.cardback.setVisible(count > 0);
};

CardDeck.prototype.getCount = function() {
    return this.count.getText();
};

CardDeck.prototype.resetPosition = function() {
    // TODO??
    //this.setPosition(0.08 * win_w, 0.8 * win_h);
    // using setPosition doesn't seem to do anything
};

var CardStack = function(config) {
    Kinetic.Group.call(this, config);
};

Kinetic.Util.extend(CardStack, Kinetic.Group);

CardStack.prototype.add = function(child) {
    var pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardStack.prototype._setChildrenIndices = function() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
};

CardStack.prototype.doLayout = function() {
    var self = this;
    var node;
    var lw, lh;
    var i, n;
    var scale;

    lw = this.getWidth();
    lh = this.getHeight();

    n = this.children.length;

    var hide_under = function() {
        var i, n, node;
        n = self.children.length;
        for (i = 0; i < n; i++)
        {
            node = self.children[i];

            if (!node.tween) {
                continue;
            }

            if (node.tween.isPlaying()) {
                return;
            }
        }
        for (i = 0; i < n - 1; i++)
        {
            self.children[i].setVisible(false);
        }
        if (n > 0) {
            self.children[n - 1].setVisible(true);
        }
    };

    for (i = 0; i < n; i++)
    {
        node = this.children[i];

        scale = lh / node.getHeight();

        if (node.tween) {
            node.tween.destroy();
        }

        if (ui.animate_fast)
        {
            node.setX(0);
            node.setY(0);
            node.setScaleX(scale);
            node.setScaleY(scale);
            node.setRotation(0);
            hide_under();
        }
        else
        {
            node.tween = new Kinetic.Tween({
                node: node,
                duration: 0.8,
                x: 0,
                y: 0,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                runonce: true,
                onFinish: hide_under,
            }).play();
        }
    }
};

var Button = function(config) {
    Kinetic.Group.call(this, config);

    var w = this.getWidth();
    var h = this.getHeight();

    var background = new Kinetic.Rect({
        name: "background",
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: "black",
        opacity: 0.6,
    });

    this.add(background);

    if (config.text)
    {
        var text = new Kinetic.Text({
            name: "text",
            x: 0,
            y: 0.2 * h,
            width: w,
            height: 0.6 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: "Verdana",
            fill: "white",
            align: "center",
            text: config.text,
        });

        this.add(text);
    }
    else if (config.image)
    {
        var img = new Kinetic.Image({
            name: "image",
            x: 0.2 * w,
            y: 0.2 * h,
            width: 0.6 * w,
            height: 0.6 * h,
            listening: false,
            image: ImageLoader.get(config.image),
        });

        this.add(img);
    }

    this.enabled = true;
    this.pressed = false;

    this.target_index = config.target_index;

    background.on("mousedown", function() {
        background.setFill("#888888");
        background.getLayer().draw();

        var reset_button = function() {
            background.setFill("black");
            background.getLayer().draw();

            background.off("mouseup");
            background.off("mouseout");
        };

        background.on("mouseout", function() { reset_button(); });
        background.on("mouseup", function() { reset_button(); });
    });
};

Kinetic.Util.extend(Button, Kinetic.Group);

Button.prototype.setEnabled = function(enabled) {
    this.enabled = enabled;

    this.get(".text")[0].setFill(enabled ? "white" : "#444444");

    this.get(".background")[0].setListening(enabled);

    this.getLayer().draw();
};

Button.prototype.getEnabled = function() {
    return this.enabled;
};

Button.prototype.setPressed = function(pressed) {
    this.pressed = pressed;

    this.get(".background")[0].setFill(pressed ? "#cccccc" : "black");

    this.getLayer().batchDraw();
};

var NumberButton = function(config) {
    Kinetic.Group.call(this, config);

    var w = this.getWidth();
    var h = this.getHeight();

    var background = new Kinetic.Rect({
        name: "background",
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: "black",
        opacity: 0.6,
    });

    this.add(background);

    var text = new Kinetic.Text({
        x: 0,
        y: 0.2 * h,
        width: w,
        height: 0.6 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: "Verdana",
        fill: "white",
        stroke: "black",
        strokeWidth: 1,
        align: "center",
        text: config.number.toString(),
    });

    this.add(text);

    this.pressed = false;

    this.clue_type = config.clue_type;

    background.on("mousedown", function() {
        background.setFill("#888888");
        background.getLayer().draw();

        var reset_button = function() {
            background.setFill("black");
            background.getLayer().draw();

            background.off("mouseup");
            background.off("mouseout");
        };

        background.on("mouseout", function() { reset_button(); });
        background.on("mouseup", function() { reset_button(); });
    });
};

Kinetic.Util.extend(NumberButton, Kinetic.Group);

NumberButton.prototype.setPressed = function(pressed) {
    this.pressed = pressed;

    this.get(".background")[0].setFill(pressed ? "#cccccc" : "black");

    this.getLayer().batchDraw();
};

var ColorButton = function(config) {
    Kinetic.Group.call(this, config);

    var w = this.getWidth();
    var h = this.getHeight();

    var background = new Kinetic.Rect({
        name: "background",
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: "black",
        opacity: 0.6,
    });

    this.add(background);

    var color = new Kinetic.Rect({
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

    var text = new Kinetic.Text({
        x: 0,
        y: 0.2 * h,
        width: w,
        height: 0.6 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: "Verdana",
        fill: "white",
        stroke: "black",
        strokeWidth: 1,
        align: "center",
        text: config.text,
        visible: lobby.show_colorblind_ui,
    });

    this.add(text);

    this.pressed = false;

    this.clue_type = config.clue_type;

    background.on("mousedown", function() {
        background.setFill("#888888");
        background.getLayer().draw();

        var reset_button = function() {
            background.setFill("black");
            background.getLayer().draw();

            background.off("mouseup");
            background.off("mouseout");
        };

        background.on("mouseout", function() { reset_button(); });
        background.on("mouseup", function() { reset_button(); });
    });
};

Kinetic.Util.extend(ColorButton, Kinetic.Group);

ColorButton.prototype.setPressed = function(pressed) {
    this.pressed = pressed;

    this.get(".background")[0].setFill(pressed ? "#cccccc" : "black");

    this.getLayer().batchDraw();
};

var ButtonGroup = function(config) {
    Kinetic.Node.call(this, config);

    this.list = [];
};

Kinetic.Util.extend(ButtonGroup, Kinetic.Node);

ButtonGroup.prototype.add = function(button) {
    var self = this;

    this.list.push(button);

    button.on("click tap", function() {
        var i;

        this.setPressed(true);

        for (i = 0; i < self.list.length; i++)
        {
            if (self.list[i] !== this && self.list[i].pressed)
            {
                self.list[i].setPressed(false);
            }
        }

        self.fire("change");
    });
};

ButtonGroup.prototype.getPressed = function() {
    var i;

    for (i = 0; i < this.list.length; i++)
    {
        if (this.list[i].pressed) {
            return this.list[i];
        }
    }

    return null;
};

ButtonGroup.prototype.clearPressed = function() {
    var i;

    for (i = 0; i < this.list.length; i++)
    {
        if (this.list[i].pressed) {
            this.list[i].setPressed(false);
        }
    }
};

var HanabiClueLog = function(config) {
    Kinetic.Group.call(this, config);
};

Kinetic.Util.extend(HanabiClueLog, Kinetic.Group);

HanabiClueLog.prototype.add = function(child) {
    Kinetic.Group.prototype.add.call(this, child);
    this.doLayout();
};

HanabiClueLog.prototype._setChildrenIndices = function() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

HanabiClueLog.prototype.doLayout = function() {
    var y = 0, i;
    var node;

    for (i = 0; i < this.children.length; i++)
    {
        node = this.children[i];

        node.setY(y);

        y += node.getHeight() + 0.001 * win_h;
    }
};

HanabiClueLog.prototype.checkExpiry = function() {
    var maxLength = 31;
    var childrenToRemove = this.children.length - maxLength;
    if (childrenToRemove < 1) {
        return;
    }
    var childrenRemoved = 0;
    var i;
    for (i = 0; i < this.children.length; i++)
    {
        childrenRemoved += this.children[i].checkExpiry();
        if (childrenRemoved >= childrenToRemove) {
            break;
        }

    }

    this.doLayout();
};

HanabiClueLog.prototype.showMatches = function(target) {
    var i;

    for (i = 0; i < this.children.length; i++)
    {
        this.children[i].showMatch(target);
    }
};

HanabiClueLog.prototype.clear = function() {
    var i;

    for (i = this.children.length - 1; i >= 0; i--)
    {
        this.children[i].remove();
    }

};

var HanabiClueEntry = function(config) {
    var self = this;

    Kinetic.Group.call(this, config);

    var w = config.width;
    var h = config.height;

    var background = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: "white",
        opacity: 0.1,
        listening: true,
    });

    this.background = background;

    this.add(background);

    var giver = new FitText({
        x: 0.05 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: "Verdana",
        fill: "white",
        text: config.giver,
        listening: false,
    });

    this.add(giver);

    var target = new FitText({
        x: 0.4 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: "Verdana",
        fill: "white",
        text: config.target,
        listening: false,
    });

    this.add(target);

    var type = new Kinetic.Text({
        x: 0.75 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: "center",
        fontSize: 0.9 * h,
        fontFamily: "Verdana",
        fill: "white",
        text: config.type,
        listening: false,
    });

    this.add(type);

    var negative_marker = new Kinetic.Text({
        x: 0.88 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: "center",
        fontSize: 0.9 * h,
        fontFamily: "Verdana",
        fill: "white",
        text: "✘",
        listening: false,
        visible: false,
    });

    this.negative_marker = negative_marker;
    this.add(negative_marker);

    this.list = config.list;
    this.neglist = config.neglist;

    background.on("mousemove tap", function() {
        var i;

        clue_log.showMatches(null);

        background.setOpacity(0.4);
        background.getLayer().batchDraw();

        show_clue_match(-1);

        for (i = 0; i < self.list.length; i++)
        {
            if (!self.checkValid(self.list[i])) {
                continue;
            }

            ui.deck[self.list[i]].setIndicator(true);
        }

        for (i = 0; i < self.neglist.length; i++)
        {
            if (!self.checkValid(self.neglist[i])) {
                continue;
            }

            ui.deck[self.neglist[i]].setIndicator(true, true);
        }

        cardlayer.batchDraw();
        ui.activeHover = this;
    });

    background.on("mouseout", function() {
        background.setOpacity(0.1);
        background.getLayer().batchDraw();

        show_clue_match(-1);
    });
};

Kinetic.Util.extend(HanabiClueEntry, Kinetic.Group);

HanabiClueEntry.prototype.checkValid = function(c) {
    if (!ui.deck[c]) {
        return false;
    }

    if (!ui.deck[c].parent) {
        return false;
    }

    return player_hands.indexOf(ui.deck[c].parent.parent) !== -1;
};

//returns number of expirations, either 0 or 1 depending on whether it expired
HanabiClueEntry.prototype.checkExpiry = function() {
    var i;

    for (i = 0; i < this.list.length; i++) {
        if (this.checkValid(this.list[i])) {
            return 0;
        }
    }

    for (i = 0; i < this.neglist.length; i++) {
        if (this.checkValid(this.neglist[i])) {
            return 0;
        }
    }

    this.background.off("mouseover tap");
    this.background.off("mouseout");

    this.remove();
    return 1;
};

HanabiClueEntry.prototype.showMatch = function(target) {
    var i;

    this.background.setOpacity(0.1);
    this.background.setFill("white");
    this.negative_marker.setVisible(false);

    for (i = 0; i < this.list.length; i++) {
        if (ui.deck[this.list[i]] === target) {
            this.background.setOpacity(0.4);
        }
    }

    for (i = 0; i < this.neglist.length; i++) {
        if (ui.deck[this.neglist[i]] === target) {
            this.background.setOpacity(0.4);
            this.background.setFill("#ff7777");
            if (lobby.show_colorblind_ui) {
                this.negative_marker.setVisible(true);
            }
        }
    }
};

var HanabiNameFrame = function(config) {
    var w;

    Kinetic.Group.call(this, config);

    this.name = new Kinetic.Text({
        x: config.width / 2,
        y: 0,
        height: config.height,
        align: "center",
        fontFamily: "Verdana",
        fontSize: config.height,
        text: config.name,
        fill: "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0.9,
    });

    w = this.name.getWidth();

    while (w > 0.65 * config.width && this.name.getFontSize() > 5)
    {
        this.name.setFontSize(this.name.getFontSize() * 0.9);

        w = this.name.getWidth();
    }

    this.name.setOffsetX(w / 2);
    var nameTextObject = this.name;
    this.name.on("click tap", function() {
        msgloggroup.show_player_actions(nameTextObject.getText());
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
        stroke: "#d8d5ef",
        strokeWidth: 1,
        lineJoin: "round",
        shadowColor: "black",
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
        stroke: "#d8d5ef",
        strokeWidth: 1,
        lineJoin: "round",
        shadowColor: "black",
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0,
    });

    this.add(this.rightline);
};

Kinetic.Util.extend(HanabiNameFrame, Kinetic.Group);

HanabiNameFrame.prototype.setActive = function(active) {
    this.leftline.setStrokeWidth(active ? 3 : 1);
    this.rightline.setStrokeWidth(active ? 3 : 1);

    this.name.setShadowOpacity(active ? 0.6 : 0);
    this.leftline.setShadowOpacity(active ? 0.6 : 0);
    this.rightline.setShadowOpacity(active ? 0.6 : 0);

    this.name.setFontStyle(active ? "bold" : "normal");
};

HanabiNameFrame.prototype.setConnected = function(connected) {
    var color = connected ? "#d8d5ef" : "#e8233d";

    this.leftline.setStroke(color);
    this.rightline.setStroke(color);
    this.name.setFill(color);
};

var Loader = function(cb) {
    this.cb = cb;

    this.filemap = {};

    var basic = [
        "button",
        "button_pressed",
        "trashcan",
        "redx",
        "replay",
        "rewind",
        "forward",
        "rewindfull",
        "forwardfull",
    ];
    var i;

    for (i = 0; i < basic.length; i++)
    {
        this.filemap[basic[i]] = "public/img/" + basic[i] + ".png";
    }

    this.filemap.background = "public/img/background.jpg";
};

Loader.prototype.add_image = function(name, ext) {
    this.filemap[name] = "public/img/" + name + "." + ext;
};

Loader.prototype.add_alias = function(name, alias, ext) {
    this.filemap[name] = "public/img/" + alias + "." + ext;
};

Loader.prototype.start = function() {
    var self = this;

    var total = Object.keys(self.filemap).length;

    this.map = {};
    this.num_loaded = 0;

    for (var name in this.filemap)
    {
        var img = new Image();

        this.map[name] = img;

        img.onload = function() {
            self.num_loaded++;

            self.progress(self.num_loaded, total);

            if (self.num_loaded === total)
            {
                self.cb();
            }
        };

        img.src = self.filemap[name];
    }

    self.progress(0, total);
};

Loader.prototype.progress = function(done, total) {
    if (this.progress_callback)
    {
        this.progress_callback(done, total);
    }
};

Loader.prototype.get = function(name) {
    return this.map[name];
};

var ImageLoader = new Loader(function() {
    notes_written = ui.load_notes();

    /*
    if ("timebank" in notes_written) {
        ui.timebank_seconds = parseInt(notes_written.timebank);
        if (isNaN(ui.timebank_seconds)) {
            ui.timebank_seconds = ui.timebank_minimum;
        }
    }
    */

    ui.build_cards();
    ui.build_ui();
    ui.send_msg({
        type: "ready",
        resp: {},
    });
    ui.ready = true;
});

this.load_images = function() {
    ImageLoader.start();
};

var show_clue_match = function(target, clue, show_neg) {
    var child, i, j;
    var card, match = false;

    for (i = 0; i < ui.player_names.length; i++)
    {
        if (i === target) {
            continue;
        }

        for (j = 0; j < player_hands[i].children.length; j++)
        {
            child = player_hands[i].children[j];

            card = child.children[0];

            card.setIndicator(false);
        }
    }

    cardlayer.batchDraw();

    if (target < 0) {
        return;
    }

    for (i = 0; i < player_hands[target].children.length; i++)
    {
        child = player_hands[target].children[i];

        card = child.children[0];

        if ((clue.type === CLUE.RANK && clue.value === card.rank) ||
            (clue.type === CLUE.SUIT && clue.value === card.suit) ||
            (clue.type === CLUE.SUIT && card.suit === 5 && ui.variant === VARIANT.RAINBOW))
        {
            match = true;

            card.setIndicator(true);
        }
        else
        {
            card.setIndicator(false);
        }
    }

    cardlayer.batchDraw();

    return match;
};

var suit_colors = [
    "#0044cc",
    "#00cc00",
    "#ccaa22",
    "#aa0000",
    "#6600cc",
    "#111111",
    "#cccccc",
];

var card_images = {};
var scale_card_images = {};

this.build_cards = function() {
    var cvs, ctx;
    var i, j, name;
    var xrad = cardw * 0.08, yrad = cardh * 0.08;
    var x, y;
    var rainbow = false, grad;
    var pathfuncs = [];

    if (this.variant === VARIANT.RAINBOW) {
        rainbow = true;
    }

    pathfuncs[0] = function() {
        ctx.beginPath();
        ctx.moveTo(75, 0);
        ctx.quadraticCurveTo(110, 60, 150, 100);
        ctx.quadraticCurveTo(110, 140, 75, 200);
        ctx.quadraticCurveTo(40, 140, 0, 100);
        ctx.quadraticCurveTo(40, 60, 75, 0);
    };

    pathfuncs[1] = function() {
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 4.712, true);
        ctx.arc(75, 50, 35, 1, 2.1416, true);
        ctx.arc(40, 110, 35, 4.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    };

    pathfuncs[2] = function() {
        var i;
        ctx.translate(75, 100);
        ctx.beginPath();
        ctx.moveTo(0, -75);
        for (i = 0; i < 5; i++)
        {
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -30);
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -75);
        }
    };

    pathfuncs[3] = function() {
        ctx.beginPath();
        ctx.moveTo(75, 65);
        ctx.bezierCurveTo(75, 57, 70, 45, 50, 45);
        ctx.bezierCurveTo(20, 45, 20, 82, 20, 82);
        ctx.bezierCurveTo(20, 100, 40, 122, 75, 155);
        ctx.bezierCurveTo(110, 122, 130, 100, 130, 82);
        ctx.bezierCurveTo(130, 82, 130, 45, 100, 45);
        ctx.bezierCurveTo(85, 45, 75, 57, 75, 65);
    };

    pathfuncs[4] = function() {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 3, 4.3, true);
        ctx.arc(48, 83, 52, 5, 2.5, false);
    };

    pathfuncs[5] = function() {
        ctx.beginPath();
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 5.712, true);
        ctx.lineTo(75, 0);
        ctx.arc(40, 110, 35, 3.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    };

    if (rainbow)
    {
        pathfuncs[5] = function() {
            ctx.beginPath();
            ctx.moveTo(0, 140);
            ctx.arc(75, 140, 75, Math.PI, 0, false);
            ctx.lineTo(125, 140);
            ctx.arc(75, 140, 25, 0, Math.PI, true);
            ctx.lineTo(0, 140);
        };
    }

    var backpath = function(p) {
        ctx.beginPath();
        ctx.moveTo(p, yrad + p);
        ctx.lineTo(p, cardh - yrad - p);
        ctx.quadraticCurveTo(0, cardh, xrad + p, cardh - p);
        ctx.lineTo(cardw - xrad - p, cardh - p);
        ctx.quadraticCurveTo(cardw, cardh, cardw - p, cardh - yrad - p);
        ctx.lineTo(cardw - p, yrad + p);
        ctx.quadraticCurveTo(cardw, 0, cardw - xrad - p, p);
        ctx.lineTo(xrad + p, p);
        ctx.quadraticCurveTo(0, 0, p, yrad + p);
    };

    var drawshape = function() {
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.fill();
        ctx.shadowColor = "rgba(0, 0, 0, 0)";
        ctx.stroke();
    };

    // 0-5 are the real suits. 6 is a "white" suit for replays
    for (i = 0; i < 7; i++) {
        //0 is the stack base. 1-5 are the cards 1-5. 6 is a numberless card for replays.
        for (j = 0; j < 7; j++) {
            name = "card-" + i + "-" + j;

            cvs = document.createElement("canvas");
            cvs.width = cardw;
            cvs.height = cardh;

            ctx = cvs.getContext("2d");

            card_images[name] = cvs;

            backpath(4);

            ctx.fillStyle = "white";
            ctx.fill();

            ctx.save();
            ctx.clip();
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = "black";
            for (x = 0; x < cardw; x += 4 + Math.random() * 4) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, cardh);
                ctx.stroke();
            }
            for (y = 0; y < cardh; y += 4 + Math.random() * 4) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(cardw, y);
                ctx.stroke();
            }
            ctx.restore();

            if (i === 5 && rainbow) {
                grad = ctx.createLinearGradient(0, 0, 0, cardh);

                grad.addColorStop(0, suit_colors[0]);
                grad.addColorStop(0.25, suit_colors[1]);
                grad.addColorStop(0.5, suit_colors[2]);
                grad.addColorStop(0.75, suit_colors[3]);
                grad.addColorStop(1, suit_colors[4]);

                ctx.fillStyle = grad;
                ctx.strokeStyle = grad;
            }
            else
            {
                ctx.fillStyle = suit_colors[i];
                ctx.strokeStyle = suit_colors[i];
            }

            backpath(4);

            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fill();
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 8;
            ctx.stroke();
            ctx.restore();

            ctx.shadowBlur = 10;

            if (i === 5 && rainbow) {
                grad = ctx.createLinearGradient(0, 14, 0, 110);

                grad.addColorStop(0, suit_colors[0]);
                grad.addColorStop(0.25, suit_colors[1]);
                grad.addColorStop(0.5, suit_colors[2]);
                grad.addColorStop(0.75, suit_colors[3]);
                grad.addColorStop(1, suit_colors[4]);

                ctx.fillStyle = grad;
            }

            var suit_letter = suit_abbreviations[i];
            if (suit_letter === "K" && rainbow) {
                suit_letter = "M";
            }


            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            ctx.lineJoin = "round";
            var text_y_pos = 110;
            ctx.font = "bold 96pt Arial";
            var index_label = j.toString();
            if (j === 6) {
                index_label = "";
            }

            if (lobby.show_colorblind_ui) {
                ctx.font = "bold 68pt Arial";
                text_y_pos = 83;
                index_label = suit_letter + index_label;
            }

            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.fillText(index_label, 19, text_y_pos);
            ctx.shadowColor = "rgba(0, 0, 0, 0)";
            ctx.strokeText(index_label, 19, text_y_pos);

            ctx.save();
            ctx.translate(cardw, cardh);
            ctx.rotate(Math.PI);
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.fillText(index_label, 19, text_y_pos);
            ctx.shadowColor = "rgba(0, 0, 0, 0)";
            ctx.strokeText(index_label, 19, text_y_pos);
            ctx.restore();

            if (i === 5 && rainbow) {
                grad = ctx.createRadialGradient(75, 150, 25, 75, 150, 75);

                grad.addColorStop(0, suit_colors[0]);
                grad.addColorStop(0.25, suit_colors[1]);
                grad.addColorStop(0.5, suit_colors[2]);
                grad.addColorStop(0.75, suit_colors[3]);
                grad.addColorStop(1, suit_colors[4]);

                ctx.fillStyle = grad;
            }

            ctx.lineWidth = 5;
            if (i !== 6) {
                if (j === 1 || j === 3) {
                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.scale(0.4, 0.4);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();
                }

                if (j > 1 && j !== 6) {
                    var symbol_y_pos = 120;
                    if (lobby.show_colorblind_ui) {
                        symbol_y_pos = 85;
                    }
                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.translate(0, -symbol_y_pos);
                    ctx.scale(0.4, 0.4);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();

                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.translate(0, symbol_y_pos);
                    ctx.scale(0.4, 0.4);
                    ctx.rotate(Math.PI);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();
                }

                if (j > 3 && j !== 6) {
                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.translate(-90, 0);
                    ctx.scale(0.4, 0.4);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();

                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.translate(90, 0);
                    ctx.scale(0.4, 0.4);
                    ctx.rotate(Math.PI);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();
                }

                if (j === 0) {
                    ctx.clearRect(0, 0, cardw, cardh);
                    if (lobby.show_colorblind_ui) {
                        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
                        ctx.fillText(suit_letter, 19, 83);
                        ctx.shadowColor = "rgba(0, 0, 0, 0)";
                        ctx.strokeText(suit_letter, 19, 83);
                    }

                }

                if (j === 0 || j === 5)
                {
                    ctx.save();
                    ctx.translate(cardw / 2, cardh / 2);
                    ctx.scale(0.6, 0.6);
                    ctx.translate(-75, -100);
                    pathfuncs[i]();
                    drawshape();
                    ctx.restore();
                }
            }
        }
    }

    cvs = document.createElement("canvas");
    cvs.width = cardw;
    cvs.height = cardh;

    ctx = cvs.getContext("2d");

    card_images["card-back"] = cvs;

    backpath(4);

    ctx.fillStyle = "white";
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "black";
    for (x = 0; x < cardw; x += 4 + Math.random() * 4)
    {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cardh);
        ctx.stroke();
    }
    for (y = 0; y < cardh; y += 4 + Math.random() * 4)
    {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cardw, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "black";

    backpath(4);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#444444";
    ctx.lineWidth = 8;
    ctx.lineJoin = "round";

    ctx.translate(cardw / 2, cardh / 2);

    for (i = 0; i < 5; i++)
    {
        ctx.save();
        ctx.translate(0, -90);
        ctx.scale(0.4, 0.4);
        ctx.rotate(-i * Math.PI * 2 / 5);
        ctx.translate(-75, -100);
        pathfuncs[i]();
        drawshape();
        ctx.restore();

        ctx.rotate(Math.PI * 2 / 5);
    }
};

var size_stage = function(stage) {
    var ww = window.innerWidth;
    var wh = window.innerHeight;
    var cw, ch;

    if (ww < 640) {
        ww = 640;
    }
    if (wh < 360) {
        wh = 360;
    }

    var ratio = 1.777;

    if (ww < wh * ratio)
    {
        cw = ww;
        ch = ww / ratio;
    }
    else
    {
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

var stage = new Kinetic.Stage({
    container: "game",
});

size_stage(stage);

var win_w = stage.getWidth();
var win_h = stage.getHeight();

var bglayer    = new Kinetic.Layer();
var cardlayer  = new Kinetic.Layer();
var uilayer    = new Kinetic.Layer();
var overlayer  = new Kinetic.Layer();
var tiplayer   = new Kinetic.Layer();
var timerlayer = new Kinetic.Layer();

var player_hands = [];
var drawdeck;
var message_prompt, clue_label, score_label, spectators_label, spectators_num_label;
var strikes = [];
var name_frames = [];
var play_stacks = [], discard_stacks = [];
var play_area, discard_area, clue_log;
var clue_area, clue_target_group, clue_type_group, submit_clue;
var timer_rect1, timer_label1, timer_text1;
var timer_rect2, timer_label2, timer_text2;
var no_clue_label, no_clue_box, no_discard_label, deck_play_available_label;
var replay_area, replay_bar, replay_shuttle, replay_button;
var lobby_button, help_button;
var helpgroup;
var msgloggroup, overback;
var notes_written = {};

var overPlayArea = function(pos)
{
    return pos.x >= play_area.getX() &&
           pos.y >= play_area.getY() &&
           pos.x <= play_area.getX() + play_area.getWidth() &&
           pos.y <= play_area.getY() + play_area.getHeight();
};

this.build_ui = function() {
    var self = this;
    var x, y, width, height, offset, radius;
    var i, j;
    var rect, img, text, button;
    var suits = 5;

    if (this.variant) {
        suits = 6;
    }

    var layers = stage.getLayers();

    for (i = 0; i < layers.length; i++)
    {
        layers[i].remove();
    }

    var background = new Kinetic.Image({
        x: 0,
        y: 0,
        width: win_w,
        height: win_h,
        image: ImageLoader.get("background"),
    });

    bglayer.add(background);

    play_area = new Kinetic.Rect({
        x: 0.183 * win_w,
        y: 0.3 * win_h,
        width: 0.435 * win_w,
        height: 0.189 * win_h,
    });

    discard_area = new Kinetic.Rect({
        x: 0.8 * win_w,
        y: 0.6 * win_h,
        width: 0.2 * win_w,
        height: 0.4 * win_h,
    });

    no_discard_label = new Kinetic.Rect({
        x: 0.8 * win_w,
        y: 0.6 * win_h,
        width: 0.19 * win_w,
        height: 0.39 * win_h,
        stroke: "#df1c2d",
        strokeWidth: 0.007 * win_w,
        cornerRadius: 0.01 * win_w,
        visible: false,
    });

    uilayer.add(no_discard_label);

    rect = new Kinetic.Rect({
        x: 0.8 * win_w,
        y: 0.6 * win_h,
        width: 0.19 * win_w,
        height: 0.39 * win_h,
        fill: "black",
        opacity: 0.2,
        cornerRadius: 0.01 * win_w,
    });

    bglayer.add(rect);

    img = new Kinetic.Image({
        x: 0.82 * win_w,
        y: 0.62 * win_h,
        width: 0.15 * win_w,
        height: 0.35 * win_h,
        opacity: 0.2,
        image: ImageLoader.get("trashcan"),
    });

    bglayer.add(img);

    rect = new Kinetic.Rect({
        x: 0.2 * win_w,
        y: (MHGA_show_more_log ? 0.235 : 0.24) * win_h,
        width: 0.4 * win_w,
        height: (MHGA_show_more_log ? 0.098 : 0.05) * win_h,
        fill: "black",
        opacity: 0.3,
        cornerRadius: 0.01 * win_h,
        listening: true,
    });

    bglayer.add(rect);

    rect.on("click tap", function() {
        msgloggroup.show();
        overback.show();

        overlayer.draw();

        overback.on("click tap", function() {
            overback.off("click tap");

            msgloggroup.hide();
            overback.hide();

            overlayer.draw();
        });
    });

    message_prompt = new MultiFitText({
        align: "center",
        fontSize: 0.028 * win_h,
        fontFamily: "Verdana",
        fill: "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
        x: 0.21 * win_w,
        y: (MHGA_show_more_log ? 0.238 : 0.25) * win_h,
        width: 0.38 * win_w,
        height: (MHGA_show_more_log ? 0.095 : 0.03) * win_h,
        maxLines: (MHGA_show_more_log ? 3 : 1),
    });

    uilayer.add(message_prompt);

    overback = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: win_w,
        height: win_h,
        opacity: 0.3,
        fill: "black",
        visible: false,
    });

    overlayer.add(overback);

    msgloggroup = new HanabiMsgLog();

    overlayer.add(msgloggroup);

    rect = new Kinetic.Rect({
        x: 0.66 * win_w,
        y: 0.81 * win_h,
        width: 0.13 * win_w,
        height: 0.18 * win_h,
        fill: "black",
        opacity: 0.2,
        cornerRadius: 0.01 * win_w,
    });

    bglayer.add(rect);

    for (i = 0; i < 3; i++)
    {
        rect = new Kinetic.Rect({
            x: (0.67 + 0.04 * i) * win_w,
            y: 0.91 * win_h,
            width: 0.03 * win_w,
            height: 0.053 * win_h,
            fill: "black",
            opacity: 0.6,
            cornerRadius: 0.003 * win_w,
        });

        bglayer.add(rect);
    }

    clue_label = new Kinetic.Text({
        x: 0.67 * win_w,
        y: 0.83 * win_h,
        width: 0.11 * win_w,
        height: 0.03 * win_h,
        fontSize: 0.03 * win_h,
        fontFamily: "Verdana",
        align: "center",
        text: "Clues: 8",
        fill: "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });

    uilayer.add(clue_label);

    score_label = new Kinetic.Text({
        x: 0.67 * win_w,
        y: 0.87 * win_h,
        width: 0.11 * win_w,
        height: 0.03 * win_h,
        fontSize: 0.03 * win_h,
        fontFamily: "Verdana",
        align: "center",
        text: "Score: 0",
        fill: "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });

    uilayer.add(score_label);

    spectators_label = new Kinetic.Text({
        x: 0.583 * win_w,
        y: 0.9 * win_h,
        width: 0.11 * win_w,
        height: 0.03 * win_h,
        fontSize: 0.03 * win_h,
        fontFamily: "Verdana",
        align: "center",
        text: "👀",
        fill: "yellow", // "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    uilayer.add(spectators_label);

    spectators_num_label = new Kinetic.Text({
        x: 0.583 * win_w,
        y: 0.934 * win_h,
        width: 0.11 * win_w,
        height: 0.03 * win_h,
        fontSize: 0.03 * win_h,
        fontFamily: "Verdana",
        align: "center",
        text: "0",
        fill: "#d8d5ef",
        shadowColor: "black",
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    uilayer.add(spectators_num_label);

    rect = new Kinetic.Rect({
        x: 0.8 * win_w,
        y: 0.01 * win_h,
        width: 0.19 * win_w,
        height: 0.58 * win_h,
        fill: "black",
        opacity: 0.2,
        cornerRadius: 0.01 * win_w,
    });

    bglayer.add(rect);

    clue_log = new HanabiClueLog({
        x: 0.81 * win_w,
        y: 0.02 * win_h,
        width: 0.17 * win_w,
        height: 0.56 * win_h,
    });

    uilayer.add(clue_log);

    var pileback;

    y = 0.05;
    width = 0.075;
    height = 0.189;
    offset = 0;
    radius = 0.006;

    if (this.variant) {
        y = 0.04;
        width = 0.06;
        height = 0.151;
        offset = 0.019;
        radius = 0.004;
    }

    for (i = 0; i < suits; i++) {
        pileback = new Kinetic.Rect({
            fill: suit_colors[i],
            opacity: 0.4,
            x: (0.183 + (width + 0.015) * i) * win_w,
            y: ((MHGA_show_more_log ? 0.345 : 0.3) + offset) * win_h,
            width: width * win_w,
            height: height * win_h,
            cornerRadius: radius * win_w,
        });

        bglayer.add(pileback);

        pileback = new Kinetic.Image({
            x: (0.183 + (width + 0.015) * i) * win_w,
            y: ((MHGA_show_more_log ? 0.345 : 0.3) + offset) * win_h,
            width: width * win_w,
            height: height * win_h,
            image: card_images["card-" + i + "-0"],
        });

        bglayer.add(pileback);

        pileback = new Kinetic.Rect({
            stroke: suit_colors[i],
            strokeWidth: 5,
            x: (0.183 + (width + 0.015) * i) * win_w,
            y: ((MHGA_show_more_log ? 0.345 : 0.3) + offset) * win_h,
            width: width * win_w,
            height: height * win_h,
            cornerRadius: radius * win_w,
        });

        bglayer.add(pileback);

        play_stacks[i] = new CardStack({
            x: (0.183 + (width + 0.015) * i) * win_w,
            y: ((MHGA_show_more_log ? 0.345 : 0.3) + offset) * win_h,
            width: width * win_w,
            height: height * win_h,
        });

        cardlayer.add(play_stacks[i]);

        discard_stacks[i] = new CardLayout({
            x: 0.81 * win_w,
            y: (0.61 + y * i) * win_h,
            width: 0.17 * win_w,
            height: 0.17 * win_h,
        });

        cardlayer.add(discard_stacks[i]);
    }

    rect = new Kinetic.Rect({
        x: 0.08 * win_w,
        y: 0.8 * win_h,
        width: 0.075 * win_w,
        height: 0.189 * win_h,
        fill: "black",
        opacity: 0.2,
        cornerRadius: 0.006 * win_w,
    });

    bglayer.add(rect);

    drawdeck = new CardDeck({
        x: 0.08 * win_w,
        y: 0.8 * win_h,
        width: 0.075 * win_w,
        height: 0.189 * win_h,
        cardback: "card-back",
    });

    drawdeck.on("dragend.play", function() {
        var pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        if (overPlayArea(pos)) {
            ui.send_msg({
                type: "action",
                resp: {
                    type: ACT.DECKPLAY,
                },
            });

            self.stop_action();

            this.setDraggable(false);

            // We need to return the deck to its original position somehow, since it seems to stay where the user dragged it
            // Why don't cards have this behavior?
            this.resetPosition();

            deck_play_available_label.setVisible(false);

            saved_action = null;

        } else {
            new Kinetic.Tween({
                node: this,
                duration: 0.5,
                x: 0.08 * win_w,
                y: 0.8 * win_h,
                runonce: true,
                onFinish: function() {
                    uilayer.draw();
                },
            }).play();
        }
    });

    cardlayer.add(drawdeck);

    var hand_pos = {
        2: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0, },
            { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0, },
        ],
        3: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0, },
            { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78, },
            { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78, },
        ],
        4: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0, },
            { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78, },
            { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0, },
            { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78, },
        ],
        5: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0, },
            { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90, },
            { x: 0.025, y: 0.009, w: 0.34, h: 0.189, rot: 0, },
            { x: 0.445, y: 0.009, w: 0.34, h: 0.189, rot: 0, },
            { x: 0.77, y: 0.22, w: 0.301, h: 0.18, rot: 90, },
        ],
    };

    var shade_pos = {
        2: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0, },
            { x: 0.185, y: 0.002, w: 0.43, h: 0.205, rot: 0, },
        ],
        3: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0, },
            { x: 0.005, y: 0.718, w: 0.42, h: 0.205, rot: -78, },
            { x: 0.708, y: -0.008, w: 0.42, h: 0.205, rot: 78, },
        ],
        4: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0, },
            { x: 0.01, y: 0.708, w: 0.35, h: 0.205, rot: -78, },
            { x: 0.225, y: 0.002, w: 0.35, h: 0.205, rot: 0, },
            { x: 0.718, y: 0.087, w: 0.35, h: 0.205, rot: 78, },
        ],
        5: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0, },
            { x: 0.026, y: 0.775, w: 0.311, h: 0.196, rot: -90, },
            { x: 0.02, y: 0.001, w: 0.35, h: 0.205, rot: 0, },
            { x: 0.44, y: 0.001, w: 0.35, h: 0.205, rot: 0, },
            { x: 0.774, y: 0.215, w: 0.311, h: 0.196, rot: 90, },
        ],
    };

    var name_pos = {
        2: [
            { x: 0.18, y: 0.97, w: 0.44, h: 0.02, },
            { x: 0.18, y: 0.21, w: 0.44, h: 0.02, },
        ],
        3: [
            { x: 0.18, y: 0.97, w: 0.44, h: 0.02, },
            { x: 0.01, y: 0.765, w: 0.12, h: 0.02, },
            { x: 0.67, y: 0.765, w: 0.12, h: 0.02, },
        ],
        4: [
            { x: 0.22, y: 0.97, w: 0.36, h: 0.02, },
            { x: 0.01, y: 0.74, w: 0.13, h: 0.02, },
            { x: 0.22, y: 0.21, w: 0.36, h: 0.02, },
            { x: 0.66, y: 0.74, w: 0.13, h: 0.02, },
        ],
        5: [
            { x: 0.22, y: 0.97, w: 0.36, h: 0.02, },
            { x: 0.025, y: 0.775, w: 0.116, h: 0.02, },
            { x: 0.015, y: 0.199, w: 0.36, h: 0.02, },
            { x: 0.435, y: 0.199, w: 0.36, h: 0.02, },
            { x: 0.659, y: 0.775, w: 0.116, h: 0.02, },
        ],
    };

    var nump = this.player_names.length;

    for (i = 0; i < nump; i++) {
        j = i - this.player_us;

        if (j < 0) {
            j += nump;
        }

        player_hands[i] = new CardLayout({
            x: hand_pos[nump][j].x * win_w,
            y: hand_pos[nump][j].y * win_h,
            width: hand_pos[nump][j].w * win_w,
            height: hand_pos[nump][j].h * win_h,
            rotationDeg: hand_pos[nump][j].rot,
            align: "center",
            reverse: j === 0,
        });

        cardlayer.add(player_hands[i]);

        rect = new Kinetic.Rect({
            x: shade_pos[nump][j].x * win_w,
            y: shade_pos[nump][j].y * win_h,
            width: shade_pos[nump][j].w * win_w,
            height: shade_pos[nump][j].h * win_h,
            rotationDeg: shade_pos[nump][j].rot,
            cornerRadius: 0.01 * shade_pos[nump][j].w * win_w,
            opacity: 0.4,
            fillLinearGradientStartPoint: {
                x: 0,
                y: 0,
            },
            fillLinearGradientEndPoint: {
                x: shade_pos[nump][j].w * win_w,
                y: 0,
            },
            fillLinearGradientColorStops: [
                0,
                "rgba(0,0,0,0)",
                0.9,
                "white",
            ],
        });

        if (j === 0) {
            rect.setFillLinearGradientColorStops([
                1,
                "rgba(0,0,0,0)",
                0.1,
                "white",
            ]);
        }

        bglayer.add(rect);

        name_frames[i] = new HanabiNameFrame({
            x: name_pos[nump][j].x * win_w,
            y: name_pos[nump][j].y * win_h,
            width: name_pos[nump][j].w * win_w,
            height: name_pos[nump][j].h * win_h,
            name: this.player_names[i],
        });

        uilayer.add(name_frames[i]);

        // The following code is copied from HanabiCard
        if (ui.timed_game) {
            let frame_hover_tooltip = new Kinetic.Label({
                x: -1000,
                y: -1000,
            });

            frame_hover_tooltip.add(new Kinetic.Tag({
                fill: '#3E4345',
                pointerDirection: 'left',
                pointerWidth: 0.02 * win_w,
                pointerHeight: 0.015 * win_h,
                lineJoin: 'round',
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 3,
                    y: 3,
                },
                shadowOpacity: 0.6,
            }));

            frame_hover_tooltip.add(new FitText({
                fill: "white",
                align: "left",
                padding: 0.01 * win_h,
                fontSize: 0.04 * win_h,
                minFontSize: 0.02 * win_h,
                width: 0.075 * win_w,
                fontFamily: "Verdana",
                text: "??:??",
            }));

            tiplayer.add(frame_hover_tooltip);
            name_frames[i].tooltip = frame_hover_tooltip;

            name_frames[i].on("mousemove", function() {
                var mousePos = stage.getPointerPosition();
                this.tooltip.setX(mousePos.x + 15);
                this.tooltip.setY(mousePos.y + 5);

                this.tooltip.show();
                tiplayer.draw();

                ui.activeHover = this;
            });

            name_frames[i].on("mouseout", function() {
                this.tooltip.hide();
                tiplayer.draw();
            });
        }
    }

    no_clue_box = new Kinetic.Rect({
        x: 0.275 * win_w,
        y: 0.56 * win_h,
        width: 0.25 * win_w,
        height: 0.15 * win_h,
        cornerRadius: 0.01 * win_w,
        fill: "black",
        opacity: 0.5,
        visible: false,
    });

    uilayer.add(no_clue_box);

    no_clue_label = new Kinetic.Text({
        x: 0.15 * win_w,
        y: 0.585 * win_h,
        width: 0.5 * win_w,
        height: 0.19 * win_h,
        fontFamily: "Verdana",
        fontSize: 0.08 * win_h,
        strokeWidth: 1,
        text: "No Clues",
        align: "center",
        fill: "#df2c4d",
        stroke: "black",
        visible: false,
    });

    uilayer.add(no_clue_label);

    clue_area = new Kinetic.Group({
        x: 0.10 * win_w,
        y: (MHGA_show_more_log ? 0.54 : 0.51) * win_h,
        width: 0.55 * win_w,
        height: 0.27 * win_h,
    });

    clue_target_group = new ButtonGroup();
    clue_type_group = new ButtonGroup();

    //var button; // This is already defined

    x = 0.26 * win_w - (nump - 2) * 0.044 * win_w;

    for (i = 0; i < nump - 1; i++)
    {
        j = (this.player_us + i + 1) % nump;

        button = new Button({
            x: x,
            y: 0,
            width: 0.08 * win_w,
            height: 0.025 * win_h,
            text: this.player_names[j],
            target_index: j,
        });

        clue_area.add(button);

        x += 0.0875 * win_w;

        clue_target_group.add(button);
    }

    for (i = 1; i <= 5; i++)
    {
        button = new NumberButton({
            x: (0.183 + (i - 1) * 0.049) * win_w,
            y: (MHGA_show_more_log ? 0.027 : 0.035) * win_h,
            width: 0.04 * win_w,
            height: 0.071 * win_h,
            number: i,
            clue_type: {
                type: CLUE.RANK,
                value: i,
            },
        });

        clue_area.add(button);

        clue_type_group.add(button);
    }

    suits = 5;
    x = 0.183;

    if (this.variant === VARIANT.BLACKSUIT || this.variant === VARIANT.BLACKONE)
    {
        suits = 6;
        x = 0.158;
    }

    for (i = 0; i < suits; i++)
    {
        button = new ColorButton({
            x: (x + i * 0.049) * win_w,
            y: (MHGA_show_more_log ? 0.1 : 0.115) * win_h,
            width: 0.04 * win_w,
            height: 0.071 * win_h,
            color: suit_colors[i],
            text: suit_abbreviations[i],
            clue_type: {
                type: CLUE.SUIT,
                value: i,
            },
        });

        clue_area.add(button);

        clue_type_group.add(button);
    }

    submit_clue = new Button({
        x: 0.183 * win_w,
        y: (MHGA_show_more_log ? 0.172 : 0.195) * win_h,
        width: 0.236 * win_w,
        height: 0.051 * win_h,
        text: "Give Clue",
    });

    clue_area.add(submit_clue);

    clue_area.hide();

    if (ui.timed_game) {
        let x = 0.155;
        let y = (MHGA_show_more_log ? 0.592 : 0.615);
        let x2 = 0.565;

        timer_rect1 = new Kinetic.Rect({
            x: x * win_w,
            y: y * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fill: "black",
            cornerRadius: 0.005 * win_h,
            opacity: 0.2,
        });
        timerlayer.add(timer_rect1);

        timer_label1 = new Kinetic.Text({
            x: x * win_w,
            y: (y + 0.06) * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fontSize: 0.03 * win_h,
            fontFamily: "Verdana",
            align: "center",
            text: "You",
            fill: "#d8d5ef",
            shadowColor: "black",
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        timerlayer.add(timer_label1);

        timer_text1 = new Kinetic.Text({
            x: x * win_w,
            y: (y + 0.01) * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fontSize: 0.03 * win_h,
            fontFamily: "Verdana",
            align: "center",
            text: "??:??",
            fill: "#d8d5ef",
            shadowColor: "black",
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        timerlayer.add(timer_text1);

        timer_rect2 = new Kinetic.Rect({
            x: x2 * win_w,
            y: y * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fill: "black",
            cornerRadius: 0.005 * win_h,
            opacity: 0.2,
        });
        timerlayer.add(timer_rect2);

        timer_label2 = new Kinetic.Text({
            x: x2 * win_w,
            y: (y + 0.06) * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fontSize: 0.02 * win_h,
            fontFamily: "Verdana",
            align: "center",
            text: "Current\nPlayer",
            fill: "#d8d5ef",
            shadowColor: "black",
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        timerlayer.add(timer_label2);

        timer_text2 = new Kinetic.Text({
            x: x2 * win_w,
            y: (y + 0.01) * win_h,
            width: 0.08 * win_w,
            height: 0.051 * win_h,
            fontSize: 0.03 * win_h,
            fontFamily: "Verdana",
            align: "center",
            text: "??:??",
            fill: "#d8d5ef",
            shadowColor: "black",
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        timerlayer.add(timer_text2);

        // Hide the first timer if spectating
        if (this.spectating) {
            timer_rect1.hide();
            timer_label1.hide();
            timer_text1.hide();
        }

        // Hide the second timer by default
        if (this.spectating === false) {
            timer_rect2.hide();
            timer_label2.hide();
            timer_text2.hide();
        }
    }

    uilayer.add(clue_area);

    replay_area = new Kinetic.Group({
        x: 0.15 * win_w,
        y: 0.51 * win_h,
        width: 0.5 * win_w,
        height: 0.27 * win_h,
    });

    replay_bar = new Kinetic.Rect({
        x: 0,
        y: 0.0425 * win_h,
        width: 0.5 * win_w,
        height: 0.01 * win_h,
        fill: "black",
        cornerRadius: 0.005 * win_h,
        listening: false,
    });

    replay_area.add(replay_bar);

    rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: 0.5 * win_w,
        height: 0.05 * win_h,
        opacity: 0,
    });

    rect.on("click", function(evt) {
        var x = evt.evt.x - this.getAbsolutePosition().x;
        var w = this.getWidth();
        var step = w / self.replay_max;
        var newturn = Math.floor((x + step / 2) / step);
        if (newturn !== self.replay_turn) {
            self.perform_replay(newturn, true);
        }
    });

    replay_area.add(rect);

    replay_shuttle = new Kinetic.Rect({
        x: 0,
        y: 0.0325 * win_h,
        width: 0.03 * win_w,
        height: 0.03 * win_h,
        fill: "#0000cc",
        cornerRadius: 0.01 * win_w,
        draggable: true,
        dragBoundFunc: function(pos) {
            var min = this.getParent().getAbsolutePosition().x;
            var w = this.getParent().getWidth() - this.getWidth();
            var y = this.getAbsolutePosition().y;
            var x = pos.x - min;
            if (x < 0) {
                x = 0;
            }
            if (x > w) {
                x = w;
            }
            var step = w / self.replay_max;
            var newturn = Math.floor((x + step / 2) / step);
            if (newturn !== self.replay_turn) {
                self.perform_replay(newturn, true);
            }
            x = newturn * step;
            return {
                x: min + x,
                y: y,
            };
        },
    });

    replay_shuttle.on("dragend", function() {
        cardlayer.draw();
        uilayer.draw();
    });

    replay_area.add(replay_shuttle);

    button = new Button({
        x: 0.1 * win_w,
        y: 0.07 * win_h,
        width: 0.06 * win_w,
        height: 0.08 * win_h,
        image: "rewindfull",
    });

    button.on("click tap", function() {
        ui.perform_replay(0);
    });

    replay_area.add(button);

    button = new Button({
        x: 0.18 * win_w,
        y: 0.07 * win_h,
        width: 0.06 * win_w,
        height: 0.08 * win_h,
        image: "rewind",
    });

    button.on("click tap", function() {
        ui.perform_replay(self.replay_turn - 1, true);
    });

    replay_area.add(button);

    button = new Button({
        x: 0.26 * win_w,
        y: 0.07 * win_h,
        width: 0.06 * win_w,
        height: 0.08 * win_h,
        image: "forward",
    });

    button.on("click tap", function() {
        ui.perform_replay(self.replay_turn + 1);
    });

    replay_area.add(button);

    button = new Button({
        x: 0.34 * win_w,
        y: 0.07 * win_h,
        width: 0.06 * win_w,
        height: 0.08 * win_h,
        image: "forwardfull",
    });

    button.on("click tap", function() {
        ui.perform_replay(self.replay_max, true);
    });

    replay_area.add(button);

    button = new Button({
        x: 0.15 * win_w,
        y: 0.17 * win_h,
        width: 0.2 * win_w,
        height: 0.06 * win_h,
        text: "Exit Replay",
    });

    button.on("click tap", function() {
        if (self.replay_only)
        {
            ui.send_msg({
                type: "unattend_table",
                resp: {},
            });

            if (ui.timerId !== null) {
                window.clearInterval(ui.timerId);
                ui.timerId = null;
            }

            ui.lobby.game_ended();
        }
        else
        {
            self.enter_replay(false);
        }
    });

    replay_area.add(button);

    replay_area.hide();
    uilayer.add(replay_area);

    helpgroup = new Kinetic.Group({
        x: 0.1 * win_w,
        y: 0.1 * win_h,
        width: 0.8 * win_w,
        height: 0.8 * win_h,
        visible: false,
        listening: false,
    });

    overlayer.add(helpgroup);

    rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: 0.8 * win_w,
        height: 0.8 * win_h,
        opacity: 0.9,
        fill: "black",
        cornerRadius: 0.01 * win_w,
    });

    helpgroup.add(rect);

    text = new Kinetic.Text({
        x: 0.03 * win_w,
        y: 0.03 * win_h,
        width: 0.74 * win_w,
        height: 0.74 * win_h,
        fontSize: 0.02 * win_w,
        fontFamily: "Verdana",
        fill: "white",
        text: "Welcome to Hanabi!\n\nWhen it is your turn, you may " +
              "play a card by dragging it to the play stacks in the " +
              "center of the screen.\n\nTo discard, drag the card " +
              "to the discard area in the lower right.\n\nTo give " +
              "a clue, select the player who will receive it, then " +
              "select either the number or color of the clue you " +
              "wish to give, then hit the Give Clue button.\n\n" +
              "You may mouseover a card to see what clues have " +
              "been given about it, or mouseover the clues in the " +
              "log to see which cards it referenced.",
    });

    helpgroup.add(text);

    deck_play_available_label = new Kinetic.Rect({
        x: 0.08 * win_w,
        y: 0.8 * win_h,
        width: 0.075 * win_w,
        height: 0.189 * win_h,
        stroke: "yellow",
        cornerRadius: 6,
        strokeWidth: 10,
        visible: false,
    });

    uilayer.add(deck_play_available_label);

    replay_button = new Button({
        x: 0.01 * win_w,
        y: 0.8 * win_h,
        width: 0.06 * win_w,
        height: 0.06 * win_h,
        image: "replay",
        visible: false,
    });

    replay_button.on("click tap", function() {
        self.enter_replay(!self.replay);
    });

    uilayer.add(replay_button);

    help_button = new Button({
        x: 0.01 * win_w,
        y: 0.87 * win_h,
        width: 0.06 * win_w,
        height: 0.06 * win_h,
        text: "Help",
    });

    uilayer.add(help_button);

    help_button.on("click tap", function() {
        helpgroup.show();
        overback.show();

        overlayer.draw();

        overback.on("click tap", function() {
            overback.off("click tap");

            helpgroup.hide();
            overback.hide();

            overlayer.draw();
        });
    });

    lobby_button = new Button({
        x: 0.01 * win_w,
        y: 0.94 * win_h,
        width: 0.06 * win_w,
        height: 0.05 * win_h,
        text: "Lobby",
    });

    uilayer.add(lobby_button);

    lobby_button.on("click tap", function() {
        lobby_button.off("click tap");
        ui.send_msg({
            type: "unattend_table",
            resp: {},
        });

        if (ui.timerId !== null) {
            window.clearInterval(ui.timerId);
            ui.timerId = null;
        }

        ui.lobby.game_ended();
    });

    if (ui.replay)
    {
        replay_area.show();
    }

    stage.add(bglayer);
    stage.add(uilayer);
    if (ui.timed_game) {
        stage.add(timerlayer);
    }
    stage.add(cardlayer);
    stage.add(tiplayer);
    stage.add(overlayer);
};

this.reset = function() {
    var i, suits;

    message_prompt.setMultiText("");
    msgloggroup.reset();

    suits = 5;

    if (this.variant > 0)
    {
        suits = 6;
    }

    for (i = 0; i < suits; i++)
    {
        play_stacks[i].removeChildren();
        discard_stacks[i].removeChildren();
    }

    for (i = 0; i < this.player_names.length; i++)
    {
        player_hands[i].removeChildren();
    }

    ui.deck = [];

    clue_log.clear();
    message_prompt.reset();
    //this should always be overridden before it gets displayed
    drawdeck.setCount(99);


    for (i = 0; i < strikes.length; i++)
    {
        strikes[i].remove();
    }

    strikes = [];

    this.animate_fast = true;
};

this.save_replay = function(msg) {
    var msgData = msg.resp;

    this.replay_log.push(msg);

    if (msgData.type === "turn") {
        this.replay_max = msgData.num;
    }
    if (msgData.type === "game_over") {
        this.replay_max++;
    }

    if (!this.replay_only && this.replay_max > 0) {
        replay_button.show();
    }

    if (this.replay) {
        this.adjust_replay_shuttle();
        uilayer.draw();
    }
};

this.adjust_replay_shuttle = function() {
    var w = replay_shuttle.getParent().getWidth() - replay_shuttle.getWidth();
    replay_shuttle.setX(this.replay_turn * w / this.replay_max);
};

this.enter_replay = function(enter) {
    if (!this.replay && enter)
    {
        this.replay = true;
        this.replay_pos = this.replay_log.length;
        this.replay_turn = this.replay_max;
        this.adjust_replay_shuttle();
        this.stop_action(true);
        replay_area.show();
        for (var i = 0; i < this.deck.length; ++i) {
            this.deck[i].setBareImage();
        }
        uilayer.draw();
        cardlayer.draw();
    }
    else if (this.replay && !enter)
    {
        this.perform_replay(this.replay_max, true);
        this.replay = false;
        replay_area.hide();

        if (saved_action) {
            this.handle_action(saved_action);
        }
        for (let i = 0; i < this.deck.length; ++i) {
            this.deck[i].setBareImage();
        }
        uilayer.draw();
        cardlayer.draw();
    }
};

this.handle_message_in_replay = function(ui, msg) {
    ui.set_message(msg.resp);
};

this.perform_replay = function(target, fast) {
    var msg;
    var rewind = false;

    if (target < 0) {
        target = 0;
    }
    if (target > this.replay_max) {
        target = this.replay_max;
    }

    if (target < this.replay_turn) {
        rewind = true;
    }

    if (this.replay_turn === target) {
        return; // we're already there, nothing to do!
    }

    this.replay_turn = target;

    this.adjust_replay_shuttle();
    if (fast) {
        this.animate_fast = true;
    }

    if (rewind) {
        this.reset();
        this.replay_pos = 0;
    }

    while (true) {
        msg = this.replay_log[this.replay_pos++];

        if (!msg)
        {
            break;
        }

        if (msg.type === "message") {
            this.handle_text_message(msg, this.handle_message_in_replay);
        }

        else if (msg.type === "notify") {
            var performing_replay = true;
            this.handle_notify(msg.resp, performing_replay);
        }

        if (msg.type === "notify" && msg.resp.type === "turn") {
            if (msg.resp.num === this.replay_turn) {
                break;
            }
        }
    }

    this.animate_fast = false;
    msgloggroup.refresh_text();
    message_prompt.refresh_text();
    cardlayer.draw();
    uilayer.draw();

};

this.replay_advanced = function() {
    this.animate_fast = false;

    if (this.replay)
    {
        this.perform_replay(0);
    }

    cardlayer.draw();

    // There's a bug on the emulator where the text doesn't show upon first loading a game
    // Doing this seems to fix it
    uilayer.draw();
};

this.show_connected = function(list) {
    var i;

    if (!this.ready) {
        return;
    }

    for (i = 0; i < list.length; i++) {
        name_frames[i].setConnected(list[i]);
    }

    uilayer.draw();
};

function show_loading() {
    var loadinglayer = new Kinetic.Layer();

    var loadinglabel = new Kinetic.Text({
        fill: "#d8d5ef",
        stroke: "#747278",
        strokeWidth: 1,
        text: "Loading...",
        align: "center",
        x: 0,
        y: 0.7 * win_h,
        width: win_w,
        height: 0.05 * win_h,
        fontFamily: "Arial",
        fontStyle: "bold",
        fontSize: 0.05 * win_h,
    });

    loadinglayer.add(loadinglabel);

    var progresslabel = new Kinetic.Text({
        fill: "#d8d5ef",
        stroke: "#747278",
        strokeWidth: 1,
        text: "0 / 0",
        align: "center",
        x: 0,
        y: 0.8 * win_h,
        width: win_w,
        height: 0.05 * win_h,
        fontFamily: "Arial",
        fontStyle: "bold",
        fontSize: 0.05 * win_h,
    });

    loadinglayer.add(progresslabel);

    ImageLoader.progress_callback = function(done, total) {
        progresslabel.setText(done.toString() + " / " + total.toString());
        loadinglayer.draw();
    };

    stage.add(loadinglayer);
}

show_loading();

var suit_names = [
    "Blue",
    "Green",
    "Yellow",
    "Red",
    "Purple",
    "Black",
    " ",
];

var suit_abbreviations = [
    "B",
    "G",
    "Y",
    "R",
    "P",
    "K",
    "",
];


//the idea here is we get these two events, one with the server telling us to print a message like "Bob discards Blue 1"
//which we want to add slot information to the end of, and another message which we can use to derive slot information.
//i'm not sure if they will always be sent in the same order, so we handle them in either order, just assuming that a
//second pair of messages can't overlap the first.
//"movement" here means a play or discard. (the things we want slot info for)
this.current_movement_slot_num = undefined;
this.current_movement_message = undefined;

this.try_doing_movement_message = function() {
    if (this.current_movement_slot_num && this.current_movement_message) {
        //need to save off and restore original message or else during replays if you go back and forth it will keep adding slot info over and over.
        var original_message = this.current_movement_message.resp.text;
        if (MHGA_show_slot_nums) {
            this.current_movement_message.resp.text = this.current_movement_message.resp.text + " from slot #" + this.current_movement_slot_num;
        }
        if (this.replay) {
            this.handle_message_in_replay(this, this.current_movement_message);
        } else {
            this.handle_message_in_game(this, this.current_movement_message);
        }
        this.current_movement_message.resp.text = original_message;
        delete this.current_movement_slot_num;
        delete this.current_movement_message;
    }
};

this.movement_notify_slot = function(slot_num) {
    if (this.current_movement_slot_num) {
        console.log("ERROR in Make Hanabi Great Again extension: the slot number was set to " + this.current_movement_slot_num + " when I expected it to be undefined.");
    }
    this.current_movement_slot_num = slot_num;
    this.try_doing_movement_message();
};

this.movement_notify_message = function(msg, callback) {
    if (this.current_movement_message) {
        console.log("ERROR in Make Hanabi Great Again extension: the movement message was set to " + this.current_movement_message + " when I expected it to be undefined.");
    }

    this.current_movement_message = msg;
    this.try_doing_movement_message();
};

this.save_slot_information = function(note) {
    for (var i = 0; i < player_hands.length; ++i) {
        var hand = player_hands[i];
        for (var j = 0; j < hand.children.length; ++j) {
            var handchild = hand.children[j];
            var handcard = handchild.children[0];
            if (handcard.order === note.which.order) {
                this.movement_notify_slot(hand.children.length - j);
            }
        }
    }

};

this.getNote = function(card_order) {
    return notes_written[card_order];
};

this.setNote = function(card_order, note) {
    if (note) {
        notes_written[card_order] = note;
    } else {
        delete notes_written[card_order];
    }
    this.save_notes();
};

this.load_notes = function() {
    var cookie = localStorage.getItem(game_id);
    if (cookie) {
        return JSON.parse(cookie);
    } else {
        return {};
    }
};

this.save_notes = function() {
    var cookie = JSON.stringify(notes_written);
    localStorage.setItem(game_id, cookie);
};

this.handle_notify = function(note, performing_replay) {
    var type = note.type;
    var child, order;
    var pos, scale, n;
    var i;

    if (ui.activeHover) {
        ui.activeHover.dispatchEvent(new MouseEvent("mouseout"));
        ui.activeHover = null;
    }

    if (type === "draw") {
        ui.deck[note.order] = new HanabiCard({
            suit: note.suit,
            rank: note.rank,
            order: note.order,
        });

        child = new LayoutChild();
        child.add(ui.deck[note.order]);

        pos = drawdeck.getPosition();

        child.setAbsolutePosition(pos);
        child.setRotation(-player_hands[note.who].getRotation());

        scale = drawdeck.getWidth() / cardw;
        child.setScale({
            x: scale,
            y: scale,
        });

        player_hands[note.who].add(child);

        player_hands[note.who].moveToTop();

        /*
        if (note.who == ui.player_us)
        {
            child.setDraggable(true);

            child.on("dragend.reorder", function() {
                var pos = this.getAbsolutePosition();

                pos.x += this.getWidth() * this.getScaleX() / 2;
                pos.y += this.getHeight() * this.getScaleY() / 2;

                var area = player_hands[ui.player_us];

                if (pos.x >= area.getX() &&
                    pos.y >= area.getY() &&
                    pos.x <= area.getX() + area.getWidth() &&
                    pos.y <= area.getY() + area.getHeight())
                {
                    var i, x;

                    while (1)
                    {
                        i = this.index;
                        x = this.getX();

                        if (i == 0) break;

                        if (x > this.parent.children[i - 1].getX())
                        {
                            this.moveDown();
                        }
                        else
                        {
                            break;
                        }
                    }

                    while (1)
                    {
                        i = this.index;
                        x = this.getX();

                        if (i == this.parent.children.length - 1) break;

                        if (x < this.parent.children[i + 1].getX())
                        {
                            this.moveUp();
                        }
                        else
                        {
                            break;
                        }
                    }
                }

                area.doLayout();
            });
        }
        */
    }

    else if (type === "draw_size") {
        drawdeck.setCount(note.size);
    }

    else if (type === "played") {
        show_clue_match(-1);

        child = ui.deck[note.which.order].parent;

        if (!this.replay || performing_replay) {
            this.save_slot_information(note);
        }

        ui.deck[note.which.order].suit = note.which.suit;
        ui.deck[note.which.order].rank = note.which.rank;
        ui.deck[note.which.order].unknown = false;
        ui.learned_cards[note.which.order] = {
            suit: note.which.suit,
            rank: note.which.rank,
            revealed: true,
        };
        ui.deck[note.which.order].setBareImage();
        ui.deck[note.which.order].hide_clues();


        pos = child.getAbsolutePosition();
        child.setRotation(child.parent.getRotation());
        child.remove();
        child.setAbsolutePosition(pos);

        play_stacks[note.which.suit].add(child);

        play_stacks[note.which.suit].moveToTop();

        clue_log.checkExpiry();
    }

    else if (type === "discard") {
        show_clue_match(-1);

        child = ui.deck[note.which.order].parent;

        if (!this.replay || performing_replay) {
            this.save_slot_information(note);
        }

        ui.deck[note.which.order].suit = note.which.suit;
        ui.deck[note.which.order].rank = note.which.rank;
        ui.deck[note.which.order].unknown = false;
        ui.learned_cards[note.which.order] = {
            suit: note.which.suit,
            rank: note.which.rank,
            revealed: true,
        };
        ui.deck[note.which.order].setBareImage();
        ui.deck[note.which.order].hide_clues();


        pos = child.getAbsolutePosition();
        child.setRotation(child.parent.getRotation());
        child.remove();
        child.setAbsolutePosition(pos);

        discard_stacks[note.which.suit].add(child);

        for (i = 0; i < 6; i++)
        {
            if (discard_stacks[i]) {
                discard_stacks[i].moveToTop();
            }
        }

        while (1)
        {
            n = child.getZIndex();

            if (!n) {
                break;
            }

            if (note.which.rank < child.parent.children[n - 1].children[0].rank)
            {
                child.moveDown();
            }
            else
            {
                break;
            }
        }

        clue_log.checkExpiry();
    }

    else if (type === "reveal") {
        child = ui.deck[note.which.order].parent;

        ui.deck[note.which.order].suit = note.which.suit;
        ui.deck[note.which.order].rank = note.which.rank;
        ui.deck[note.which.order].unknown = false;
        ui.learned_cards[note.which.order] = {
            suit: note.which.suit,
            rank: note.which.rank,
            revealed: true,
        };
        ui.deck[note.which.order].setBareImage();
        ui.deck[note.which.order].hide_clues();

        if (!this.animate_fast) {
            cardlayer.draw();
        }
    }

    else if (type === "clue") {
        show_clue_match(-1);

        for (i = 0; i < note.list.length; i++) {
            ui.deck[note.list[i]].setIndicator(true);
            ui.deck[note.list[i]].clue_given.show();

            if (note.target === ui.player_us && !ui.replay_only && !ui.spectating) {
                ui.deck[note.list[i]].add_clue(note.clue);
                ui.deck[note.list[i]].setBareImage();
            }
        }

        var neglist = [];

        for (i = 0; i < player_hands[note.target].children.length; i++)
        {
            child = player_hands[note.target].children[i];

            order = child.children[0].order;

            if (note.list.indexOf(order) < 0) {
                neglist.push(order);
            }
        }

        if (note.clue.type === CLUE.RANK) {
            type = note.clue.value.toString();
        } else {
            type = suit_names[note.clue.value];
        }

        var entry = new HanabiClueEntry({
            width: clue_log.getWidth(),
            height: 0.017 * win_h,
            giver: ui.player_names[note.giver],
            target: ui.player_names[note.target],
            type: type,
            list: note.list,
            neglist: neglist,
        });

        clue_log.add(entry);

        clue_log.checkExpiry();
    }

    else if (type === "status") {
        clue_label.setText("Clues: " + note.clues);

        if (note.clues === 0) {
            clue_label.setFill("#df1c2d");
        } else if (note.clues === 1) {
            clue_label.setFill("#ef8c1d");
        } else if (note.clues === 2) {
            clue_label.setFill("#efef1d");
        } else {
            clue_label.setFill("#d8d5ef");
        }

        score_label.setText("Score: " + note.score);
        if (!this.animate_fast) {
            uilayer.draw();
        }
    }

    else if (type === "strike") {
        var x = new Kinetic.Image({
            x: (0.675 + 0.04 * (note.num - 1)) * win_w,
            y: 0.918 * win_h,
            width: 0.02 * win_w,
            height: 0.036 * win_h,
            image: ImageLoader.get("redx"),
            opacity: 0,
        });

        strikes[note.num - 1] = x;

        uilayer.add(x);

        if (ui.animate_fast) {
            x.setOpacity(1.0);
        }
        else {
            new Kinetic.Tween({
                node: x,
                opacity: 1.0,
                duration: ui.animate_fast ? 0.001 : 1.0,
                runonce: true,
            }).play();
        }
    }

    else if (type === "turn") {
        for (i = 0; i < ui.player_names.length; i++) {
            name_frames[i].setActive(note.who === i);
        }

        if (!this.animate_fast) {
            uilayer.draw();
        }
    }

    else if (type === "game_over") {
        // Disable the timer when the game ends
        if (ui.timerId !== null) {
            window.clearInterval(ui.timerId);
            ui.timerId = null;
        }

        for (let i = 0; i < this.player_names.length; i++) {
            name_frames[i].off("mousemove");
        }

        if (timer_rect1) {
            timer_rect1.hide();
            timer_label1.hide();
            timer_text1.hide();
        }
        if (timer_rect2) {
            timer_rect2.hide();
            timer_label2.hide();
            timer_text2.hide();
        }

        timerlayer.draw();

        this.replay_only = true;
        replay_button.hide();
        if (!this.replay) {
            this.enter_replay(true);
        }
        if (!this.animate_fast) {
            uilayer.draw();
        }
    }

    else if (type === "boot") {
        if (ui.timerId !== null) {
            window.clearInterval(ui.timerId);
            ui.timerId = null;
        }

        alert('The game was ended by: ' + note.who);
        ui.lobby.game_ended();
    }
};

this.handle_num_spec = function(note) {
    let shouldShowLabel = typeof note.num === 'number' && note.num > 0;
    spectators_label.setVisible(shouldShowLabel);
    spectators_num_label.setVisible(shouldShowLabel);
    if (shouldShowLabel) {
        spectators_num_label.setText(note.num);
    }
    uilayer.draw();
};

this.handle_clock = function(note) {
    if (ui.timerId !== null) {
        window.clearInterval(ui.timerId);
        ui.timerId = null;
    }

    ui.player_times = note.times;

    // Check to see if the second timer has been drawn
    if (typeof(timer_rect2) === 'undefined') {
        return;
    }

    let current_user_turn = note.active === ui.player_us && ui.spectating === false;

    // Update onscreen time displays
    if (ui.spectating === false){
        // The visibilty of this timer does not change during a game
        timer_text1.setText(milliseconds_to_time_display(ui.player_times[ui.player_us]));
    }

    if (! current_user_turn) {
        // Update the ui with the value of the timer for the active player
        timer_text2.setText(milliseconds_to_time_display(ui.player_times[note.active]));
    }

    timer_rect2.setVisible(! current_user_turn);
    timer_label2.setVisible(! current_user_turn);
    timer_text2.setVisible(! current_user_turn);
    timerlayer.draw();

    // Update the timer tooltips for each player
    for (let i = 0; i < ui.player_times.length; i++) {
        name_frames[i].tooltip.getText().setText(milliseconds_to_time_display(ui.player_times[i]));
    }

    tiplayer.draw();

    // Start local timer for active player
    let active_timer_ui_text = current_user_turn ? timer_text1 : timer_text2;
    let textUpdateTargets = [active_timer_ui_text, name_frames[note.active].tooltip.getText()];
    ui.timerId = window.setInterval(function() {
        setTickingDownTime(textUpdateTargets, note.active);
    }, 1000);
};

this.stop_action = function(fast) {
    var i, child;

    if (fast)
    {
        clue_area.hide();
    }
    else
    {
        new Kinetic.Tween({
            node: clue_area,
            opacity: 0.0,
            duration: 0.5,
            runonce: true,
            onFinish: function() {
                clue_area.hide();
            },
        }).play();
    }

        no_clue_label.hide();
        no_clue_box.hide();
        no_discard_label.hide();

    clue_target_group.off("change");
    clue_type_group.off("change");

    for (i = 0; i < player_hands[ui.player_us].children.length; i++)
    {
        child = player_hands[ui.player_us].children[i];

        child.off("dragend.play");
        child.setDraggable(false);
    }

    drawdeck.setDraggable(false);
    deck_play_available_label.setVisible(false);

    submit_clue.off("click tap");
};

var saved_action = null;

this.handle_action = function(data) {

    var self = this;
    var i, child;

    saved_action = data;

    if (this.replay) {
        return;
    }

    if (data.can_clue) {
        clue_area.show();

        new Kinetic.Tween({
            node: clue_area,
            opacity: 1.0,
            duration: 0.5,
            runonce: true,
        }).play();
    } else {
        no_clue_label.show();
        if (MHGA_show_no_clues_box) {
            no_clue_box.show();
        }
        if (!this.animate_fast) {
            uilayer.draw();
        }
    }

    if (!data.can_discard) {
        no_discard_label.show();
        if (!this.animate_fast) {
            uilayer.draw();
        }
    }

    submit_clue.setEnabled(false);

    clue_target_group.clearPressed();
    clue_type_group.clearPressed();

    if (this.player_names.length === 2) {
        clue_target_group.list[0].setPressed(true);
    }

    player_hands[ui.player_us].moveToTop();

    for (i = 0; i < player_hands[ui.player_us].children.length; i++) {
        child = player_hands[ui.player_us].children[i];

        child.setDraggable(true);

        child.on("dragend.play", function() {
            var pos = this.getAbsolutePosition();

            pos.x += this.getWidth() * this.getScaleX() / 2;
            pos.y += this.getHeight() * this.getScaleY() / 2;

            if (overPlayArea(pos))
            {
                ui.send_msg({
                    type: "action",
                    resp: {
                        type: ACT.PLAY,
                        target: this.children[0].order,
                    },
                });

                self.stop_action();

                /* this.off("dragend.reorder"); */
                this.setDraggable(false);

                saved_action = null;
            }

            else if (pos.x >= discard_area.getX() &&
                 pos.y >= discard_area.getY() &&
                 pos.x <= discard_area.getX() + discard_area.getWidth() &&
                 pos.y <= discard_area.getY() + discard_area.getHeight() &&
                 data.can_discard)
            {
                ui.send_msg({
                    type: "action",
                    resp: {
                        type: ACT.DISCARD,
                        target: this.children[0].order,
                    },
                });
                self.stop_action();

                /* this.off("dragend.reorder"); */
                this.setDraggable(false);

                saved_action = null;
            }

            else
            {
                player_hands[ui.player_us].doLayout();
            }
        });
    }

    drawdeck.setDraggable(data.can_blind_play_deck);

    deck_play_available_label.setVisible(data.can_blind_play_deck);

    // Ensure deck blindplay is above other cards, ui elements
    if (data.can_blind_play_deck)
    {
        drawdeck.moveToTop();
    }

    var check_clue_legal = function() {
        var target = clue_target_group.getPressed();
        var type = clue_type_group.getPressed();

        if (!target || !type)
        {
            submit_clue.setEnabled(false);
            return;
        }

        var who = target.target_index;
        var match = show_clue_match(who, type.clue_type);

        if (!match)
        {
            submit_clue.setEnabled(false);
            return;
        }

        submit_clue.setEnabled(true);
    };

    clue_target_group.on("change", check_clue_legal);
    clue_type_group.on("change", check_clue_legal);

    submit_clue.on("click tap", function() {
        if (!data.can_clue) {
            return;
        }

        if (!this.getEnabled()) {
            return;
        }

        var target = clue_target_group.getPressed();
        var type = clue_type_group.getPressed();

        show_clue_match(target.target_index, {});

        ui.send_msg({
            type: "action",
            resp: {
                type: ACT.CLUE,
                target: target.target_index,
                clue: type.clue_type,
            },
        });

        self.stop_action();

        saved_action = null;
    });
};

this.set_message = function(msg) {
    msgloggroup.add_message(msg.text);

    message_prompt.setMultiText(msg.text);
    if (!this.animate_fast) {
        uilayer.draw();
        overlayer.draw();
    }
};

this.destroy = function() {
    stage.destroy();
    if (ui.timerId !== null) {
        window.clearInterval(ui.timerId);
        ui.timerId = null;
    }
};

this.replay_log = [];
this.replay_pos = 0;
this.replay_turn = 0;

}

HanabiUI.prototype.handle_message_in_game = function(ui, msg) {
    ui.replay_log.push(msg);

    if (!ui.replay)
    {
        ui.set_message.call(ui, msg.resp);
    }
};

HanabiUI.prototype.handle_text_message = function(msg, callback) {
    var msgWithoutName = msg.resp.text.substr(msg.resp.text.indexOf(" ") + 1);
    if (msgWithoutName.includes("plays") || msgWithoutName.includes("discards") || msgWithoutName.includes("fails")) {
        this.movement_notify_message(msg, callback);
    } else {
        callback(this, msg);
    }
};

HanabiUI.prototype.handle_message = function(msg) {
    var msgType = msg.type;
    var msgData = msg.resp;

    if (msgType === "message") {
        if (this.replay) {
            this.replay_log.push(msg);
        } else {
            this.handle_text_message(msg, this.handle_message_in_game);
        }
    }

    if (msgType === "init") {
        this.player_us = msgData.seat;
        this.player_names = msgData.names;
        this.variant = msgData.variant;
        this.replay = this.replay_only = msgData.replay;
        if (this.replay_only) {
            this.replay_turn = -1;
        }
        this.spectating = msgData.spectating;
        this.timed_game = msgData.timed;

        this.load_images();
    }

    if (msgType === "advanced") {
        this.replay_advanced();
    }

    if (msgType === "connected") {
        this.show_connected(msgData.list);
    }

    if (msgType === "notify") {
        this.save_replay(msg);

        if (!this.replay || msgData.type === 'reveal') {
            this.handle_notify.call(this, msgData);
        }
    }

    if (msgType === "action") {
        this.handle_action.call(this, msgData);

        if (this.animate_fast) {
            return;
        }

        if (this.lobby.send_turn_notify) {
            this.lobby.send_notify("It's your turn", "turn");
        }
    }

    // This is used to update how many people are currently spectating the game
    if (msgType === "num_spec") {
        this.handle_num_spec.call(this, msgData);
    }

    // This is used for timed games
    if (msgType === "clock") {
        this.handle_clock.call(this, msgData);
    }
};

HanabiUI.prototype.set_backend = function(backend) {
    this.backend = backend;

    this.send_msg({
        type: "hello",
        resp: {},
    });
};

HanabiUI.prototype.send_msg = function(msg) {
    if (MHGA_show_debug_messages) {
        console.log('%cSent (UI) "' + msg.type + '":', 'color: green;');
        console.log(msg.resp);
    }
    this.backend.emit("message", msg);
};
