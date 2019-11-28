/*
    This is one of the entries in the clue log
    (in the top-right-hand corner of the UI)
*/

// Imports
import Konva from 'konva';
import FitText from './FitText';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as replay from './replay';

export default class ClueEntry extends Konva.Group {
    list: Array<number>;
    negativeList: Array<number>;
    turn: number;

    background: Konva.Rect;
    negativeMarker: Konva.Text;

    constructor(config: Konva.ContainerConfig) {
        super(config);

        // Object variables
        const w = config.width;
        if (typeof w === 'undefined') {
            throw new Error('ClueEntry was not provided with a "w" value.');
        }
        const h = config.height;
        if (typeof h === 'undefined') {
            throw new Error('ClueEntry was not provided with a "h" value.');
        }
        this.list = config.list;
        this.negativeList = config.negativeList;
        this.turn = config.turn;

        this.background = new Konva.Rect({
            x: 0,
            y: 0,
            width: w,
            height: h,
            fill: 'white',
            opacity: 0.1,
            listening: true,
        });
        this.add(this.background);

        const giver = new FitText({
            x: 0.05 * w,
            y: 0,
            width: 0.3 * w,
            height: h,
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.giver,
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
        });
        this.add(target);

        const name = new Konva.Text({
            x: 0.75 * w,
            y: 0,
            width: 0.2 * w,
            height: h,
            align: 'center',
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.clueName,
        });
        this.add(name);

        this.negativeMarker = new Konva.Text({
            x: 0.88 * w,
            y: 0,
            width: 0.2 * w,
            height: h,
            align: 'center',
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: '✘',
            visible: false,
        });
        this.add(this.negativeMarker);

        // Add a mouseover highlighting effect
        this.background.on('mouseover', () => {
            globals.elements.clueLog!.showMatches(null);

            this.background.opacity(0.4);
            const layer = this.getLayer();
            if (layer) {
                layer.batchDraw();
            }
        });
        this.background.on('mouseout', () => {
            this.background.opacity(0.1);
            const layer = this.getLayer();
            if (layer) {
                layer.batchDraw();
            }
        });

        // Click an entry in the clue log to go to that turn in the replay
        this.background.on('click', () => {
            replay.clueLogClickHandler(this.turn);
        });
    }

    showMatch(target: HanabiCard | null) {
        this.background.opacity(0.1);
        this.background.fill('white');
        this.negativeMarker.hide();

        for (let i = 0; i < this.list.length; i++) {
            if (globals.deck[this.list[i]] === target) {
                this.background.opacity(0.4);
            }
        }

        for (let i = 0; i < this.negativeList.length; i++) {
            if (globals.deck[this.negativeList[i]] === target) {
                this.background.opacity(0.4);
                this.background.fill('#ff7777');
                if (globals.lobby.settings.get('showColorblindUI')) {
                    this.negativeMarker.show();
                }
            }
        }
    }
}
