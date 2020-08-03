import globals from './globals';

export type CursorType = 'default' | 'hand' | 'dragging' | 'look';

// Module variables
// (this does not have to be on the globals because it is explicitly reset in HanabiUI constructor)
let currentCursorType = 'default';

export default function cursorSet(cursorType: CursorType) {
  if (cursorType === currentCursorType) {
    return;
  }

  // Don't show any custom cursors if we are an active player in a speedrun
  if (
    (globals.options.speedrun || globals.lobby.settings.speedrunMode)
    && globals.state.playing
  ) {
    return;
  }

  currentCursorType = cursorType;

  let cursorValue = 'auto';
  switch (cursorType) {
    case 'look': {
      const url = `/public/img/cursors/${cursorType}.png`;
      cursorValue = `url('${url}'), auto`;
      break;
    }

    case 'hand':
      cursorValue = 'grab';
      break;

    case 'dragging': {
      cursorValue = 'grabbing';
      break;
    }

    default: {
      cursorValue = 'auto';
      break;
    }
  }

  globals.stage.container().style.cursor = cursorValue;

  // If the Chrome development tools are open, then the cursor may not update properly
  // https://stackoverflow.com/questions/37462132/update-mouse-cursor-without-moving-mouse-with-changed-css-cursor-property
}
