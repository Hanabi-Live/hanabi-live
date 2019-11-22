/*
   The lobby area that shows all of the current logged-in users
*/

// Imports
import globals from '../globals';

export default () => {
    $('#lobby-users-num').text(globals.userList.size);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const [, user] of globals.userList) {
        const row = $('<tr>');

        let name = `<a href="/scores/${user.name}" target="_blank" rel="noopener noreferrer">${user.name}</a>`;
        if (user.name === globals.username) {
            name = `<strong>${name}</strong>`;
        }

        $('<td>').html(name).appendTo(row);
        $('<td>').html(user.status).appendTo(row);

        row.appendTo(tbody);
    }
};
