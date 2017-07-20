'use strict';

// Imports
const db = require('./db');

exports.create = function(socket, data, done) {
    let sql = `
        INSERT INTO games (
            name,
            max_players,
            variant,
            allow_spec,
            timed,
            owner
        ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    let values = [
        data.name,
        data.max,
        data.variant,
        data.allow_spec,
        data.timed,
        data.owner,
    ];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        data.gameID = results.insertId;
        done(null, socket, data);
    });
};

exports.delete = function(socket, data, done) {
    let sql = 'DELETE FROM games where id = ?';
    let values = [data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.start = function(socket, data, done) {
    let sql = `
        UPDATE games
        SET status = 1, seed = ?, datetime_started = NOW()
        WHERE id = ?
    `;
    let values = [data.seed, data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.end = function(data, done) {
    let sql = `
        UPDATE games
        SET status = 2, score = ?, datetime_finished = NOW()
        WHERE id = ?
    `;
    let values = [data.score, data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};

// Clean up any races that were either not started yet or were not finished
exports.clean = function(done) {
    let sql = 'DELETE FROM games WHERE status != 2';
    db.query(sql, [], function (error, results, fields) {
        if (error) {
            done(error);
            return;
        }

        done(null);
    });
};

exports.exists = function(done, data) {
    let sql = 'SELECT id FROM games WHERE id = ?';
    let values = [data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, data);
        } else if (results.length === 0) {
            data.exists = false;
            done(null, data);
        } else {
            data.exists = true;
            done(null, data);
        }
    });
};

exports.getUserHistory = function(socket, data, done) {
    let sql = `
        SELECT
            games.id AS id,
            (
                SELECT COUNT(id)
                FROM game_participants
                WHERE game_id = games.id
            ) AS num_players,
            (
                SELECT COUNT(id)
                FROM games
                WHERE seed = games.seed
            ) AS num_similar,
            games.score AS score,
            games.variant AS variant
        FROM games
            JOIN game_participants ON game_participants.game_id = games.id
        WHERE games.status = 2 AND game_participants.user_id = ?
        ORDER BY games.id
    `;
    let values = [socket.userID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.gameHistory = [];
        for (let row of results) {
            data.gameHistory.push({
                id: row.id,
                num_players: row.num_players,
                num_similar: row.num_similar,
                score: row.score,
                variant: row.variant,
            });
        }

        done(null, socket, data);
    });
};

exports.getNumSimilar = function(data, done) {
    let sql = 'SELECT COUNT(id) AS num_similar FROM games WHERE seed = ?';
    let values = [data.seed];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, data);
            return;
        }

        data.num_similar = results[0].num_similar;
        done(null, data);
    });
};

exports.getAllDeals = function(socket, data, done) {
    let sql = `
        SELECT
            id,
            score,
            datetime_finished,
            (
                SELECT COUNT(game_participants.id)
                FROM game_participants
                WHERE user_id = ? AND game_id = games.id
            ) AS you
        FROM games
        WHERE seed = (SELECT seed FROM games WHERE id = ?)
        ORDER BY id
    `;
    let values = [socket.userID, data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.gameList = [];
        for (let row of results) {
            // Convert the MySQL bool to a JavaScript boolean
            row.you = (row.you > 0 ? true : false);

            data.gameList.push({
                id: row.id,
                score: row.score,
                ts: row.datetime_finished,
                you: row.you,
            });
        }

        done(null, socket, data);
    });
};

// Get the variant and the names of the players
// (sent after the "hello" command when starting a replay)
exports.getVariantPlayers = function(socket, data, done) {
    let sql = `
        SELECT
            games.variant AS variant,
            users.id AS user_id,
            users.username AS username
        FROM games
            JOIN game_participants ON games.id = game_participants.game_id
            JOIN users ON game_participants.user_id = users.id
        WHERE games.id = ?
        ORDER BY game_participants.id
    `;
    let values = [data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }
        if (results.length === 0) {
            let error = new Error(`Got no rows in the "games" table for ID: ${data.gameID}`);
            done(error, socket, data);
        }
        data.game = {};
        data.game.variant = results[0].variant;
        data.game.players = [];
        for (let row of results) {
            data.game.players.push({
                userID:   row.user_id,
                username: row.username,
            });
        }

        done(null, socket, data);
    });
};

exports.getActions = function(socket, data, done) {
    let sql = 'SELECT action FROM game_actions WHERE game_id = ? ORDER BY id';
    let values = [data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.game = {};
        data.game.actions = [];
        for (let row of results) {
            data.game.actions.push(JSON.parse(row.action));
        }

        done(null, socket, data);
    });
};

// Used when creating a shared replay
exports.getVariant = function(socket, data, done) {
    let sql = 'SELECT variant FROM games WHERE id = ?';
    let values = [data.gameID];
    db.query(sql, values, function (error, results, fields) {
        if (error) {
            done(error, socket, data);
            return;
        }
        if (results.length === 0) {
            data.variant = null;
        } else {
            data.variant = results[0].variant;
        }
        done(null, socket, data);
    });
};
