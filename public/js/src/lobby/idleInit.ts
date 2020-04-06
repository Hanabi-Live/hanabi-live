// Imports
import globals from '../globals';

// Constants
const minutesToTriggerIdle = 15;

// From: https://stackoverflow.com/questions/667555/how-to-detect-idle-time-in-javascript-elegantly
export default function idleInit() {
  // Increment the global idle variable every minute
  setInterval(timerIncrement, 60000); // 1 minute

  // Zero the idle timer on mouse movement or keyboard inputs
  $(document).mousemove(mousemoveOrKeypress);
  $(document).keypress(mousemoveOrKeypress);
}

const mousemoveOrKeypress = () => {
  if (globals.idleMinutes >= minutesToTriggerIdle) {
    globals.conn.send('inactive', {
      inactive: false,
    });
  }
  globals.idleMinutes = 0;
};

const timerIncrement = () => {
  globals.idleMinutes += 1;
  if (globals.idleMinutes === minutesToTriggerIdle) {
    // We do not want to keep sending "inactive" messages every minute,
    // so we check for being exactly at the cutoff
    globals.conn.send('inactive', {
      inactive: true,
    });
  }
};
