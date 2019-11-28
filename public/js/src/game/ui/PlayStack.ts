/*
    PlayStack represents the stack in the middle of the table for each suit
    It is composed of LayoutChild objects
*/

// Imports
import Konva from 'konva';
import globals from './globals';
import LayoutChild from './LayoutChild';
import { STACK_BASE_RANK } from '../../constants';

export default class PlayStack extends Konva.Group {
    addChild(child: LayoutChild) {
        const pos = child.getAbsolutePosition();
        this.add(child as any);
        child.setAbsolutePosition(pos);
        this.doLayout();
    }

    doLayout() {
        const lh = this.height();

        for (const node of this.children.toArray()) { // node is a LayoutChild
            const scale = lh / node.height();
            const stackBase = node.children[0].rank === STACK_BASE_RANK;
            const opacity = ( // Hide cards in "Throw It in a Hole" variants
                globals.variant.name.startsWith('Throw It in a Hole')
                && !globals.replay // Revert to the normal behavior for replays
                && !stackBase // We want the stack bases to always be visible
            ) ? 0 : 1;

            if (globals.animateFast) {
                node.x(0);
                node.y(0);
                node.scaleX(scale);
                node.scaleY(scale);
                node.rotation(0);
                node.opacity(opacity);
                this.hideUnder();
            } else {
                // Animate the card leaving the hand to the play stacks
                // (tweening from the hand to the discard pile is handled in
                // the "CardLayout" object)
                const card = node.children[0];
                card.tweening = true;
                node.tween = new Konva.Tween({
                    node,
                    duration: 0.8,
                    x: 0,
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    opacity,
                    easing: Konva.Easings.EaseOut,
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

        // If the play stack only has the stack base on it, then we do not need to hide anything
        if (n === 1) {
            return;
        }

        for (let i = 0; i < n; i++) {
            const node: any = this.children[i]; // This is a LayoutChild // TODO set to LayoutChild
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
