// In production, we send all errors to the cloud using the Sentry.io service

import * as Sentry from '@sentry/browser';
import version from '../../data/version.json';

export const init = () => {
  if (!useSentry()) {
    return;
  }

  Sentry.init({
    dsn: 'https://93293e0a9dff44c7b8485d646738a3e5@sentry.io/5189482',
    release: version.toString(),
    whitelistUrls: ['hanab.live'], // Otherwise, we get errors for LastPass, etc.
    ignoreErrors,
  });
};

const ignoreErrors = [
  // All of these are related to playing a sound file before the user has interacted with the page
  // https://gamedev.stackexchange.com/questions/163365
  'AbortError: The operation was aborted.',
  'AbortError: The play() request was interrupted by a call to pause().',
  'Failed to load because no supported source was found.',
  'NotSupportedError: The operation is not supported.',
  'play() can only be initiated by a user gesture.',
  'play() failed because the user didn\'t interact with the document first.',
  'The fetching process for the media resource was aborted by the user agent at the user\'s request.',
  'The play method is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
  'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',

  // https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded
  'ResizeObserver loop limit exceeded',
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

export const setGameContext = (gameInitData: any) => {
  if (!useSentry()) {
    return;
  }

  // If we encounter an error later on, we want metadata to be attached to the error message,
  // which can be helpful for debugging (since we know what type of game that the user was in)
  // https://docs.sentry.io/enriching-error-data/context/?platform=browser
  Sentry.configureScope((scope) => {
    scope.setTag('gameInitData', gameInitData);
  });
};

const useSentry = () => (
  window.location.hostname !== 'localhost'
  && !window.location.pathname.includes('/dev')
);
