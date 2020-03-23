/*
    WebSocket command handlers for in-game events
*/

// Imports
import Game from './Game';
import GameHistory from './GameHistory';
import * as gameMain from '../game/main';
import globals from '../globals';
import * as history from './history';
import * as pregame from './pregame';
import tablesDraw from './tablesDraw';
import usersDraw from './usersDraw';

export default () => {
    for (const [commandName, commandFunction] of commands) {
        globals.conn.on(commandName, (data: any) => {
            commandFunction(data);
        });
    }
};

// Define a command handler map
const commands = new Map();

interface JoinedData {
    tableID: number,
}
commands.set('joined', (data: JoinedData) => {
    globals.tableID = data.tableID;

    // We joined a new game, so transition between screens
    pregame.show();
});

commands.set('game', (data: Game) => {
    globals.game = data;

    // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
    globals.game.baseTime *= 1000;
    globals.game.timePerTurn *= 1000;

    pregame.draw();
});

commands.set('gameHistory', (dataArray: Array<GameHistory>) => {
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
        history.draw();
    }

    const shownGames = Object.keys(globals.history).length;
    $('#nav-buttons-history-shown-games').html(shownGames.toString());
    $('#nav-buttons-history-total-games').html(globals.totalGames.toString());
    if (shownGames === globals.totalGames) {
        $('#lobby-history-show-more').hide();
    }
});

commands.set('gameHistoryOtherScores', (data: Array<GameHistory>) => {
    history.drawOtherScores(data);
});

commands.set('left', () => {
    // We left a table, so transition between screens
    pregame.hide();
});

interface NameData {
    name: string,
}
commands.set('name', (data: NameData) => {
    globals.randomName = data.name;
});

// Received by the client when a table is created or modified
commands.set('table', (data: Table) => {
    // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
    data.baseTime *= 1000;
    data.timePerTurn *= 1000;

    globals.tableList.set(data.id, data);

    if (globals.currentScreen === 'lobby') {
        tablesDraw();
    }
});

// Received by the client when a table no longer has any members present
interface TableGoneData {
    id: number,
}
commands.set('tableGone', (data: TableGoneData) => {
    globals.tableList.delete(data.id);

    if (globals.currentScreen === 'lobby') {
        tablesDraw();
    }
});

interface TableReadyData {
    ready: boolean,
}
commands.set('tableReady', (data: TableReadyData) => {
    if (data.ready) {
        $('#nav-buttons-pregame-start').removeClass('disabled');
    } else {
        $('#nav-buttons-pregame-start').addClass('disabled');
    }
});

interface TableStartData {
    replay: boolean,
}
commands.set('tableStart', (data: TableStartData) => {
    if (!data.replay) {
        pregame.hide();
    }
    gameMain.show();
});

// Received by the client when a user connect or has a new status
commands.set('user', (data: User) => {
    globals.userList.set(data.id, data);

    if (globals.currentScreen === 'lobby') {
        usersDraw();
    }
});

// Received by the client when a user disconnects
interface UserLeftData {
    id: number,
}
commands.set('userLeft', (data: UserLeftData) => {
    globals.userList.delete(data.id);

    if (globals.currentScreen === 'lobby') {
        usersDraw();
    }
});
