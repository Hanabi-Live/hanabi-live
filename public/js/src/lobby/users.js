/*
   The lobby area that shows all of the current logged-in users
*/

// Imports
const globals = require('../globals');

exports.draw = () => {
    $('#lobby-users-num').text(Object.keys(globals.userList).length);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const user of Object.values(globals.userList)) {
        const row = $('<tr>');

        let { name } = user;
        name = `<a href="/scores/${name}" target="_blank" rel="noopener noreferrer">${name}</a>`;
        if (user.name === globals.username) {
            name = `<strong>${name}</strong>`;
        }
        $('<td>').html(name).appendTo(row);

        const { status } = user;
        $('<td>').html(status).appendTo(row);

        row.appendTo(tbody);
    }
};
