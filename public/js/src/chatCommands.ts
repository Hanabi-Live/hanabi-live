// Imports
import * as chat from './chat';
import globals from './globals';
import * as modals from './modals';

// Define a command handler map
const chatCommands = new Map();
export default chatCommands;

// /friend [username]
chatCommands.set('friend', (_room: string, args: string[]) => {
  // Validate that the format of the command is correct
  if (args.length < 1) {
    modals.warningShow('The format of the /friend command is: <code>/friend Alice</code>');
    return;
  }

  // Validate that we are not targeting ourselves
  const name = args.join(' ');
  if (name.toLowerCase() === globals.username.toLowerCase()) {
    modals.warningShow('You cannot friend yourself.');
  }

  globals.conn!.send('chatFriend', {
    name,
  });
});

// /friends
const friends = (room: string) => {
  let friendsMsg;
  if (globals.friends.length === 0) {
    friendsMsg = 'Currently, you do not have any friends on your friends list.';
  } else {
    friendsMsg = `Current friends: ${globals.friends.join(', ')}`;
  }
  chat.add({
    msg: friendsMsg,
    who: '',
    server: true,
    datetime: new Date().getTime(),
    room,
    recipient: '', // This is needed to prevent the message from being viewed as a PM
  }, false);
};
chatCommands.set('friends', friends);
chatCommands.set('friendlist', friends);
chatCommands.set('friendslist', friends);

// /pm [username] [msg]
const pm = (room: string, args: string[]) => {
  // Validate that the format of the command is correct
  if (args.length < 2) {
    modals.warningShow('The format of a private message is: <code>/w Alice hello</code>');
    return;
  }

  let recipient = args[0];
  args.shift(); // Remove the recipient

  // Validate that they are not sending a private message to themselves
  if (recipient.toLowerCase() === globals.username.toLowerCase()) {
    modals.warningShow('You cannot send a private message to yourself.');
    return;
  }

  // Validate that the receipient is online
  let isOnline = false;
  for (const user of globals.userMap.values()) {
    if (user.name.toLowerCase() === recipient.toLowerCase()) {
      isOnline = true;

      // Overwrite the recipient in case the user capitalized the username wrong
      recipient = user.name;

      break;
    }
  }
  if (!isOnline) {
    modals.warningShow(`User "${recipient}" is not currently online.`);
    return;
  }

  globals.conn!.send('chatPM', {
    msg: args.join(' '),
    recipient,
    room,
  });
};
chatCommands.set('pm', pm);
chatCommands.set('w', pm);
chatCommands.set('whisper', pm);
chatCommands.set('msg', pm);

// /setleader [username]
const setLeader = (_room: string, args: string[]) => {
  if (globals.tableID === -1) {
    modals.warningShow('You are not currently at a table, so you cannot use that command.');
    return;
  }

  const username = args.join(' ');
  globals.conn!.send('tableSetLeader', {
    tableID: globals.tableID,
    name: username,
  });
};
chatCommands.set('setleader', setLeader);
chatCommands.set('setlead', setLeader);
chatCommands.set('setowner', setLeader);
chatCommands.set('chnageleader', setLeader);
chatCommands.set('changelead', setLeader);
chatCommands.set('changeowner', setLeader);

// /setvariant [variant]
const setVariant = (_room: string, args: string[]) => {
  if (globals.tableID === -1) {
    modals.warningShow('You are not currently at a table, so you cannot use that command.');
    return;
  }

  const variant = args.join(' ');
  globals.conn!.send('tableSetVariant', {
    tableID: globals.tableID,
    variant,
  });
};
chatCommands.set('setvariant', setVariant);
chatCommands.set('changevariant', setVariant);

// /tag [tag]
chatCommands.set('tag', (_room: string, args: string[]) => {
  if (globals.tableID === -1) {
    modals.warningShow('You are not currently at a table, so you cannot use that command.');
    return;
  }

  const tag = args.join(' ');
  globals.conn!.send('tags', {
    tableID: globals.tableID,
    msg: tag,
  });
});

// /tags
const tags = () => {
  if (globals.tableID === -1) {
    modals.warningShow('You are not currently at a table, so you cannot use that command.');
    return;
  }

  globals.conn!.send('tags', {
    tableID: globals.tableID,
  });
};
chatCommands.set('tags', tags);
chatCommands.set('taglist', tags);

// /unfriend [username]
chatCommands.set('unfriend', (_room: string, args: string[]) => {
  // Validate that the format of the command is correct
  if (args.length < 1) {
    modals.warningShow('The format of the /unfriend command is: <code>/unfriend Alice</code>');
    return;
  }

  // Validate that we are not targeting ourselves
  const name = args.join(' ');
  if (name.toLowerCase() === globals.username.toLowerCase()) {
    modals.warningShow('You cannot unfriend yourself.');
  }

  globals.conn!.send('chatUnfriend', {
    name,
  });
});

// /version
chatCommands.set('version', (room: string) => {
  chat.add({
    msg: `You are running version <strong>${globals.version}</strong> of the Hanabi Live client.`,
    who: '',
    server: true,
    datetime: new Date().getTime(),
    room,
    recipient: '', // This is needed to prevent the message from being viewed as a PM
  }, false);
});

// /warning
chatCommands.set('warning', (_room: string, args: string[]) => {
  let warning = args.join(' ');
  if (warning === '') {
    warning = 'This is a warning!';
  }
  modals.warningShow(warning);
});
