import { assertDefined } from "isaacscript-common-ts";
import Konva from "konva";
import { Screen } from "../../lobby/types/Screen";
import * as tooltips from "../../tooltips";
import { globals } from "./UIGlobals";
import type { NodeWithTooltip } from "./controls/NodeWithTooltip";
import type { TextWithTooltip } from "./controls/TextWithTooltip";

export function init(
  element: NodeWithTooltip,
  delayed: boolean,
  customContent: boolean,
): void {
  assertDefined(
    element.tooltipName,
    'An element that is supposed to have a tooltip does not have a "tooltipName" property.',
  );
  assertDefined(
    element.tooltipContent,
    'An element that is supposed to have a tooltip does not have a "tooltipContent" property.',
  );

  element.on("mouseover touchstart", function mouseOver(this: Konva.Node) {
    resetActiveHover();
    globals.activeHover = this;
    if (delayed) {
      setTimeout(() => {
        show(this);
      }, tooltips.TOOLTIP_DELAY_IN_MILLISECONDS);
    } else {
      show(this);
    }
  });

  element.on("mouseout touchend", () => {
    assertDefined(
      element.tooltipName,
      'An element that is supposed to have a tooltip does not have a "tooltipName" property.',
    );
    globals.activeHover = null;
    tooltips.close(`#tooltip-${element.tooltipName}`);
  });

  let content = element.tooltipContent;
  if (!customContent) {
    content = '<span style="font-size: 0.75em;">';
    content += '<i class="fas fa-info-circle fa-sm"></i>';
    content += ` &nbsp;${element.tooltipContent}</span>`;
  }
  tooltips.setInstanceContent(`#tooltip-${element.tooltipName}`, content);
}

export function show(element: NodeWithTooltip): void {
  // Do not do anything if we are no longer in the game.
  if (globals.lobby.currentScreen !== Screen.Game) {
    return;
  }

  // Do not do anything if the user has moved the mouse away in the meantime.
  if (globals.activeHover !== element) {
    return;
  }

  assertDefined(
    element.tooltipName,
    'An element that is supposed to have a tooltip does not have a "tooltipName" property.',
  );

  const pos = element.getAbsolutePosition();
  let width = element.width();
  if (element instanceof Konva.Text) {
    width = element.getTextWidth();

    // For text elements consisting of only one emoji, "getTextWidth()" will not return the correct
    // width. Fall back to the element width instead.
    const text = element as TextWithTooltip;
    if (text.emoji) {
      width = element.width();
    }
  }
  const tooltip = `#tooltip-${element.tooltipName}`;
  const tooltipX = pos.x + width / 2;
  tooltips.setPosition(tooltip, tooltipX, pos.y);
  tooltips.open(tooltip);
}

export function resetActiveHover(): void {
  if (globals.activeHover !== null) {
    globals.activeHover.dispatchEvent(new MouseEvent("mouseout"));
  }
}
