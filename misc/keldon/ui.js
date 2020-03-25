/* eslint-disable */

"use strict";

function HanabiUI(lobby)
{

this.lobby = lobby;

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

function image_name(card) {

	if (card.unknown) return "card-back";

	var name = "card-";

	name += card.suit + "-";
	name += card.rank;

	return name;
};

var scale_card_image = function(context, name) {
	var width = this.getWidth();
	var height = this.getHeight();
	var am = this.getAbsoluteTransform();
	var src = card_images[name];

	if (!src) return;

	var dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
	var dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

	if (dw < 1 || dh < 1) return;

	var sw = width, sh = height;
	var scale_cvs, scale_ctx;
	var steps = 0;

	if (!scale_card_images[name]) scale_card_images[name] = [];

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
		if (this.needs_resize) this.resize();
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

var HanabiCard = function(config) {
	var self = this;

	config.width = cardw;
	config.height = cardh;
	config.x = cardw / 2;
	config.y = cardh / 2;
	config.offset = { x: cardw / 2, y: cardh / 2 };

	Kinetic.Group.call(this, config);

	this.bare = new Kinetic.Image({
		width: config.width,
		height: config.height
	});

	this.bare.setDrawFunc(function(context) {
		scale_card_image.call(this, context, self.barename);
	});

	this.add(this.bare);

	this.unknown = (config.suit === undefined);
	this.suit = config.suit || 0;
	this.rank = config.rank || 0;
	this.order = config.order;

	this.barename = "";

	this.setBareImage();

	this.indicateRect = new Kinetic.Rect({
		x: 0,
		y: 0,
		width: config.width,
		height: config.height,
		cornerRadius: 6,
		strokeWidth: 12,
		stroke: "#ccccee",
		visible: false,
		listening: false
	});

	this.add(this.indicateRect);

	this.color_clue = new Kinetic.Rect({
		x: .3 * config.width,
		y: .1 * config.height,
		width: .4 * config.width,
		height: .282 * config.height,
		stroke: "black",
		strokeWidth: 12, 
		cornerRadius: 12,
		fillLinearGradientStartPoint: {x: 0, y: 0},
		fillLinearGradientEndPoint: {x: .4 * config.width, y: .282 * config.height},
		fillLinearGradientColorStops: [ 0, "black" ],
		visible: false
	});

	this.add(this.color_clue);

	this.number_clue = new Kinetic.Text({
		x: .3 * config.width,
		y: .5 * config.height,
		width: .4 * config.width,
		height: .282 * config.height,
		align: "center",
		fontFamily: "Verdana",
		fontSize: .282 * config.height,
		fill: "#d8d5ef",
		stroke: "black",
		strokeWidth: 4,
		shadowOpacity: 0.9,
		shadowColor: "black",
		shadowOffset: {x: 0, y: 1 },
		shadowBlur: 2,
		text: "?",
		visible: false
	});

	this.add(this.number_clue);

	this.clue_given = new Kinetic.Circle({
		x: .9 * config.width,
		y: .1 * config.height,
		radius: .05 * config.width,
		fill: "white",
		stroke: "black",
		strokeWidth: 4,
		visible: false
	});

	this.add(this.clue_given);

	this.reset();
};

Kinetic.Util.extend(HanabiCard, Kinetic.Group);

HanabiCard.prototype.reset = function() {
	this.hide_clues();

	this.add_listeners();
};

HanabiCard.prototype.add_listeners = function() {
	var self = this;

	this.on("mouseover tap", function() {
		clue_log.showMatches(self);
		uilayer.draw();
	});

	this.on("mouseout", function() {
		clue_log.showMatches(null);
		uilayer.draw();
	});
};

HanabiCard.prototype.setBareImage = function() {
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
};

HanabiCard.prototype.add_clue = function(clue) {
	var i;

	if (clue.type == CLUE.SUIT)
	{
		var grad = this.color_clue.getFillLinearGradientColorStops();

		if (grad.length == 2)
		{
			this.color_clue.setFillLinearGradientColorStops([0, suit_colors[clue.value], 1, suit_colors[clue.value]]);
		}
		else if (grad[1] == grad[3])
		{
			grad[3] = suit_colors[clue.value];
			this.color_clue.setFillLinearGradientColorStops(grad);
		}
		else
		{
			if (grad[grad.length - 1] == suit_colors[clue.value])
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
		}

		this.color_clue.show();
	}
	else
	{
		this.number_clue.setText(clue.value.toString());
		this.number_clue.show();
	}
};

HanabiCard.prototype.hide_clues = function() {
	this.color_clue.hide();
	this.number_clue.hide();
	this.clue_given.hide();
	this.off("mouseover tap");
	this.off("mouseout");
	clue_log.showMatches(null);
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
		if (evt.oldVal == evt.newVal) return;
		self.setWidth(evt.newVal);
		if (self.parent) self.parent.doLayout();
	});

	child.on("heightChange", function(evt) {
		if (evt.oldVal == evt.newVal) return;
		self.setHeight(evt.newVal);
		if (self.parent) self.parent.doLayout();
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

		if (!node.getHeight()) continue;

		scale = lh / node.getHeight();

		uw += scale * node.getWidth();
	}

	if (n > 1) dist = (lw - uw) / (n - 1);

	if (dist > 10) dist = 10;

	uw += dist * (n - 1);

	if (this.align == "center" && uw < lw) x = (lw - uw) / 2;

	if (this.reverse)
	{
		x = lw - x;
	}

	for (i = 0; i < n; i++)
	{
		node = this.children[i];

		if (!node.getHeight()) continue;

		scale = lh / node.getHeight();

		if (node.tween) node.tween.destroy();

		if (!node.isDragging()) {
			if (ui.animate_fast)
			{
				node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
				node.setY(0);
				node.setScaleX(scale);
				node.setScaleY(scale);
				node.setRotation(0);
			}
			else
			{
				node.tween = new Kinetic.Tween({
					node: node,
					duration: 0.5,
					x: x - (this.reverse ? scale * node.getWidth() : 0),
					y: 0,
					scaleX: scale,
					scaleY: scale,
					rotation: 0,
					runonce: true
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
		image: card_images[config.cardback]
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
		text: "0"
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
			runonce: true
		}).play();

		child.tween.onFinish = function() {
			if (child.parent == self)
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

			if (!node.tween) continue;

			if (node.tween.isPlaying()) return;
		}
		for (i = 0; i < n - 1; i++)
		{
			self.children[i].setVisible(false);
		}
		if (n > 0) self.children[n - 1].setVisible(true);
	};

	for (i = 0; i < n; i++)
	{
		node = this.children[i];

		scale = lh / node.getHeight();

		if (node.tween) node.tween.destroy();

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
				onFinish: hide_under
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
		cornerRadius: .12 * h,
		fill: "black",
		opacity: 0.6
	});

	this.add(background);

	if (config.text)
	{
		var text = new Kinetic.Text({
			name: "text",
			x: 0,
			y: 0.2 * h,
			width: w,
			height: .6 * h,
			listening: false,
			fontSize: .5 * h,
			fontFamily: "Verdana",
			fill: "white",
			align: "center",
			text: config.text
		});

		this.add(text);
	}
	else if (config.image)
	{
		var img = new Kinetic.Image({
			name: "image",
			x: 0.2 * w,
			y: 0.2 * h,
			width: .6 * w,
			height: .6 * h,
			listening: false,
			image: ImageLoader.get(config.image)
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
		cornerRadius: .12 * h,
		fill: "black",
		opacity: 0.6
	});

	this.add(background);

	var text = new Kinetic.Text({
		x: 0,
		y: 0.2 * h,
		width: w,
		height: .6 * h,
		listening: false,
		fontSize: .5 * h,
		fontFamily: "Verdana",
		fill: "white",
		stroke: "black",
		strokeWidth: 1,
		align: "center",
		text: config.number.toString()
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
		cornerRadius: .12 * h,
		fill: "black",
		opacity: 0.6
	});

	this.add(background);

	var color = new Kinetic.Rect({
		x: .1 * w,
		y: .1 * h,
		width: .8 * w,
		height: .8 * h,
		listening: false,
		cornerRadius: .12 * .8 * h,
		fill: config.color,
		opacity: 0.9
	});

	this.add(color);

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
			if (self.list[i] != this && self.list[i].pressed)
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
		if (this.list[i].pressed) return this.list[i];
	}

	return null;
};

ButtonGroup.prototype.clearPressed = function() {
	var i;

	for (i = 0; i < this.list.length; i++)
	{
		if (this.list[i].pressed) this.list[i].setPressed(false);
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
	var i;

	for (i = this.children.length - 1; i >= 0; i--)
	{
		this.children[i].checkExpiry();
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
		listening: true
	});

	this.background = background;

	this.add(background);

	var giver = new FitText({
		x: 0.05 * w,
		y: 0,
		width: .3 * w,
		height: h,
		fontSize: 0.9 * h,
		fontFamily: "Verdana",
		fill: "white",
		text: config.giver,
		listening: false
	});

	this.add(giver);

	var target = new FitText({
		x: .4 * w,
		y: 0,
		width: .3 * w,
		height: h,
		fontSize: 0.9 * h,
		fontFamily: "Verdana",
		fill: "white",
		text: config.target,
		listening: false
	});

	this.add(target);

	var type = new Kinetic.Text({
		x: .75 * w,
		y: 0,
		width: .2 * w,
		height: h,
		align: "center",
		fontSize: 0.9 * h,
		fontFamily: "Verdana",
		fill: "white",
		text: config.type,
		listening: false
	});

	this.add(type);

	this.list = config.list;
	this.neglist = config.neglist;

	background.on("mouseover tap", function() {
		var i;

		clue_log.showMatches(null);

		background.setOpacity(0.4);
		background.getLayer().batchDraw();

		show_clue_match(-1);

		for (i = 0; i < self.list.length; i++)
		{
			if (!self.checkValid(self.list[i])) continue;

			ui.deck[self.list[i]].setIndicator(true);
		}

		for (i = 0; i < self.neglist.length; i++)
		{
			if (!self.checkValid(self.neglist[i])) continue;

			ui.deck[self.neglist[i]].setIndicator(true, true);
		}

		cardlayer.batchDraw();
	});

	background.on("mouseout", function() {
		background.setOpacity(0.1);
		background.getLayer().batchDraw();

		show_clue_match(-1);
	});
};

Kinetic.Util.extend(HanabiClueEntry, Kinetic.Group);

HanabiClueEntry.prototype.checkValid = function(c) {
	if (!ui.deck[c]) return false;

	if (!ui.deck[c].parent) return false;

	return player_hands.indexOf(ui.deck[c].parent.parent) != -1;
};

HanabiClueEntry.prototype.checkExpiry = function() {
	var i;

	for (i = 0; i < this.list.length; i++)
	{
		if (this.checkValid(this.list[i])) return;
	}

	for (i = 0; i < this.neglist.length; i++)
	{
		if (this.checkValid(this.neglist[i])) return;
	}

	this.background.off("mouseover tap");
	this.background.off("mouseout");

	this.remove();
};

HanabiClueEntry.prototype.showMatch = function(target) {
	var i;

	this.background.setOpacity(0.1);
	this.background.setFill("white");

	for (i = 0; i < this.list.length; i++)
	{
		if (ui.deck[this.list[i]] == target)
		{
			this.background.setOpacity(0.4);
		}
	}

	for (i = 0; i < this.neglist.length; i++)
	{
		if (ui.deck[this.neglist[i]] == target)
		{
			this.background.setOpacity(0.4);
			this.background.setFill("#ff7777");
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
		shadowOffset: { x: 0, y: 3 },
		shadowOpacity: 0.9
	});

	w = this.name.getWidth();

	while (w > 0.65 * config.width && this.name.getFontSize() > 5)
	{
		this.name.setFontSize(this.name.getFontSize() * 0.9);

		w = this.name.getWidth();
	}

	this.name.setOffsetX(w / 2);

	this.add(this.name);

	w *= 1.4;

	this.leftline = new Kinetic.Line({
		points: [ 0, 0, 0, config.height / 2, config.width / 2 - w / 2, config.height / 2 ],
		stroke: "#d8d5ef",
		strokeWidth: 1,
		lineJoin: "round",
		shadowColor: "black",
		shadowBlur: 5,
		shadowOffset: { x: 0, y: 3 },
		shadowOpacity: 0
	});

	this.add(this.leftline);

	this.rightline = new Kinetic.Line({
		points: [ config.width / 2 + w / 2, config.height / 2, config.width, config.height / 2, config.width, 0 ],
		stroke: "#d8d5ef",
		strokeWidth: 1,
		lineJoin: "round",
		shadowColor: "black",
		shadowBlur: 5,
		shadowOffset: { x: 0, y: 3 },
		shadowOpacity: 0
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

	var basic = [ "button", "button_pressed", "trashcan", "redx", "replay",
       			"rewind", "forward", "rewindfull", "forwardfull" ];
	var i;

	for (i = 0; i < basic.length; i++)
	{
		this.filemap[basic[i]] = "img/" + basic[i] + ".png";
	}

	this.filemap["background"] = "img/background.jpg";
};

Loader.prototype.add_image = function(name, ext) {
	this.filemap[name] = "img/" + name + "." + ext;
};

Loader.prototype.add_alias = function(name, alias, ext) {
	this.filemap[name] = "img/" + alias + "." + ext;
};

Loader.prototype.start = function() {
	var self = this;
	var i;

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

			if (self.num_loaded == total)
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
	ui.build_cards();
	ui.build_ui();
	ui.send_msg({type: "ready", resp: {}});
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
		if (i == target) continue;

		for (j = 0; j < player_hands[i].children.length; j++)
		{
			child = player_hands[i].children[j];

			card = child.children[0];

			card.setIndicator(false);
		}
	}

	cardlayer.batchDraw();

	if (target < 0) return;

	for (i = 0; i < player_hands[target].children.length; i++)
	{
		child = player_hands[target].children[i];

		card = child.children[0];

		if ((clue.type == CLUE.RANK && clue.value == card.rank) ||
		    (clue.type == CLUE.SUIT && clue.value == card.suit) ||
		    (clue.type == CLUE.SUIT && card.suit == 5 && ui.variant == VARIANT.RAINBOW))
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
	"#111111"
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

	if (this.variant == VARIANT.RAINBOW) rainbow = true;

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
		ctx.arc(40, 110, 35, 4.712, .4636, true);
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
		ctx.arc(40, 110, 35, 3.712, .4636, true);
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

	for (i = 0; i < 6; i++)
	{
		for (j = 0; j <= 5; j++)
		{
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

			if (i == 5 && rainbow)
			{
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

			if (i == 5 && rainbow)
			{
				grad = ctx.createLinearGradient(0, 14, 0, 110);

				grad.addColorStop(0, suit_colors[0]);
				grad.addColorStop(0.25, suit_colors[1]);
				grad.addColorStop(0.5, suit_colors[2]);
				grad.addColorStop(0.75, suit_colors[3]);
				grad.addColorStop(1, suit_colors[4]);

				ctx.fillStyle = grad;
			}

			ctx.strokeStyle = "black";
			ctx.lineWidth = 2;
			ctx.lineJoin = "round";
			ctx.font = "bold 96pt Arial";
			ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
			ctx.fillText(j.toString(), 19, 110);
			ctx.shadowColor = "rgba(0, 0, 0, 0)";
			ctx.strokeText(j.toString(), 19, 110);

			ctx.save();
			ctx.translate(cardw, cardh);
			ctx.rotate(Math.PI);
			ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
			ctx.fillText(j.toString(), 19, 110);
			ctx.shadowColor = "rgba(0, 0, 0, 0)";
			ctx.strokeText(j.toString(), 19, 110);
			ctx.restore();

			if (i == 5 && rainbow)
			{
				grad = ctx.createRadialGradient(75, 150, 25, 75, 150, 75);

				grad.addColorStop(0, suit_colors[0]);
				grad.addColorStop(0.25, suit_colors[1]);
				grad.addColorStop(0.5, suit_colors[2]);
				grad.addColorStop(0.75, suit_colors[3]);
				grad.addColorStop(1, suit_colors[4]);

				ctx.fillStyle = grad;
			}

			ctx.lineWidth = 5;

			if (j == 1 || j == 3)
			{
				ctx.save();
				ctx.translate(cardw / 2, cardh / 2);
				ctx.scale(0.4, 0.4);
				ctx.translate(-75, -100);
				pathfuncs[i]();
				drawshape();
				ctx.restore();
			}

			if (j > 1)
			{
				ctx.save();
				ctx.translate(cardw / 2, cardh / 2);
				ctx.translate(0, -120);
				ctx.scale(0.4, 0.4);
				ctx.translate(-75, -100);
				pathfuncs[i]();
				drawshape();
				ctx.restore();

				ctx.save();
				ctx.translate(cardw / 2, cardh / 2);
				ctx.translate(0, 120);
				ctx.scale(0.4, 0.4);
				ctx.rotate(Math.PI);
				ctx.translate(-75, -100);
				pathfuncs[i]();
				drawshape();
				ctx.restore();
			}

			if (j > 3)
			{
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

			if (j == 0)
			{
				ctx.clearRect(0, 0, cardw, cardh);
			}

			if (j == 0 || j == 5)
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

	if (ww < 640) ww = 640;
	if (wh < 360) wh = 360;

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

	if (cw > 0.98 * ww) cw = ww;
	if (ch > 0.98 * wh) ch = wh;

	stage.setWidth(cw);
	stage.setHeight(ch);
};

var stage = new Kinetic.Stage({
	container: "game"
});

size_stage(stage);

var win_w = stage.getWidth();
var win_h = stage.getHeight();

var bglayer = new Kinetic.Layer();
var cardlayer = new Kinetic.Layer();
var uilayer = new Kinetic.Layer();
var overlayer = new Kinetic.Layer();

var player_hands = [];
var drawdeck;
var message_prompt, clue_label, score_label, strikes = [];
var name_frames = [];
var play_stacks = [], discard_stacks = [];
var play_area, discard_area, clue_log;
var clue_area, clue_target_group, clue_type_group, submit_clue;
var no_clue_label, no_discard_label;
var replay_area, replay_bar, replay_shuttle, replay_button;
var lobby_button, help_button;
var helpgroup;
var msglog, msgloggroup, overback;

this.build_ui = function() {
	var self = this;
	var x, y, width, height, offset, radius;
	var i, j;
	var rect, img, text, button;
	var suits = 5;

	if (this.variant) suits = 6;

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
		image: ImageLoader.get("background")
	});

	bglayer.add(background);

	play_area = new Kinetic.Rect({
		x: .183 * win_w,
		y: .3 * win_h,
		width: .435 * win_w,
		height: .189 * win_h
	});

	discard_area = new Kinetic.Rect({
		x: .8 * win_w,
		y: .6 * win_h,
		width: .2 * win_w,
		height: .4 * win_h
	});

	no_discard_label = new Kinetic.Rect({
		x: .8 * win_w,
		y: .6 * win_h,
		width: .19 * win_w,
		height: .39 * win_h,
		stroke: "#df1c2d",
		strokeWidth: .007 * win_w,
		cornerRadius: .01 * win_w,
		visible: false
	});

	uilayer.add(no_discard_label);

	rect = new Kinetic.Rect({
		x: .8 * win_w,
		y: .6 * win_h,
		width: .19 * win_w,
		height: .39 * win_h,
		fill: "black",
		opacity: 0.2,
		cornerRadius: .01 * win_w
	});

	bglayer.add(rect);

	img = new Kinetic.Image({
		x: .82 * win_w,
		y: .62 * win_h,
		width: .15 * win_w,
		height: .35 * win_h,
		opacity: 0.2,
		image: ImageLoader.get("trashcan")
	});

	bglayer.add(img);

	rect = new Kinetic.Rect({
		x: .2 * win_w,
		y: .24 * win_h,
		width: .4 * win_w,
		height: .05 * win_h,
		fill: "black",
		opacity: 0.3,
		cornerRadius: .01 * win_h,
		listening: true
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

	message_prompt = new FitText({
		x: .21 * win_w,
		y: .25 * win_h,
		width: .38 * win_w,
		height: .03 * win_h,
		align: "center",
		fontSize: .03 * win_h,
		fontFamily: "Verdana",
		fill: "#d8d5ef",
		shadowColor: "black",
		shadowBlur: 10,
		shadowOffset: { x: 0, y: 0 },
		shadowOpacity: 0.9,
		text: "Waiting for other players",
		listening: false
	});

	uilayer.add(message_prompt);

	overback = new Kinetic.Rect({
		x: 0,
		y: 0,
		width: win_w,
		height: win_h,
		opacity: 0.3,
		fill: "black",
		visible: false
	});

	overlayer.add(overback);

	msgloggroup = new Kinetic.Group({
		x: .2 * win_w,
		y: .02 * win_h,
		width: .4 * win_w,
		height: .96 * win_h,
		clipX: 0,
		clipY: 0,
		clipWidth: .4 * win_w,
		clipHeight: .96 * win_h,
		visible: false,
		listening: false
	});

	rect = new Kinetic.Rect({
		x: 0,
		y: 0,
		width: .4 * win_w,
		height: .96 * win_h,
		fill: "black",
		opacity: 0.9,
		cornerRadius: .01 * win_w
	});

	msgloggroup.add(rect);

	msglog = new Kinetic.Text({
		fontSize: .025 * win_h,
		fontFamily: "Verdana",
		fill: "white",
		x: .01 * win_w,
		y: .01 * win_h,
		width: .38 * win_w,
		height: "auto"
	});

	msgloggroup.add(msglog);

	overlayer.add(msgloggroup);

	rect = new Kinetic.Rect({
		x: .66 * win_w,
		y: .81 * win_h,
		width: .13 * win_w,
		height: .18 * win_h,
		fill: "black",
		opacity: 0.2,
		cornerRadius: .01 * win_w
	});

	bglayer.add(rect);

	for (i = 0; i < 3; i++)
	{
		rect = new Kinetic.Rect({
			x: (.67 + .04 * i) * win_w,
			y: .91 * win_h,
			width: .03 * win_w,
			height: .053 * win_h,
			fill: "black",
			opacity: 0.6,
			cornerRadius: .003 * win_w
		});

		bglayer.add(rect);
	}

	clue_label = new Kinetic.Text({
		x: .67 * win_w,
		y: .83 * win_h,
		width: .11 * win_w,
		height: .03 * win_h,
		fontSize: .03 * win_h,
		fontFamily: "Verdana",
		align: "center",
		text: "Clues: 8",
		fill: "#d8d5ef",
		shadowColor: "black",
		shadowBlur: 10,
		shadowOffset: { x: 0, y: 0 },
		shadowOpacity: 0.9
	});

	uilayer.add(clue_label);

	score_label = new Kinetic.Text({
		x: .67 * win_w,
		y: .87 * win_h,
		width: .11 * win_w,
		height: .03 * win_h,
		fontSize: .03 * win_h,
		fontFamily: "Verdana",
		align: "center",
		text: "Score: 0",
		fill: "#d8d5ef",
		shadowColor: "black",
		shadowBlur: 10,
		shadowOffset: { x: 0, y: 0 },
		shadowOpacity: 0.9
	});

	uilayer.add(score_label);

	rect = new Kinetic.Rect({
		x: .8 * win_w,
		y: .01 * win_h,
		width: .19 * win_w,
		height: .58 * win_h,
		fill: "black",
		opacity: 0.2,
		cornerRadius: .01 * win_w
	});

	bglayer.add(rect);

	clue_log = new HanabiClueLog({
		x: .81 * win_w,
		y: .02 * win_h,
		width: .17 * win_w,
		height: .56 * win_h
	});

	uilayer.add(clue_log);

	var pileback;

	y = .05;
	width = .075;
	height = .189;
	offset = 0;
	radius = .006;

	if (this.variant)
	{
		y = .04;
		width = .06;
		height = .151;
		offset = .019;
		radius = .004;
	}

	for (i = 0; i < suits; i++)
	{
		pileback = new Kinetic.Rect({
			fill: suit_colors[i],
			opacity: 0.4,
			x: (.183 + (width + .015) * i) * win_w,
			y: (.3 + offset) * win_h,
			width: width * win_w,
			height: height * win_h,
			cornerRadius: radius * win_w
		});

		bglayer.add(pileback);

		pileback = new Kinetic.Image({
			x: (.183 + (width + .015) * i) * win_w,
			y: (.3 + offset) * win_h,
			width: width * win_w,
			height: height * win_h,
			image: card_images["card-" + i + "-0"]
		});

		bglayer.add(pileback);

		pileback = new Kinetic.Rect({
			stroke: suit_colors[i],
			strokeWidth: 5,
			x: (.183 + (width + .015) * i) * win_w,
			y: (.3 + offset) * win_h,
			width: width * win_w,
			height: height * win_h,
			cornerRadius: radius * win_w
		});

		bglayer.add(pileback);

		play_stacks[i] = new CardStack({
			x: (.183 + (width + .015) * i) * win_w,
			y: (.3 + offset) * win_h,
			width: width * win_w,
			height: height * win_h
		});

		cardlayer.add(play_stacks[i]);

		discard_stacks[i] = new CardLayout({
			x: .81 * win_w,
			y: (.61 + y * i) * win_h,
			width: .17 * win_w,
			height: .17 * win_h
		});

		cardlayer.add(discard_stacks[i]);
	}

	rect = new Kinetic.Rect({
		x: .08 * win_w,
		y: .8 * win_h,
		width: .075 * win_w,
		height: .189 * win_h,
		fill: "black",
		opacity: 0.2,
		cornerRadius: .006 * win_w
	});

	bglayer.add(rect);

	drawdeck = new CardDeck({
		x: .08 * win_w,
		y: .8 * win_h,
		width: .075 * win_w,
		height: .189 * win_h,
		cardback: "card-back"
	});

	cardlayer.add(drawdeck);

	var hand_pos = {
		2: [
			{ x: .19, y: .77, w: .42, h: .189, rot: 0 },
			{ x: .19, y: .01, w: .42, h: .189, rot: 0 }
		],
		3: [
			{ x: .19, y: .77, w: .42, h: .189, rot: 0 },
			{ x: .01, y: .71, w: .41, h: .189, rot: -78 },
			{ x: .705, y: 0, w: .41, h: .189, rot: 78 }
		],
		4: [
			{ x: .23, y: .77, w: .34, h: .189, rot: 0 },
			{ x: .015, y: .7, w: .34, h: .189, rot: -78 },
			{ x: .23, y: .01, w: .34, h: .189, rot: 0 },
			{ x: .715, y: .095, w: .34, h: .189, rot: 78 }
		],
		5: [
			{ x: .23, y: .77, w: .34, h: .189, rot: 0 },
			{ x: .03, y: .77, w: .301, h: .18, rot: -90 },
			{ x: .025, y: .009, w: .34, h: .189, rot: 0 },
			{ x: .445, y: .009, w: .34, h: .189, rot: 0 },
			{ x: .77, y: .22, w: .301, h: .18, rot: 90 }
		]
	};

	var shade_pos = {
		2: [
			{ x: .185, y: .762, w: .43, h: .205, rot: 0 },
			{ x: .185, y: .002, w: .43, h: .205, rot: 0 }
		],
		3: [
			{ x: .185, y: .762, w: .43, h: .205, rot: 0 },
			{ x: .005, y: .718, w: .42, h: .205, rot: -78 },
			{ x: .708, y: -.008, w: .42, h: .205, rot: 78 }
		],
		4: [
			{ x: .225, y: .762, w: .35, h: .205, rot: 0 },
			{ x: .01, y: .708, w: .35, h: .205, rot: -78 },
			{ x: .225, y: .002, w: .35, h: .205, rot: 0 },
			{ x: .718, y: .087, w: .35, h: .205, rot: 78 }
		],
		5: [
			{ x: .225, y: .762, w: .35, h: .205, rot: 0 },
			{ x: .026, y: .775, w: .311, h: .196, rot: -90 },
			{ x: .02, y: .001, w: .35, h: .205, rot: 0 },
			{ x: .44, y: .001, w: .35, h: .205, rot: 0 },
			{ x: .774, y: .215, w: .311, h: .196, rot: 90 }
		]
	};

	var name_pos = {
		2: [
			{ x: .18, y: .97, w: .44, h: .02 },
			{ x: .18, y: .21, w: .44, h: .02 }
		],
		3: [
			{ x: .18, y: .97, w: .44, h: .02 },
			{ x: .01, y: .765, w: .12, h: .02 },
			{ x: .67, y: .765, w: .12, h: .02 }
		],
		4: [
			{ x: .22, y: .97, w: .36, h: .02 },
			{ x: .01, y: .74, w: .13, h: .02 },
			{ x: .22, y: .21, w: .36, h: .02 },
			{ x: .66, y: .74, w: .13, h: .02 }
		],
		5: [
			{ x: .22, y: .97, w: .36, h: .02 },
			{ x: .025, y: .775, w: .116, h: .02 },
			{ x: .015, y: .199, w: .36, h: .02 },
			{ x: .435, y: .199, w: .36, h: .02 },
			{ x: .659, y: .775, w: .116, h: .02 }
		]
	};

	var nump = this.player_names.length;

	for (i = 0; i < nump; i++)
	{
		j = i - this.player_us;

		if (j < 0) j += nump;

		player_hands[i] = new CardLayout({
			x: hand_pos[nump][j].x * win_w,
			y: hand_pos[nump][j].y * win_h,
			width: hand_pos[nump][j].w * win_w,
			height: hand_pos[nump][j].h * win_h,
			rotationDeg: hand_pos[nump][j].rot,
			align: "center",
			reverse: j == 0
		});

		cardlayer.add(player_hands[i]);

		rect = new Kinetic.Rect({
			x: shade_pos[nump][j].x * win_w,
			y: shade_pos[nump][j].y * win_h,
			width: shade_pos[nump][j].w * win_w,
			height: shade_pos[nump][j].h * win_h,
			rotationDeg: shade_pos[nump][j].rot,
			cornerRadius: .01 * shade_pos[nump][j].w * win_w,
			opacity: 0.4,
			fillLinearGradientStartPoint: {x: 0, y: 0},
			fillLinearGradientEndPoint: {x: shade_pos[nump][j].w * win_w, y: 0},
			fillLinearGradientColorStops: [ 0, "rgba(0,0,0,0)", 0.9, "white" ]
		});

		if (j == 0)
		{
			rect.setFillLinearGradientColorStops([ 1, "rgba(0,0,0,0)", 0.1, "white" ]);
		}

		bglayer.add(rect);

		/*
		uilayer.add(new Kinetic.Rect({
			x: hand_pos[nump][j].x * win_w,
			y: hand_pos[nump][j].y * win_h,
			width: hand_pos[nump][j].w * win_w,
			height: hand_pos[nump][j].h * win_h,
			rotationDeg: hand_pos[nump][j].rot,
			stroke: "black",
			strokeWidth: 1
		}));
		*/

		name_frames[i] = new HanabiNameFrame({
			x: name_pos[nump][j].x * win_w,
			y: name_pos[nump][j].y * win_h,
			width: name_pos[nump][j].w * win_w,
			height: name_pos[nump][j].h * win_h,
			name: this.player_names[i]
		});

		uilayer.add(name_frames[i]);

		/*
		uilayer.add(new Kinetic.Rect({
			x: name_pos[nump][j].x * win_w,
			y: name_pos[nump][j].y * win_h,
			width: name_pos[nump][j].w * win_w,
			height: name_pos[nump][j].h * win_h,
			stroke: "black",
			strokeWidth: 1
		}));
		*/
	}

	no_clue_label = new Kinetic.Text({
		x: .15 * win_w,
		y: .55 * win_h,
		width: .5 * win_w,
		height: .19 * win_h,
		fontFamily: "Verdana",
		fontSize: .08 * win_h,
		strokeWidth: 1,
		text: "No Clues",
		align: "center",
		fill: "#df2c4d",
		stroke: "black",
		visible: false
	});

	uilayer.add(no_clue_label);

	clue_area = new Kinetic.Group({
		x: .15 * win_w,
		y: .51 * win_h,
		width: .5 * win_w,
		height: .27 * win_h
	});

	clue_target_group = new ButtonGroup();
	clue_type_group = new ButtonGroup();

	var button;

	x = .21 * win_w - (nump - 2) * .044 * win_w;

	for (i = 0; i < nump - 1; i++)
	{
		j = (this.player_us + i + 1) % nump;

		button = new Button({
			x: x,
			y: 0,
			width: .08 * win_w,
			height: .025 * win_h,
			text: this.player_names[j],
			target_index: j
		});

		clue_area.add(button);

		x += .0875 * win_w;

		clue_target_group.add(button);
	}

	for (i = 1; i <= 5; i++)
	{
		button = new NumberButton({
			x: (.133 + (i - 1) * .049) * win_w,
			y: .035 * win_h,
			width: .04 * win_w,
			height: .071 * win_h,
			number: i,
			clue_type: {type: CLUE.RANK, value: i}
		});

		clue_area.add(button);

		clue_type_group.add(button);
	}

	suits = 5;
	x = .133;

	if (this.variant == VARIANT.BLACKSUIT || this.variant == VARIANT.BLACKONE)
	{
		suits = 6;
		x = .108;
	}

	for (i = 0; i < suits; i++)
	{
		button = new ColorButton({
			x: (x + i * .049) * win_w,
			y: .115 * win_h,
			width: .04 * win_w,
			height: .071 * win_h,
			color: suit_colors[i],
			clue_type: {type: CLUE.SUIT, value: i}
		});

		clue_area.add(button);

		clue_type_group.add(button);
	}

	submit_clue = new Button({
		x: .133 * win_w,
		y: .195 * win_h,
		width: .236 * win_w,
		height: .051 * win_h,
		text: "Give Clue"
	});

	clue_area.add(submit_clue);

	clue_area.hide();

	uilayer.add(clue_area);

	replay_area = new Kinetic.Group({
		x: .15 * win_w,
		y: .51 * win_h,
		width: .5 * win_w,
		height: .27 * win_h
	});

	replay_bar = new Kinetic.Rect({
		x: 0,
		y: .03 * win_h,
		width: .5 * win_w,
		height: .01 * win_h,
		fill: "black",
		cornerRadius: .005 * win_h,
		listening: false
	});

	replay_area.add(replay_bar);

	rect = new Kinetic.Rect({
		x: 0,
		y: 0,
		width: .5 * win_w,
		height: .05 * win_h,
		opacity: 0
	});

	rect.on("click", function(evt) {
		var x = evt.evt.x - this.getAbsolutePosition().x;
		var w = this.getWidth();
		var step = w / self.replay_max;
		var newturn = Math.floor((x + step / 2) / step);
		if (newturn != self.replay_turn)
		{
			self.perform_replay(newturn, true);
		}
	});

	replay_area.add(rect);

	replay_shuttle = new Kinetic.Rect({
		x: 0,
		y: .02 * win_h,
		width: .03 * win_w,
		height: .03 * win_h,
		fill: "#0000cc",
		cornerRadius: .01 * win_w,
		draggable: true,
		dragBoundFunc: function(pos) {
			var min = this.getParent().getAbsolutePosition().x;
			var w = this.getParent().getWidth() - this.getWidth();
			var y = this.getAbsolutePosition().y;
			var x = pos.x - min;
			if (x < 0) x = 0;
			if (x > w) x = w;
			var step = w / self.replay_max;
			var newturn = Math.floor((x + step / 2) / step);
			if (newturn != self.replay_turn)
			{
				self.perform_replay(newturn, true);
			}
			x = newturn * step;
			return {x: min + x, y: y};
		}
	});

	replay_shuttle.on("dragend", function() {
		cardlayer.draw();
		uilayer.draw();
	});

	replay_area.add(replay_shuttle);

	button = new Button({
		x: .1 * win_w,
		y: .06 * win_h,
		width: .06 * win_w,
		height: .08 * win_h,
		image: "rewindfull"
	});

	button.on("click tap", function() {
		ui.perform_replay(0);
	});

	replay_area.add(button);

	button = new Button({
		x: .18 * win_w,
		y: .06 * win_h,
		width: .06 * win_w,
		height: .08 * win_h,
		image: "rewind"
	});

	button.on("click tap", function() {
		ui.perform_replay(self.replay_turn - 1);
	});

	replay_area.add(button);

	button = new Button({
		x: .26 * win_w,
		y: .06 * win_h,
		width: .06 * win_w,
		height: .08 * win_h,
		image: "forward"
	});

	button.on("click tap", function() {
		ui.perform_replay(self.replay_turn + 1);
	});

	replay_area.add(button);

	button = new Button({
		x: .34 * win_w,
		y: .06 * win_h,
		width: .06 * win_w,
		height: .08 * win_h,
		image: "forwardfull"
	});

	button.on("click tap", function() {
		ui.perform_replay(self.replay_max, true);
	});

	replay_area.add(button);

	button = new Button({
		x: .15 * win_w,
		y: .15 * win_h,
		width: .2 * win_w,
		height: .08 * win_h,
		text: "Exit Replay"
	});

	button.on("click tap", function() {
		if (self.replay_only)
		{
			ui.send_msg({type: "unattend_table", resp: {}});
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
		x: .1 * win_w,
		y: .1 * win_h,
		width: .8 * win_w,
		height: .8 * win_h,
		visible: false,
		listening: false
	});

	overlayer.add(helpgroup);

	rect = new Kinetic.Rect({
		x: 0,
		y: 0,
		width: .8 * win_w,
		height: .8 * win_h,
		opacity: 0.9,
		fill: "black",
		cornerRadius: .01 * win_w
	});

	helpgroup.add(rect);

	text = new Kinetic.Text({
		x: .03 * win_w,
		y: .03 * win_h,
		width: .74 * win_w,
		height: .74 * win_h,
		fontSize: .02 * win_w,
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
		      "log to see which cards it referenced."
	});

	helpgroup.add(text);

	replay_button = new Button({
		x: .01 * win_w,
		y: .8 * win_h,
		width: .06 * win_w,
		height: .06 * win_h,
		image: "replay",
		visible: false
	});

	replay_button.on("click tap", function() {
		self.enter_replay(!self.replay);
	});

	uilayer.add(replay_button);

	help_button = new Button({
		x: .01 * win_w,
		y: .87 * win_h,
		width: .06 * win_w,
		height: .06 * win_h,
		text: "Help"
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
		x: .01 * win_w,
		y: .94 * win_h,
		width: .06 * win_w,
		height: .05 * win_h,
		text: "Lobby"
	});

	uilayer.add(lobby_button);

	lobby_button.on("click tap", function() {
		lobby_button.off("click tap");
		ui.send_msg({type: "unattend_table", resp: {}});
		ui.lobby.game_ended();
	});

	if (ui.replay)
	{
		replay_area.show();
	}

	stage.add(bglayer);
	stage.add(uilayer);
	stage.add(cardlayer);
	stage.add(overlayer);
};

this.reset = function() {
	var i, suits;

	message_prompt.setText("");
	msglog.setText("");

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

	clue_log.checkExpiry();

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

	if (msgData.type == "turn")
	{
		this.replay_max = msgData.num;
	}
	if (msgData.type == "game_over")
	{
		this.replay_max++;
	}

	if (!this.replay_only && this.replay_max > 0) replay_button.show();

	if (this.replay)
	{
		this.adjust_replay_shuttle();
		uilayer.draw();
	}
}

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
		uilayer.draw();
	}
	else if (this.replay && !enter)
	{
		this.perform_replay(this.replay_max, true);
		this.replay = false;
		replay_area.hide();

		if (saved_action) this.handle_action(saved_action);
		uilayer.draw();
	}
};

this.perform_replay = function(target, fast) {
	var msg;
	var rewind = false;

	if (target < 0) target = 0;
	if (target > this.replay_max) target = this.replay_max;

	if (target < this.replay_turn) rewind = true;

	this.replay_turn = target;

	this.adjust_replay_shuttle();

	if (fast) this.animate_fast = true;

	if (rewind)
	{
		this.reset();
		this.replay_pos = 0;
	}

	while (true)
	{
		msg = this.replay_log[this.replay_pos++];

		if (!msg)
		{
			break;
		}

		if (msg.type == "message")
		{
			this.set_message(msg.resp);
		}

		else if (msg.type == "notify")
		{
			this.handle_notify(msg.resp);
		}

		if (msg.type == "notify" && msg.resp.type == "turn")
		{
			if (msg.resp.num == this.replay_turn)
			{
				break;
			}
		}
	}

	this.animate_fast = false;
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
};

this.show_connected = function(list) {
	var i;

	if (!this.ready) return;

	for (i = 0; i < list.length; i++)
	{
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
		y: .7 * win_h,
		width: win_w,
		height: .05 * win_h,
		fontFamily: "Arial",
		fontStyle: "bold",
		fontSize: .05 * win_h
	});

	loadinglayer.add(loadinglabel);

	var progresslabel = new Kinetic.Text({
		fill: "#d8d5ef",
		stroke: "#747278",
		strokeWidth: 1,
		text: "0 / 0",
		align: "center",
		x: 0,
		y: .8 * win_h,
		width: win_w,
		height: .05 * win_h,
		fontFamily: "Arial",
		fontStyle: "bold",
		fontSize: .05 * win_h
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
	"Black"
];

this.handle_notify = function(note) {
	var type = note.type;
	var child, order;
	var pos, scale, n;
	var i;

	if (type == "draw")
	{
		ui.deck[note.order] = new HanabiCard({
			suit: note.suit,
			rank: note.rank,
			order: note.order
		});

		child = new LayoutChild();
		child.add(ui.deck[note.order]);

		pos = drawdeck.getPosition();

		child.setAbsolutePosition(pos);
		child.setRotation(-player_hands[note.who].getRotation());

		scale = drawdeck.getWidth() / cardw;
		child.setScale({x: scale, y: scale});

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

	else if (type == "draw_size")
	{
		drawdeck.setCount(note.size);
	}

	else if (type == "played")
	{
		show_clue_match(-1);

		child = ui.deck[note.which.order].parent;

		ui.deck[note.which.order].suit = note.which.suit;
		ui.deck[note.which.order].rank = note.which.rank;
		ui.deck[note.which.order].unknown = false;
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

	else if (type == "discard")
	{
		show_clue_match(-1);

		child = ui.deck[note.which.order].parent;

		ui.deck[note.which.order].suit = note.which.suit;
		ui.deck[note.which.order].rank = note.which.rank;
		ui.deck[note.which.order].unknown = false;
		ui.deck[note.which.order].setBareImage();
		ui.deck[note.which.order].hide_clues();

		pos = child.getAbsolutePosition();
		child.setRotation(child.parent.getRotation());
		child.remove();
		child.setAbsolutePosition(pos);

		discard_stacks[note.which.suit].add(child);

		for (i = 0; i < 6; i++)
		{
			if (discard_stacks[i]) discard_stacks[i].moveToTop();
		}

		while (1)
		{
			n = child.getZIndex();

			if (!n) break;

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

	else if (type == "reveal")
	{
		child = ui.deck[note.which.order].parent;

		ui.deck[note.which.order].suit = note.which.suit;
		ui.deck[note.which.order].rank = note.which.rank;
		ui.deck[note.which.order].unknown = false;
		ui.deck[note.which.order].setBareImage();
		ui.deck[note.which.order].hide_clues();

		if (!this.animate_fast) cardlayer.draw();
	}

	else if (type == "clue")
	{
		show_clue_match(-1);

		for (i = 0; i < note.list.length; i++)
		{
			ui.deck[note.list[i]].setIndicator(true);
			ui.deck[note.list[i]].clue_given.show();

			if (note.target == ui.player_us && !ui.replay_only &&
			    !ui.spectating)
			{
				ui.deck[note.list[i]].add_clue(note.clue);
			}
		}

		var neglist = [];

		for (i = 0; i < player_hands[note.target].children.length; i++)
		{
			child = player_hands[note.target].children[i];

			order = child.children[0].order;

			if (note.list.indexOf(order) < 0) neglist.push(order);
		}

		var type;

		if (note.clue.type == CLUE.RANK)
		{
			type = note.clue.value.toString();
		}
		else
		{
			type = suit_names[note.clue.value];
		}

		var entry = new HanabiClueEntry({
			width: clue_log.getWidth(),
			height: .017 * win_h,
			giver: ui.player_names[note.giver],
			target: ui.player_names[note.target],
			type: type,
			list: note.list,
			neglist: neglist
		});

		clue_log.add(entry);
	}

	else if (type == "status")
	{
		clue_label.setText("Clues: " + note.clues);

		if (note.clues == 0)
		{
			clue_label.setFill("#df1c2d");
		}
		else if (note.clues == 1)
		{
			clue_label.setFill("#ef8c1d");
		}
		else if (note.clues == 2)
		{
			clue_label.setFill("#efef1d");
		}
		else
		{
			clue_label.setFill("#d8d5ef");
		}

		score_label.setText("Score: " + note.score);
		if (!this.animate_fast) uilayer.draw();
	}

	else if (type == "strike")
	{
		var x = new Kinetic.Image({
			x: (.675 + .04 * (note.num - 1)) * win_w,
			y: .918 * win_h,
			width: .02 * win_w,
			height: .036 * win_h,
			image: ImageLoader.get("redx"),
			opacity: 0
		});

		strikes[note.num - 1] = x;

		uilayer.add(x);

		if (ui.animate_fast)
		{
			x.setOpacity(1.0);
		}
		else
		{
			var t = new Kinetic.Tween({
				node: x,
				opacity: 1.0,
				duration: ui.animate_fast ? 0.001 : 1.0,
				runonce: true
			}).play();
		}
	}

	else if (type == "turn")
	{
		for (i = 0; i < ui.player_names.length; i++)
		{
			name_frames[i].setActive(note.who == i);
		}

		if (!this.animate_fast) uilayer.draw();
	}

	else if (type == "game_over")
	{
		this.replay_only = true;
		replay_button.hide();
		if (!this.replay) this.enter_replay(true);
		if (!this.animate_fast) uilayer.draw();
	}
};

this.stop_action = function(fast) {
	var i, child;

	if (fast)
	{
		clue_area.hide();
	}
	else
	{
		var t = new Kinetic.Tween({
			node: clue_area,
			opacity: 0.0,
			duration: 0.5,
			runonce: true,
			onFinish: function() {
				clue_area.hide();
			}
		}).play();
	}

	no_clue_label.hide();
	no_discard_label.hide();

	clue_target_group.off("change");
	clue_type_group.off("change");

	for (i = 0; i < player_hands[ui.player_us].children.length; i++)
	{
		child = player_hands[ui.player_us].children[i];

		child.off("dragend.play");
		child.setDraggable(false);
	}

	submit_clue.off("click tap");
};

var saved_action = null;

this.handle_action = function(data) {
	var self = this;
	var i, child;

	saved_action = data;

	if (this.replay) return;

	if (data.can_clue)
	{
		clue_area.show();

		var t = new Kinetic.Tween({
			node: clue_area,
			opacity: 1.0,
			duration: 0.5,
			runonce: true
		}).play();
	}
	else
	{
		no_clue_label.show();
		uilayer.draw();
	}

	if (!data.can_discard)
	{
		no_discard_label.show();
		uilayer.draw();
	}

	submit_clue.setEnabled(false);

	clue_target_group.clearPressed();
	clue_type_group.clearPressed();

	if (this.player_names.length == 2)
	{
		clue_target_group.list[0].setPressed(true);
	}

	player_hands[ui.player_us].moveToTop();

	for (i = 0; i < player_hands[ui.player_us].children.length; i++)
	{
		child = player_hands[ui.player_us].children[i];

		child.setDraggable(true);

		child.on("dragend.play", function() {
			var pos = this.getAbsolutePosition();

			pos.x += this.getWidth() * this.getScaleX() / 2;
			pos.y += this.getHeight() * this.getScaleY() / 2;

			if (pos.x >= play_area.getX() &&
			    pos.y >= play_area.getY() &&
			    pos.x <= play_area.getX() + play_area.getWidth() &&
			    pos.y <= play_area.getY() + play_area.getHeight())
			{
				ui.send_msg({type: "action", resp: {type: ACT.PLAY, target: this.children[0].order}});

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
				ui.send_msg({type: "action", resp: {type: ACT.DISCARD, target: this.children[0].order}});
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
		if (!data.can_clue) return;

		if (!this.getEnabled()) return;

		var target = clue_target_group.getPressed();
		var type = clue_type_group.getPressed();

		show_clue_match(target.target_index, {});

		ui.send_msg({type: "action", resp: {type: ACT.CLUE, target: target.target_index, clue: type.clue_type}});

		self.stop_action();

		saved_action = null;
	});
};

this.set_message = function(msg) {
	var text = msglog.getText();

	text = text + msg.text + "\n";

	msglog.setText(text);

	var h = msglog.getHeight(), gh = msgloggroup.getHeight();
	var th = msglog.getTextHeight();

	gh -= .02 * win_h;

	if (h > gh)
	{
		msglog.setOffset({x: 0, y: h - gh - th});
	}

	message_prompt.setText(msg.text);
	if (!this.animate_fast)
	{
		uilayer.draw();
		overlayer.draw();
	}
};

this.destroy = function() {
	stage.destroy();
};

this.replay_log = [];
this.replay_pos = 0;
this.replay_turn = 0;

}

HanabiUI.prototype.handle_message = function(msg) {
	var msgType = msg.type;
	var msgData = msg.resp;

	if (msgType == "message")
	{
		this.replay_log.push(msg);

		if (!this.replay)
		{
			this.set_message.call(this, msgData);
		}
	}

	if (msgType == "init")
	{
		this.player_us = msgData.seat;
		this.player_names = msgData.names;
		this.variant = msgData.variant;
		this.replay = this.replay_only = msgData.replay;
		this.spectating = msgData.spectating;

		this.load_images();
	}

	if (msgType == "advanced")
	{
		this.replay_advanced();
	}

	if (msgType == "connected")
	{
		this.show_connected(msgData.list);
	}

	if (msgType == "notify")
	{
		this.save_replay(msg);

		if (!this.replay)
		{
			this.handle_notify.call(this, msgData);
		}
	}

	if (msgType == "action")
	{
		this.handle_action.call(this, msgData);

		if (this.animate_fast) return;

		if (this.lobby.send_turn_notify)
		{
			this.lobby.send_notify("It's your turn", "turn");
		}

		if (this.lobby.send_turn_sound)
		{
			this.lobby.play_sound("turn");
		}
	}
};

HanabiUI.prototype.set_backend = function(backend) {
	this.backend = backend;

	this.send_msg({type: "hello", resp: {}});
};

HanabiUI.prototype.send_msg = function(msg) {
	console.log("out", msg);
	this.backend.emit("message", msg);
};
