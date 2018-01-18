module.exports = {
    debug: true,
    fadeTime: 350,

    userList: {}, // Set upon login`
    tableList: {}, // Set upon login
    historyList: {}, // Set upon login
    historyDetailList: [], // Set upon clicking the "History Details" button

    // Upon connecting, the server will only send us the last 10 games that we played
    // If the user clicks on the "Show More History" button,
    // then the server will send all of their games, and this will get set to true
    historyAll: false,

    username: null,
    password: null,

    // The lobby settings found in the gear sub-menu
    settings: {
        sendTurnNotify: false,
        sendTurnSound: true, // We want sounds by default
        sendTimerSound: true,
        sendChatNotify: false,
        sendChatSound: false,
        showColorblindUI: false,
        hideTimerInUntimed: false,
    },

    randomName: '', // Set upon login

    gameID: null,
    game: {}, // Equal to the data for the "game" command

    currentScreen: 'login',
    errorOccured: false,
};
