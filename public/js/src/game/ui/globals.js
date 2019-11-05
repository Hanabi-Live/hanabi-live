// This object contains global variables for the "ui.js" file
// (they are initialized in the "globalsInit.js" file)
const globals = {};
export default globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
if (typeof window !== 'undefined') {
    window.globals = globals;
}
