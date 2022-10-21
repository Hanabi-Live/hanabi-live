// The site has the ability to send (optional) notifications.

import * as modals from "./modals";

export function test(): void {
  // From: https://stackoverflow.com/questions/38422340/check-if-browser-notification-is-available
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission === "granted") {
    return;
  }

  const notificationAdvice =
    "You may have previously denied notifications for this page. Please explicitly enable permission. For example, on Google Chrome, click the lock in the top-left hand corner.";
  Notification.requestPermission()
    .then((permission) => {
      // If they have previously denied the permission pop-up dialog, then nothing will appear when
      // "Notification.requestPermission()" is invoked.
      if (permission !== "granted") {
        modals.showWarning(
          `The website does not have permissions to send desktop notifications. ${notificationAdvice}`,
        );
      }
    })
    .catch(() => {
      modals.showWarning(
        `Something went wrong when checking for desktop notification permission. ${notificationAdvice}`,
      );
    });
}

export function send(msg: string, tag: string | undefined): void {
  // From: https://stackoverflow.com/questions/38422340/check-if-browser-notification-is-available
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  // eslint-disable-next-line no-new
  new Notification(`Hanab Live: ${msg}`, {
    tag,
  });
}
