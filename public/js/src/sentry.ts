// In production, we send all errors to the cloud using the Sentry.io service

// Imports
import * as Sentry from '@sentry/browser';
import version from './data/version.json';

export const init = () => {
  if (!useSentry()) {
    return;
  }

  Sentry.init({
    dsn: 'https://93293e0a9dff44c7b8485d646738a3e5@sentry.io/5189482',
    release: version.toString(),
    blacklistUrls: ['chrome-extension://'], // Otherwise, we get errors for LastPass, etc.
    beforeSend, // Ignore some kinds of errors
  });
};

// We do not want to not send certain specific common events to Sentry
// (to avoid using up our monthly limit)
// https://docs.sentry.io/error-reporting/configuration/filtering/?platform=browser
const beforeSend = (
  event: Sentry.Event,
  hint?: Sentry.EventHint | undefined
): Sentry.Event | PromiseLike<Sentry.Event | null> => {
  if (typeof hint === 'undefined') {
    return event;
  }
  const error = hint.originalException;
  if (error && (error as Error).message) {
    const msg = (error as Error).message;
    let ignore = false;
    for (const regex of ignoredErrors) {
      if (msg.match(regex)) {
        ignore = true;
        break;
      }
    }
    if (ignore) {
      // Returning null will prevent Sentry from sending the message
      return null as any;
    }
  }
  return event;
};

const ignoredErrors = [
  // All of these are related to playing a sound file before the user has interacted with the page
  // https://gamedev.stackexchange.com/questions/163365
  /AbortError: The operation was aborted\./,
  /AbortError: The play\(\) request was interrupted by a call to pause\(\)\./,
  /Failed to load because no supported source was found\./,
  /The fetching process for the media resource was aborted by the user agent at the user's request\./,
  /The play method is not allowed by the user agent or the platform in the current context, possibly because the user denied permission\./,
  /The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission\./,
  /play\(\) can only be initiated by a user gesture\./,
  /play\(\) failed because the user didn't interact with the document first\./,
];

export const setUserContext = (userID: number, username: string) => {
  if (!useSentry()) {
    return;
  }

  // If we encounter an error later on, we want metadata to be attached to the error message,
  // which can be helpful for debugging (since we can ask the user how they caused the error)
  // We use "SetTags()" instead of "SetUser()" since tags are more easy to see in the
  // Sentry GUI than users
  // https://docs.sentry.io/enriching-error-data/context/?platform=browser
  Sentry.configureScope((scope) => {
    scope.setTag('userID', userID.toString());
    scope.setTag('username', username);
  });
};

const useSentry = () => window.location.hostname !== 'localhost' && !window.location.pathname.includes('/dev');
