/*
    WebSocket command handlers for in-game events
*/

// Imports
import { VARIANTS } from '../constants';
import drawCards from './ui/drawCards';
import globals from '../globals';
import phaserInit from '../client_v2/phaserInit';
import websocket from './ui/websocket';

export default () => {
    let commandsToUse: Map<string, (data: any) => void>;
    if (window.location.pathname === '/dev2') {
        commandsToUse = commands; // The new client, defined below
    } else {
        commandsToUse = websocket; // The old client, defined in the "ui/websocket.ts" file
    }

    for (const [commandName, commandFunction] of commandsToUse) {
        globals.conn.on(commandName, (data: any) => {
            if (globals.currentScreen !== 'game') {
                return;
            }

            commandFunction(data);
        });
    }
};

/*
    Code for the new development client
*/

// Define a command handler map
const commands = new Map();

commands.set('init', (data: any) => {
    // Record all of the settings for this game
    globals.init = data;

    // The variant is an integer on the server side, but an object on the client side,
    // so convert it accordingly
    globals.init.variant = VARIANTS.get(data.variant);

    // Also initalize the "ui" object, which contains various graphical objects
    globals.ui = {
        cards: [],
    };

    // Find out whether "colorblind mode" is enabled
    const colorblindModeSetting = globals.settings.get('colorblindMode');
    let colorblindMode = false;
    if (typeof colorblindModeSetting === 'boolean') {
        colorblindMode = colorblindModeSetting;
    }

    // Build images for every card
    // (with respect to the variant that we are playing
    // and whether or not we have the colorblind UI feature enabled)
    globals.ui.cardImages = drawCards(globals.init.variant, colorblindMode);

    // Draw the user interface
    phaserInit();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    // keyboard.init();

    // Tell the server that we are finished loading
    // globals.lobby.conn.send('ready');
});
