'use strict';

// Imports
const db = require('./db');

exports.create = function(socket, data, done) {
    let sql = 'INSERT INTO game_participants (user_id, game_id) VALUES (?, ?)';
    db.query(sql, [data.userID, data.gameID], function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.delete = function(socket, data, done) {
    let sql = 'DELETE FROM game_participants WHERE user_id = ? AND game_id = ?';
    db.query(sql, [data.userID, data.gameID], function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};
