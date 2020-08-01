/* eslint-disable import/prefer-default-export */

import * as ourHand from '../../ourHand';

export const onOngoingCurrentPlayerIndexChanged = () => {
  ourHand.checkSetDraggableAll();
};
