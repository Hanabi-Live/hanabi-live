// Imports
const db = require('./db');

exports.getUser = (socket, data, done) => {
    const sql = `
        SELECT
            id,
            username,
            password
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
        done(null, socket, data);
    });
};

exports.getStats = (socket, data, done) => {
    const sql = `
        SELECT
            (
                SELECT COUNT(id)
                FROM game_participants
                WHERE user_id = ?
            ) AS num_played,
            (
                SELECT COUNT(games.id)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                AND games.variant = ?
            ) AS num_played_variant,
            (
                SELECT IFNULL(MAX(games.score), 0)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.variant = ?
                    AND SUBSTRING(games.seed, 2, 1) = "3"
            ) AS best_score_variant_3,
            (
                SELECT IFNULL(MAX(games.score), 0)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.variant = ?
                    AND SUBSTRING(games.seed, 2, 1) = "4"
            ) AS best_score_variant_4,
            (
                SELECT IFNULL(MAX(games.score), 0)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.variant = ?
                    AND SUBSTRING(games.seed, 2, 1) = "5"
            ) AS best_score_variant_5,
            (
                SELECT AVG(games.score)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.score != 0
                    AND games.variant = ?
            ) AS average_score_variant,
            (
                SELECT COUNT(games.id)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.score = 0
                    AND games.variant = ?
            ) / (
                SELECT COUNT(games.id)
                FROM games
                    JOIN game_participants
                        ON game_participants.game_id = games.id
                WHERE game_participants.user_id = ?
                    AND games.variant = ?
            ) AS strikeout_rate_variant
    `;
    const values = [
        data.userID, // num_played
        data.userID, // num_played_variant
        data.variant,
        data.userID, // best_score_variant_3
        data.variant,
        data.userID, // best_score_variant_4
        data.variant,
        data.userID, // best_score_variant_5
        data.variant,
        data.userID, // average_score_variant
        data.variant,
        data.userID, // strikeout_rate_variant
        data.variant,
        data.userID,
        data.variant,
    ];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        if (results.length === 0) {
            error = new Error(`There was no rows in the "users" table for the user ID of: ${data.userID}`);
            done(error, socket, data);
            return;
        } else if (results.length !== 1) {
            error = new Error(`Got ${results.length} rows in the "users" table for the user ID of: ${data.userID}`);
            done(error, socket, data);
            return;
        }

        data.stats = {
            numPlayed: results[0].num_played,
            numPlayedVariant: results[0].num_played_variant,
            bestScoreVariant3: results[0].best_score_variant_3,
            bestScoreVariant4: results[0].best_score_variant_4,
            bestScoreVariant5: results[0].best_score_variant_5,
            averageScoreVariant: results[0].average_score_variant,
            strikeoutRateVariant: results[0].strikeout_rate_variant,
        };

        done(null, socket, data);
    });
};
