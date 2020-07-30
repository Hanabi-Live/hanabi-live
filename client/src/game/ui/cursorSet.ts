import globals from './globals';

export type CursorType = 'default' | 'hand' | 'dragging' | 'look';

// Module variables
// (this does not have to be on the globals because it is explicitly reset in HanabiUI constructor)
let currentCursorType = 'default';

export default function cursorSet(cursorType: CursorType) {
  if (cursorType === currentCursorType) {
    return;
  }

  // Don't show any custom cursors in a speedrun
  // But override this if we are spectating an ongoing game or in a dedicated replay
  if (
    (globals.metadata.options.speedrun || globals.lobby.settings.speedrunMode)
    && !globals.metadata.spectating
    && !globals.metadata.replay
  ) {
    return;
  }

  currentCursorType = cursorType;
  const url = `/public/img/cursors/${cursorType}.png`;
  const cursorValue = `url('${url}'), auto`;
  globals.stage.container().style.cursor = cursorType === 'default' ? 'auto' : cursorValue;

  // If the Chrome development tools are open, then the cursor may not update properly
  // https://stackoverflow.com/questions/37462132/update-mouse-cursor-without-moving-mouse-with-changed-css-cursor-property
}
