/* eslint-disable import/prefer-default-export */

import * as ourHand from '../../ourHand';

export const onOngoingCurrentPlayerIndexChanged = (
  _: number | null,
  previousCurrentPlayerIndex: number | null | undefined,
) => {
  if (previousCurrentPlayerIndex === undefined) {
    return;
  }

  ourHand.checkSetDraggableAll();
};
