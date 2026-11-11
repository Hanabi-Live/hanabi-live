import type { PauseState } from "../../../types/PauseState.ts";
import { globals } from "../../UIGlobals.ts";
import {
  DISABLED_OPACITY,
  PAUSED_STAGE_FADE_OPACITY,
  STAGE_FADE_OPACITY,
} from "../../constants.ts";
import { isOurTurn } from "../../isOurTurn.ts";

export function onChanged(pause: PauseState): void {
  const paused = pause.playerIndex !== undefined;
  const stageFadeOpacity = paused
    ? PAUSED_STAGE_FADE_OPACITY
    : STAGE_FADE_OPACITY;
  globals.elements.stageFade?.opacity(stageFadeOpacity);
  globals.elements.stageFade?.visible(paused);

  globals.elements.pauseArea?.visible(paused);

  // The timer elements may not be initialized under certain conditions (e.g. an untimed game)
  globals.elements.timer1?.visible(!paused && globals.state.playing);
  globals.elements.timer2?.visible(!paused && !isOurTurn());
  globals.elements.timer1Circle?.visible(pause.queued);

  if (pause.playerIndex !== undefined) {
    globals.elements.pauseText?.text(
      `by: ${globals.metadata.playerNames[pause.playerIndex]}`,
    );

    if (globals.state.playing) {
      globals.elements.pauseButton?.setEnabled(true);
      globals.elements.pauseButton?.opacity(1);
    } else {
      globals.elements.pauseButton?.setEnabled(false);
      globals.elements.pauseButton?.opacity(DISABLED_OPACITY);
    }
  }

  globals.layers.UI.batchDraw();
  globals.layers.UI2.batchDraw();
  globals.layers.timer.batchDraw();
}
