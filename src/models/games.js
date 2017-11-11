// Imports
const db = require('./db');

exports.create = (socket, data, done) => {
    const sql = 'INSERT INTO games (owner) VALUES (?)';
    const values = [data.owner];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        data.gameID = results.insertId;
        done(null, socket, data);
    });
};

exports.delete = (data, done) => {
    const sql = 'DELETE FROM games where id = ?';
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};

exports.end = (data, done) => {
    const sql = `
        UPDATE games
        SET
            name = ?,
            owner = ?,
            variant = ?,
            timed = ?,
            seed = ?,
            score = ?,
            datetime_started = ?,
            datetime_finished = ?
        WHERE id = ?
    `;
    const values = [
        data.name,
        data.owner,
        data.variant,
        data.timed,
        data.seed,
        data.score,
        data.datetimeStarted,
        data.datetimeFinished,
        data.gameID,
    ];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};

// Used by the "startReplay" function
exports.exists = (socket, data, done) => {
    const sql = `
        SELECT id
        FROM games
        WHERE id = ? AND datetime_finished IS NOT NULL
    `;
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
        } else if (results.length === 0) {
            data.exists = false;
            done(null, socket, data);
        } else {
            data.exists = true;
            done(null, socket, data);
        }
    });
};

exports.getUserHistory = (socket, data, done) => {
    const sql = `
        SELECT
            games.id AS id_original,
            (
                SELECT COUNT(id)
                FROM game_participants
                WHERE game_id = games.id
            ) AS num_players,
            games.seed AS seed_original,
            (
                SELECT COUNT(id)
                FROM games
                WHERE seed = seed_original
            ) AS num_similar,
            games.score AS score,
            datetime_finished,
            games.variant AS variant,
            (
                SELECT GROUP_CONCAT(users.username SEPARATOR ', ')
                FROM game_participants
                    JOIN users ON users.id = game_participants.user_id
                WHERE game_participants.game_id = id_original
                    AND game_participants.user_id != ?
                ORDER BY game_participants.id
            ) AS otherPlayerNames
        FROM games
            JOIN game_participants ON game_participants.game_id = games.id
        WHERE game_participants.user_id = ? AND datetime_finished IS NOT NULL
        ORDER BY games.id
    `;
    const values = [socket.userID, socket.userID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.gameHistory = [];
        for (const row of results) {
            data.gameHistory.push({
                id: row.id_original,
                numPlayers: row.num_players,
                numSimilar: row.num_similar,
                otherPlayerNames: row.otherPlayerNames,
                score: row.score,
                ts: row.datetime_finished,
                variant: row.variant,
            });
        }

        done(null, socket, data);
    });
};

// Used in the "endGame" function
exports.getNumSimilar = (data, done) => {
    const sql = `
        SELECT COUNT(id) AS num_similar
        FROM games
        WHERE seed = ? AND datetime_finished IS NOT NULL
    `;
    const values = [data.seed];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        data.numSimilar = results[0].num_similar;
        done(null, data);
    });
};

exports.getAllDeals = (socket, data, done) => {
    const sql = `
        SELECT
            id AS id_original,
            score,
            datetime_finished,
            (
                SELECT COUNT(game_participants.id)
                FROM game_participants
                WHERE user_id = ? AND game_id = games.id
            ) AS you,
            (
                SELECT GROUP_CONCAT(users.username SEPARATOR ', ')
                FROM game_participants
                    JOIN users ON users.id = game_participants.user_id
                WHERE game_participants.game_id = id_original
                    AND game_participants.user_id != ?
                ORDER BY game_participants.id
            ) AS otherPlayerNames
        FROM games
        WHERE seed = (SELECT seed FROM games WHERE id = ?)
        AND datetime_finished IS NOT NULL
        ORDER BY id
    `;
    const values = [socket.userID, socket.userID, data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.gameList = [];
        for (const row of results) {
            // Convert the MySQL bool to a JavaScript boolean
            row.you = (row.you > 0);

            data.gameList.push({
                id: row.id_original,
                otherPlayerNames: row.otherPlayerNames,
                score: row.score,
                ts: row.datetime_finished,
                you: row.you,
            });
        }

        done(null, socket, data);
    });
};

exports.getPlayerSeeds = (socket, data, done) => {
    const sql = `
        SELECT games.seed AS seed
        FROM games
            JOIN game_participants ON games.id = game_participants.game_id
        WHERE game_participants.user_id = ? AND datetime_finished IS NOT NULL
    `;
    const values = [data.userID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        for (const row of results) {
            data.seeds[row.seed] = true;
        }
        done(null, socket, data);
    });
};

// Get the variant and the names of the players
// (sent after the "hello" command when starting a replay)
exports.getVariantPlayers = (socket, data, done) => {
    const sql = `
        SELECT
            games.variant AS variant,
            users.id AS user_id,
            users.username AS username
        FROM games
            JOIN game_participants ON games.id = game_participants.game_id
            JOIN users ON game_participants.user_id = users.id
        WHERE games.id = ? AND datetime_finished IS NOT NULL
        ORDER BY game_participants.id
    `;
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        if (results.length === 0) {
            error = new Error(`Got no rows in the "games" table for ID: ${data.gameID}`);
            done(error, socket, data);
            return;
        }
        data.game = {};
        data.game.variant = results[0].variant;
        data.game.players = [];
        for (const row of results) {
            data.game.players.push({
                userID: row.user_id,
                username: row.username,
            });
        }

        done(null, socket, data);
    });
};

// Used when creating a shared replay
exports.getVariant = (socket, data, done) => {
    const sql = `
        SELECT variant
        FROM games
        WHERE id = ? AND datetime_finished IS NOT NULL
    `;
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
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

// Used in the "ready" command
exports.getNotes = (socket, data, done) => {
    const sql = `
        SELECT
            users.username AS username,
            game_participants.notes AS notes
        FROM games
            JOIN game_participants ON game_participants.game_id = games.id
            JOIN users ON users.id = game_participants.user_id
        WHERE games.id = ?
        ORDER BY game_participants.id
    `;
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.game.players = [];
        for (const row of results) {
            let { notes } = row;

            // Games before October 2017 do not have notes associated with them in the database
            // Thus, we need to check for empty strings to avoid JSON parsing errors
            if (notes === '') {
                notes = [];
            } else {
                // Games between October 2017 and November 2017 may have
                // corrupted notes if they were longer than 500 characters;
                // thus we need to check to see if the JSON correctly parses
                try {
                    notes = JSON.parse(row.notes);
                } catch (err) {
                    notes = [];
                }
            }
            data.game.players.push({
                username: row.username,
                notes,
            });
        }

        done(null, socket, data);
    });
};

// Clean up any races that were either not started yet or were not finished
exports.clean = (done) => {
    const sql = 'DELETE FROM games WHERE datetime_finished IS NULL';
    db.query(sql, [], (error, results, fields) => {
        if (error) {
            done(error);
            return;
        }

        done(null);
    });
};
