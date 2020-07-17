/* eslint-disable import/prefer-default-export */

import * as ourHand from '../../ourHand';

export const onCurrentPlayerIndexChanged = () => {
  ourHand.checkSetDraggableAll();
};
