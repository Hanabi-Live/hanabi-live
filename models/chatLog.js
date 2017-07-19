'use strict';

// Imports
const db = require('./db');

exports.create = function(socket, data, done) {
    let sql = 'INSERT INTO chat_log (user_id, message) VALUES (?, ?)';
    let values = [socket.userID, data.msg];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};
