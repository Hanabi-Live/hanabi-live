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

  // In some circumstances, the cursor icon will not be updated unless the cursor is moved at least
  // one pixel, so use a hack to refresh it
  // From: https://stackoverflow.com/questions/25209590/cursor-style-doesnt-update-when-element-dynamically-moved-under-it
  /*
  $('body').css('cursor', 'move');
  function mouseMove(this: HTMLElement) {
    $('body').css('cursor', '');
    $(this).unbind('mousemove');
  }
  $('body').mousemove(mouseMove);
  */
}
