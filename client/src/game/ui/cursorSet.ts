import globals from './globals';

type CursorType = 'default' | 'hand' | 'dragging' | 'look';

// Module variables
let currentCursorType = 'default';

export default function cursorSet(cursorType: CursorType) {
  if (cursorType === currentCursorType) {
    return;
  }

  if (globals.options.speedrun || globals.lobby.settings.speedrunMode) {
    return;
  }

  currentCursorType = cursorType;
  const url = `/public/img/cursors/${cursorType}.png`;
  const cursorValue = `url('${url}'), auto`;
  globals.stage.container().style.cursor = cursorValue;

  // If the Chrome development tools are open, then the cursor may not update properly
  // https://stackoverflow.com/questions/37462132/update-mouse-cursor-without-moving-mouse-with-changed-css-cursor-property
}
