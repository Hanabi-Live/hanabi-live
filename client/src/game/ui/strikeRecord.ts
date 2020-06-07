// Imports
import { ActionStrike } from '../types/actions';
import globals from './globals';

export default (data: ActionStrike) => {
  const i = data.num - 1;
  const strikeX = globals.elements.strikeXs[i];
  if (!strikeX) {
    return;
  }
  const strikeSquare = globals.elements.strikeSquares[i];
  if (!strikeSquare) {
    return;
  }

  // We want to record the turn before the strike actually happened
  let turn;
  if (Object.prototype.hasOwnProperty.call(data, 'turn')) {
    turn = data.turn - 1;
  } else {
    // Games prior to 2019 will not have the turn integrated into the strike
    turn = globals.turn - 1;
    if (turn <= 0) {
      turn = null;
    }
  }
  strikeX.turn = turn;
  strikeSquare.turn = turn;

  // We also want to record the card that misplayed so that we can highlight it with an arrow
  let order;
  if (Object.prototype.hasOwnProperty.call(data, 'order')) {
    ({ order } = data);
  } else {
    // Games prior to 2019 will not have the card number integrated into the strike
    order = null;
  }
  strikeX.order = order;
  strikeSquare.order = order;

  // Show an indication that the strike is clickable
  strikeX.setFaded();
};
