// This is one of the entries in the clue log (in the top-right-hand corner of the UI)

import Konva from 'konva';
import { cluesRules } from '../rules';
import { StateClue } from '../types/GameState';
import FitText from './controls/FitText';
import globals from './globals';
import HanabiCard from './HanabiCard';
import { drawLayer } from './konvaHelpers';
import * as replay from './replay';

export default class ClueEntry extends Konva.Group {
  clue: StateClue;

  background: Konva.Rect;
  negativeMarker: Konva.Text;

  constructor(clue: StateClue, config: Konva.ContainerConfig) {
    super(config);

    this.clue = clue;

    // Object variables
    const w = config.width;
    if (w === undefined) {
      throw new Error('ClueEntry was not provided with a "w" value.');
    }
    const h = config.height;
    if (h === undefined) {
      throw new Error('ClueEntry was not provided with a "h" value.');
    }

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
      text: globals.state.metadata.playerNames[clue.giver],
      verticalAlign: 'middle',
      listening: false,
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
      text: globals.state.metadata.playerNames[clue.target],
      verticalAlign: 'middle',
      listening: false,
    });
    this.add(target);

    const characterID = globals.state.metadata.characterAssignments[clue.giver];
    const name = new Konva.Text({
      x: 0.75 * w,
      y: 0,
      width: 0.2 * w,
      height: h,
      align: 'center',
      fontSize: 0.9 * h,
      fontFamily: 'Verdana',
      fill: 'white',
      text: cluesRules.getClueName(clue.type, clue.value, globals.variant, characterID),
      verticalAlign: 'middle',
      listening: false,
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
      listening: false,
    });
    this.add(this.negativeMarker);

    // Add a mouseover highlighting effect
    this.background.on('mouseover', () => {
      globals.elements.clueLog!.showMatches(null);

      this.background.opacity(0.4);
      drawLayer(this);
    });
    this.background.on('mouseout', () => {
      this.background.opacity(0.1);
      drawLayer(this);
    });

    // Click an entry in the clue log to go to that turn in the replay
    this.background.on('click tap', () => {
      replay.goToSegment(this.clue.segment + 1, true);
    });
  }

  showMatch(target: HanabiCard | null) {
    this.background.opacity(0.1);
    this.background.fill('white');
    this.negativeMarker.hide();

    for (let i = 0; i < this.clue.list.length; i++) {
      if (globals.deck[this.clue.list[i]] === target) {
        this.background.opacity(0.4);
      }
    }

    for (let i = 0; i < this.clue.negativeList.length; i++) {
      if (globals.deck[this.clue.negativeList[i]] === target) {
        this.background.opacity(0.4);
        this.background.fill('#ff7777');
        if (globals.lobby.settings.colorblindMode) {
          this.negativeMarker.show();
        }
      }
    }
  }
}
