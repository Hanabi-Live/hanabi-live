/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export const onInitializationChanged = (initialized: boolean) => {
  if (!initialized) {
    return;
  }

  if (globals.loading) {
    globals.lobby.conn!.send('loaded', {
      tableID: globals.lobby.tableID,
    });
  }
  globals.loading = false;
  globals.animateFast = false;
};
