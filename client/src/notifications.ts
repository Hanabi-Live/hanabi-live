// The site has the ability to send (optional) notifications

// Imports
import * as modals from './modals';

export const test = () => {
  // From: https://stackoverflow.com/questions/38422340/check-if-browser-notification-is-available
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    return;
  }

  Notification.requestPermission().then((permission) => {
    // If they have previously denied the permission popup dialog, then nothing will appear when
    // "Notification.requestPermission()" is invoked
    if (permission !== 'granted') {
      modals.warningShow('Hanabi Live does not have permissions to send desktop notifications. You may have previously denied notifications for this page. Please explicitly enable permission. For example, on Google Chrome, click the lock in the top-left hand corner.');
    }
  });
};

export const send = (msg: string, tag: string | undefined) => {
  // From: https://stackoverflow.com/questions/38422340/check-if-browser-notification-is-available
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  new Notification(`Hanabi Live: ${msg}`, { // eslint-disable-line no-new
    tag,
  });
};
