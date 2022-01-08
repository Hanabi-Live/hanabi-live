// Imports
const db = require('./db');

exports.create = (data, done) => {
    const sql = `
        INSERT INTO game_actions (game_id, action)
        VALUES ?
    `;
    // "gameActions" is a two dimensional array to allow for a bulk import
    // of all of the actions at once
    const values = [data.gameActions];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};

exports.getAll = (socket, data, done) => {
    const sql = `
        SELECT action
        FROM game_actions
        WHERE game_id = ?
        ORDER BY id
    `;
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
