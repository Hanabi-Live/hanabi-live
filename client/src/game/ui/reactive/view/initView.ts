/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export function onInitializationChanged(initialized: boolean) {
  if (initialized) {
    globals.loading = false;
    globals.animateFast = false;
  }
}
