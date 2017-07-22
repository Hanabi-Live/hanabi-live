// Imports
const db = require('./db');

exports.create = (socket, data, done) => {
    const sql = 'INSERT INTO game_participants (user_id, game_id) VALUES (?, ?)';
    const values = [data.userID, data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.delete = (socket, data, done) => {
    const sql = 'DELETE FROM game_participants WHERE user_id = ? AND game_id = ?';
    const values = [data.userID, data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};

exports.getSeeds = (socket, data, done) => {
    const sql = `
        SELECT games.seed AS seed
        FROM game_participants
            JOIN games ON game_participants.game_id = games.id
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
