// This object contains global variables for the "ui.js" file
const globals = {};
// (they are initialized in the "globalsInit.js" file)
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals = globals;
