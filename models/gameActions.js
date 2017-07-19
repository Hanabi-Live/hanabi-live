'use strict';

// Imports
const db = require('./db');

exports.create = function(data, done) {
    let sql = 'INSERT INTO game_actions (game_id, action) VALUES (?, ?)';
    let values = [data.gameID, data.action];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};
