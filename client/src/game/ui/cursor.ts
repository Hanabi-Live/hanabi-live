import globals from './globals';

type CursorType = 'default' | 'grab' | 'grabbing' | 'look';

const filenameMap = {
  default: 'cursor',
  grab: 'hand',
  grabbing: 'clenched-fist',
  look: 'magnifying-glass',
};

export function set(cursorType: CursorType) {
  const filename = filenameMap[cursorType];
  const url = `/public/img/cursors/${filename}.png`;
  globals.stage.container().style.cursor = `url('${url}'), auto`;
}

// In some circumstances, the cursor icon will not be updated unless the cursor is moved at least
// one pixel, so use a hack to refresh it
// From: https://stackoverflow.com/questions/25209590/cursor-style-doesnt-update-when-element-dynamically-moved-under-it
export function update() {
  $('body').css('cursor', 'move');
  function mouseMove(this: HTMLElement) {
    $('body').css('cursor', '');
    $(this).unbind();
  }
  $('body').mousemove(mouseMove);
}
