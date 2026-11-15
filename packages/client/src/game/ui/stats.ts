import type Konva from "konva";
import { askForEfficiency } from "../efficiencyModifier.ts";
import * as arrows from "./arrows.ts";
import { RIGHT_MOUSE_BUTTON } from "./constants.ts";
import type { TextWithTooltip } from "./controls/TextWithTooltip.ts";

export function efficiencyLabelClick(
  this: TextWithTooltip,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // "event.evt.buttons" is always 0 here.
  if (event.evt.button === RIGHT_MOUSE_BUTTON) {
    arrows.click(event, "efficiency");
    return;
  }

  askForEfficiency();
}
