/* eslint-disable import/prefer-default-export */

import * as ourHand from '../../ourHand';

export function onCurrentPlayerIndexChanged() {
  ourHand.checkSetDraggableAll();
}
