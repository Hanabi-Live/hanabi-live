// A short tutorial is shown to brand-new users

import { FADE_TIME } from '../constants';
import * as login from './login';

export default () => {
  $('#tutorial-yes').on('click', () => {
    $('#tutorial-1').fadeOut(FADE_TIME, () => {
      $('#tutorial-2').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-no').on('click', () => {
    $('#tutorial').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });

  $('#tutorial-2-yes').on('click', () => {
    $('#tutorial-2').fadeOut(FADE_TIME, () => {
      $('#tutorial-2-1').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-2-no').on('click', () => {
    $('#tutorial-2').fadeOut(FADE_TIME, () => {
      $('#tutorial-2-2').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-2-1-ok').on('click', () => {
    $('#tutorial-2-1').fadeOut(FADE_TIME, () => {
      $('#tutorial-3').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-2-2-ok').on('click', () => {
    $('#tutorial-2-2').fadeOut(FADE_TIME, () => {
      $('#tutorial-3').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-3-ok').on('click', () => {
    $('#tutorial-3').fadeOut(FADE_TIME, () => {
      $('#tutorial-4').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-4-yes').on('click', () => {
    $('#tutorial-4').fadeOut(FADE_TIME, () => {
      $('#tutorial-4-1').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-4-no').on('click', () => {
    $('#tutorial-4').fadeOut(FADE_TIME, () => {
      $('#tutorial-5').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-4-1-ok').on('click', () => {
    $('#tutorial-4-1').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });

  $('#tutorial-5-casual').on('click', () => {
    $('#tutorial-5').fadeOut(FADE_TIME, () => {
      $('#tutorial-5-1').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-5-expert').on('click', () => {
    $('#tutorial-5').fadeOut(FADE_TIME, () => {
      $('#tutorial-6').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-5-1-lobby').on('click', () => {
    $('#tutorial-5-1').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });

  $('#tutorial-6-ok').on('click', () => {
    $('#tutorial-6').fadeOut(FADE_TIME, () => {
      $('#tutorial-7').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-6-lobby').on('click', () => {
    $('#tutorial-6').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });

  $('#tutorial-7-yes').on('click', () => {
    $('#tutorial-7').fadeOut(FADE_TIME, () => {
      $('#tutorial-8').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-7-no').on('click', () => {
    $('#tutorial-7').fadeOut(FADE_TIME, () => {
      $('#tutorial-7-1').fadeIn(FADE_TIME);
    });
  });

  $('#tutorial-7-1-microphone').on('click', () => {
    $('#tutorial-7-1').fadeOut(FADE_TIME, () => {
      $('#tutorial-8').fadeIn(FADE_TIME);
    });
  });
  $('#tutorial-7-1-lobby').on('click', () => {
    $('#tutorial-7-1').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });

  $('#tutorial-8-ok').on('click', () => {
    $('#tutorial-8').fadeOut(FADE_TIME, () => {
      login.hide(false);
    });
  });
};
