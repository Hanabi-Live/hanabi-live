// A collection of miscellaneous functions

// Imports
import shajs from 'sha.js';

// init is executed when the document is ready
export const init = () => {
  // Add a function to the jQuery object to detect if an element is off screen
  // https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen
  ($.expr as any).filters.offscreen = (el: any) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < 0 || // Above the top
      rect.bottom > window.innerHeight || // Below the bottom
      rect.left < 0 || // Left of the left edge
      rect.right > window.innerWidth // Right of the right edge
    );
  };
};

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
export const closeAllTooltips = () => {
  const instances = $.tooltipster.instances();
  $.each(instances, (_: number, instance: any) => {
    if (instance.status().open) {
      instance.close();
    }
  });
};

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
export const copyStringToClipboard = (str: string) => {
  const el = document.createElement('textarea'); // Create new element
  el.value = str; // Set the value (the string to be copied)
  el.setAttribute('readonly', ''); // Set non-editable to avoid focus
  document.body.appendChild(el);
  el.select(); // Select text inside element
  document.execCommand('copy'); // Copy text to clipboard
  document.body.removeChild(el); // Remove temporary element
};

export const getRandomNumber = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

// We salt passwords and then hash them with SHA256 before sending them to the server
export const hashPassword = (salt: string, plaintextPassword: string) => {
  const stringToHash = `${salt}${plaintextPassword}`;
  return shajs('sha256').update(stringToHash).digest('hex');
};

export const timerFormatter = (milliseconds: number) => {
  if (!milliseconds) {
    milliseconds = 0;
  }
  const time = new Date();
  time.setHours(0, 0, 0, milliseconds);
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
  return `${minutes}:${secondsFormatted}`;
};
