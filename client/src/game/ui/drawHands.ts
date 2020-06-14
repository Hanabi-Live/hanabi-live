// Imports
import Konva from 'konva';
import { CHARACTERS } from '../data/gameData';
import * as hand from '../rules/hand';
import CardLayout from './CardLayout';
import globals from './globals';
import NameFrame from './NameFrame';
import TextWithTooltip from './TextWithTooltip';
import * as tooltips from './tooltips';

interface HandConfig {
  x: number;
  y: number;
  w?: number;
  h?: number;
  rot?: number;
}

// Local variables
const handPos: HandConfig[][] = [];
const namePos: HandConfig[][] = [];
const namePosBGA: HandConfig[][] = [];

export default (winW: number, winH: number) => {
  // Constants
  const numPlayers = globals.playerNames.length;

  /* eslint-disable object-curly-newline */

  // In Keldon mode, the hand positions are different depending on the amount of players,
  // so they have to be hard coded
  const handPos6H = 0.165; // 5-player is 0.189
  const handPos6Ratio = 0.34 / 0.189;
  const handPos6W = handPos6H * handPos6Ratio * 0.75;
  handPos[2] = [
    { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
    { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0 },
  ];
  handPos[3] = [
    { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
    { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78 },
    { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78 },
  ];
  handPos[4] = [
    { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78 },
    { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78 },
  ];
  handPos[5] = [
    { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90 },
    { x: 0.0205, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.44, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.77, y: 0.225, w: 0.301, h: 0.18, rot: 90 },
  ];
  handPos[6] = [
    { x: 0.273, y: 0.77, w: 0.34 * 0.75, h: 0.189, rot: 0 },
    { x: 0.03, y: 0.72, w: 0.301 * 0.8, h: 0.18, rot: -90 },
    { x: 0.0235, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.289, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.5535, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.77, y: 0.292, w: 0.301 * 0.8, h: 0.18, rot: 90 },
  ];

  // In Board Game Arena mode, the hands are all in a line,
  // so they do not have to be hard coded
  const handPosBGA: HandConfig[][] = [];
  const handPosBGAValues = {
    x: 0.435,
    y: 0.03,
    w: 0.34,
    h: 0.16,
    spacing: 0.24,
  };
  for (let i = 2; i <= 6; i++) {
    let handX = handPosBGAValues.x;
    let handY = handPosBGAValues.y;
    let handW = handPosBGAValues.w;
    let handH = handPosBGAValues.h;
    let handSpacing = handPosBGAValues.spacing;
    if (i >= 4) {
      // The hands have 4 cards instead of 5,
      // so we need to slightly reposition the hands horizontally
      handX += 0.03;
      handW -= 0.07;
    }
    if (i === 5) {
      // There is not enough room for 5 hands to fit on the screen,
      // so we need to reduce the size of the cards and the spacing
      handH -= 0.02;
      handSpacing -= 0.045;
    } else if (i === 6) {
      handY -= 0.005;
      handH -= 0.045;
      handSpacing -= 0.075;
    }

    handPosBGA[i] = [];
    for (let j = 0; j < i; j++) {
      handPosBGA[i].push({
        x: handX,
        y: handY + (handSpacing * j),
        w: handW,
        h: handH,
        rot: 0,
      });
    }
  }

  // Set the hand positions for 4-player and 5-player
  // (with 4 cards in the hand)
  const handPosBGAValues4 = {
    x: 0.47,
    y: handPosBGAValues.y,
    w: 0.27,
    h: handPosBGAValues.h,
    rot: 0,
    spacing: handPosBGAValues.spacing,
  };
  for (let j = 0; j < 4; j++) {
    handPosBGA[4].push({
      x: handPosBGAValues4.x,
      y: handPosBGAValues4.y + (handPosBGAValues4.spacing * j),
      w: handPosBGAValues4.w,
      h: handPosBGAValues4.h,
      rot: 0,
    });
  }

  // This is the position for the player name frames in Keldon mode
  // This cannot be algorithmically derived from the hand positions
  const namePosValues = {
    h: 0.02,
  };
  namePos[2] = [
    { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
    { x: 0.18, y: 0.21, w: 0.44, h: namePosValues.h },
  ];
  namePos[3] = [
    { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
    { x: 0.01, y: 0.765, w: 0.12, h: namePosValues.h },
    { x: 0.67, y: 0.765, w: 0.12, h: namePosValues.h },
  ];
  namePos[4] = [
    { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
    { x: 0.01, y: 0.74, w: 0.13, h: namePosValues.h },
    { x: 0.22, y: 0.21, w: 0.36, h: namePosValues.h },
    { x: 0.66, y: 0.74, w: 0.13, h: namePosValues.h },
  ];
  namePos[5] = [
    {
      x: handPos[5][0].x - 0.005,
      y: handPos[5][0].y + handPos[5][1].h! + 0.02,
      w: handPos[5][0].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][1].x - 0.0095,
      y: handPos[5][1].y + 0.005,
      w: 0.12,
      h: namePosValues.h,
    },
    {
      x: handPos[5][2].x - 0.005,
      y: handPos[5][2].y + handPos[5][2].h! + 0.005,
      w: handPos[5][2].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][3].x - 0.005,
      y: handPos[5][3].y + handPos[5][3].h! + 0.005,
      w: handPos[5][3].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][4].x - 0.006 - 0.105,
      y: handPos[5][1].y + 0.005,
      w: 0.12,
      h: namePosValues.h,
    },
  ];
  namePos[6] = [
    {
      x: handPos[6][0].x - 0.005,
      y: handPos[6][0].y + handPos[6][1].h! + 0.02,
      w: handPos[6][0].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][1].x - 0.009,
      y: handPos[6][1].y + 0.01,
      w: 0.12,
      h: namePosValues.h,
    },
    {
      x: handPos[6][2].x - 0.005,
      y: handPos[6][2].y + handPos[6][2].h! + 0.02,
      w: handPos[6][2].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][3].x - 0.005,
      y: handPos[6][3].y + handPos[6][3].h! + 0.02,
      w: handPos[6][3].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][4].x - 0.005,
      y: handPos[6][4].y + handPos[6][4].h! + 0.02,
      w: handPos[6][4].w! + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][5].x - 0.006 - 0.105,
      y: handPos[6][1].y + 0.01,
      w: 0.12,
      h: namePosValues.h,
    },
  ];

  /* eslint-enable object-curly-newline */

  const namePosBGAMod = {
    x: -0.01,
    y: 0.17,
  };
  const numCardsPerHand = hand.cardsPerHand(globals.playerNames.length);
  for (let i = 2; i <= 6; i++) {
    let { y } = namePosBGAMod;
    if (i === 5) {
      // Matches the "handH" reduction above
      y -= 0.02;
    } else if (i === 6) {
      // Matches the "handH" reduction above
      y -= 0.045;
    }
    namePosBGA[i] = [];
    for (let j = 0; j < i; j++) {
      namePosBGA[i].push({
        x: handPosBGA[i][j].x + namePosBGAMod.x,
        y: handPosBGA[i][j].y + y,
        h: namePosValues.h,
      });
      if (numCardsPerHand === 5) {
        namePosBGA[i][j].x += 0.005;
        namePosBGA[i][j].w = handPosBGA[i][j].w! + 0.01;
      } else if (numCardsPerHand === 4) {
        namePosBGA[i][j].w = 0.29;
      } else if (numCardsPerHand === 3) {
        namePosBGA[i][j].x += 0.054;
        namePosBGA[i][j].w = 0.182;
      }
    }
  }

  // Draw the hands
  for (let i = 0; i < numPlayers; i++) {
    let j = i - globals.playerUs;

    if (j < 0) {
      j += numPlayers;
    }

    let playerHandPos = handPos;
    let playerNamePos = namePos;
    if (!globals.lobby.settings.keldonMode) {
      playerHandPos = handPosBGA;
      playerNamePos = namePosBGA;
    }

    const handValues = {
      x: playerHandPos[numPlayers][j].x,
      y: playerHandPos[numPlayers][j].y,
      w: playerHandPos[numPlayers][j].w!,
      h: playerHandPos[numPlayers][j].h!,
      rot: playerHandPos[numPlayers][j].rot,
    };
    globals.elements.playerHands[i] = new CardLayout({
      x: handValues.x * winW,
      y: handValues.y * winH,
      width: handValues.w * winW,
      height: handValues.h * winH,
      rotation: handValues.rot,
      align: 'center',
      reverse: isHandReversed(j),
      listening: true,
    });
    globals.layers.card.add(globals.elements.playerHands[i] as any);

    const turnRectValues = {
      // The black box should always be as wide as the name frame
      x: playerNamePos[numPlayers][j].x,
      y: handValues.y,
      w: playerNamePos[numPlayers][j].w! * 1.04,
      h: handValues.h * 1.38,
      offsetX: handValues.w * 0.02,
      offsetY: handValues.h * 0.14,
    };
    if (globals.lobby.settings.keldonMode) {
      turnRectValues.x = handValues.x;
      turnRectValues.w = handValues.w;
      turnRectValues.h = handValues.h * 1.1;
      turnRectValues.offsetX = 0;
      turnRectValues.offsetY = handValues.h * 0.05;
      if (numPlayers === 5) {
        turnRectValues.w += handValues.w * 0.03;
        turnRectValues.offsetX += handValues.w * 0.015;
      }
    } else if (numPlayers === 6) {
      turnRectValues.h += 0.005;
    }
    const turnRect = new Konva.Rect({
      x: turnRectValues.x * winW,
      y: turnRectValues.y * winH,
      width: turnRectValues.w * winW,
      height: turnRectValues.h * winH,
      offset: {
        x: turnRectValues.offsetX * winW,
        y: turnRectValues.offsetY * winH,
      },
      fill: 'black',
      cornerRadius: turnRectValues.h * 0.1 * winH,
      rotation: handValues.rot,
      opacity: 0.5,
      visible: false,
    });
    globals.layers.UI.add(turnRect);
    globals.elements.playerHandTurnRects.push(turnRect);

    // drawShades(winW, winH, numPlayers, j);

    globals.elements.nameFrames[i] = new NameFrame({
      x: playerNamePos[numPlayers][j].x * winW,
      y: playerNamePos[numPlayers][j].y * winH,
      width: playerNamePos[numPlayers][j].w! * winW,
      height: playerNamePos[numPlayers][j].h! * winH,
      name: globals.playerNames[i],
      playerIndex: i,
    });
    globals.layers.UI.add(globals.elements.nameFrames[i] as any);

    drawDetrimentalCharacters(winW, winH, numPlayers, i, j);
  }
};

/*
// Draw the faded shade that shows where the "new" side of the hand is
// (but don't bother drawing it in BGA mode since all the hands face the same way)
const drawShades = (winW: number, winH: number, numPlayers: number, playerIndex: number) => {
  if (!globals.lobby.settings.keldonMode) {
    return;
  }

  // This is the position for the white shade that shows where the new side of the hand is
  // The x and y coordinates cannot be algorithmically derived from the hand positions
  // Note that there is no shade in BGA mode
  const shadePos: HandConfig[][] = [];
  shadePos[2] = [
    { x: handPos[2][0].x + 0.001, y: handPos[2][0].y - 0.008 },
    { x: handPos[2][1].x - 0.011, y: handPos[2][1].y - 0.008 },
  ];
  shadePos[3] = [
    { x: handPos[3][0].x + 0.001, y: handPos[3][0].y - 0.008 },
    { x: handPos[3][1].x - 0.006, y: handPos[3][1].y + 0.01 },
    { x: handPos[3][2].x + 0.003, y: handPos[3][2].y - 0.013 },
  ];
  shadePos[4] = [
    { x: handPos[4][0].x + 0.001, y: handPos[4][0].y - 0.008 },
    { x: handPos[4][1].x - 0.007, y: handPos[4][1].y + 0.021 },
    { x: handPos[4][2].x - 0.011, y: handPos[4][2].y - 0.008 },
    { x: handPos[4][3].x + 0.002, y: handPos[4][3].y - 0.023 },
  ];
  shadePos[5] = [
    { x: handPos[5][0].x + 0.001, y: handPos[5][0].y - 0.008 },
    { x: handPos[5][1].x - 0.004, y: handPos[5][1].y + 0.009 },
    { x: handPos[5][2].x - 0.01, y: handPos[5][2].y - 0.008 },
    { x: handPos[5][3].x - 0.01, y: handPos[5][3].y - 0.008 },
    { x: handPos[5][4].x + 0.004, y: handPos[5][4].y - 0.009 },
  ];
  shadePos[6] = [
    { x: handPos[6][0].x + 0.001, y: handPos[6][0].y - 0.008 },
    { x: handPos[6][1].x - 0.0045, y: handPos[6][1].y + 0.02 },
    { x: handPos[6][2].x - 0.011, y: handPos[6][2].y - 0.008 },
    { x: handPos[6][3].x - 0.011, y: handPos[6][3].y - 0.008 },
    { x: handPos[6][4].x - 0.011, y: handPos[6][4].y - 0.008 },
    { x: handPos[6][5].x + 0.0045, y: handPos[6][5].y - 0.02 },
  ];
  for (let i = 2; i <= 6; i++) {
    for (let j = 0; j < i; j++) {
      shadePos[i][j].w = handPos[i][j].w! + 0.01;
      shadePos[i][j].h = handPos[i][j].h! + 0.016;
      shadePos[i][j].rot = handPos[i][j].rot;
    }
  }

  const rect = new Konva.Rect({
    x: shadePos[numPlayers][playerIndex].x * winW,
    y: shadePos[numPlayers][playerIndex].y * winH,
    width: shadePos[numPlayers][playerIndex].w! * winW,
    height: shadePos[numPlayers][playerIndex].h! * winH,
    rotation: shadePos[numPlayers][playerIndex].rot,
    cornerRadius: 0.03 * shadePos[numPlayers][playerIndex].w! * winW,
    opacity: 0.4,
    fillLinearGradientStartPoint: {
      x: 0,
      y: 0,
    },
    fillLinearGradientEndPoint: {
      x: shadePos[numPlayers][playerIndex].w! * winW,
      y: 0,
    },
    fillLinearGradientColorStops: [0, 'rgba(0,0,0,0)', 0.9, 'white'],
  });

  if (isHandReversed(playerIndex)) {
    rect.fillLinearGradientColorStops([1, 'rgba(0,0,0,0)', 0.1, 'white']);
  }

  globals.layers.UI.add(rect);
};
*/

// Draw the "Detrimental Character Assignments" icon and tooltip
const drawDetrimentalCharacters = (
  winW: number,
  winH: number,
  numPlayers: number,
  i: number,
  j: number,
) => {
  let playerNamePos = namePos;
  if (!globals.lobby.settings.keldonMode) {
    playerNamePos = namePosBGA;
  }

  if (globals.options.detrimentalCharacters) {
    let character = CHARACTERS.get(globals.characterAssignments[i]);
    if (globals.characterAssignments[i] === 'n/a') {
      // A "n/a" character may be assigned when debugging
      character = {
        id: -1,
        name: 'n/a',
        description: '',
        emoji: '',
      };
    }
    if (typeof character === 'undefined') {
      throw new Error(`Failed to get the "${globals.characterAssignments[i]}" character.`);
    }

    const width2 = 0.03 * winW;
    const height2 = 0.03 * winH;
    const charIcon = new TextWithTooltip({
      width: width2,
      height: height2,
      x: (playerNamePos[numPlayers][j].x * winW) - (width2 / 2),
      y: (playerNamePos[numPlayers][j].y * winH) - (height2 / 2),
      fontSize: 0.03 * winH,
      fontFamily: 'Verdana',
      align: 'center',
      text: character.emoji,
      fill: 'yellow',
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: true,
    });
    globals.layers.UI.add(charIcon);

    charIcon.tooltipName = `character-assignment-${i}`;
    const metadata = globals.characterMetadata[i];
    let tooltipContent = `<strong>#${character.id} - ${character.name}</strong><br />${character.description}`;
    if (tooltipContent.includes('[random color]')) {
      // Replace "[random color]" with the selected color
      tooltipContent = tooltipContent.replace(
        '[random color]',
        globals.variant.clueColors[metadata].name.toLowerCase(),
      );
    } else if (tooltipContent.includes('[random number]')) {
      // Replace "[random number]" with the selected number
      tooltipContent = tooltipContent.replace(
        '[random number]',
        metadata.toString(),
      );
    } else if (tooltipContent.includes('[random suit]')) {
      // Replace "[random suit]" with the selected suit name
      tooltipContent = tooltipContent.replace(
        '[random suit]',
        globals.variant.suits[metadata].name,
      );
    }
    charIcon.tooltipContent = tooltipContent;
    tooltips.init(charIcon, false, true);
  }
};

const isHandReversed = (j: number) => {
  // By default, the hand is not reversed
  let reverse = false;

  if (j === 0) {
    // Reverse the ordering of the cards for our own hand
    // (for our hand, the oldest card is the first card, which should be on the right)
    reverse = true;
  }
  if (!globals.lobby.settings.keldonMode) {
    // In BGA mode, we need to reverse every hand
    reverse = true;
  }
  if (globals.lobby.settings.reverseHands) {
    // If the "Reverse hand direction" option is turned on,
    // then we need to flip the direction of every hand
    reverse = !reverse;
  }

  return reverse;
};
