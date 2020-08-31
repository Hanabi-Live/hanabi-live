// The initial login page

import version from '../../../data/version.json';
import { FADE_TIME } from '../constants';
import globals from '../globals';
import { isEmpty, parseIntSafe } from '../misc';
import websocketInit from '../websocketInit';
import * as nav from './nav';
import tablesDraw from './tablesDraw';
import Screen from './types/Screen';
import * as usersDraw from './usersDraw';

export const init = () => {
  $('#login-button').click(() => {
    $('#login-form').submit();
  });
  $('#login-form').on('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#login-form').submit();
    }
  });
  $('#login-form').submit(submit);

  $('#firefox-warning-button').click(() => {
    localStorage.setItem('acceptedFirefoxWarning', 'true');
    show();
  });
};

const submit = (event: JQuery.Event) => {
  // By default, the form will reload the page, so stop this from happening
  event.preventDefault();

  let username = $('#login-username').val();
  if (isEmpty(username)) {
    formError('You must provide a username.');
    return;
  }
  if (typeof username !== 'string') {
    username = username!.toString();
  }

  let password = $('#login-password').val();
  if (isEmpty(password)) {
    formError('You must provide a password.');
    return;
  }
  if (typeof password === 'number') {
    password = password.toString();
  }
  if (typeof password !== 'string') {
    throw new Error('The password is not a string.');
  }

  send(username, password);
};

const send = (username: string, password: string) => {
  $('#login-button').addClass('disabled');
  $('#login-explanation').hide();
  $('#login-ajax').show();

  // Send a login request to the server; if successful, we will get a cookie back
  let url = `${window.location.protocol}//${window.location.hostname}`;
  if (window.location.port !== '') {
    url += `:${window.location.port}`;
  }
  url += '/login';
  const postData = {
    username,
    password,
    version,
  };
  const request = $.ajax({
    url,
    type: 'POST',
    data: postData,
  });
  console.log(`Sent a login request to: ${url}`);

  request.done(() => {
    // We successfully got a cookie; attempt to establish a WebSocket connection
    websocketInit();
  });
  request.fail((jqXHR) => {
    formError(`Login failed: ${getAjaxError(jqXHR)}`);
  });
};

const getAjaxError = (jqXHR: JQuery.jqXHR<any>) => {
  if (jqXHR.readyState === 0) {
    return 'A network error occurred. The server might be down!';
  }
  if (jqXHR.responseText === '') {
    return 'An unknown error occurred.';
  }
  return jqXHR.responseText;
};

export const automaticLogin = () => {
  // Automatically sign in to the WebSocket server if we are using a "/test" URL
  if (window.location.pathname.includes('/test')) {
    // Parse the test number from the URL, if any
    let testNumberString = '';
    const match = window.location.pathname.match(/\/test\/(\d+)/);
    if (match) {
      testNumberString = match[1];
    }
    let testNumber = 1;
    if (testNumberString !== '') {
      testNumber = parseIntSafe(testNumberString);
    }
    if (Number.isNaN(testNumber)) {
      testNumber = 1;
    }

    const username = `test${testNumber}`;
    console.log(`Automatically logging in as "${username}".`);
    send(username, username); // For test accounts, we use the username as the password
    return;
  }

  // If we have logged in previously and our cookie is still good, automatically login
  console.log('Testing to see if we have a cached WebSocket cookie.');
  fetch('/test-cookie').then((response) => {
    // Check to see if we have accepted the Firefox warning
    // (cookies are strings)
    if (globals.browserIsFirefox && localStorage.getItem('acceptedFirefoxWarning') !== 'true') {
      $('#loading').hide();
      $('#firefox-warning').show();
      return;
    }

    if (response.status === 200) {
      console.log('WebSocket cookie confirmed to be good. Automatically logging in to the WebSocket server.');
      websocketInit();
      return;
    }

    if (response.status === 204) {
      console.log('Either we have not previously logged in or the existing cookie is expired.');
    } else {
      console.log('Received an unknown status back from the server:', response.status);
    }
    show();
  });
};

// -------------------------
// Miscellaneous subroutines
// -------------------------

export const show = () => {
  $('#loading').hide();
  $('#firefox-warning').hide();
  $('#sign-in').show();
  $('#login-username').focus();
};

export const hide = (firstTimeUser: boolean) => {
  // Hide the login screen
  $('#login').hide();

  if (firstTimeUser && !window.location.pathname.includes('/dev')) {
    $('#tutorial').fadeIn(FADE_TIME);
    return;
  }
  $('#tutorial').hide();

  // Disable scroll bars
  // Even with height and width 100%,
  // the scroll bar can pop up when going back from a game to the lobby
  // It also can show up in-game if a tooltip animates off of the edge of the screen
  // So we can set "overflow" to explicitly prevent this from occurring
  // We don't want to set this in "hanabi.css" because
  // there should be scrolling enabled on the login screen
  // We need to scroll to the top of the screen before disabling the scroll bars
  // or else the lobby can become misaligned when logging in from a scroll-down state
  window.scrollTo(0, 0);
  $('body').css('overflow', 'hidden');

  // Show the lobby
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw(); // If we were in the tutorial, we have to re-draw all of the user rows
  $('#lobby').show();
  $('#lobby-history').hide();
  // We can't hide this element by default in "index.html" or else the "No game history" text
  // will not be centered
  nav.show('games');
  $('#lobby-chat-input').focus();

  // Scroll to the bottom of the chat
  // (this is necessary if we are going to the lobby after the tutorial)
  const chat = $('#lobby-chat-text');
  chat.animate({
    scrollTop: chat[0].scrollHeight,
  }, 0);
};

export const formError = (msg: string) => {
  // For some reason this has to be invoked asynchronously in order to work properly
  setTimeout(() => {
    $('#login-ajax').hide();
    $('#login-button').removeClass('disabled');
    $('#login-alert').html(msg);
    $('#login-alert').fadeIn(FADE_TIME);

    const offset = $('#login-alert').offset();
    if (offset === undefined) {
      throw new Error('Failed to get the coordinates for the "#login-alert" element.');
    }
    $('html, body').animate({
      scrollTop: offset.top,
    }, 500);
  }, 0);
};
