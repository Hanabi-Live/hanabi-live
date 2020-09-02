// The navigation bar at the top of the lobby

import globals from '../globals';
import { closeAllTooltips } from '../misc';
import * as modals from '../modals';
import * as createGame from './createGame';
import * as history from './history';
import * as pregame from './pregame';
import * as watchReplay from './watchReplay';

export const init = () => {
  // Remove the recursive link to prevent confusion
  $('#logo-link').removeAttr('href');

  // Initialize all of the navigation tooltips using Tooltipster
  initTooltips();

  // The "Create Game" button
  $('#nav-buttons-games-create-game').tooltipster('option', 'functionBefore', createGame.before);
  $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', createGame.ready);
  // (the logic for this tooltip is handled in the "createGame.ts" file)

  // The "Show History" button
  $('#nav-buttons-games-history').on('click', () => {
    history.show();
  });

  // The "Watch Specific Replay" button
  $('#nav-buttons-games-replay').tooltipster('option', 'functionReady', watchReplay.ready);
  // (the logic for this tooltip is handled in the "watchReplay.ts" file)

  // The "Help" button
  // (this is just a simple link)

  // The "Resources" button
  // (initialized in the "initTooltips()" function)

  // The "Settings" button
  // (initialized in the "initTooltips()" function)

  // The "Sign Out" button
  $('.signout').on('click', () => {
    let path = '/logout';
    if (window.location.pathname.includes('/dev')) {
      path += '?dev=true';
    }
    window.location.href = path;
  });

  // The "Start Game" button
  $('#nav-buttons-pregame-start').on('click', () => {
    if (!$('#nav-buttons-pregame-start').hasClass('disabled')) {
      globals.conn!.send('tableStart', {
        tableID: globals.tableID,
      });
      $('#nav-buttons-pregame-start').addClass('disabled');
    }
  });

  // The "Return to Lobby" button (from the "Pregame" screen)
  $('#nav-buttons-pregame-unattend').on('click', () => {
    pregame.hide();
    globals.conn!.send('tableUnattend', {
      tableID: globals.tableID,
    });
    globals.tableID = -1;
  });

  // The "Leave Game" button
  $('#nav-buttons-pregame-leave').on('click', () => {
    globals.conn!.send('tableLeave', {
      tableID: globals.tableID,
    });
  });

  // The "Show History of Friends" button (from the "History" screen)
  $('#nav-buttons-history-show-friends').on('click', () => {
    history.showFriends();
  });

  // The "Return to Lobby" button (from the "History" screen)
  $('#nav-buttons-history-return').on('click', () => {
    history.hide();
  });

  // The "Return to History" button (from the "History of Friends" screen)
  $('#nav-buttons-history-friends-return').on('click', () => {
    history.hideFriends();
  });

  // The "Return to History" button (from the "History Details" screen)
  // (initialized in the "history.drawOtherScores()" function)
};

const initTooltips = () => {
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
      modals.setShadeOpacity(0.6);
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
      modals.setShadeOpacity(0);
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
      closeAllTooltips();
      modals.closeAll();
    }
  });
};

export const show = (target: string) => {
  const navTypes = [
    'games',
    'pregame',
    'history',
    'history-friends',
    'history-other-scores',
  ];
  for (const navType of navTypes) {
    $(`#nav-buttons-${navType}`).hide();
  }
  if (target !== 'nothing') {
    $(`#nav-buttons-${target}`).show();
  }
};
