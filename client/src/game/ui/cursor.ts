import globals from './globals';

type CursorType = 'default' | 'grab' | 'grabbing';

const urlPrefix = '/public/img/cursors';

export function set(cursorType: CursorType) {
  let url;
  switch (cursorType) {
    case 'default': {
      url = `${urlPrefix}/cursor.png`;
      break;
    }

    case 'grab': {
      url = `${urlPrefix}/hand.png`;
      break;
    }

    case 'grabbing': {
      url = `${urlPrefix}/clenched-fist.png`;
      break;
    }

    default: {
      throw new Error('Unknown cursor type.');
    }
  }

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
