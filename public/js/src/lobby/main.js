/*
    The lobby is composed of all of the UI elements that don't have to do with the game itself
*/

exports.createTable = require('./createTable');
exports.history = require('./history');
exports.keyboard = require('./keyboard');
exports.login = require('./login');
exports.nav = require('./nav');
exports.pregame = require('./pregame');
exports.settings = require('./settings');
exports.tables = require('./tables');
exports.users = require('./users');

const tutorial = require('./tutorial');
const watchReplay = require('./watchReplay');

// Initialize jQuery elements related to the lobby
exports.init = () => {
    exports.createTable.init();
    exports.history.init();
    exports.login.init();
    exports.nav.init();

    tutorial.init();
    watchReplay.init();
};
