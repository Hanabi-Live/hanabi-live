// Imports
const db = require('./db');

exports.create = (data, done) => {
    const sql = `
        INSERT INTO game_participants (user_id, game_id, notes)
        VALUES ?
    `;
    // "gameParticipants" is a two dimensional array to allow for a bulk import
    // of all of the players at once
    const values = [data.gameParticipants];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, data);
            return;
        }

        done(null, data);
    });
};
