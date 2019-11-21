// Imports
import * as action from './action';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as replay from './replay';

// We define some functions as globals to avoid cyclical dependencies
export default () => {
    globals.functions = {
        clueLogClickHandler: (turn) => {
            replay.clueLogClickHandler(turn);
        },
        hypotheticalSend: (actionObject) => { // TODO replace with actionOjbect
            hypothetical.send(actionObject);
            action.stop();
        },
    };
};
