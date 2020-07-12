/* eslint-disable import/prefer-default-export */

import * as ourHand from '../../ourHand';

export function onCurrentPlayerIndexChanged() {
  console.log('XXX onCurrentPlayerIndexChanged FIRED');
  ourHand.checkSetDraggableAll();
}
