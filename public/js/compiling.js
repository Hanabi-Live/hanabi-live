$(document).ready(() => {
  $('#loading').hide();
  $('#compiling-warning').show();

  // The time for the server to build the client is not consistent;
  // it can take take anywhere between 30 to 60 seconds
  // Thus, just try refreshing the page every 15 seconds
  setTimeout(() => {
    window.location.reload();
  }, 15000);
});
