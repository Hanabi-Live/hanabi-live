'use strict';

// The exports key name has to exactly match the incoming message type
// (Keldon uses underscores instead of camel case)
exports.abandon_table        = require('./messages/abandonTable');
exports.action               = require('./messages/action');
exports.chat                 = require('./messages/chat');
exports.create_shared_replay = require('./messages/createSharedReplay');
exports.create_table         = require('./messages/createTable');
exports.end_game             = require('./messages/endGame'); // Not a real message
exports.hello                = require('./messages/hello');
exports.history_details      = require('./messages/historyDetails');
exports.join_shared_replay   = require('./messages/joinSharedReplay'); // Not a real message
exports.join_table           = require('./messages/joinTable');
exports.leave_table          = require('./messages/leaveTable');
exports.login                = require('./messages/login');
exports.logout               = require('./messages/logout'); // Not a real message
exports.note                 = require('./messages/note');
exports.ready                = require('./messages/ready');
exports.reattend_table       = require('./messages/reattendTable');
exports.start_game           = require('./messages/startGame');
exports.unattend_table       = require('./messages/unattendTable');
exports.start_replay         = require('./messages/startReplay');
exports.spectate_table       = require('./messages/spectateTable');
