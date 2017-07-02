'use strict';

// Imports
const db = require('./db');

exports.create = function(socket, data, done) {
    let sql = 'INSERT INTO chat_log (user_id, message) VALUES (?, ?)';
    db.query(sql, [socket.userID, data.msg], function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};
