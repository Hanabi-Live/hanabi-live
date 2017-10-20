// Imports
const db = require('./db');

exports.getUser = (socket, data, done) => {
    const sql = `
        SELECT
            id,
            username,
            password,
            num_played,
            average_score,
            strikeout_rate
        FROM users
        WHERE username = ?
    `;
    const values = [data.username];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data, null);
            return;
        }

        if (results.length === 0) {
            data.userID = null;
        } else if (results.length !== 1) {
            error = new Error(`Got ${results.length} rows in the "users" table for: ${data.username}`);
            done(error, socket, data, null);
            return;
        } else {
            data.userID = results[0].id;
            data.username = results[0].username;
            // We replace the existing username in case they submitted the wrong case
            data.realPassword = results[0].password;
            data.numPlayed = results[0].num_played;
            data.averageScore = results[0].average_score;
            data.strikeoutRate = results[0].strikeout_rate;
        }

        done(null, socket, data);
    });
};

exports.create = (socket, data, done) => {
    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    const values = [data.username, data.password];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        data.userID = results.insertId;
        data.numPlayed = 0;
        data.averageScore = 0;
        data.strikeoutRate = 0;
        done(null, socket, data);
    });
};

exports.updateStats = (data, done) => {
    const sql = `
        UPDATE users
        SET
            num_played = (
                SELECT COUNT(id) FROM game_participants WHERE user_id = ?
            ),
            average_score = (
                SELECT AVG(games.score)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ? AND games.score != 0
            ),
            strikeout_rate = (
                SELECT COUNT(games.id)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ? AND games.score = 0
            ) / (
                SELECT COUNT(id) FROM game_participants WHERE user_id = ?
            )
        WHERE id = ?
    `;
    const values = [
        data.userID,
        data.userID,
        data.userID,
        data.userID,
        data.userID,
    ];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};


exports.getStats = (data, done) => {
    const sql = `
        SELECT num_played, average_score, strikeout_rate
        FROM users
        WHERE id = ?
    `;
    const values = [data.userID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data, null);
            return;
        }

        if (results.length === 0) {
            error = new Error(`There was no rows in the "users" table for the user ID of: ${data.userID}`);
            done(error, data, null);
            return;
        } else if (results.length !== 1) {
            error = new Error(`Got ${results.length} rows in the "users" table for the user ID of: ${data.userID}`);
            done(error, data, null);
            return;
        }

        data.numPlayed = results[0].num_played;
        data.averageScore = results[0].average_score;
        data.strikeoutRate = results[0].strikeout_rate;

        done(null, data);
    });
};
