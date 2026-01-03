import type { NumPlayers, PlayerIndex } from "@hanabi-live/game";
import { getCardsPerHand, getCharacter } from "@hanabi-live/game";
import { eRange } from "complete-common";
import Konva from "konva";
import { CardLayout } from "./CardLayout";
import { NameFrame } from "./NameFrame";
import { globals } from "./UIGlobals";
import { CARD_H, CARD_W, OFF_BLACK } from "./constants";
import { TextWithTooltip } from "./controls/TextWithTooltip";
import { initKonvaTooltips } from "./konvaTooltips";

interface HandConfig {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

const handPos: HandConfig[][] = [];
const namePos: HandConfig[][] = [];
const namePosBGA: HandConfig[][] = [];

export function drawHands(winW: number, winH: number): void {
  // Constants
  const { numPlayers } = globals.options;
  const numCardsPerHand = getCardsPerHand(globals.options);

  // In Keldon mode, the hand positions are different depending on the amount of players, so they
  // have to be hard-coded.
  const handPos6H = 0.165; // 5-player is 0.189
  const handPos6Ratio = 0.34 / 0.189;
  const handPos6W = handPos6H * handPos6Ratio * 0.75;
  handPos[2] = [
    { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
    { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0 },
  ];
  handPos[3] = [
    { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
    { x: 0.011, y: 0.73, w: 0.41, h: 0.189, rot: -82 },
    { x: 0.735, y: 0.024, w: 0.41, h: 0.189, rot: 82 },
  ];
  handPos[4] = [
    { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.015, y: 0.68, w: 0.34, h: 0.189, rot: -78 },
    { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78 },
  ];
  handPos[5] = [
    { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.03, y: 0.756, w: 0.301, h: 0.18, rot: -90 },
    { x: 0.0205, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.44, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
    { x: 0.77, y: 0.238, w: 0.301, h: 0.18, rot: 90 },
  ];
  handPos[6] = [
    { x: 0.273, y: 0.77, w: 0.34 * 0.75, h: 0.189, rot: 0 },
    { x: 0.03, y: 0.72, w: 0.301 * 0.8, h: 0.18, rot: -90 },
    { x: 0.0235, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.289, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.5535, y: 0.009, w: handPos6W, h: handPos6H, rot: 0 },
    { x: 0.77, y: 0.292, w: 0.301 * 0.8, h: 0.18, rot: 90 },
  ];
  if (globals.options.oneExtraCard) {
    const reducedH = 0.165;
    const adjustedYUs = 0.018;
    const adjustedYOther = 0.013;

    // 2-player
    handPos[2][0]!.h = reducedH;
    handPos[2][1]!.h = reducedH;
    handPos[2][0]!.y += adjustedYUs;
    handPos[2][1]!.y += adjustedYOther;

    // 3-player
    handPos[3][0]!.h = reducedH;
    handPos[3][1]!.h = reducedH;
    handPos[3][2]!.h = reducedH;
    handPos[3][0]!.y += adjustedYUs;

    // 4-player
    handPos[4][0]!.h = reducedH;
    handPos[4][1]!.h = reducedH;
    handPos[4][2]!.h = reducedH;
    handPos[4][3]!.h = reducedH;
    handPos[4][0]!.y += adjustedYUs;
    handPos[4][2]!.y += adjustedYOther;

    // 5-player
    handPos[5][0]!.h = reducedH;
    handPos[5][1]!.h = reducedH - 0.02;
    handPos[5][2]!.h = reducedH;
    handPos[5][3]!.h = reducedH;
    handPos[5][4]!.h = reducedH - 0.02;
    handPos[5][0]!.y += adjustedYUs;

    // 6-player
    handPos[6][0]!.h = reducedH - 0.01;
    handPos[6][1]!.h = reducedH - 0.02;
    handPos[6][2]!.h = reducedH - 0.03;
    handPos[6][3]!.h = reducedH - 0.03;
    handPos[6][4]!.h = reducedH - 0.03;
    handPos[6][5]!.h = reducedH - 0.02;
    handPos[6][2]!.y += adjustedYOther;
    handPos[6][3]!.y += adjustedYOther;
    handPos[6][4]!.y += adjustedYOther;
  }

  // In Board Game Arena mode, the hands are all in a line, so they do not have to be hard-coded.
  const handPosBGA: HandConfig[][] = [];
  if (!globals.lobby.settings.keldonMode) {
    let leftX = 0.43; // This is 0.020 away from the action log.
    const rightX = 0.78; // This is 0.020 away from the clue log.
    let topY = 0.03;
    const bottomY = 0.96;
    let cardSpacing = 0.1; // The amount of card widths between adjacent cards.
    const handSpacing = 0.45; // The amount of hand heights between adjacent hands.

    if (numPlayers >= 4) {
      // The hands would overlap with the timer for spectators or the hypothetical controls during a
      // shared replay.
      leftX = 0.44;
    }
    if (numPlayers >= 5) {
      // Create a bit more space for the cards.
      topY -= 0.005;
    }

    if (numCardsPerHand <= 4) {
      // We do not need to keep the cards so close to each other.
      cardSpacing = 0.2;
    }

    // The ratio of hand width to card width.
    const widthRatio = numCardsPerHand * (1 + cardSpacing) - cardSpacing;
    const maxCardWidth = (rightX - leftX) / widthRatio;
    // The ratio of hand height to the total height used by the hands (not including name frames).
    const heightRatio = numPlayers * (1 + handSpacing) - handSpacing;
    const maxCardHeight = (bottomY - topY) / heightRatio;

    // We need this because all of the other variables are defined relative to the canvas
    // dimensions.
    const relativeCardRatio = CARD_W / winW / (CARD_H / winH);

    let handX: number;
    let handY: number;
    let handW: number;
    let handH: number;
    if (maxCardWidth / maxCardHeight <= relativeCardRatio) {
      // If we were to stretch the hands as much as possible, the cards would be too tall. So, the
      // limiting factor on card size is the width.
      handX = leftX;
      handY = topY;
      handW = rightX - leftX;
      handH = maxCardWidth / relativeCardRatio;
    } else {
      handW = maxCardHeight * relativeCardRatio * widthRatio;
      handH = maxCardHeight; // The height of cards and hands are the same.
      handX = (rightX + leftX - handW) / 2;
      handY = topY;
    }

    handPosBGA[numPlayers] = [];
    for (const j of eRange(numPlayers)) {
      handPosBGA[numPlayers].push({
        x: handX,
        y: handY + handH * (1 + handSpacing) * j,
        w: handW,
        h: handH,
        rot: 0,
      });
    }
  }

  // This is the position for the player name frames in Keldon mode. This cannot be algorithmically
  // derived from the hand positions.
  const namePosValues = {
    h: 0.02,
  };
  namePos[2] = [
    { x: 0.175, y: 0.97, w: 0.45, h: namePosValues.h },
    { x: 0.175, y: 0.21, w: 0.45, h: namePosValues.h },
  ];
  namePos[3] = [
    { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
    { x: 0.0075, y: 0.775, w: 0.12, h: namePosValues.h },
    { x: 0.675, y: 0.775, w: 0.12, h: namePosValues.h },
  ];
  namePos[4] = [
    { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
    { x: 0.01, y: 0.74, w: 0.13, h: namePosValues.h },
    { x: 0.22, y: 0.21, w: 0.36, h: namePosValues.h },
    { x: 0.66, y: 0.74, w: 0.13, h: namePosValues.h },
  ];
  namePos[5] = [
    {
      x: handPos[5][0]!.x - 0.005,
      y: handPos[5][0]!.y + handPos[5][1]!.h + 0.02,
      w: handPos[5][0]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][1]!.x - 0.0095,
      y: handPos[5][1]!.y + 0.022,
      w: 0.12,
      h: namePosValues.h,
    },
    {
      x: handPos[5][2]!.x - 0.005,
      y: handPos[5][2]!.y + handPos[5][2]!.h + 0.005,
      w: handPos[5][2]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][3]!.x - 0.005,
      y: handPos[5][3]!.y + handPos[5][3]!.h + 0.005,
      w: handPos[5][3]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[5][4]!.x - 0.006 - 0.105,
      y: handPos[5][1]!.y + 0.025,
      w: 0.12,
      h: namePosValues.h,
    },
  ];
  namePos[6] = [
    {
      x: handPos[6][0]!.x - 0.005,
      y: handPos[6][0]!.y + handPos[6][1]!.h + 0.02,
      w: handPos[6][0]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][1]!.x - 0.009,
      y: handPos[6][1]!.y + 0.01,
      w: 0.12,
      h: namePosValues.h,
    },
    {
      x: handPos[6][2]!.x - 0.005,
      y: handPos[6][2]!.y + handPos[6][2]!.h + 0.02,
      w: handPos[6][2]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][3]!.x - 0.005,
      y: handPos[6][3]!.y + handPos[6][3]!.h + 0.02,
      w: handPos[6][3]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][4]!.x - 0.005,
      y: handPos[6][4]!.y + handPos[6][4]!.h + 0.02,
      w: handPos[6][4]!.w + 0.01,
      h: namePosValues.h,
    },
    {
      x: handPos[6][5]!.x - 0.006 - 0.105,
      y: handPos[6][1]!.y + 0.01,
      w: 0.12,
      h: namePosValues.h,
    },
  ];

  if (!globals.lobby.settings.keldonMode) {
    const i = numPlayers;
    const namePosBGAMod = {
      x: 0.005,
      y: 0.01,
    };
    namePosBGA[i] = [];
    for (const j of eRange(i)) {
      namePosBGA[i].push({
        x: handPosBGA[i]![j]!.x - namePosBGAMod.x,
        y: handPosBGA[i]![j]!.y + handPosBGA[i]![j]!.h + namePosBGAMod.y,
        h: namePosValues.h,
        w: handPosBGA[i]![j]!.w + namePosBGAMod.x * 2,
      });
    }
  }

  // Draw the hands
  for (const i of eRange(numPlayers)) {
    let j = i - globals.metadata.ourPlayerIndex;

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
      x: playerHandPos[numPlayers]![j]!.x,
      y: playerHandPos[numPlayers]![j]!.y,
      w: playerHandPos[numPlayers]![j]!.w,
      h: playerHandPos[numPlayers]![j]!.h,
      rot: playerHandPos[numPlayers]![j]!.rot,
    };
    globals.elements.playerHands[i] = new CardLayout({
      x: handValues.x * winW,
      y: handValues.y * winH,
      width: handValues.w * winW,
      height: handValues.h * winH,
      rotation: handValues.rot,
      align: "center",
      reverse: isHandReversed(j),
      // Hands must listen in order for the events to propagate through to the cards.
      listening: true,
    });
    globals.layers.card.add(
      globals.elements.playerHands[i] as unknown as Konva.Group,
    );

    if (globals.lobby.settings.keldonMode) {
      // In Keldon mode, we want to show a helper element that indicates which side of the hand is
      // the oldest.
      const blackLineGroup = new Konva.Group({
        x: handValues.x * winW,
        y: handValues.y * winH,
        width: handValues.w * winW,
        height: handValues.h * winH,
        rotation: handValues.rot,
        align: "center",
        listening: false,
      });
      globals.layers.UI.add(blackLineGroup);

      // The beginning of the hand is at 0 We want it a little to the left of the first card.
      let blackLineX: number;
      switch (numPlayers) {
        case 2: {
          blackLineX = -0.0075;
          break;
        }

        case 3: {
          blackLineX = -0.0125;
          break;
        }

        case 4: {
          blackLineX = -0.005;
          break;
        }

        case 5: {
          blackLineX = j === 1 || j === 4 ? -0.01 : -0.001;
          break;
        }

        case 6: {
          blackLineX = -0.0025;
          break;
        }
      }

      const blackLineY = 0;
      if (isHandReversed(j)) {
        switch (numPlayers) {
          case 2:
          case 3: {
            blackLineX = handValues.w + 0.002;
            break;
          }

          case 4: {
            blackLineX = handValues.w;
            break;
          }

          case 5:
          case 6: {
            blackLineX = handValues.w - 0.005;
            break;
          }
        }
      }
      const blackLine = new Konva.Rect({
        x: blackLineX * winW,
        y: blackLineY * winH,
        width: 0.0075 * winW,
        height: handValues.h * winH,
        fill: OFF_BLACK,
        stroke: OFF_BLACK,
        strokeWidth: 0.002 * winH,
        cornerRadius: 0.003 * winW,
        listening: false,
      });
      blackLineGroup.add(blackLine);
      globals.elements.playerHandBlackLines.push(blackLine);
    } else {
      // In BGA mode, we show a black box around a player's hand to indicate that it is their turn.
      const turnRectValues = {
        // The black box should always be as wide as the name frame.
        x: handValues.x,
        y: handValues.y,
        w: handValues.w * 1.025,
        h: handValues.h * 1.075,
        offsetX: handValues.w * 0.0125,
        offsetY: handValues.h * 0.0375,
      };

      if (numPlayers === 5) {
        turnRectValues.w += handValues.w * 0.03;
        turnRectValues.offsetX += handValues.w * 0.015;
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
        fill: "black",
        cornerRadius: turnRectValues.h * 0.1 * winH,
        rotation: handValues.rot,
        opacity: 0.5,
        visible: false,
        listening: false,
      });
      globals.layers.UI.add(turnRect);
      globals.elements.playerHandTurnRects.push(turnRect);
    }

    globals.elements.nameFrames[i] = new NameFrame(
      {
        x: playerNamePos[numPlayers]![j]!.x * winW,
        y: playerNamePos[numPlayers]![j]!.y * winH,
        width: playerNamePos[numPlayers]![j]!.w * winW,
        height: playerNamePos[numPlayers]![j]!.h * winH,
        name: globals.metadata.playerNames[i],
      },
      i as PlayerIndex,
    );
    globals.layers.UI.add(
      globals.elements.nameFrames[i] as unknown as Konva.Group,
    );

    drawDetrimentalCharacters(winW, winH, numPlayers, i, j);
  }
}

// Draw the "Detrimental Character Assignments" icon and tooltip.
function drawDetrimentalCharacters(
  winW: number,
  winH: number,
  numPlayers: NumPlayers,
  i: number,
  j: number,
) {
  let playerNamePos = namePos;
  if (!globals.lobby.settings.keldonMode) {
    playerNamePos = namePosBGA;
  }

  if (!globals.options.detrimentalCharacters) {
    return;
  }

  const characterID = globals.metadata.characterAssignments[i];
  // A character with an ID of null may be assigned when debugging.
  const character =
    characterID === null || characterID === undefined
      ? {
          id: -1,
          name: "n/a",
          description: "",
          emoji: "",
        }
      : getCharacter(characterID);

  const width2 = 0.03 * winW;
  const height2 = 0.03 * winH;
  const charIcon = new TextWithTooltip({
    width: width2,
    height: height2,
    x: playerNamePos[numPlayers]![j]!.x * winW - width2 / 2,
    y: playerNamePos[numPlayers]![j]!.y * winH - height2 / 2,
    fontSize: 0.03 * winH,
    fontFamily: "Verdana",
    align: "center",
    text: character.emoji,
    fill: "yellow",
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    listening: true,
  });
  charIcon.emoji = true; // Mark that this is a text element containing only emoji
  globals.layers.UI.add(charIcon);

  charIcon.tooltipName = `character-assignment-${i}`;
  const metadata = globals.metadata.characterMetadata[i]!;
  let tooltipContent = `<strong>#${character.id} - ${character.name}</strong><br />${character.description}`;
  if (tooltipContent.includes("[random color]")) {
    // Replace "[random color]" with the selected color.
    tooltipContent = tooltipContent.replace(
      "[random color]",
      globals.variant.clueColors[metadata]!.name.toLowerCase(),
    );
  } else if (tooltipContent.includes("[random number]")) {
    // Replace "[random number]" with the selected number.
    tooltipContent = tooltipContent.replace(
      "[random number]",
      metadata.toString(),
    );
  } else if (tooltipContent.includes("[random suit]")) {
    // Replace "[random suit]" with the selected suit name.
    tooltipContent = tooltipContent.replace(
      "[random suit]",
      globals.variant.suits[metadata]!.displayName,
    );
  }
  charIcon.tooltipContent = tooltipContent;
  initKonvaTooltips(charIcon, false, true);
}

function isHandReversed(j: number) {
  // By default, the hand is not reversed.
  let reverse = false;

  if (j === 0) {
    // Reverse the ordering of the cards for our own hand. (For our hand, the oldest card is the
    // first card, which should be on the right.)
    reverse = true;
  }
  if (!globals.lobby.settings.keldonMode) {
    // In BGA mode, we need to reverse every hand.
    reverse = true;
  }
  if (globals.lobby.settings.reverseHands) {
    // If the "Reverse hand direction" option is turned on, then we need to flip the direction of
    // every hand.
    reverse = !reverse;
  }

  return reverse;
}
