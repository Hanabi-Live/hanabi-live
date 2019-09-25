/*
    CardStack is an object that represents a play stack
    It is composed of LayoutChild objects
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');
const graphics = require('./graphics');

class PlayStack extends graphics.Group {
    constructor(config) {
        super(config);
        this.rotation = 0;
    }

    add(child) {
        const pos = child.getAbsolutePosition();
        graphics.Group.prototype.add.call(this, child);
        child.setAbsolutePosition(pos);
        this.doLayout();
    }

    doLayout() {
        const lh = this.getHeight();

        const hideUnder = () => {
            const n = this.children.length;
            for (let i = 0; i < n; i++) {
                const node = this.children[i]; // This is a LayoutChild
                if (!node.tween) {
                    continue;
                }
                if (node.tween !== null) {
                    return;
                }
            }
            for (let i = 0; i < n - 1; i++) {
                this.children[i].hide();
            }
            if (n > 0) {
                this.children[n - 1].show();
            }
        };

        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i]; // This is a LayoutChild
            const scale = lh / node.getHeight();
            const opacity = (
                globals.variant.name.startsWith('Throw It in a Hole')
                && !globals.replay
                // We want the stack bases to always be visible
                && node.children[0].rank !== constants.STACK_BASE_RANK
            ) ? 0 : 1;

            if (globals.animateFast) {
                node.setX(0);
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
                node.setOpacity(opacity);
                hideUnder();
            } else {
                // Animate the card leaving the hand to the play stacks
                // (tweening from the hand to the discard pile is handled in "CardLayout.js")
                const card = node.children[0];
                card.tweening = true;
                node.tween = new graphics.Tween({
                    node,
                    duration: 0.8,
                    x: 0,
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    opacity,
                    easing: graphics.Easings.EaseOut,
                    onFinish: () => {
                        if (!node || !card || !card.parent) {
                            return;
                        }
                        if (card.isMisplayed && card.parent.parent) {
                            // If the card is misplayed, then tween it to the discard pile
                            // We check for "card.parent.parent" to fix the bug where
                            // the tween will still finish if the user goes backward in a replay
                            card.removeFromParent();
                            card.animateToDiscardPile();
                        } else {
                            card.tweening = false;
                            node.checkSetDraggable();
                            hideUnder();
                        }
                    },
                }).play();
            }
        }
    }

    getLastPlayedRank() {
        // The PlayStack will always have at least 1 element in it (the "stack base" card)
        const topLayoutChild = this.children[this.children.length - 1];
        const topCard = topLayoutChild.children[0];
        return topCard.rank;
    }
}

module.exports = PlayStack;
