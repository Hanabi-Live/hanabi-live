// WebSocket command handlers for in-game events

// Imports
import * as gameMain from '../game/main';
import globals from '../globals';
import * as sounds from '../sounds';
import Game from './Game';
import GameHistory from './GameHistory';
import * as history from './history';
import * as pregame from './pregame';
import Table from './Table';
import tablesDraw from './tablesDraw';
import User from './User';
import * as usersDraw from './usersDraw';

export default () => {
  if (globals.conn === null) {
    throw new Error('The "initCommands()" function was entered before "globals.conn" was initiated.');
  }

  for (const [commandName, commandFunction] of commands) {
    globals.conn.on(commandName, (data: any) => {
      commandFunction(data);
    });
  }
};

// Define a command handler map
type Callback = (data: any) => void;
const commands = new Map<string, Callback>();

interface JoinedData {
  tableID: number;
}
commands.set('joined', (data: JoinedData) => {
  globals.tableID = data.tableID;

  // We joined a new game, so transition between screens
  pregame.show();
});

interface FriendsData {
  friends: string[];
}
commands.set('friends', (data: FriendsData) => {
  globals.friends = data.friends;
  if (globals.currentScreen === 'lobby' || globals.currentScreen === 'pregame') {
    usersDraw.draw();
  }
  if (globals.currentScreen === 'lobby') {
    tablesDraw();
  }
  if (globals.currentScreen === 'pregame') {
    pregame.draw();
  }
});

commands.set('game', (data: Game) => {
  globals.game = data;

  // The timeBase and timePerTurn come in seconds, so convert them to milliseconds
  globals.game.options.timeBase *= 1000;
  globals.game.options.timePerTurn *= 1000;

  pregame.draw();
});

commands.set('gameHistory', (dataArray: GameHistory[]) => {
  // data will be an array of all of the games that we have previously played
  for (const data of dataArray) {
    globals.history[data.id] = data;

    if (data.incrementNumGames) {
      globals.totalGames += 1;
    }
  }

  // The server sent us more games because
  // we clicked on the "Show More History" button
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(false);
  }

  const shownGames = Object.keys(globals.history).length;
  $('#nav-buttons-history-shown-games').html(shownGames.toString());
  $('#nav-buttons-history-total-games').html(globals.totalGames.toString());
  if (shownGames === globals.totalGames) {
    $('#lobby-history-show-more').hide();
  }
});

commands.set('gameHistoryFriends', (dataArray: GameHistory[]) => {
  // data will be an array of all of the games that our friends have previously played
  for (const data of dataArray) {
    globals.historyFriends[data.id] = data;
  }

  // The server sent us more games because
  // we clicked on the "Show More History" button
  if (globals.showMoreHistoryClicked) {
    globals.showMoreHistoryClicked = false;
    history.draw(true);
  }
});

interface GameHistoryOtherScoresData {
  games: GameHistory[],
  friends: boolean,
}
commands.set('gameHistoryOtherScores', (data: GameHistoryOtherScoresData) => {
  history.drawOtherScores(data.games, data.friends);
});

commands.set('left', () => {
  // We left a table, so transition between screens
  pregame.hide();
});

interface NameData {
  name: string;
}
commands.set('name', (data: NameData) => {
  globals.randomName = data.name;
});

interface SoundLobbyData {
  file: string;
}
commands.set('soundLobby', (data: SoundLobbyData) => {
  sounds.play(data.file);
});

// Received by the client when a table is created or modified
commands.set('table', (data: Table) => {
  tableSet(data);
  if (globals.currentScreen === 'lobby') {
    tablesDraw();
  }
});

const tableSet = (data: Table) => {
  // The timebase and timePerTurn come in seconds, so convert them to milliseconds
  data.timeBase *= 1000;
  data.timePerTurn *= 1000;

  globals.tableMap.set(data.id, data);
};

// Received by the client when a table no longer has any members present
interface TableGoneData {
  id: number;
}
commands.set('tableGone', (data: TableGoneData) => {
  globals.tableMap.delete(data.id);

  if (globals.currentScreen === 'lobby') {
    tablesDraw();
  }
});

// Received by the client upon initial connection
commands.set('tableList', (dataList: Table[]) => {
  for (const data of dataList) {
    tableSet(data);
  }
  if (globals.currentScreen === 'lobby') {
    tablesDraw();
  }
});

interface TableProgressData {
  id: number;
  progress: number;
}

commands.set('tableProgress', (data: TableProgressData) => {
  const table = globals.tableMap.get(data.id);
  if (!table) {
    return;
  }
  table.progress = data.progress;

  if (globals.currentScreen === 'lobby') {
    $(`#status-${data.id}`).html(data.progress.toString());
  }
});

interface TableStartData {
  tableID: number;
  replay: boolean;
}
commands.set('tableStart', (data: TableStartData) => {
  globals.tableID = data.tableID;

  if (!data.replay) {
    pregame.hide();
  }
  gameMain.show();
});

// Received by the client when a user connect or has a new status
commands.set('user', (data: User) => {
  globals.userMap.set(data.id, data);
  if (globals.currentScreen === 'lobby' || globals.currentScreen === 'pregame') {
    usersDraw.draw();
  }
});

commands.set('userList', (dataList: User[]) => {
  for (const data of dataList) {
    globals.userMap.set(data.id, data);
  }
  if (globals.currentScreen === 'lobby' || globals.currentScreen === 'pregame') {
    usersDraw.draw();
  }
});

// Received by the client when a user disconnects
interface UserLeftData {
  id: number;
}
commands.set('userLeft', (data: UserLeftData) => {
  globals.userMap.delete(data.id);

  if (globals.currentScreen === 'lobby' || globals.currentScreen === 'pregame') {
    usersDraw.draw();
  }
});

interface UserInactiveData {
  id: number;
  inactive: boolean;
}
commands.set('userInactive', (data: UserInactiveData) => {
  const user = globals.userMap.get(data.id);
  if (user) {
    user.inactive = data.inactive;
    if (globals.currentScreen === 'lobby' || globals.currentScreen === 'pregame') {
      usersDraw.setInactive(user.id, user.inactive);
    }
  }
});
