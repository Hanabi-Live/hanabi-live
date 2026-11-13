import { assertDefined } from "complete-common";
import Konva from "konva";
import { Screen } from "../../lobby/types/Screen.ts";
import { store } from "../../store.ts";
import { TOOLTIP_DELAY_IN_MILLISECONDS } from "../../Tooltip.ts";
import * as tooltips from "../../tooltips.ts";
import type { NodeWithTooltip } from "./controls/NodeWithTooltip.ts";
import type { TextWithTooltip } from "./controls/TextWithTooltip.ts";
import { globals } from "./UiGlobals.ts";

export function initKonvaTooltips(
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
    setActiveHover(this);
    if (delayed) {
      setTimeout(() => {
        show(this);
      }, TOOLTIP_DELAY_IN_MILLISECONDS);
    } else {
      show(this);
    }
  });

  element.on("mouseout touchend", function mouseOut(this: Konva.Node) {
    assertDefined(
      element.tooltipName,
      'An element that is supposed to have a tooltip does not have a "tooltipName" property.',
    );
    resetActiveHover(this);
    tooltips.close(element.tooltipName);
  });

  setKonvaTooltipContent(element, element.tooltipContent, customContent);
}

/**
 * Changes the content of an element's tooltip. Unless the content is custom, it shows beside an
 * info icon, in the smaller text.
 */
export function setKonvaTooltipContent(
  element: NodeWithTooltip,
  content: string,
  customContent: boolean,
): void {
  assertDefined(
    element.tooltipName,
    'An element that is supposed to have a tooltip does not have a "tooltipName" property.',
  );

  element.tooltipContent = content;
  tooltips.setContent(
    element.tooltipName,
    customContent || content === ""
      ? content
      : `<div class="info-tooltip small-tooltip-text"><i class="fas fa-info-circle fa-sm"></i><div>${content}</div></div>`,
  );
}

export function show(element: NodeWithTooltip): void {
  // Do not do anything if we are no longer in the game or if the user has moved the mouse away in
  // the meantime.
  if (
    store.getState().session.screen !== Screen.Game
    || globals.activeHover !== element
  ) {
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
  const { y, height } = element.getClientRect();
  tooltips.setPosition(element.tooltipName, { x: pos.x, y, width, height });
  tooltips.open(element.tooltipName);
}

export function setActiveHover(element: NodeWithTooltip): void {
  // Most elements use "mouseout", but cards use "mouseleave" instead, so send both events.
  if (globals.activeHover !== undefined) {
    globals.activeHover.dispatchEvent(new MouseEvent("mouseout"));
  }
  if (globals.activeHover !== undefined) {
    globals.activeHover.dispatchEvent(new MouseEvent("mouseleave"));
  }

  globals.activeHover = element;
}

export function resetActiveHover(element: NodeWithTooltip): void {
  if (globals.activeHover === element) {
    globals.activeHover = undefined;
  }
}
