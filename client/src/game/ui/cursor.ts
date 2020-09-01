import Konva from 'konva';
import Deck from './Deck';
import globals from './globals';
import LayoutChild from './LayoutChild';

export type CursorType = 'default' | 'hand' | 'dragging' | 'look';

// Module variables
// (this does not have to be on the globals because it is explicitly reset in HanabiUI constructor)
let currentCursorType = 'default';

export const set = (cursorType: CursorType) => {
  // It is possible to receive cursor events before the UI has initialized
  if (globals.store === null) {
    return;
  }

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

    case 'hand': {
      cursorValue = 'grab';
      break;
    }

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
};

export const getElementDragLocation = (element: LayoutChild | Deck) => {
  const pos = element.getAbsolutePosition();
  pos.x += element.width() * element.scaleX() / 2;
  pos.y += element.height() * element.scaleY() / 2;

  if (globals.elements.playArea !== null && posOverlaps(pos, globals.elements.playArea)) {
    return 'playArea';
  }
  if (globals.elements.discardArea !== null && posOverlaps(pos, globals.elements.discardArea)) {
    return 'discardArea';
  }

  return null;
};

export const elementOverlaps = (element: LayoutChild) => {
  if (globals.loading) {
    return false;
  }

  const pos = globals.stage.getPointerPosition();
  if (pos === undefined) {
    // This method will return undefined if the cursor is not inside of the stage
    return false;
  }

  return posOverlaps(pos, element);
};

const posOverlaps = (pos: Konva.Vector2d, element: Konva.Rect | LayoutChild) => {
  const elementPos = element.getAbsolutePosition();
  return (
    pos.x >= elementPos.x
    && pos.y >= elementPos.y
    && pos.x <= elementPos.x + element.width()
    && pos.y <= elementPos.y + element.height()
  );
};
