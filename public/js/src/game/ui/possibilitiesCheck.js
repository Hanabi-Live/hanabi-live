// Imports
import globals from './globals';

// Return whether or not the "card possibilities" feature should be turned on
export default () => (
    !globals.lobby.settings.get('realLifeMode')
    && !globals.speedrun
    && !globals.hypothetical
    && !globals.variant.name.startsWith('Throw It in a Hole')
);
