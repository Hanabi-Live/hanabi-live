// Imports
const db = require('./db');

exports.create = (data, done) => {
    const sql = `
        INSERT INTO game_participants (user_id, game_id, notes)
        VALUES (?, ?, ?)
    `;
    const values = [data.userID, data.gameID, data.notes];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};
