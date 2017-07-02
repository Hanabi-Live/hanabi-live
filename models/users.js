'use strict';

// Imports
const db = require('./db');

exports.getUser = function(socket, data, done) {
    let sql = 'SELECT id, password, num_started, num_finished, best_score FROM users WHERE username = ?';
    db.query(sql, [data.username], function (error, results, fields) {
        if (error) {
            done(error, socket, data, null);
            return;
        }

        if (results.length === 0) {
            data.userID = null;
        } else if (results.length !== 1) {
            let error = new Error('Got ' + results.length + ' rows in the "users" table for: ' + data.username);
            done(error, socket, data, null);
            return;
        } else {
            data.userID = results[0].id;
            data.realPassword = results[0].password;
            data.num_started = results[0].num_started;
            data.num_finished = results[0].num_finished;
            data.best_score = results[0].best_score;
        }

        done(null, socket, data);
    });
};

exports.create = function(socket, data, done) {
    let sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.query(sql, [data.username, data.password], function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        data.userID = results.insertId;
        data.num_started = 0;
        data.num_finished = 0;
        data.best_score = 0;
        done(null, socket, data);
    });
};
