/*
   The lobby area that shows all of the current logged-in users
*/

// Imports
import globals from '../globals';

export const draw = () => {
    $('#lobby-users-num').text(globals.userMap.size);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Make a mapping of user names to IDs
    const usernameMapping: Map<string, number> = new Map();
    for (const [id, user] of globals.userMap) {
        usernameMapping.set(user.name, id);
    }

    // Make an alphabetical list of all of the usernames
    const alphabeticalUsernames = Array.from(usernameMapping.keys());
    alphabeticalUsernames.sort(
        // We want to do a case-insensitive sort, which will not occur by default
        (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
    );

    // Add all of the users in alphabetical order
    for (const username of alphabeticalUsernames) {
        // Find the status of this user from the "userList" map
        const id = usernameMapping.get(username);
        if (!id) {
            throw new Error(`Failed to get the ID for the username of "${username}".`);
        }
        const user = globals.userMap.get(id);
        if (!user) {
            throw new Error(`Failed to get the user for the ID of "${id}".`);
        }
        const status = user.status;

        let nameColumn = `<span id="online-users-${id}">`;
        nameColumn += `<a href="/scores/${username}" target="_blank" rel="noopener noreferrer">`;
        if (username === globals.username) {
            nameColumn += `<strong><span class="name-me">${username}</span></strong>`;
        } else {
            nameColumn += username;
        }
        nameColumn += '</a>';
        nameColumn += `<span id="online-users-${id}-zzz" class="hidden"> &nbsp;💤</span>`;
        nameColumn += '</span>';

        const row = $('<tr>');
        $('<td>').html(nameColumn).appendTo(row);
        $('<td>').html(status).appendTo(row);

        row.appendTo(tbody);

        setInactive(id, user.inactive);
    }
};

export const setInactive = (id: number, inactive: boolean) => {
    if (inactive) {
        $(`#online-users-${id}`).fadeTo(0, 0.3);
        $(`#online-users-${id}-zzz`).show();
    } else {
        $(`#online-users-${id}`).fadeTo(0, 1);
        $(`#online-users-${id}-zzz`).hide();
    }
};
