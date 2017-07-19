'use strict';

// Imports
const db = require('./db');

exports.create = function(socket, data, done) {
    let sql = 'INSERT INTO game_participants (user_id, game_id) VALUES (?, ?)';
    let values = [data.userID, data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.delete = function(socket, data, done) {
    let sql = 'DELETE FROM game_participants WHERE user_id = ? AND game_id = ?';
    let values = [data.userID, data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.getSeeds = function(socket, data, done) {
    let sql = `
        SELECT games.seed AS seed
        FROM game_participants
            JOIN games ON game_participants.game_id = games.id
        WHERE game_participants.user_id = ? AND games.status = 2
    `;
    let values = [data.userID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        for (let row of results) {
            data.seeds[row.seed] = true;
        }
        done(null, socket, data);
    });
};
