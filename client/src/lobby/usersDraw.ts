// The lobby area that shows all of the current logged-in users

// Imports
import globals from '../globals';

export const draw = () => {
  $('#lobby-users-num').text(globals.userMap.size);

  const tbody = $('#lobby-users-table-tbody');

  // Clear all of the existing rows
  tbody.html('');

  // Don't do anything if there are no users
  // (this will be the case when first logging in and not doing the tutorial)
  if (globals.userMap.size === 0) {
    return;
  }

  // Make a mapping of user names to IDs (and keep track of our friends)
  const usernameMapping: Map<string, number> = new Map<string, number>();
  const onlineFriends: string[] = [];
  for (const [id, user] of globals.userMap) {
    usernameMapping.set(user.name, id);
    if (globals.friends.includes(user.name)) {
      onlineFriends.push(user.name);
    }
  }

  // Make an alphabetical list of all of the usernames
  const alphabeticalUsernames = Array.from(usernameMapping.keys());
  alphabeticalUsernames.sort(
    // We want to do a case-insensitive sort, which will not occur by default
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // Additionally, alphabetize all of our friends
  onlineFriends.sort(
    // We want to do a case-insensitive sort, which will not occur by default
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // First, draw our username at the top
  const alreadyDrawnUsers: string[] = [];
  drawUser(globals.username, usernameMapping, tbody, false);
  alreadyDrawnUsers.push(globals.username);

  // Second, draw our currently online friends, if any
  for (const friend of onlineFriends) {
    drawUser(friend, usernameMapping, tbody, true);
    alreadyDrawnUsers.push(friend);
  }

  // Then, draw all of the other users in alphabetical order
  for (const username of alphabeticalUsernames) {
    if (!alreadyDrawnUsers.includes(username)) {
      drawUser(username, usernameMapping, tbody, false);
    }
  }
};

const drawUser = (
  username: string,
  usernameMapping: Map<string, number>,
  tbody: JQuery<HTMLElement>,
  friend: boolean,
) => {
  // Find the status of this user from the "userList" map
  const id = usernameMapping.get(username);
  if (id === undefined) {
    throw new Error(`Failed to get the ID for the username of "${username}".`);
  }
  const user = globals.userMap.get(id);
  if (!user) {
    throw new Error(`Failed to get the user for the ID of "${id}".`);
  }
  const status = user.status;

  let nameColumn = `<span id="online-users-${id}">`;
  if (username === globals.username) {
    nameColumn += '<strong>';
  }
  nameColumn += `<a href="/scores/${username}" `;
  if (username === globals.username) {
    nameColumn += 'class="name-me" ';
  } else if (friend) {
    nameColumn += 'class="friend" ';
  }
  nameColumn += 'target="_blank" rel="noopener noreferrer">';
  nameColumn += username;
  nameColumn += '</a>';
  if (username === globals.username) {
    nameColumn += '</strong>';
  }
  nameColumn += `<span id="online-users-${id}-zzz" class="hidden"> &nbsp;💤</span>`;
  nameColumn += '</span>';

  const row = $('<tr>');
  $('<td>').html(nameColumn).appendTo(row);
  $('<td>').html(status).appendTo(row);

  row.appendTo(tbody);

  setInactive(id, user.inactive);
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
