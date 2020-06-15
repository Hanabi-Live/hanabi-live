// Imports
import Konva from 'konva';
import { TOOLTIP_DELAY } from '../../constants';
import globals from './globals';
import TextWithTooltip from './TextWithTooltip';

export interface NodeWithTooltip extends Konva.Node {
  tooltipName?: string;
  tooltipContent?: string;
}

export const init = (element: NodeWithTooltip, delayed: boolean, customContent: boolean) => {
  element.on('mousemove', function mouseMove(this: Konva.Node) {
    globals.activeHover = this;
    if (!delayed) {
      show(this);
    } else {
      setTimeout(() => {
        show(this);
      }, TOOLTIP_DELAY);
    }
  });
  element.on('mouseout', () => {
    globals.activeHover = null;
    $(`#tooltip-${element.tooltipName}`).tooltipster('close');
  });
  let content = element.tooltipContent;
  if (!customContent) {
    content = '<span style="font-size: 0.75em;">';
    content += '<i class="fas fa-info-circle fa-sm"></i>';
    content += ` &nbsp;${element.tooltipContent}</span>`;
  }
  $(`#tooltip-${element.tooltipName}`).tooltipster('instance').content(content);
};

export const show = (element: NodeWithTooltip) => {
  // Don't do anything if we are no longer in the game
  if (globals.lobby.currentScreen !== 'game') {
    return;
  }

  // Don't do anything if the user has moved the mouse away in the meantime
  if (globals.activeHover !== element) {
    return;
  }

  const tooltip = $(`#tooltip-${element.tooltipName}`);
  const pos = element.getAbsolutePosition();
  let width = element.width();
  if (element instanceof TextWithTooltip) {
    width = element.getTextWidth();
  }
  const tooltipX = pos.x + (width / 2);
  tooltip.css('left', tooltipX);
  tooltip.css('top', pos.y);
  tooltip.tooltipster('open');
};
