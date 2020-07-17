/* eslint-disable import/prefer-default-export */

import * as tooltips from '../../tooltips';

export const onSegmentChanged = () => {
  // Automatically close any tooltips and disable all Empathy when the visible segment changes
  // Without this, we would observe glitchy behavior
  // (e.g. a note tooltip showing attached to a wrong card)
  // Note that if a user is actively editing a note, the tooltip will not close
  tooltips.resetActiveHover();
};
