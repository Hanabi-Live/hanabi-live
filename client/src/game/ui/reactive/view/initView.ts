/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export const onInitializationChanged = (initialized: boolean) => {
  if (!initialized) {
    return;
  }

  globals.loading = false;
  globals.animateFast = false;
};
