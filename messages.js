/*
    The exports key name has to exactly match the incoming message type
    (Keldon originally used underscores for these messages instead of camel
    case, but they have since been converted)
*/
exports.abandonTable = require('./messages/abandonTable');
exports.action = require('./messages/action');
exports.chat = require('./messages/chat');
exports.createSharedReplay = require('./messages/createSharedReplay');
exports.createTable = require('./messages/createTable');
exports.endGame = require('./messages/endGame'); // Not a real message
exports.getName = require('./messages/getName');
exports.hello = require('./messages/hello');
exports.historyDetails = require('./messages/historyDetails');
exports.joinSharedReplay = require('./messages/joinSharedReplay');
exports.joinTable = require('./messages/joinTable');
exports.leaveTable = require('./messages/leaveTable');
exports.login = require('./messages/login');
exports.logout = require('./messages/logout'); // Not a real message
exports.note = require('./messages/note');
exports.notes = require('./messages/notes');
exports.ready = require('./messages/ready');
exports.reattendTable = require('./messages/reattendTable');
exports.replayAction = require('./messages/replayAction');
exports.startGame = require('./messages/startGame');
exports.unattendTable = require('./messages/unattendTable');
exports.startReplay = require('./messages/startReplay');
exports.spectateTable = require('./messages/spectateTable');
