import type { PlayerIndex } from "@hanabi-live/game";
import {
  getClueCost,
  getUnadjustedClueTokens,
  isAtMaxClueTokens,
  isHandLocked,
} from "@hanabi-live/game";
import { assertDefined, eRange } from "complete-common";
import Konva from "konva";
import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";
import {
  DOUBLE_DISCARD_COLOR,
  FULL_TURN_DEGREES,
  HALF_TURN_DEGREES,
  LABEL_COLOR,
  NO_CLUES_COLOR,
  TEXT_SHRINK_FACTOR,
} from "../../constants";
import { degreesToRadians, radiansToDegrees } from "../../konvaHelpers";

/** The most times the player name shrinks before it is drawn as it is. */
const MAX_SHRINK_STEPS = 100;

/** How long the current player arrow takes to turn toward the next player. */
const ARROW_ROTATION_SECONDS = 0.75;

/** The stage height, in pixels, on which the imaginary player distance was tuned. */
const REFERENCE_STAGE_HEIGHT = 1080;

/**
 * In Keldon mode, how far behind each hand the arrow aims, as a fraction of the stage height (600
 * pixels on the reference stage).
 */
const IMAGINARY_PLAYER_DISTANCE = 600 / REFERENCE_STAGE_HEIGHT;

/**
 * How far the center of each line of text sits below the center of the current player area, as
 * fractions of the stage height. The lines are "Current player:", the player's name, and an
 * optional warning (such as "(cannot discard; at 8 clues)").
 */
const LINE_OFFSETS = {
  withoutWarning: [-0.03, 0.03],
  withWarning: [-0.04, 0.01, 0.06],
} as const;

export function isVisible(state: State): boolean {
  return (
    // Do not show it we happen to have the in-game replay open.
    !state.replay.active
    // The clue UI should take precedence over the "Current Player" area.
    && (state.ongoingGame.turn.currentPlayerIndex
      !== state.metadata.ourPlayerIndex
      || !state.playing)
    // The premove cancel button should take precedence over the "Current Player" area.
    && state.premove === null
    // Do not show it if the game is over.
    && state.ongoingGame.turn.currentPlayerIndex !== null
  );
}

export function onChanged(
  data: {
    visible: boolean;
    currentPlayerIndex: PlayerIndex | null;
  },
  previousData:
    | {
        visible: boolean;
        currentPlayerIndex: PlayerIndex | null;
      }
    | undefined,
): void {
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

  const winW = globals.stage.width();
  const winH = globals.stage.height();
  const { clueTokens } = globals.state.ongoingGame;
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  if (currentPlayerIndex === null) {
    return;
  }
  const currentPlayerHand =
    globals.state.ongoingGame.hands[currentPlayerIndex]!;
  const { numPlayers } = globals.options;

  // Update the text
  const { text1, text2, text3 } = currentPlayerArea;
  let specialText = "";
  if (!globals.lobby.settings.realLifeMode) {
    // In "Clue Starved" variants, clues are tracked internally at twice the value shown to the
    // user.
    const unadjustedClueTokens = getUnadjustedClueTokens(
      clueTokens,
      globals.variant,
    );
    const cluesTokensText = unadjustedClueTokens.toString();

    if (clueTokens < getClueCost(globals.variant)) {
      specialText = `(cannot clue; ${cluesTokensText} clues left)`;
      text3.fill(NO_CLUES_COLOR);
    } else if (isAtMaxClueTokens(clueTokens, globals.variant)) {
      specialText = `(cannot discard; at ${cluesTokensText} clues)`;
      text3.fill(LABEL_COLOR);
    } else if (
      globals.lobby.settings.hGroupConventions
      && isHandLocked(currentPlayerHand, globals.state.ongoingGame.deck)
    ) {
      specialText = "(locked; may not be able to discard)";
      text3.fill(LABEL_COLOR);
    } else if (
      globals.state.ongoingGame.stats.doubleDiscardCard !== null
      && globals.lobby.settings.hGroupConventions
    ) {
      specialText = '(potentially in a "Double Discard" situation)';
      text3.fill(DOUBLE_DISCARD_COLOR);
    }
  }

  // eslint-disable-next-line func-style
  const setPlayerText = (numLines: number) => {
    const { rect1, textValues, values } = currentPlayerArea;

    text2.fitText(globals.metadata.playerNames[data.currentPlayerIndex!]!);

    // The name may fill one share of the area, with one more share than there are lines.
    const maxSize = (values.h / (numLines + 1)) * winH;
    text2.width(textValues.w * winW);
    text2.resize();

    // We need to adjust the font size of the player name, depending on how long the name is.
    // Continue to shrink the text until it reaches the maximum size. In most cases, it will take
    // around 15 steps.
    for (const _i of eRange(MAX_SHRINK_STEPS)) {
      if (text2.measureSize(text2.text()).height <= maxSize) {
        break;
      }
      text2.width(text2.width() * TEXT_SHRINK_FACTOR);
      text2.resize();
    }
    text2.x(rect1.width() / 2 - text2.width() / 2);
  };

  const totalH = currentPlayerArea.height();
  const text1H = text1.measureSize(text1.text()).height;
  if (specialText === "") {
    const [text1Offset, text2Offset] = LINE_OFFSETS.withoutWarning;
    setPlayerText(LINE_OFFSETS.withoutWarning.length);
    const text2H = text2.measureSize(text2.text()).height;
    text1.y(totalH / 2 - text1H / 2 + text1Offset * winH);
    text2.y(totalH / 2 - text2H / 2 + text2Offset * winH);
    text3.hide();
  } else {
    const [text1Offset, text2Offset, text3Offset] = LINE_OFFSETS.withWarning;
    setPlayerText(LINE_OFFSETS.withWarning.length);
    const text2H = text2.measureSize(text2.text()).height;
    text1.y(totalH / 2 - text1H / 2 + text1Offset * winH);
    text2.y(totalH / 2 - text2H / 2 + text2Offset * winH);
    text3.fitText(specialText);
    // The offsets were tuned with the warning offset by half the height of the first line rather
    // than its own.
    text3.y(totalH / 2 - text1H / 2 + text3Offset * winH);
    text3.show();
  }

  // Get the rotation that corresponds to the current player.
  let rotation = getArrowRotationCorrespondingToPlayer(
    data.currentPlayerIndex!,
  );

  if (
    globals.animateFast
    || previousData === undefined
    || !previousData.visible
  ) {
    // Immediately snap the arrow in position and do not tween if:
    // 1) we performed an action on our turn and now the "Current Player" area is now visible again
    //    after being hidden
    // 2) we are exiting an in-game replay
    currentPlayerArea.arrow.rotation(rotation);
  } else {
    if (currentPlayerArea.tween !== null) {
      currentPlayerArea.tween.destroy();
      currentPlayerArea.tween = null;
    }

    // Since the "Current Player" area might have been hidden and/or not updated for a while, update
    // the current arrow rotation to be equal to that of the previous player.
    let previousPlayerIndex = data.currentPlayerIndex! - 1;
    if (previousPlayerIndex === -1) {
      previousPlayerIndex = numPlayers - 1;
    }
    const previousRotation = getArrowRotationCorrespondingToPlayer(
      previousPlayerIndex as PlayerIndex,
    );
    currentPlayerArea.arrow.rotation(previousRotation);

    // We want the arrow to always be moving clockwise.
    const unmodifiedRotation = rotation;
    if (previousRotation > rotation) {
      rotation += FULL_TURN_DEGREES;
    }

    currentPlayerArea.tween = new Konva.Tween({
      node: currentPlayerArea.arrow,
      duration: ARROW_ROTATION_SECONDS,
      rotation,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          currentPlayerArea.arrow !== undefined
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          && currentPlayerArea.arrow !== null
        ) {
          currentPlayerArea.arrow.rotation(unmodifiedRotation);
        }
      },
    }).play();
  }

  globals.layers.UI.batchDraw();
}

function getArrowRotationCorrespondingToPlayer(playerIndex: PlayerIndex) {
  const hand = globals.elements.playerHands[playerIndex];
  assertDefined(
    hand,
    `Failed to get the hand corresponding to the player at index: ${playerIndex}`,
  );

  const centerPos = hand.getAbsoluteCenterPos();

  if (globals.lobby.settings.keldonMode) {
    // Make sure that the arrow points to an imaginary person behind the hand of cards.
    const winH = globals.stage.height();
    const distanceToImaginaryPlayer = IMAGINARY_PLAYER_DISTANCE * winH;
    const handRotation =
      globals.metadata.ourPlayerIndex === playerIndex
        ? HALF_TURN_DEGREES
        : hand.origRotation;
    const rot = degreesToRadians(-handRotation);
    centerPos.x += distanceToImaginaryPlayer * -Math.sin(rot); // -sin(x) = cos(x + PI / 2)
    centerPos.y -= distanceToImaginaryPlayer * Math.cos(rot); // cos(x) = sin(x + PI / 2)
  }

  const thisPos =
    globals.elements.currentPlayerArea!.arrow.getAbsolutePosition();
  const x = centerPos.x - thisPos.x;
  const y = centerPos.y - thisPos.y;
  const radians = Math.atan(y / x);
  let rotation = radiansToDegrees(radians);
  if (x < 0) {
    rotation += HALF_TURN_DEGREES;
  }

  return rotation;
}
