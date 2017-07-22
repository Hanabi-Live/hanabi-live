// Imports
const db = require('./db');

exports.create = (data, done) => {
    const sql = 'INSERT INTO game_actions (game_id, action) VALUES (?, ?)';
    const values = [data.gameID, data.action];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};
