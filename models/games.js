// Imports
const db = require('./db');

exports.create = (socket, data, done) => {
    const sql = `
        INSERT INTO games (
            name,
            owner,
            max_players,
            variant,
            allow_spec,
            timed,
            seed,
            score,
            datetime_created,
            datetime_started
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
        data.name,
        data.owner,
        data.max_players,
        data.variant,
        data.allow_spec,
        data.timed,
        data.seed,
        data.score,
        data.datetime_created,
        data.datetime_started,
    ];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        data.gameID = results.insertId;
        done(null, socket, data);
    });
};

exports.exists = (socket, data, done) => {
    const sql = 'SELECT id FROM games WHERE id = ?';
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
        WHERE game_participants.user_id = ?
        ORDER BY games.id
    `;
    const values = [socket.userID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.gameHistory = [];
        for (const row of results) {
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

exports.getNumSimilar = (data, done) => {
    const sql = 'SELECT COUNT(id) AS num_similar FROM games WHERE seed = ?';
    const values = [data.seed];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        data.num_similar = results[0].num_similar;
        done(null, data);
    });
};

exports.getAllDeals = (socket, data, done) => {
    const sql = `
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
    const values = [socket.userID, data.gameID];
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
                id: row.id,
                score: row.score,
                ts: row.datetime_finished,
                you: row.you,
            });
        }

        done(null, socket, data);
    });
};

exports.getSeeds = (socket, data, done) => {
    const sql = `
        SELECT games.seed AS seed
        FROM games
            JOIN game_participants ON games.id = game_participants.games_id
        WHERE game_participants.user_id = ? AND games.status = 2
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
        WHERE games.id = ?
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

exports.getActions = (socket, data, done) => {
    const sql = 'SELECT action FROM game_actions WHERE game_id = ? ORDER BY id';
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }
        data.game = {};
        data.game.actions = [];
        for (const row of results) {
            data.game.actions.push(JSON.parse(row.action));
        }

        done(null, socket, data);
    });
};

// Used when creating a shared replay
exports.getVariant = (socket, data, done) => {
    const sql = 'SELECT variant FROM games WHERE id = ?';
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
