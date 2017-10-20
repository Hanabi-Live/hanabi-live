// Imports
const db = require('./db');

exports.create = (socket, data, done) => {
    const sql = 'INSERT INTO chat_log (user_id, message) VALUES (?, ?)';
    const values = [socket.userID, data.msg];
    db.query(sql, values, (error, results, fields) => {
        if (error) {
            done(error, socket, data);
            return;
        }

        done(null, socket, data);
    });
};
