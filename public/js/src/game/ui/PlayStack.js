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
        console.log(config);
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

        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i]; // This is a LayoutChild
            const scale = lh / node.getHeight();
            const stackBase = node.children[0].rank === constants.STACK_BASE_RANK;
            const opacity = (
                globals.variant.name.startsWith('Throw It in a Hole')
                && !globals.replay
                // We want the stack bases to always be visible
                && !stackBase
            ) ? 0 : 1;

            if (globals.animateFast || stackBase) {
                node.setX(0);
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
                node.setOpacity(opacity);
                this.hideUnder();
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
                            this.hideUnder();
                        }
                    },
                }).play();
            }
        }
    }

    hideUnder() {
        const n = this.children.length;
        if (n <= 2) {
            // If we are tweening the first card on to the stack base,
            // we don't need to hide anything
            return;
        }

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
    }

    getLastPlayedRank() {
        // The PlayStack will always have at least 1 element in it (the "stack base" card)
        const topLayoutChild = this.children[this.children.length - 1];
        const topCard = topLayoutChild.children[0];
        return topCard.rank;
    }
}

module.exports = PlayStack;
