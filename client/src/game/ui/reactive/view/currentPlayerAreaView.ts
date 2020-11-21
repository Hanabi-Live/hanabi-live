import Konva from "konva";
import { clueTokensRules, handRules, variantRules } from "../../../rules";
import State from "../../../types/State";
import { LABEL_COLOR } from "../../constants";
import globals from "../../globals";

export const isVisible = (state: State): boolean =>
  // Don't show it we happen to have the in-game replay open
  !state.replay.active &&
  // The clue UI should take precedence over the "Current Player" area
  (state.ongoingGame.turn.currentPlayerIndex !==
    state.metadata.ourPlayerIndex ||
    !state.playing) &&
  // The premove cancel button should take precedence over the "Current Player" area
  state.premove === null &&
  // Don't show it if the game is over
  state.ongoingGame.turn.currentPlayerIndex !== null;

export function onChanged(
  data: {
    visible: boolean;
    currentPlayerIndex: number | null;
  },
  previousData:
    | {
        visible: boolean;
        currentPlayerIndex: number | null;
      }
    | undefined,
): void {
  // Local variables
  const { currentPlayerArea } = globals.elements;
  if (currentPlayerArea === null) {
    return;
  }

  if (previousData === undefined || data.visible !== previousData.visible) {
    currentPlayerArea.visible(data.visible);
    globals.layers.UI.batchDraw();
  }
  if (!data.visible) {
    return;
  }

  // Local variables
  const winW = globals.stage.width();
  const winH = globals.stage.height();
  const { clueTokens } = globals.state.ongoingGame;
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  if (currentPlayerIndex === null) {
    return;
  }
  const currentPlayerHand = globals.state.ongoingGame.hands[currentPlayerIndex];
  const isLocked = handRules.isLocked(
    currentPlayerHand,
    globals.state.ongoingGame.deck,
  );
  const { numPlayers } = globals.options;

  // Update the text
  const { text1, text2, text3 } = currentPlayerArea;
  let specialText = "";
  if (!globals.lobby.settings.realLifeMode) {
    let cluesTokensText = clueTokens.toString();
    if (variantRules.isClueStarved(globals.variant)) {
      // In "Clue Starved" variants,
      // clues are tracked internally at twice the value shown to the user
      cluesTokensText = (clueTokens / 2).toString();
    }

    if (clueTokens < clueTokensRules.getAdjusted(1, globals.variant)) {
      specialText = `(cannot clue; ${cluesTokensText} clues left)`;
      text3.fill("red");
    } else if (clueTokensRules.atMax(clueTokens, globals.variant)) {
      specialText = `(cannot discard; at ${cluesTokensText} clues)`;
      text3.fill(LABEL_COLOR);
    } else if (isLocked && globals.lobby.settings.hyphenatedConventions) {
      specialText = "(locked; may not be able to discard)";
      text3.fill(LABEL_COLOR);
    } else if (
      globals.state.ongoingGame.stats.doubleDiscard &&
      globals.lobby.settings.hyphenatedConventions
    ) {
      specialText = '(potentially in a "Double Discard" situation)';
      text3.fill("yellow");
    }
  }

  const setPlayerText = (threeLines: boolean) => {
    const { rect1, textValues, values } = currentPlayerArea;

    text2.fitText(globals.metadata.playerNames[data.currentPlayerIndex!]);

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
    text2.x(rect1.width() / 2 - text2.width() / 2);
  };

  const totalH = currentPlayerArea.height();
  const text1H = text1.measureSize(text1.text()).height;
  if (specialText === "") {
    // 2 lines
    setPlayerText(false);
    const text2H = text2.measureSize(text2.text()).height;
    const spacing = 0.03 * winH;
    text1.y(totalH / 2 - text1H / 2 - spacing);
    text2.y(totalH / 2 - text2H / 2 + spacing);
    text3.hide();
  } else {
    // 3 lines
    setPlayerText(true);
    const text2H = text2.measureSize(text2.text()).height;
    const spacing = 0.04 * winH;
    text1.y(totalH / 2 - text1H / 2 - spacing);
    text2.y(totalH / 2 - text2H / 2 + spacing * 0.25);
    text3.y(totalH / 2 - text1H / 2 + spacing * 1.5);
    text3.fitText(specialText);
    text3.show();
  }

  // Get the rotation that corresponds to the current player
  let rotation = getArrowRotationCorrespondingToPlayer(
    data.currentPlayerIndex!,
  );

  if (
    globals.animateFast ||
    previousData === undefined ||
    !previousData.visible
  ) {
    // Immediately snap the arrow in position and do not tween if:
    // 1) we performed an action on our turn and now the "Current Player" area is now visible again
    //    after being hidden
    // 2) we are exiting an in-game replay
    currentPlayerArea.arrow?.rotation(rotation);
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
    const previousRotation = getArrowRotationCorrespondingToPlayer(
      previousPlayerIndex,
    );
    currentPlayerArea.arrow?.rotation(previousRotation);

    // We want the arrow to always be moving clockwise
    const unmodifiedRotation = rotation;
    if (previousRotation > rotation) {
      rotation += 360;
    }

    currentPlayerArea.tween = new Konva.Tween({
      node: currentPlayerArea.arrow,
      duration: 0.75,
      rotation,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (
          currentPlayerArea.arrow !== undefined &&
          currentPlayerArea.arrow !== null
        ) {
          currentPlayerArea.arrow.rotation(unmodifiedRotation);
        }
      },
    }).play();
  }

  globals.layers.UI.batchDraw();
}

function getArrowRotationCorrespondingToPlayer(playerIndex: number) {
  const hand = globals.elements.playerHands[playerIndex];
  if (hand === undefined) {
    throw new Error(
      `Failed to get the hand corresponding to the player at index: ${playerIndex}`,
    );
  }
  const centerPos = hand.getAbsoluteCenterPos();

  if (globals.lobby.settings.keldonMode) {
    // Make sure that the arrow points to an imaginary person behind the hand of cards
    const winH = globals.stage.height();
    const distanceToImaginaryPlayer = (600 / 1080) * winH;
    const rot = (-hand.origRotation / 180) * Math.PI;
    centerPos.x += distanceToImaginaryPlayer * -Math.sin(rot); // -sin(x) = cos(x + PI / 2)
    centerPos.y -= distanceToImaginaryPlayer * Math.cos(rot); // cos(x) = sin(x + PI / 2)
  }

  const thisPos = globals.elements.currentPlayerArea!.arrow.getAbsolutePosition();
  const x = centerPos.x - thisPos.x;
  const y = centerPos.y - thisPos.y;
  const radians = Math.atan(y / x);
  let rotation = radians * (180 / Math.PI);
  if (x < 0) {
    rotation += 180;
  }

  return rotation;
}
