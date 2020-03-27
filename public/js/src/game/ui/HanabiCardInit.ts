/*
    Initialization functions for the HanabiCard object
*/

// Imports
import Konva from 'konva';
import * as arrows from './arrows';
import { CARD_H, CARD_W, START_CARD_RANK } from '../../constants';
import CardLayout from './CardLayout';
import drawPip from './drawPip';
import globals from './globals';
import HanabiCard from './HanabiCard';
import HanabiCardClick from './HanabiCardClick';
import HanabiCardClickSpeedrun from './HanabiCardClickSpeedrun';
import NoteIndicator from './NoteIndicator';
import * as notes from './notes';
import possibilitiesCheck from './possibilitiesCheck';
import RankPip from './RankPip';

export function image(this: HanabiCard) {
    // Create the "bare" card image, which is the main card grahpic
    // If the card is not revealed, it will just be a gray rectangle
    // The pips and other elements of a card are drawn on top of the bare image
    this.bare = new Konva.Image({
        width: CARD_W,
        height: CARD_H,
        image: null as any,
    });
    (this.bare as any).sceneFunc((ctx: CanvasRenderingContext2D) => {
        scaleCardImage(
            ctx,
            this.bareName,
            this.bare!.width(),
            this.bare!.height(),
            this.bare!.getAbsoluteTransform(),
        );
    });
    this.add(this.bare);
}

export function border(this: HanabiCard) {
    // The card will get a border when it becomes clued
    this.cluedBorder = new Konva.Rect({
        x: 3,
        y: 3,
        width: CARD_W - 6,
        height: CARD_H - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffdf00', // Yellow
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);

    /*
        The card will also get a border if it is not clued but has a particular note on it
    */

    this.noteBorder = new Konva.Rect({
        x: 3,
        y: 3,
        width: CARD_W - 6,
        height: CARD_H - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#fffce6', // White with a yellow tint
        visible: false,
        listening: false,
    });
    this.add(this.noteBorder);

    this.finesseBorder = new Konva.Rect({
        x: 3,
        y: 3,
        width: CARD_W - 6,
        height: CARD_H - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: 'aqua',
        visible: false,
        listening: false,
    });
    this.add(this.finesseBorder);
}

export function pips(this: HanabiCard) {
    // Initialize the suit pips (colored shapes) on the back of the card,
    // which will be removed one by one as the card gains negative information
    this.suitPips = new Konva.Group({
        x: 0,
        y: 0,
        width: Math.floor(CARD_W),
        height: Math.floor(CARD_H),
        visible: false,
        listening: false,
    });
    this.add(this.suitPips);

    const { suits } = globals.variant;
    this.suitPipsMap = new Map(); // Keys are suit objects
    this.suitPipsXMap = new Map(); // Keys are suit objects
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Set the pip at the middle of the card
        const x = Math.floor(CARD_W * 0.5);
        const y = Math.floor(CARD_H * 0.5);
        const scale = { // Scale numbers are magic
            x: 0.4,
            y: 0.4,
        };
        // Transform polar to Cartesian coordinates
        const offsetBase = CARD_W * 0.7;
        const offsetTrig = ((-i / suits.length) + 0.25) * Math.PI * 2;
        const offset = {
            x: Math.floor(offsetBase * Math.cos(offsetTrig)),
            y: Math.floor(offsetBase * Math.sin(offsetTrig)),
        };
        let { fill } = suit;
        if (suit.fill === 'multi') {
            fill = '';
        }

        const suitPip = new Konva.Shape({
            x,
            y,
            scale,
            offset,
            fill,
            stroke: 'black',
            strokeWidth: 5,
            sceneFunc: (ctx: any) => { // Konva.Context does not exist for some reason
                drawPip(ctx, suit, false, false);
            },
            listening: false,
        });

        // Gradient numbers are magic
        if (suit.fill === 'multi') {
            suitPip.fillRadialGradientColorStops([
                0.3, suit.fillColors[0],
                0.425, suit.fillColors[1],
                0.65, suit.fillColors[2],
                0.875, suit.fillColors[3],
                1, suit.fillColors[4],
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
            suitPip.fillRadialGradientEndRadius(Math.floor(CARD_W * 0.25));
        }
        suitPip.rotation(0);
        this.suitPips.add(suitPip);
        this.suitPipsMap.set(suit, suitPip);

        // Also create the X that will show when a certain suit can be ruled out
        const suitPipX = new Konva.Shape({
            x,
            y,
            scale,
            offset,
            fill: 'black',
            stroke: 'black',
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 50;
                const xx = Math.floor((CARD_W * 0.25) - (width * 0.45));
                const xy = Math.floor((CARD_H * 0.25) - (width * 0.05));
                drawX(ctx, shape, xx, xy, 50, width);
            },
            listening: false,
        });
        this.suitPips.add(suitPipX);
        this.suitPipsXMap.set(suit, suitPipX);
    }

    // Initialize the rank pips, which are black squares along the bottom of the card
    this.rankPips = new Konva.Group({
        x: 0,
        y: Math.floor(CARD_H * 0.85),
        width: CARD_W,
        height: Math.floor(CARD_H * 0.15),
        visible: false,
        listening: false,
    });
    this.add(this.rankPips);

    this.rankPipsMap = new Map();
    this.rankPipsXMap = new Map();
    for (const rank of globals.variant.ranks) {
        const x = Math.floor(CARD_W * ((rank * 0.19) - 0.14));
        const y = 0;
        let opacity = 1;
        if (rank === START_CARD_RANK) {
            // We don't want to show the rank pip that represents a "START" card
            opacity = 0;
        }
        const rankPip = new RankPip({
            x,
            y,
            width: Math.floor(CARD_H * 0.1),
            height: Math.floor(CARD_H * 0.1),
            fill: 'black',
            stroke: 'black',
            strokeWidth: 4,
            cornerRadius: 0.02 * CARD_H,
            opacity,
            listening: false,
        });
        this.rankPips.add(rankPip);
        this.rankPipsMap.set(rank, rankPip);

        // Also create the X that will show when a certain rank can be ruled out
        opacity = 0.8;
        if (rank === START_CARD_RANK) {
            // We don't want to show the rank pip that represents a "START" card
            opacity = 0;
        }
        const rankPipX = new Konva.Shape({
            x,
            y,
            fill: '#e6e6e6',
            stroke: 'black',
            strokeWidth: 2,
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 20;
                const xx = Math.floor(CARD_W * 0.035);
                const xy = Math.floor(CARD_H * 0.047);
                drawX(ctx, shape, xx, xy, 10, width);
            },
            listening: false,
        });
        this.rankPips.add(rankPipX);
        this.rankPipsXMap.set(rank, rankPipX);
    }
}

export function note(this: HanabiCard) {
    // Define the note indicator image
    const noteX = 0.78;
    const noteY = 0.03;
    const size = 0.2 * CARD_W;
    this.noteIndicator = new NoteIndicator({
        x: noteX * CARD_W,
        // If the cards have triangles on the corners that show the color composition,
        // the images will overlap
        // Thus, we move it downwards if this is the case
        y: (globals.variant.offsetCornerElements ? noteY + 0.1 : noteY) * CARD_H,
        align: 'center',
        image: globals.ImageLoader!.get('note')!,
        width: size,
        height: size,
        rotation: 180,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: notes.shouldShowIndicator(this.order),
        listening: false,
    });
    this.noteIndicator.scale({
        x: -1,
        y: -1,
    });
    this.add(this.noteIndicator);

    // If the user mouses over the card, show a tooltip that contains the note
    // (we don't use the "tooltip.init()" function because we need the extra conditions in the
    // "mousemove" event)
    this.tooltipName = `card-${this.order}`;
    this.on('mousemove', function cardMouseMove(this: HanabiCard) {
        // Don't do anything if there is not a note on this card
        if (!this.noteIndicator!.visible()) {
            return;
        }

        // Don't open any more note tooltips if the user is currently editing a note
        if (globals.editingNote !== null) {
            return;
        }

        // If we are spectating and there is an new note, mark it as seen
        if (this.noteIndicator!.rotated) {
            this.noteIndicator!.rotated = false;
            this.noteIndicator!.rotate(-15);
            globals.layers.get('card')!.batchDraw();
        }

        globals.activeHover = this;
        notes.show(this);
    });

    this.on('mouseout', function cardMouseOut(this: HanabiCard) {
        globals.activeHover = null;

        // Don't close the tooltip if we are currently editing a note
        if (globals.editingNote !== null) {
            return;
        }

        const tooltip = $(`#tooltip-${this.tooltipName}`);
        tooltip.tooltipster('close');
    });
}

// In a game, click on a teammate's hand to it show as it would to that teammate
// (or show your own hand as it should appear without any identity notes on it)
// (or, in a replay, show the hand as it appeared at that moment in time)
export function empathy(this: HanabiCard) {
    this.on('mousedown', (event: Konva.KonvaEventObject<MouseEvent>) => {
        if (
            event.evt.which !== 1 // Only enable Empathy for left-clicks
            // Disable Empathy if a modifier key is pressed
            // (unless we are in a speedrun,
            // because then Empathy is mapped to Ctrl + left click)
            || (event.evt.ctrlKey && !globals.speedrun && !globals.lobby.settings.get('speedrunMode'))
            || (
                !event.evt.ctrlKey
                && (globals.speedrun || globals.lobby.settings.get('speedrunMode'))
                && !globals.replay
                && !globals.spectating
            )
            || event.evt.shiftKey
            || event.evt.altKey
            || event.evt.metaKey
            || this.tweening // Disable Empathy if the card is tweening
            || this.isPlayed // Clicking on a played card goes to the turn that it was played
            // Clicking on a discarded card goes to the turn that it was discarded
            || this.isDiscarded
            || this.order > globals.deck.length - 1 // Disable empathy for the stack bases
        ) {
            return;
        }

        globals.activeHover = this;
        setEmpathyOnHand(true);
    });

    // Konva.PointerEvent does not have a "type" property for some reason
    this.on('mouseup mouseout', (event: any) => {
        if (event.type === 'mouseup' && event.evt.which !== 1) { // Left-click
            return;
        }

        globals.activeHover = null;
        setEmpathyOnHand(false);
    });

    const setEmpathyOnHand = (enabled: boolean) => {
        // Disable Empathy for the stack bases
        if (this.order > globals.deck.length - 1) {
            return;
        }

        if (!this.parent || !this.parent.parent) {
            return;
        }
        const hand = this.parent.parent as unknown as CardLayout;
        if (!hand || hand.children.length === 0 || hand.empathy === enabled) {
            return;
        }

        hand.empathy = enabled;
        for (const layoutChild of hand.children.toArray()) {
            const card = layoutChild.children[0];
            card.empathy = enabled;
            card.setBareImage();
            card.setFade();
        }
        globals.layers.get('card')!.batchDraw();
    };
}

export function click(this: HanabiCard) {
    // Define the clue log mouse handlers
    this.on('mousemove tap', () => {
        globals.elements.clueLog!.showMatches(this);
        globals.layers.get('UI')!.batchDraw();
    });
    this.on('mouseout', () => {
        globals.elements.clueLog!.showMatches(null);
        globals.layers.get('UI')!.batchDraw();
    });

    // Define the other mouse handlers
    this.on('click tap', HanabiCardClick);
    this.on('mousedown', HanabiCardClickSpeedrun);
    this.on('mousedown', (event: any) => {
        if (
            event.evt.which !== 1 // Dragging uses left click
            || !this.parent
            || !this.parent.draggable()
        ) {
            return;
        }

        // Hide any visible arrows on the rest of a hand when the card begins to be dragged
        if (!this.parent || !this.parent.parent) {
            return;
        }
        const hand = this.parent.parent;
        let hidden = false;
        for (const layoutChild of hand.children.toArray()) {
            const card = layoutChild.children[0];
            for (const arrow of globals.elements.arrows) {
                if (arrow.pointingTo === card) {
                    hidden = true;
                    arrows.hideAll();
                    break;
                }
            }
            if (hidden) {
                break;
            }
        }

        // Move this hand to the top
        // (otherwise, the card can appear under the play stacks / discard stacks)
        hand.moveToTop();
    });
}

export function possibilities(this: HanabiCard) {
    if (!possibilitiesCheck()) {
        return;
    }

    // We want to remove all of the currently seen cards from the list of possibilities
    for (let i = 0; i < globals.indexOfLastDrawnCard; i++) {
        const card = globals.deck[i];

        // Don't do anything if this is one of our unknown cards
        if (card.suit === null || card.rank === null) {
            continue;
        }

        // If the card is still in the player's hand and it is not fully "filled in" with clues,
        // then we cannot remove it from the list of possibilities
        // (because they do not know what it is yet)
        if (
            card.holder === this.holder
            && (card.possibleSuits.length > 1 || card.possibleRanks.length > 1)
        ) {
            continue;
        }

        this.removePossibility(card.suit, card.rank, false);
    }
}

export function fixme(this: HanabiCard) {
    this.fixme = new Konva.Image({
        x: 0.1 * CARD_W,
        y: 0.33 * CARD_H,
        width: 0.8 * CARD_W,
        image: globals.ImageLoader!.get('wrench')!,
        visible: false,
    });
    this.add(this.fixme);
}

export function sparkles(this: HanabiCard) {
    /*
    const spark = new Sparkle({
        x: -50,
        y: -50,
        image: globals.ImageLoader.get('sparkle');
    });
    this.add(spark);
    */
}

/*
    Misc. functions
*/

const scaleCardImage = (
    ctx: CanvasRenderingContext2D,
    name: string,
    width: number,
    height: number,
    tf: any, // Konva.Transform does not exist for some reason
) => {
    let src = globals.cardImages.get(name);
    if (typeof src === 'undefined') {
        throw new Error(`The image "${name}" was not generated.`);
    }

    const dw = Math.sqrt((tf.m[0] * tf.m[0]) + (tf.m[1] * tf.m[1])) * width;
    const dh = Math.sqrt((tf.m[2] * tf.m[2]) + (tf.m[3] * tf.m[3])) * height;

    if (dw < 1 || dh < 1) {
        return;
    }

    let sw = width;
    let sh = height;
    let steps = 0;

    let scaledCardImages = globals.scaledCardImages.get(name);
    if (typeof scaledCardImages === 'undefined') {
        scaledCardImages = [];
        globals.scaledCardImages.set(name, scaledCardImages);
    }

    // This code was written by Keldon;
    // scaling the card down in steps of half in each dimension presumably improves the scaling
    while (dw < sw / 2) {
        let scaledCardImage = scaledCardImages[steps];

        sw = Math.floor(sw / 2);
        sh = Math.floor(sh / 2);

        if (!scaledCardImage) {
            scaledCardImage = document.createElement('canvas');
            scaledCardImage.width = sw;
            scaledCardImage.height = sh;

            const scaleContext = scaledCardImage.getContext('2d');
            if (scaleContext === null) {
                throw new Error('Failed to get the context for a new scaled card image.');
            }
            scaleContext.drawImage(src, 0, 0, sw, sh);

            scaledCardImages[steps] = scaledCardImage;
        }

        src = scaledCardImage;
        steps += 1;
    }

    ctx.drawImage(src, 0, 0, width, height);
};

const drawX = (
    ctx: any, // Konva.Context does not exist for some reason
    shape: any,
    x: number,
    y: number,
    size: number,
    width: number,
) => {
    // Start at the top left corner and draw an X
    ctx.beginPath();
    ctx.translate(-1.4 * width, -2 * width);
    x -= size;
    y -= size;
    ctx.moveTo(x, y);
    x += width / 2;
    y -= width / 2;
    ctx.lineTo(x, y);
    x += size;
    y += size;
    ctx.lineTo(x, y);
    x += size;
    y -= size;
    ctx.lineTo(x, y);
    x += width / 2;
    y += width / 2;
    ctx.lineTo(x, y);
    x -= size;
    y += size;
    ctx.lineTo(x, y);
    x += size;
    y += size;
    ctx.lineTo(x, y);
    x -= width / 2;
    y += width / 2;
    ctx.lineTo(x, y);
    x -= size;
    y -= size;
    ctx.lineTo(x, y);
    x -= size;
    y += size;
    ctx.lineTo(x, y);
    x -= width / 2;
    y -= width / 2;
    ctx.lineTo(x, y);
    x += size;
    y -= size;
    ctx.lineTo(x, y);
    x -= size;
    y -= size;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();
    ctx.fillStrokeShape(shape);
};
