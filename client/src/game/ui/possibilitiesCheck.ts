// Imports
import * as variantRules from '../rules/variant';
import globals from './globals';

// Return whether or not the "card possibilities" feature should be turned on
export default () => (
  !globals.lobby.settings.realLifeMode
  && !globals.options.speedrun
  && !globals.hypothetical
  && !variantRules.isThrowItInAHole(globals.variant)
);
