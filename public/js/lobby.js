const showDebugMessages = true;
const fadeTime = 200; // Vanilla Keldon is 800

function HanabiLobby() {
    const self = this;

    this.userList = {};
    this.tableList = {};
    this.historyList = {};
    this.historyDetailList = [];

    this.username = null;
    this.pass = null;

    this.gameID = null;
    this.randomName = '';
    this.beenInAtLeast1Game = false;

    // The lobby settings found in the gear sub-menu
    this.sendTurnNotify = false;
    this.sendTurnSound = true; // We want sounds by default
    this.sendChatNotify = false;
    this.sendChatSound = false;
    this.showColorblindUI = false;

    this.game = {
        name: '',
        numPlayers: 0,
        ourIndex: 0,
        players: [],
    };

    this.hideLobby();
    this.hideCreateDialog();
    this.showLogin();

    this.loadSettings();

    // Preload some sounds by playing them at 0 volume
    $(document).ready(() => {
        if (!self.sendTurnSound) {
            return;
        }

        const soundFiles = ['blind', 'fail', 'tone', 'turn_other', 'turn_us'];
        for (const file of soundFiles) {
            const audio = new Audio(`public/sounds/${file}.mp3`);
            audio.volume = 0;
            audio.play();
        }
    });

    const performLogin = () => {
        const user = $('#user').val();
        const pass = $('#pass').val();

        if (!user) {
            $('#login-result').html('You must provide a username.');
            return;
        }

        if (!pass) {
            $('#login-result').html('You must provide a password.');
            return;
        }

        const hash = hex_sha256(`Hanabi password ${pass}`);

        setCookie('hanabiuser', user);
        setCookie('hanabipass', hash);

        self.username = user;
        self.pass = hash;

        self.sendLogin();
    };

    $('#login-button').on('click', (event) => {
        event.preventDefault();
        performLogin();
    });

    $('#login-form').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            performLogin();
        }
    });

    const input = $('#chat-input');

    input.on('keypress', (event) => {
        if (event.keyCode === 13) {
            if (!input.val()) {
                return;
            }
            self.sendMsg({
                type: 'chat',
                resp: {
                    msg: input.val(),
                },
            });
            input.val('');
        }
    });

    $('#create-table').on('click', (event) => {
        event.preventDefault();

        self.showCreateDialog();
    });

    $('#create-table').removeAttr('disabled');

    $('#create-table-dialog').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#create-game-submit').click();
        }
    });

    $('#create-game-submit').on('click', (event) => {
        const gameName = $('#create-game-name').val();
        const variant = parseInt($('#create-game-variant').val(), 10);
        const timed = document.getElementById('create-game-timed').checked;
        const reorderCards = document.getElementById('create-game-reorder-cards').checked;

        localStorage.setItem('createTableVariant', variant);
        localStorage.setItem('createTableTimed', timed);
        localStorage.setItem('createTableReorderCards', reorderCards);

        event.preventDefault();

        self.sendMsg({
            type: 'createTable',
            resp: {
                name: gameName,
                variant,
                timed,
                reorderCards,
            },
        });

        self.hideCreateDialog();
    });

    $('#show-resources').on('click', (event) => {
        self.showResources();
    });

    $('#close-resources').on('click', (event) => {
        self.hideResources();
    });

    $('#show-settings').on('click', (event) => {
        self.showSettings();
    });

    $('#close-settings').on('click', (event) => {
        self.hideSettings();
    });

    $('#create-game-cancel').on('click', (event) => {
        event.preventDefault();

        self.hideCreateDialog();
    });

    $('#start-game').on('click', (event) => {
        event.preventDefault();

        self.sendMsg({
            type: 'startGame',
            resp: {},
        });
    });

    $('#leave-game').on('click', (event) => {
        event.preventDefault();

        self.sendMsg({
            type: 'leaveTable',
            resp: {},
        });
    });

    $('#unattend-table').on('click', (event) => {
        event.preventDefault();

        $('#joined-table').hide();
        $('#table-area').show();

        self.sendMsg({
            type: 'unattendTable',
            resp: {},
        });
    });

    $('#show-history').on('click', (event) => {
        event.preventDefault();

        $('#table-area').hide();
        $('#game-history').show();

        self.drawHistory();
    });

    const logoutButton = document.createElement('button');
    logoutButton.id = 'logout';
    logoutButton.innerHTML = 'Log Out';

    $('#show-history').parent().append(logoutButton);
    $('#logout').on('click', (event) => {
        deleteCookie('hanabiuser');
        deleteCookie('hanabipass');
        location.reload();
    });


    $('.return-table').on('click', (event) => {
        event.preventDefault();

        $('#game-history-details').hide();
        $('#game-history').hide();
        $('#table-area').show();
    });

    $('#return-history').on('click', (event) => {
        event.preventDefault();

        $('#game-history-details').hide();
        $('#game-history').show();
    });

    $('body').on('contextmenu', '#game', () => false);

    $(document).keydown((event) => {
        if (event.altKey && event.key === 'c') {
            // Click the "Create Table" button
            $('#create-table').click();
        } else if (event.altKey && event.key === 'h') {
            // Click the "Show History" button
            $('#show-history').click();
        } else if (event.altKey && event.key === 's') {
            // Click on the "Start Game" button
            $('#start-game').click();
        } else if (event.altKey && event.key === 'l') {
            // Click on the "Leave Game" button
            $('#leave-game').click();
        } else if (event.altKey && event.key === 'r') {
            // Click on the "Return to Tables" button
            $('#unattend-table').click();
        }
    });
}

HanabiLobby.prototype.resetLobby = function resetLobby() {
    this.userList = {};
    this.tableList = {};
    this.historyList = {};
    this.historyDetailList = [];
    this.drawUsers();
    this.drawTables();
};

HanabiLobby.prototype.sendLogin = function sendLogin() {
    $('#login-container').hide();
    $('#connecting').show();

    this.sendMsg({
        type: 'login',
        resp: {
            username: this.username,
            password: this.pass,
        },
    });
};

HanabiLobby.prototype.loginFailed = (reason) => {
    $('#login-container').show();
    $('#connecting').hide();

    $('#login-result').html(`Login failed: ${reason}`);
};

HanabiLobby.prototype.resetLogin = () => {
    $('#login-container').show();
    $('#connecting').hide();

    $('#login-result').html('');
};

HanabiLobby.prototype.showLogin = () => {
    $('#login').show();
};

HanabiLobby.prototype.hideLogin = () => {
    $('#login').hide();
};

HanabiLobby.prototype.showLobby = () => {
    $('#lobby').fadeIn(fadeTime);
};

HanabiLobby.prototype.hideLobby = () => {
    $('#lobby').hide();
};

HanabiLobby.prototype.showCreateDialog = function showCreateDialog() {
    $('#create-table-dialog').fadeIn(fadeTime);

    $('#create-game-name').val(this.randomName);

    // Get a new random name from the server for the next time we click the button
    this.sendMsg({
        type: 'getName',
    });

    let variant = JSON.parse(localStorage.getItem('createTableVariant'));
    if (typeof variant !== 'number' || variant < 0 || variant >= variantNames.length) {
        variant = 0;
    }
    $('#create-game-variant').val(variant);

    const timed = JSON.parse(localStorage.getItem('createTableTimed'));
    $('#create-game-timed').prop('checked', timed);

    const reorderCards = JSON.parse(localStorage.getItem('createTableReorderCards'));
    $('#create-game-reorder-cards').prop('checked', reorderCards);

    // Autofocus the "Game Name" field
    $('#create-game-name').focus();
};

HanabiLobby.prototype.hideCreateDialog = () => {
    $('#create-table-dialog').fadeOut(fadeTime);
};

HanabiLobby.prototype.showResources = () => {
    $('#resources-dialog').fadeIn(fadeTime);
};

HanabiLobby.prototype.hideResources = () => {
    $('#resources-dialog').fadeOut(fadeTime);
};

HanabiLobby.prototype.showSettings = () => {
    $('#settings-dialog').fadeIn(fadeTime);
};

HanabiLobby.prototype.hideSettings = () => {
    $('#settings-dialog').fadeOut(fadeTime);
};

HanabiLobby.prototype.showHistoryDetails = function showHistoryDetails() {
    $('#game-history').hide();
    $('#game-history-details').show();

    this.historyDetailList = [];
    this.drawHistoryDetails();
};

HanabiLobby.prototype.showPregame = () => {
    $('#pregame').fadeIn(fadeTime);
};

HanabiLobby.prototype.hidePregame = () => {
    $('#pregame').hide();
};

HanabiLobby.prototype.showGame = () => {
    $('#game').fadeIn(fadeTime);
};

HanabiLobby.prototype.hideGame = () => {
    $('#game').hide();
};

HanabiLobby.prototype.addUser = function addUser(data) {
    this.userList[data.id] = {
        name: data.name,
        status: data.status,
    };
    this.drawUsers();
};

HanabiLobby.prototype.removeUser = function removeUser(data) {
    delete this.userList[data.id];
    this.drawUsers();
};

HanabiLobby.prototype.drawUsers = function drawUsers() {
    const div = $('#user-list');

    div.html('');

    const attrs = $('<ul>')
        .append($('<li>')
            .text('Name')
            .addClass('table-attr user-name'))
        .append($('<li>')
            .text('Status')
            .addClass('table-attr user-status'));

    div.append($('<li>').addClass('table-header').append(attrs));

    for (const userID of Object.keys(this.userList)) {
        const attrs2 = $('<ul>')
            .append($('<li>')
                .html(this.userList[userID].name === this.username ? `<i>${this.userList[userID].name}</i>` : this.userList[userID].name)
                .addClass('table-attr user-name'))
            .append($('<li>')
                .append(this.userList[userID].status)
                .addClass('table-attr user-status'));
        div.append($('<li>').append(attrs2));
    }

    $('#user-list :checkbox').click((event) => {
        event.preventDefault();
    });
};

HanabiLobby.prototype.addTable = function addTable(data) {
    this.tableList[data.id] = {
        name: data.name,
        numPlayers: data.numPlayers,
        variant: data.variant,
        joined: data.joined,
        running: data.running,
        ourTurn: data.ourTurn,
        owned: data.owned,
        sharedReplay: data.sharedReplay,
    };
    this.drawTables();

    // Automatically resume any games that we are currently in
    if (data.joined && data.running && !this.beenInAtLeast1Game) {
        $(`#resume-${data.id}`).click();
    }
};

HanabiLobby.prototype.removeTable = function removeTable(data) {
    delete this.tableList[data.id];
    this.drawTables();
};

const variantNames = [
    'None',
    'Black Suit',
    'Black Suit (one of each rank)',
    'Rainbow Suit (all colors)',
    'Dual-color Suits',
    'Dual-color & Rainbow Suits',
    'White Suit (colorless) & Rainbow Suit',
    'Wild and Crazy',
];
$(document).ready(() => {
    for (let i = 0; i < variantNames.length; i++) {
        const option = new Option(variantNames[i], i);
        $('#create-game-variant').append($(option));
    }
});

HanabiLobby.prototype.drawTables = function drawTables() {
    const self = this;
    const div = $('#table-list');

    div.html('');

    for (const gameID of Object.keys(this.tableList)) {
        const table = $('<li>').addClass('table-item');
        const attrs = $('<ul>')
            .append($('<li>')
                .text(this.tableList[gameID].name)
                .addClass('table-attr table-name'))
            .append($('<li>')
                .text(`${this.tableList[gameID].numPlayers}p`)
                .addClass('table-attr table-players'))
            .append($('<li>')
                .text(`Variant: ${variantNames[this.tableList[gameID].variant]}`)
                .addClass('table-attr table-variant'));

        let status = 'Not Started';
        if (this.tableList[gameID].running && !this.tableList[gameID].joined) {
            status = 'Running';
        } else if (this.tableList[gameID].running) {
            if (this.tableList[gameID].ourTurn) {
                status = '<b>Your Turn</b>';
            } else {
                status = 'Waiting';
            }
        }
        attrs
            .append($('<li>')
                .html(status)
                .addClass('table-attr table-status'));

        let button;
        if (
            !this.tableList[gameID].joined &&
            this.tableList[gameID].running
        ) {
            button = $('<button>').text('Spectate').attr('type', 'button');
            button.attr('id', `spectate-${gameID}`);

            button.on('click', function buttonClick(event) {
                event.preventDefault();

                const id = parseInt(this.id.slice(9), 10);
                self.gameID = id;
                self.sendMsg({
                    type: 'spectateTable',
                    resp: {
                        gameID: id,
                    },
                });

                self.drawTables();
            });
        } else if (!this.tableList[gameID].joined) {
            button = $('<button>').text('Join').attr('type', 'button');
            button.attr('id', `join-${gameID}`);

            if (this.tableList[gameID].numPlayers >= 5) {
                button.attr('disabled', 'disabled');
            }

            button.on('click', function buttonClick(event) {
                event.preventDefault();

                self.gameID = parseInt(this.id.slice(5), 10);

                self.sendMsg({
                    type: 'joinTable',
                    resp: {
                        gameID: self.gameID,
                    },
                });

                self.drawTables();
            });
        } else {
            button = $('<button>').text('Resume').attr('type', 'button');
            button.attr('id', `resume-${gameID}`);

            button.on('click', function reattendTableClick(event) {
                event.preventDefault();

                self.gameID = parseInt(this.id.slice(7), 10);

                self.sendMsg({
                    type: 'reattendTable',
                    resp: {
                        gameID: self.gameID,
                    },
                });

                self.drawTables();
            });
        }

        attrs
            .append($('<li>')
            .append(button)
                .addClass('table-attr table-join'));

        if (
            this.tableList[gameID].joined &&
            (this.tableList[gameID].owned || this.tableList[gameID].running)
        ) {
            button = $('<button>').html('&nbsp;').attr('type', 'button').addClass('abandon');

            button.attr('id', `abandon-${gameID}`);

            button.on('click', function buttonClick(event) {
                event.preventDefault();

                const id = parseInt(this.id.slice(8), 10);
                if (self.tableList[id].running) {
                    if (!confirm('Really abandon game?  This will cancel the game for all players.')) {
                        return;
                    }
                }

                self.gameID = null;
                self.sendMsg({
                    type: 'abandonTable',
                    resp: {
                        gameID: id,
                    },
                });
            });

            attrs.append($('<li>').append(button).addClass('table-attr table-abandon'));
        }

        table.append(attrs);
        div.append(table);
    }
};

HanabiLobby.prototype.addChat = function addChat(data) {
    const chat = $('#chat-contents');

    let line = '';
    if (data.who) {
        line += `<i>${new Date().toLocaleTimeString()}</i>&nbsp;&nbsp;`;
        if (data.discord) {
            line += '&lt;<b>D</b>&gt; ';
        }
        line += `<b>${data.who}:</b> ${$('<a>').text(data.msg).html()}<br />`;
    } else {
        line += `<b>${$('<a>').text(data.msg).html()}</b><br />`;
    }

    chat.finish();
    chat.append(line);
    chat.animate({
        scrollTop: chat[0].scrollHeight,
    }, 1000);

    const r = new RegExp(this.username, 'i');

    if (data.who && r.test(data.msg)) {
        if (this.sendChatNotify) {
            this.sendNotify(`${data.who} mentioned you in chat`, 'chat');
        }

        if (this.sendChatSound) {
            this.playSound('chat');
        }
    }
};

HanabiLobby.prototype.addHistory = function addHistory(data) {
    this.historyList[data.id] = {
        id: data.id,
        numPlayers: data.numPlayers,
        score: data.score,
        variant: data.variant,
        numSimilar: data.numSimilar,
    };
};

HanabiLobby.prototype.makeReplayButton = function makeReplayButton(id, text, msgType, returnsToLobby) {
    const self = this;
    const button = $('<button>').text(text).attr('type', 'button');
    button.addClass('history-table');
    button.addClass('enter-history-game');
    button.attr('id', `replay-${id}`);

    button.on('click', function startReplayClick(event) {
        event.preventDefault();

        self.gameID = id;

        self.sendMsg({
            type: msgType,
            resp: {
                gameID: self.gameID,
            },
        });

        if (returnsToLobby) {
            $('#game-history-details').hide();
            $('#game-history').hide();
            $('#table-area').show();
        }
    });

    return button;
};

HanabiLobby.prototype.drawHistory = function drawHistory() {
    const self = this;

    const div = $('#history-list');

    div.html('');

    const ids = Object.keys(this.historyList);
    ids.sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10),
    );
    ids.reverse();

    for (let i = 0; i < ids.length; i++) {
        const gameData = this.historyList[ids[i]];
        const maxScore = constants.VARIANT_INTEGER_MAPPING[gameData.variant].maxScore;
        const history = $('<li>').addClass('table-item');

        const attrs = $('<ul>')
            .append($('<li>')
                .text(`#${ids[i]}`)
                .addClass('table-attr history-id'))
            .append($('<li>')
                .text(`${gameData.numPlayers} players`)
                .addClass('table-attr history-players'))
            .append($('<li>')
                .text(`${gameData.score}/${maxScore} points`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(`Variant: ${variantNames[gameData.variant]}`)
                .addClass('table-attr history-variant'))
            .append($('<li>')
                .text(`Other scores: ${gameData.numSimilar - 1}`)
                .addClass('table-attr history-others'));

        const button = $('<button>').text('Compare Scores').attr('type', 'button');
        button.addClass('history-table');
        button.attr('id', `history-details-${ids[i]}`);

        button.on('click', function buttonClick(event) {
            event.preventDefault();

            self.gameID = parseInt(this.id.slice(16), 10);

            self.sendMsg({
                type: 'historyDetails',
                resp: {
                    gameID: self.gameID,
                },
            });

            self.showHistoryDetails();
        });

        attrs
            .append($('<li>')
                .append(button)
                .addClass('table-attr'))
            .append($('<li>')
                .append(this.makeReplayButton(ids[i], 'Watch Replay', 'startReplay', false))
                .addClass('table-attr'))
            .append($('<li>')
                .append(this.makeReplayButton(ids[i], 'Share Replay', 'createSharedReplay', true))
                .addClass('table-attr'));

        history.append(attrs);

        div.append(history);
    }
};

HanabiLobby.prototype.addHistoryDetail = function addHistoryDetail(data) {
    this.historyDetailList.push({
        id: data.id,
        score: data.score,
        us: data.you,
        ts: data.ts.split('T')[0],
    });
    this.drawHistoryDetails();
};

// This function is called once for each new history element received from the server
// The last message is not marked, so each iteration redraws all historyDetailList items
HanabiLobby.prototype.drawHistoryDetails = function drawHistoryDetails() {
    const self = this;

    const div = $('#history-details-list');

    if (!this.historyDetailList.length) {
        div.html('<li>Loading...</li>');
        return;
    }

    div.html('');

    // The game played by the user will also include its variant
    const variant = this.historyDetailList
        .filter(g => g.id in this.historyList)
        .map(g => this.historyList[g.id].variant)
        .map(v => constants.VARIANT_INTEGER_MAPPING[v])[0];

    // The game played by the user might not have been sent by the server yet
    if (variant === undefined) {
        // If not, the variant is not known yet, so defer drawing
        return;
    }

    for (let i = 0; i < this.historyDetailList.length; i++) {
        const detail = $('<li>').addClass('table-item');
        const attrs = $('<ul>');

        if (this.historyDetailList[i].us) {
            attrs.addClass('detail-us');
        }

        attrs
            .append($('<li>')
                .text(`#${this.historyDetailList[i].id}`)
                .addClass('table-attr history-id'))
            .append($('<li>')
                .text(`${this.historyDetailList[i].score}/${variant.maxScore} points`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(this.historyDetailList[i].ts)
                .addClass('table-attr history-ts'));

        const button = this.makeReplayButton(this.historyDetailList[i].id, 'Watch Replay', 'startReplay', false);

        attrs.append($('<li>').append(button).addClass('table-attr'));

        const button2 = this.makeReplayButton(this.historyDetailList[i].id, 'Share Replay', 'createSharedReplay', true);

        attrs.append($('<li>').append(button2).addClass('table-attr'));

        detail.append(attrs);

        div.append(detail);
    }
};

HanabiLobby.prototype.tableJoined = function tableJoined(data) {
    this.drawTables();

    $('#table-area').hide();
    $('#joined-table').show();

    this.showJoined();

    this.gameID = data.gameID;
};

HanabiLobby.prototype.tableLeft = function tableLeft(data) {
    this.drawTables();

    $('#table-area').show();
    $('#joined-table').hide();
};

HanabiLobby.prototype.setGame = function setGame(data) {
    this.game.name = data.name;
    this.game.numPlayers = data.numPlayers;
    this.game.variant = data.variant;
    this.game.running = data.running;
    this.game.timed = data.timed;
    this.game.reorderCards = data.reorderCards;
    this.game.sharedReplay = data.sharedReplay;

    this.game.players.length = this.game.numPlayers;

    this.showJoined();
};

HanabiLobby.prototype.setGamePlayer = function setGamePlayer(data) {
    this.game.players[data.index] = {
        name: data.name,
        numPlayed: data.numPlayed,
        averageScore: data.averageScore,
        strikeoutRate: data.strikeoutRate,
        present: data.present,
    };

    if (data.you) {
        this.game.ourIndex = data.index;
    }

    this.showJoined();
};

HanabiLobby.prototype.showJoined = function showJoined() {
    let html = `<p><b>${$('<a>').text(this.game.name).html()}</b></p>`;
    html += '<p>&nbsp;</p>';
    html += `<p>Variant: <b>${variantNames[this.game.variant]}</p></b>`;
    html += `<p>Timed Game: <b>${(this.game.timed ? 'Yes' : 'No')}</b></p>`;
    html += `<p>Forced Chop Rotation: <b>${(this.game.reorderCards ? 'Yes' : 'No')}</b></p>`;

    $('#joined-desc').html(html);

    for (let i = 0; i < 5; i++) {
        const div = $(`#show-player-${(i + 1).toString()}`);

        if (!this.game.players[i]) {
            div.html('');
            continue;
        }

        html = `<div class="player-name">${this.game.players[i].name}</div>`;

        html += '<div class="player-details">';

        html += '<p></p>';

        html += '<table>';

        html += '<tr>';
        html += '<td>Total games:</td>';
        html += `<td><b>${this.game.players[i].numPlayed}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>Avg. score:</td>';
        let averageScore = this.game.players[i].averageScore;
        averageScore = Math.round(averageScore * 100) / 100; // Round it to 2 decimal places
        html += `<td><b>${averageScore}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>Strikeout:</td>';
        let strikeoutRate = this.game.players[i].strikeoutRate * 100; // Turn it into a percent
        strikeoutRate = Math.round(strikeoutRate * 100) / 100; // Round it to 2 decimal places
        html += `<td><b>${strikeoutRate}%</b></td>`;
        html += '</tr>';

        html += '</table>';

        if (!this.game.players[i].present) {
            html += '<p></p><div><b>AWAY</b></div>';
        }

        div.html(html);
    }
};

HanabiLobby.prototype.setTableReady = (data) => {
    if (data.ready) {
        $('#start-game').removeAttr('disabled');
    } else {
        $('#start-game').attr('disabled', 'disabled');
    }
};

HanabiLobby.prototype.gameStarted = function gameStarted(data) {
    if (!data.replay) {
        $('#joined-table').hide();
        $('#table-area').show();
    }

    this.hidePregame();
    this.showGame();

    this.beenInAtLeast1Game = true;
    this.ui = new HanabiUI(this, this.gameID);

    this.ui.setBackend(this.conn);
};

HanabiLobby.prototype.resizeCanvas = function resizeCanvas() {
    this.ui.destroy();
    this.ui = new HanabiUI(this, this.gameID);
    this.ui.setBackend(this.conn);
};

HanabiLobby.prototype.gameEnded = function gameEnded(data) {
    this.ui.destroy();

    this.hideGame();
    this.showPregame();

    this.ui = null;
};

HanabiLobby.prototype.listenConn = function listConn(conn) {
    const self = this;

    conn.on('message', (msg) => {
        const msgType = msg.type;
        const msgData = msg.resp;

        if (showDebugMessages) {
            console.log(`%cRecieved ${msgType}:`, 'color: blue;');
            console.log(msgData);
        }

        if (msgType === 'hello') {
            self.username = msgData.username;
            self.hideLogin();
            self.resetLobby();
            self.showLobby();
        } else if (msgType === 'denied') {
            self.loginFailed(msgData.reason);
        } else if (msgType === 'error') {
            alert(`Error: ${msgData.error}`);
        } else if (msgType === 'user') {
            self.addUser(msgData);
        } else if (msgType === 'userLeft') {
            self.removeUser(msgData);
        } else if (msgType === 'table') {
            self.addTable(msgData);
        } else if (msgType === 'tableGone') {
            self.removeTable(msgData);
        } else if (msgType === 'chat') {
            self.addChat(msgData);
        } else if (msgType === 'joined') {
            self.tableJoined(msgData);
        } else if (msgType === 'left') {
            self.tableLeft(msgData);
        } else if (msgType === 'game') {
            self.setGame(msgData);
        } else if (msgType === 'gamePlayer') {
            self.setGamePlayer(msgData);
        } else if (msgType === 'tableReady') {
            self.setTableReady(msgData);
        } else if (msgType === 'gameStart') {
            self.gameStarted(msgData);
        } else if (msgType === 'gameHistory') {
            self.addHistory(msgData);
        } else if (msgType === 'historyDetail') {
            self.addHistoryDetail(msgData);
        } else if (msgType === 'gameError') {
            alert('Server error');
            self.gameEnded(msgData);
        } else if (msgType === 'sound') {
            if (self.sendTurnSound) {
                self.playSound(msgData.file);
            }
        } else if (msgType === 'name') {
            self.randomName = msgData.name;
        } else if (self.ui) {
            self.ui.handleMessage(msg);
        }
    });
};

HanabiLobby.prototype.setConn = function setConn(conn) {
    const self = this;

    this.conn = conn;

    this.listenConn(conn);

    conn.on('connecting', () => {
        console.log('Attempting to connect.');
    });

    conn.on('connect_failed', () => {
        alert('Failed to connect to server');
    });

    conn.on('reconnect_failed', () => {
        alert('Lost connection to server, could not reconnect');
    });

    conn.on('error', (err) => {
        console.error('SocketIO error:', err);
    });

    conn.on('disconnect', () => {
        self.hideLobby();
        self.hideGame();
        self.hideCreateDialog();
        self.showPregame();
        self.resetLogin();
        self.showLogin();
    });

    this.username = getCookie('hanabiuser');
    this.pass = getCookie('hanabipass');

    const qs = ((a) => {
        if (a === '') {
            return {};
        }
        const b = {};
        for (let i = 0; i < a.length; ++i) {
            const p = a[i].split('=');
            if (p.length !== 2) {
                continue;
            }
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, ' '));
        }
        return b;
    })(window.location.search.substr(1).split('&'));

    if (qs.user) {
        this.username = qs.user;
    }

    if (this.username) {
        $('#user').val(this.username);
    }

    const readyLogin = () => {
        if (!document.hidden) {
            self.sendLogin();
            document.removeEventListener('visibilitychange', readyLogin, false);
        }
    };

    if (this.username && this.pass) {
        if (!document.hidden) {
            this.sendLogin();
        } else {
            document.addEventListener('visibilitychange', readyLogin, false);
        }
    }

    conn.on('reconnect', () => {
        console.log('Attempting to reconnect...');
        if (self.username && self.pass) {
            self.sendLogin();
        }
    });

    window.onerror = (message, url, lineno, colno, error) => {
        try {
            conn.emit('clienterror', {
                message,
                url,
                lineno,
                colno,
                stack: error.stack,
                modified: true,
            });
        } catch (err) {
            console.error('Recieved error:', err);
        }
    };
};

HanabiLobby.prototype.sendMsg = function sendMsg(msg) {
    if (showDebugMessages) {
        console.log(`%cSent ${msg.type}:`, 'color: green;');
        console.log(msg.resp);
    }
    this.conn.emit('message', msg);
};

HanabiLobby.prototype.loadSettings = function loadSettings() {
    const self = this;

    // Element 0 is the HTML ID
    // Element 1 is the cookie key
    const settingsList = [
        [
            'send-turn-notification',
            'sendTurnNotify',
        ],
        [
            'send-turn-sound',
            'sendTurnSound',
        ],
        [
            'send-chat-notification',
            'sendChatNotify',
        ],
        [
            'send-chat-sound',
            'sendChatSound',
        ],
        [
            'show-colorblind-ui',
            'showColorblindUI',
        ],
    ];

    for (let i = 0; i < settingsList.length; i++) {
        const htmlID = settingsList[i][0];
        const cookieKey = settingsList[i][1];

        // Get this setting from local storage
        let cookieValue = localStorage.getItem(cookieKey);

        if (typeof cookieValue === 'undefined' || typeof cookieValue !== 'string') {
            // If the cookie doesn't exist (or it is corrupt), write a default value
            cookieValue = this[cookieKey];
            localStorage.setItem(cookieKey, cookieValue);
            console.log(`Wrote a brand new "${cookieKey}" cookie of: ${cookieValue}`);
        } else {
            // Convert it from a string to a boolean
            // (all values in cookies are strings)
            cookieValue = (cookieValue === 'true');

            // Write the value of the cookie to our local variable
            this[cookieKey] = cookieValue;
        }
        $(`#${htmlID}`).attr('checked', cookieValue);

        $(`#${htmlID}`).change(function changeSettingsList() {
            // Find the local variable name that is associated with this HTML ID
            for (let j = 0; j < settingsList.length; j++) {
                const thisHtmlID = settingsList[j][0];
                const thisCookieKey = settingsList[j][1];
                if (thisHtmlID === $(this).attr('id')) {
                    const checked = $(this).is(':checked');

                    // Write the new value to our local variable
                    self[thisCookieKey] = checked;

                    // Also store the new value in localstorage
                    localStorage.setItem(thisCookieKey, checked);

                    console.log(`Wrote a "${thisCookieKey}" cookie of: ${checked}`);
                    break;
                }
            }

            if (self.sendTurnNotify || self.sendChatNotify) {
                self.testNotifications();
            }
        });
    }
};

HanabiLobby.prototype.testNotifications = () => {
    if (!('Notification' in window)) {
        return;
    }

    if (Notification.permission !== 'default') {
        return;
    }

    Notification.requestPermission();
};

HanabiLobby.prototype.sendNotify = (msg, tag) => {
    if (!('Notification' in window)) {
        return;
    }

    if (Notification.permission !== 'granted') {
        return;
    }

    Notification(`Hanabi: ${msg}`, {
        tag,
    });
};

HanabiLobby.prototype.playSound = (file) => {
    const audio = new Audio(`public/sounds/${file}.mp3`);
    audio.play();
};

function getCookie(name) {
    if (document.cookie === undefined) {
        return '';
    }

    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        let x = cookies[i].substr(0, cookies[i].indexOf('='));
        x = x.replace(/^\s+|\s+$/g, '');
        const y = cookies[i].substr(cookies[i].indexOf('=') + 1);
        if (x === name) {
            return decodeURIComponent(y);
        }
    }

    return '';
}

function setCookie(name, val) {
    if (document.cookie === undefined) {
        return;
    }
    const expire = new Date();
    expire.setDate(expire.getDate() + 365);
    const cookie = `${encodeURIComponent(val)}; expires=${expire.toUTCString()}`;
    document.cookie = `${name}=${cookie}`;
}

function deleteCookie(name) {
    if (document.cookie === undefined) {
        return;
    }
    const expire = new Date();
    expire.setDate(expire.getDate() - 1);
    const cookie = `; expires=${expire.toUTCString()}`;
    document.cookie = `${name}=${cookie}`;
}

setCookie('test', 'poop');
