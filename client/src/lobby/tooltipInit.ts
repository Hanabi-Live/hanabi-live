import tippy from 'tippy.js';
// import { FADE_TIME } from '../constants';
// import * as misc from '../misc';
// import * as modals from '../modals';

export default function tooltipInit(elementName: string, tooltipElementName: string) {
  const tooltipElement = document.getElementById(tooltipElementName);
  if (tooltipElement === null) {
    throw new Error(`The "tooltipInit()" function was unable to find the "${tooltipElementName}" element.`);
  }

  const elementSelector = `#${elementName}`;
  const tooltipElementSelector = `#${tooltipElementName}`;

  tooltipElement.style.display = 'block';
  const instanceArray = tippy(elementSelector, {
    // "appendTo" is needed to have "interactive: true" to work properly,
    // as noted in the Tippy documentation
    appendTo: document.body,
    content: tooltipElement,
    interactive: true,
    maxWidth: 'none',
    theme: 'hanabi',
    trigger: 'manual',
  });
  if (instanceArray.length !== 1) {
    throw new Error(`There is more than one "${elementSelector}" element on the page.`);
  }
  const instance = instanceArray[0];

  $(elementSelector).click(() => {
    if ($(tooltipElementSelector).is(':visible')) {
      instance.hide();
    } else {
      instance.show();
    }
  });

  /*
  const tooltips = [
    'create-game',
    'replay',
    'resources',
    'settings',
  ];

  const tooltipsterOptions = {
    theme: 'tooltipster-shadow',
    trigger: 'click',
    interactive: true,
    delay: 0,
    // Some tooltips are too large for small resolutions and will wrap off the screen;
    // we can use a Tooltipster plugin to automatically create a scroll bar for it
    // https://github.com/louisameline/tooltipster-scrollableTip
    plugins: [
      'sideTip', // Make it have the ability to be positioned on a specific side
      'scrollableTip', // Make it scrollable
    ],
    functionBefore: () => {
      $('#lobby').fadeTo(FADE_TIME, 0.4);
    },
  };

  const tooltipsterClose = () => {
    // We want to fade in the background as soon as we start the tooltip closing animation,
    // so we have to hook to the "close" event
    // Furthermore, we don't want to fade in the background if we click from one tooltip to the
    // other, so we have to check to see how many tooltips are open
    // If one tooltip is open, then it is the one currently closing
    // If two tooltips are open, then we are clicking from one to the next
    let tooltipsOpen = 0;
    for (const tooltip of tooltips) {
      if ($(`#nav-buttons-games-${tooltip}`).tooltipster('status').open) {
        tooltipsOpen += 1;
      }
    }
    if (tooltipsOpen <= 1) {
      $('#lobby').fadeTo(FADE_TIME, 1);
    }
  };

  // The "close" event will not fire if we initialize this on the tooltip class for some reason,
  // so we initialize all 3 individually
  for (const tooltip of tooltips) {
    $(`#nav-buttons-games-${tooltip}`)
      .tooltipster(tooltipsterOptions)
      .tooltipster('instance')
      .on('close', tooltipsterClose);
  }

  // Map the escape key to close all tooltips / modals
  $(document).keydown((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      misc.closeAllTooltips();
      modals.closeAll();
    }
  });
  */
}
