// The site has the ability to send (optional) notifications

export const test = () => {
  // From: https://stackoverflow.com/questions/38422340/check-if-browser-notification-is-available
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'default') {
    return;
  }

  Notification.requestPermission();
};

export const send = (msg: string, tag: any) => {
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
