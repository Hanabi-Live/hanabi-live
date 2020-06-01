// Imports
import globals from './globals';

// Return whether or not the "card possibilities" feature should be turned on
export default () => (
  !globals.lobby.settings.realLifeMode
  && !globals.options.speedrun
  && !globals.hypothetical
  && !globals.variant.name.startsWith('Throw It in a Hole')
);
