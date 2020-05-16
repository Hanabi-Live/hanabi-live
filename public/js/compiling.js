$(document).ready(() => {
  $('#loading').hide();
  $('#compiling-warning').show();

  // Moving the new client JavaScript files in place should take less than a second
  setTimeout(() => {
    window.location.reload();
  }, 1000);
});
