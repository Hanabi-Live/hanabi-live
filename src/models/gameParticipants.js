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

exports.debug = (socket, data, done) => {
    const sql = `
        SELECT id, notes
        FROM game_participants
    `;
    const values = [data.gameID];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        for (const row of results) {
            try {
                JSON.parse(row.notes);
            } catch (err) {
                console.log(`Failed to parse notes for row ${row.id}: ${row.notes}\nError was: ${err}`);
                fixNotes(row.id);
            }
        }

        done(null, socket, data);
    });
};

const fixNotes = (id) => {
    const sql = `
        UPDATE game_participants SET notes = '[]'
        WHERE id = ?
    `;
    const values = [id];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            console.log(`Failed to update row "${id}": ${error}`);
            return;
        }

        console.log(`Fixed row "${id}".`);
    });
};
exports.fixNotes = fixNotes;
