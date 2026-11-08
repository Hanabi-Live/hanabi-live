import type { PauseState } from "../../../types/PauseState";
import { globals } from "../../UIGlobals";
import {
  DISABLED_OPACITY,
  PAUSED_STAGE_FADE_OPACITY,
  STAGE_FADE_OPACITY,
} from "../../constants";
import { isOurTurn } from "../../isOurTurn";

export function onChanged(pause: PauseState): void {
  const stageFadeOpacity = pause.active
    ? PAUSED_STAGE_FADE_OPACITY
    : STAGE_FADE_OPACITY;
  globals.elements.stageFade?.opacity(stageFadeOpacity);
  globals.elements.stageFade?.visible(pause.active);

  globals.elements.pauseArea?.visible(pause.active);

  // The timer elements may not be initialized under certain conditions (e.g. an untimed game)
  globals.elements.timer1?.visible(!pause.active && globals.state.playing);
  globals.elements.timer2?.visible(!pause.active && !isOurTurn());
  globals.elements.timer1Circle?.visible(pause.queued);

  if (pause.active) {
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
