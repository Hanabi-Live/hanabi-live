'use strict';

// Imports
const db = require('./db');

exports.getUser = function(socket, data, done) {
    let sql = 'SELECT id, username, password, num_played, average_score, loss_percent FROM users WHERE username = ?';
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
            data.username = results[0].username; // We replace the existing username in case that they submitted the wrong case
            data.realPassword = results[0].password;
            data.num_played = results[0].num_played;
            data.average_score = results[0].average_score;
            data.loss_percent = results[0].loss_percent;
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
        data.num_played = 0;
        data.average_score = 0;
        data.loss_percent = 0;
        done(null, socket, data);
    });
};

exports.updateStats = function(data, done) {
    let sql = `
        UPDATE users
        SET
            num_played = (
                SELECT COUNT(id) FROM game_participants WHERE user_id = ?
            ),
            average_score = (
                SELECT AVG(games.score)
                FROM games
                    JOIN game_participants ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ? AND games.score != 0
            ),
            loss_percent = (
                SELECT COUNT(games.id)
                FROM games
                    JOIN game_participants ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ? AND games.score = 0
            ) / (
                SELECT COUNT(id) FROM game_participants WHERE user_id = ?
            )
        WHERE id = ?
    `;
    db.query(sql, [data.userID, data.userID], function (error, results, fields) {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};
