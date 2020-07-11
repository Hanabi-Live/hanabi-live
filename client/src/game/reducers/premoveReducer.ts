import produce, { Draft } from 'immer';
import { Action } from '../types/actions';
import PremoveState from '../types/PremoveState';

const premoveReducer = produce((state: Draft<PremoveState>, action: Action) => {
  switch (action.type) {
    case 'premove': {
      state.action = action.action;
      if (action.action === null) {
        state.cluedCardOrder = null;
      }
      break;
    }

    case 'premoveCluedCardOrder': {
      state.cluedCardOrder = action.order;
      break;
    }

    default: {
      break;
    }
  }
}, {} as PremoveState);

export default premoveReducer;
