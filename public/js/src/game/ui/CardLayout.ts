/*
    CardLayout is an object that represents a player's hand (or a discard pile)
    It is composed of LayoutChild objects
*/

// Imports
import Konva from 'konva';
import globals from './globals';
import LayoutChild from './LayoutChild';
import HanabiCard from './HanabiCard';

export default class CardLayout extends Konva.Group {
    align: string;
    reverse: boolean;
    origRotation: number;
    empathy: boolean;

    constructor(config: Konva.ContainerConfig) {
        super(config);

        // Class variables
        this.align = config.align || 'left';
        this.reverse = config.reverse || false;
        this.origRotation = config.rotation || 0;
        this.empathy = false;

        // Debug rectangle (uncomment to show the size of the hand)
        /*
        const debugRect = new Konva.Rect({
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            fill: 'black',
            rotation: config.rotation,
        });
        globals.layers.UI.add(debugRect);
        */
    }

    addChild(child: LayoutChild) {
        const pos = child.getAbsolutePosition();
        this.add(child as any);
        child.setAbsolutePosition(pos);
        this.doLayout();
    }

    _setChildrenIndices() {
        Konva.Group.prototype._setChildrenIndices.call(this);
        this.doLayout();
    }

    doLayout() {
        let uw = 0;
        let dist = 0;
        let x = 0;

        const lw = this.width();
        const lh = this.height();

        const n = this.children.length;
        for (let i = 0; i < n; i++) {
            const node = this.children[i]; // This is a LayoutChild

            if (!node.height()) {
                continue;
            }

            const scale = lh / node.height();
            uw += scale * node.width();
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
            const node = this.children[i] as unknown as LayoutChild;

            if (!node.height()) {
                continue;
            }

            const scale = lh / node.height();

            if (node.tween) {
                node.tween.destroy();
            }

            const newX = x - (this.reverse ? scale * node.width() : 0);
            if (globals.animateFast) {
                node.x(newX);
                node.y(0);
                node.scaleX(scale);
                node.scaleY(scale);
                node.rotation(0);
                node.checkSetDraggable();
            } else {
                // Animate the card going from the deck to the hand
                // (or from the hand to the discard pile)
                // and animate the rest of the cards sliding over
                const card = node.children[0] as unknown as HanabiCard;
                card.tweening = true;
                if (card.doMisplayAnimation) {
                    // If this card just misplayed, do a special animation
                    card.doMisplayAnimation = false;
                    node.rotation(360);
                }
                node.tween = new Konva.Tween({
                    node,
                    duration: 0.5,
                    x: newX,
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    easing: Konva.Easings.EaseOut,
                    onFinish: () => {
                        if (!card || !node) {
                            return;
                        }
                        card.tweening = false;
                        node.checkSetDraggable();
                        if (!storedPostAnimationLayout) {
                            return;
                        }
                        storedPostAnimationLayout();
                    },
                }).play();
            }

            x += ((scale * node.width()) + dist) * (this.reverse ? -1 : 1);
        }
    }

    getAbsoluteCenterPos() {
        const pos = this.getAbsolutePosition(); // The top-left-hand corner

        const w = this.width();
        const h = this.height();

        // The rotation comes from Konva in radians but we need to convert it to degrees
        const rot = this.origRotation / 180 * Math.PI;

        pos.x += (w / 2 * Math.cos(rot)) - (h / 2 * Math.sin(rot));
        pos.y += (w / 2 * Math.sin(rot)) + (h / 2 * Math.cos(rot));

        return pos;
    }

    isLocked() {
        for (const layoutChild of this.children.toArray()) {
            const card = layoutChild.children[0];
            if (!card.isClued()) {
                return false;
            }
        }
        return true;
    }
}
