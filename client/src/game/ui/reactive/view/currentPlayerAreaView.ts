import Konva from 'konva';
import { LABEL_COLOR } from '../../../../constants';
import { MAX_CLUE_NUM } from '../../../types/constants';
import State from '../../../types/State';
import globals from '../../globals';

export function isVisible(s: State) {
  return (
    // Don't show it we happen to have the in-game replay open
    !s.replay.active
    // The clue UI should take precedence over the "Current Player" area
    && (
      s.ongoingGame?.turn.currentPlayerIndex !== s.metadata.ourPlayerIndex
      && !s.metadata.spectating
    )
    // The premove cancel button should take precedence over the "Current Player" area
    && s.premove === null
    // Don't show it if the game is over
    && s.ongoingGame?.turn.currentPlayerIndex !== null
  );
}

export function onChanged(data: {
  visible: boolean;
  currentPlayerIndex: number | null;
}, previousData: {
  visible: boolean;
  currentPlayerIndex: number | null;
} | undefined) {
  const currentPlayerArea = globals.elements.currentPlayerArea!;
  if (data.visible !== previousData?.visible) {
    currentPlayerArea.visible(data.visible);
    globals.layers.UI.batchDraw();
  }
  if (!data.visible) {
    return;
  }

  // Local variables
  const winW = globals.stage.width();
  const winH = globals.stage.height();
  const state = globals.store!.getState();
  const clueTokens = state!.ongoingGame!.clueTokens;
  const numPlayers = state!.metadata.options.numPlayers;

  // Update the text
  const { text1, text2, text3 } = currentPlayerArea;
  let specialText = '';
  if (!globals.lobby.settings.realLifeMode) {
    if (clueTokens === 0) {
      specialText = '(cannot clue; 0 clues left)';
      text3.fill('red');
    } else if (clueTokens === MAX_CLUE_NUM) {
      specialText = `(cannot discard; at ${MAX_CLUE_NUM} clues)`;
      text3.fill(LABEL_COLOR);
    } else if (
      globals.lobby.settings.hyphenatedConventions
      && globals.elements.playerHands[data.currentPlayerIndex!].isLocked()
    ) {
      specialText = '(locked; may not be able to discard)';
      text3.fill(LABEL_COLOR);
    } else if (
      globals.lobby.settings.hyphenatedConventions
      && globals.elements.noDoubleDiscardBorder!.isVisible()
    ) {
      specialText = '(potentially in a "Double Discard" situation)';
      text3.fill('yellow');
    }
  }

  const setPlayerText = (threeLines: boolean) => {
    const { rect1, textValues, values } = currentPlayerArea;

    text2.fitText(globals.playerNames[data.currentPlayerIndex!]);

    let maxSize = (values.h / 3) * winH;
    if (threeLines) {
      maxSize = (values.h / 4) * winH;
    }
    text2.width(textValues.w * winW);
    text2.resize();

    // We need to adjust the font size of the player name, depending on how long the name is
    // Continue to shrink the text until it reaches the maximum size
    // Run at most 100 times; in most cases, it will take around 15
    for (let i = 0; i < 100; i++) {
      if (text2.measureSize(text2.text()).height <= maxSize) {
        break;
      }
      text2.width(text2.width() * 0.9);
      text2.resize();
    }
    text2.x((rect1.width() / 2) - (text2.width() / 2));
  };

  const totalH = currentPlayerArea.height();
  const text1H = text1.measureSize(text1.text()).height;
  if (specialText === '') {
    // 2 lines
    setPlayerText(false);
    const text2H = text2.measureSize(text2.text()).height;
    const spacing = 0.03 * winH;
    text1.y((totalH / 2) - (text1H / 2) - spacing);
    text2.y((totalH / 2) - (text2H / 2) + spacing);
    text3.hide();
  } else {
    // 3 lines
    setPlayerText(true);
    const text2H = text2.measureSize(text2.text()).height;
    const spacing = 0.04 * winH;
    text1.y((totalH / 2) - (text1H / 2) - spacing);
    text2.y((totalH / 2) - (text2H / 2) + (spacing * 0.25));
    text3.y((totalH / 2) - (text1H / 2) + (spacing * 1.5));
    text3.fitText(specialText);
    text3.show();
  }

  // Get the rotation that corresponds to the current player
  let rotation = getArrowRotationCorrespondingToPlayer(data.currentPlayerIndex!);

  if (globals.animateFast || !previousData?.visible) {
    // Immediately snap the arrow in position and do not tween if:
    // 1) we performed an action on our turn and now the "Current Player" area is now visible again
    //    after being hidden
    // 2) we are exiting an in-game replay
    currentPlayerArea.arrow!.rotation(rotation);
  } else {
    if (currentPlayerArea.tween !== null) {
      currentPlayerArea.tween.destroy();
      currentPlayerArea.tween = null;
    }

    // Since the "Current Player" area might have been hidden and/or not updated for a while,
    // update the current arrow rotation to be equal to that of the previous player
    let previousPlayerIndex = data.currentPlayerIndex! - 1;
    if (previousPlayerIndex === -1) {
      previousPlayerIndex = numPlayers - 1;
    }
    const previousRotation = getArrowRotationCorrespondingToPlayer(previousPlayerIndex);
    currentPlayerArea.arrow!.rotation(previousRotation);

    // We want the arrow to always be moving clockwise
    const unmodifiedRotation = rotation;
    if (previousRotation > rotation) {
      rotation += 360;
    }

    currentPlayerArea.tween = new Konva.Tween({
      node: currentPlayerArea.arrow,
      duration: 0.75,
      rotation,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        currentPlayerArea.arrow.rotation(unmodifiedRotation);
      },
    }).play();
  }

  globals.layers.UI.batchDraw();
}

const getArrowRotationCorrespondingToPlayer = (playerIndex: number) => {
  const hand = globals.elements.playerHands[playerIndex];
  if (hand === undefined) {
    throw new Error(`Failed to get the arrow rotation corresponding to the player at index ${playerIndex}.`);
  }
  const centerPos = hand.getAbsoluteCenterPos();
  const thisPos = globals.elements.currentPlayerArea!.arrow.getAbsolutePosition();
  const x = centerPos.x - thisPos.x;
  const y = centerPos.y - thisPos.y;
  const radians = Math.atan(y / x);
  let rotation = radians * (180 / Math.PI);
  if (x < 0) {
    rotation += 180;
  }

  return rotation;
};
