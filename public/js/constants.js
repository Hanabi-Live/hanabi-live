"use strict";

(function (exports) {

exports.ACT = {
	CLUE:     0,
	PLAY:     1,
	DISCARD:  2,
	DECKPLAY: 3,
};

exports.CLUE = {
	RANK: 0,
	SUIT: 1,
};

exports.VARIANT = {
	NONE:       0,
	BLACKSUIT:  1,
	BLACKONE:   2,
	RAINBOW:    3,
	MIXED:      4,
	MM:         5,
};

}(typeof exports === "undefined" ? (this.constants = {}): exports));
