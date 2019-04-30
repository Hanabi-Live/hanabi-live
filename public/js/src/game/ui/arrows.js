/*
    Arrows are used to show which cards are touched by a clue
    (and to highlight things in shared replays)
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');
const graphics = require('./graphics');

const hideAll = () => {
    let changed = false;
    for (const arrow of globals.elements.arrows) {
        if (arrow.pointingTo !== null) {
            changed = true;
            arrow.pointingTo = null;
            arrow.setVisible(false);
        }
    }
    if (!globals.animateFast && changed) {
        globals.layers.UI2.batchDraw();
    }
};
exports.hideAll = hideAll;

const set = (i, element, giver, clue) => {
    // Show the arrow
    const arrow = globals.elements.arrows[i];
    arrow.pointingTo = element;
    arrow.show();
    arrow.moveToTop();

    // Figure out whether the arrrow should be inverted or not
    let rot = 0;
    if (
        element.type === 'HanabiCard'
        && !element.isPlayed
        && !element.isDiscarded
    ) {
        if (element.parent && element.parent.parent) {
            rot = element.parent.parent.rotation;
        }
        if (
            (!globals.lobby.settings.showKeldonUI && element.holder === globals.playerUs)
            || (globals.lobby.settings.showKeldonUI && element.holder !== globals.playerUs)
        ) {
            // In BGA mode, invert the arrows on our hand
            // (so that it doesn't get cut off by the top of the screen)
            // In Keldon mode, invert the arrows for all other players
            rot += 180;
        }
    }
    arrow.setRotation(rot);

    // We want the text to always be right-side up (e.g. have a rotaiton of 0)
    arrow.text.setRotation(360 - rot);

    // Set the arrow features
    if (clue === null) {
        // This is a highlight arrow
        const color = constants.ARROW_COLOR.HIGHLIGHT;
        arrow.base.setStroke(color);
        arrow.base.setFill(color);

        // Don't draw the circle
        arrow.circle.hide();
        arrow.text.hide();
    } else {
        // This is a clue arrow
        let color;
        if (element.numPositiveClues >= 2) {
            // Cards that are re-clued use a different color
            color = constants.ARROW_COLOR.RETOUCHED;
        } else {
            // Freshly touched cards use the default color
            color = constants.ARROW_COLOR.DEFAULT;
        }
        arrow.base.setStroke(color);
        arrow.base.setFill(color);

        // Clue arrows have a circle that shows the type of clue given
        if (
            globals.variant.name.startsWith('Cow & Pig')
            || globals.variant.name.startsWith('Duck')
        ) {
            // Don't show the circle in Cow & Pig / Duck variants,
            // since the clue types are supposed to be hidden
            arrow.circle.hide();
        } else {
            arrow.circle.show();
            if (clue.type === constants.CLUE_TYPE.RANK) {
                arrow.circle.setFill('black');
                arrow.text.setText(clue.value.toString());
                arrow.text.show();
            } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                arrow.circle.setFill(clue.value.fill);
                arrow.text.hide();
            }
        }
    }

    if (arrow.tween) {
        arrow.tween.destroy();
    }
    if (globals.animateFast || giver === null) {
        const pos = getPos(element, rot);
        arrow.setAbsolutePosition(pos);
    } else {
        animate(arrow, element, rot, giver, globals.turn);
    }
    if (!globals.animateFast) {
        globals.layers.UI2.batchDraw();
    }
};
exports.set = set;

const getPos = (element, rot) => {
    // Start by using the absolute position of the element
    const pos = element.getAbsolutePosition();

    if (element.type === 'HanabiCard') {
        // If we set the arrow at the absolute position of a card, it will point to the exact center
        // Instead, back it off a little bit (accounting for the rotation of the hand)
        const winH = globals.stage.getHeight();
        const distance = -0.075 * winH;
        const rotRadians = (rot / 180) * Math.PI;
        pos.x -= Math.sin(rotRadians) * distance;
        pos.y += Math.cos(rotRadians) * distance;
    } else if (element.type === 'PlayStackBack' || element === globals.elements.deck) {
        pos.x += element.getWidth() / 2;
        pos.y += element.getHeight() / 3.5;
    } else if (element === globals.elements.cluesNumberLabel) {
        pos.x += element.getWidth() * 0.15;
    } else {
        pos.x += element.getWidth() / 3;
    }

    return pos;
};

// Animate the arrow to fly from the player who gave the clue to the card
const animate = (arrow, card, rot, giver, turn) => {
    // Don't bother doing the animation if it is delayed by more than one turn
    if (globals.turn > turn + 1) {
        return;
    }

    // Don't bother doing the animation if the card is no longer part of a hand
    // (which can happen rarely when jumping quickly through a replay)
    if (!card.parent.parent) {
        return;
    }

    // Delay the animation if the card is currently tweening to avoid buggy behavior
    if (card.tweening) {
        arrow.hide();
        setTimeout(() => {
            animate(arrow, card, rot, giver, turn);
        }, 20);
        return;
    }
    arrow.show();

    // Start the arrow at the center position of the clue giver's hand
    const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();
    arrow.setAbsolutePosition(centerPos);

    // Calculate the position of the final arrow destination
    // (this must be done after the card is finished tweening)
    const pos = getPos(card, rot);

    new graphics.Tween({
        node: arrow,
        duration: 0.5,
        x: pos.x,
        y: pos.y,
        easing: graphics.Easings.EaseOut,
    }).play();
};

exports.click = (event, order, element) => {
    if (
        event.evt.which === 3 // Right-click
        && globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        send(order, element);
    }
};

const send = (order, element) => {
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.ARROW,
        order,
    });

    // Draw the arrow manually so that we don't have to wait for the client to server round-trip
    toggle(element);
};
exports.send = send;

// This toggles the "highlight" arrow on a particular element
const toggle = (element) => {
    const arrow = globals.elements.arrows[0];
    const show = (
        arrow.pointingTo !== element
        || arrow.base.getFill() !== constants.ARROW_COLOR.HIGHLIGHT
    );
    hideAll();
    if (show) {
        set(0, element, null, null);

        // If this element has a tooltip and it is open, close it
        if (element.tooltipName) {
            const tooltip = $(`#tooltip-${element.tooltipName}`);
            tooltip.tooltipster('close');
        }
    }
};
exports.toggle = toggle;
