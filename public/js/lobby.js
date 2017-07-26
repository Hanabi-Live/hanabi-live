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
    this.sendTurnNotify = false;
    this.sendTurnSound = false;
    this.sendChatNotify = false;
    this.sendChatSound = false;
    this.showColorblindUI = false;

    this.game = {
        name: '',
        numPlayers: 0,
        maxPlayers: 0,
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
            self.send_msg({
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
        const maxPlayers = parseInt($('#create-game-players').val(), 10);
        const variant = parseInt($('#create-game-variant').val(), 10);
        const allowSpec = document.getElementById('create-game-allow-spec').checked;
        const timed = document.getElementById('create-game-timed').checked;
        const reorderCards = document.getElementById('create-game-reorder-cards').checked;

        localStorage.setItem('createTableMaxPlayers', maxPlayers);
        localStorage.setItem('createTableVariant', variant);
        localStorage.setItem('createTableAllowSpec', allowSpec);
        localStorage.setItem('createTableTimed', timed);
        localStorage.setItem('createTableReorderCards', reorderCards);

        event.preventDefault();

        self.send_msg({
            type: 'create_table',
            resp: {
                name: gameName,
                max: maxPlayers,
                variant,
                allow_spec: allowSpec,
                timed,
                reorder_cards: reorderCards,
            },
        });

        self.hideCreateDialog();
    });

    $('#show-resources').on('click', (event) => {
        self.show_resources();
    });

    $('#close-resources').on('click', (event) => {
        self.hide_resources();
    });

    $('#show-settings').on('click', (event) => {
        self.show_settings();
    });

    $('#close-settings').on('click', (event) => {
        self.hide_settings();
    });

    $('#create-game-cancel').on('click', (event) => {
        event.preventDefault();

        self.hideCreateDialog();
    });

    $('#start-game').on('click', (event) => {
        event.preventDefault();

        self.send_msg({
            type: 'start_game',
            resp: {},
        });
    });

    $('#leave-game').on('click', (event) => {
        event.preventDefault();

        self.send_msg({
            type: 'leave_table',
            resp: {},
        });
    });

    $('#unattend-table').on('click', (event) => {
        event.preventDefault();

        $('#joined-table').hide();
        $('#table-area').show();

        self.send_msg({
            type: 'unattend_table',
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

    this.send_msg({
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

HanabiLobby.prototype.reset_login = () => {
    $('#login-container').show();
    $('#connecting').hide();

    $('#login-result').html('');
};

HanabiLobby.prototype.showLogin = () => {
    $('#login').show();
};

HanabiLobby.prototype.hide_login = () => {
    $('#login').hide();
};

HanabiLobby.prototype.show_lobby = () => {
    $('#lobby').fadeIn(fadeTime);
};

HanabiLobby.prototype.hideLobby = () => {
    $('#lobby').hide();
};

HanabiLobby.prototype.showCreateDialog = function showCreateDialog() {
    $('#create-table-dialog').fadeIn(fadeTime);

    $('#create-game-name').val(this.randomName);

    // Get a new random name from the server for the next time we click the button
    this.send_msg({
        type: 'get_name',
    });

    let players = JSON.parse(localStorage.getItem('createTableMaxPlayers'));
    if (typeof players !== 'number' || players < 2 || players > 5) {
        players = 5;
    }
    $('#create-game-players').val(players);

    let variant = JSON.parse(localStorage.getItem('createTableVariant'));
    if (typeof variant !== 'number' || variant < 0 || variant > 5) {
        variant = 0;
    }
    $('#create-game-variant').val(variant);

    const allowSpec = JSON.parse(localStorage.getItem('createTableAllowSpec'));
    $('#create-game-allow-spec').prop('checked', allowSpec);

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

HanabiLobby.prototype.show_resources = () => {
    $('#resources-dialog').fadeIn(fadeTime);
};

HanabiLobby.prototype.hide_resources = () => {
    $('#resources-dialog').fadeOut(fadeTime);
};

HanabiLobby.prototype.show_settings = () => {
    $('#settings-dialog').fadeIn(fadeTime);
};

HanabiLobby.prototype.hide_settings = () => {
    $('#settings-dialog').fadeOut(fadeTime);
};

HanabiLobby.prototype.show_history_details = () => {
    $('#game-history').hide();
    $('#game-history-details').show();

    this.historyDetailList = [];
    this.drawHistory_details();
};

HanabiLobby.prototype.show_pregame = () => {
    $('#pregame').fadeIn(fadeTime);
};

HanabiLobby.prototype.hide_pregame = () => {
    $('#pregame').hide();
};

HanabiLobby.prototype.show_game = () => {
    $('#game').fadeIn(fadeTime);
};

HanabiLobby.prototype.hide_game = () => {
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
                .text(this.userList[userID].name)
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
        numPlayers: data.num_players,
        maxPlayers: data.max_players,
        variant: data.variant,
        joined: data.joined,
        allowSpec: data.allowSpec,
        running: data.running,
        our_turn: data.our_turn,
        owned: data.owned,
        shared_replay: data.shared_replay,
    };
    this.drawTables();
};

HanabiLobby.prototype.removeTable = function removeTable(data) {
    delete this.tableList[data.id];
    this.drawTables();
};

const variantNames = [
    'None',
    'Black Suit',
    'Black Suit (one of each rank)',
    'Multi-color Suit',
    'Mixed-color Suits',
    'Mixed and Multi-color Suits',
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
                .addClass('table-attr table-name'));

        let playerText = `${this.tableList[gameID].numPlayers}/`;
        playerText += (this.tableList[gameID].shared_replay ? '∞' : this.tableList[gameID].maxPlayers);
        attrs
            .append($('<li>')
                .text(playerText)
                .addClass('table-attr table-players'))
            .append($('<li>')
                .text(`Variant: ${variantNames[this.tableList[gameID].variant]}`)
                .addClass('table-attr table-variant'));

        let status = 'Not Started';
        if (this.tableList[gameID].running && !this.tableList[gameID].joined) {
            status = 'Running';
        } else if (this.tableList[gameID].running) {
            if (this.tableList[gameID].our_turn) {
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
            this.tableList[gameID].allowSpec &&
            this.tableList[gameID].running
        ) {
            button = $('<button>').text('Spectate').attr('type', 'button');
            button.attr('id', `spectate-${gameID}`);

            button.on('click', (event) => {
                event.preventDefault();

                const id = parseInt(this.id.slice(9), 10);
                self.gameID = id;
                self.send_msg({
                    type: 'spectate_table',
                    resp: {
                        table_id: id,
                    },
                });

                self.drawTables();
            });
        } else if (!this.tableList[gameID].joined) {
            button = $('<button>').text('Join').attr('type', 'button');
            button.attr('id', `join-${gameID}`);

            if (this.tableList[gameID].numPlayers >= this.tableList[gameID].maxPlayers) {
                button.attr('disabled', 'disabled');
            }

            button.on('click', (event) => {
                event.preventDefault();

                self.gameID = parseInt(this.id.slice(5), 10);

                self.send_msg({
                    type: 'join_table',
                    resp: {
                        table_id: self.gameID,
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

                self.send_msg({
                    type: 'reattend_table',
                    resp: {
                        table_id: self.gameID,
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

            button.on('click', (event) => {
                event.preventDefault();

                const id = parseInt(this.id.slice(8), 10);
                if (self.tableList[id].running) {
                    if (!confirm('Really abandon game?  This will cancel the game for all players.')) {
                        return;
                    }
                }

                self.gameID = null;
                self.send_msg({
                    type: 'abandon_table',
                    resp: {
                        table_id: id,
                    },
                });
            });

            attrs.append($('<li>').append(button).addClass('table-attr table-abandon'));
        }

        table.append(attrs);
        div.append(table);
    }
};

HanabiLobby.prototype.add_chat = function addChat(data) {
    const chat = $('#chat');

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
        numPlayers: data.num_players,
        score: data.score,
        variant: data.variant,
        num_scores: data.num_similar,
    };
};

HanabiLobby.prototype.drawHistory = function drawHistory() {
    const self = this;

    const div = $('#history-list');
    let history;
    let i;

    div.html('');

    const ids = Object.keys(this.historyList);
    ids.sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10),
    );
    ids.reverse();

    for (i = 0; i < ids.length; i++) {
        history = $('<li>').addClass('table-item');

        const attrs = $('<ul>')
            .append($('<li>')
                .text(`#${ids[i]}`)
                .addClass('table-attr history-id'))
            .append($('<li>')
                .text(`${this.historyList[ids[i]].numPlayers} players`)
                .addClass('table-attr history-players'));

        const score = this.historyList[ids[i]].score;
        const maxScore = (this.historyList[ids[i]].variant ? 30 : 25);
        attrs
            .append($('<li>')
                .text(`${score}/${maxScore} points`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(`Variant: ${variantNames[this.historyList[ids[i]].variant]}`)
                .addClass('table-attr history-variant'))
            .append($('<li>')
                .text(`Other scores: ${this.historyList[ids[i]].num_scores - 1}`)
                .addClass('table-attr history-others'));

        const button = $('<button>').text('Compare Scores').attr('type', 'button');
        button.attr('id', `history-details-${ids[i]}`);

        button.on('click', (event) => {
            event.preventDefault();

            self.gameID = parseInt(this.id.slice(16), 10);

            self.send_msg({
                type: 'history_details',
                resp: {
                    id: self.gameID,
                },
            });

            self.show_history_details();
        });

        attrs
            .append($('<li>')
            .append(button)
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
    this.drawHistory_details();
};

HanabiLobby.prototype.drawHistory_details = function drawHistoryDetails() {
    const self = this;

    const div = $('#history-details-list');

    if (!this.historyDetailList.length) {
        div.html('<li>Loading...</li>');
        return;
    }

    div.html('');

    let variant = 0;
    for (let i = 0; i < this.historyDetailList.length; i++) {
        if (this.historyList[this.historyDetailList[i].id]) {
            variant = this.historyList[this.historyDetailList[i].id].variant;
        }
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
                .text(`${this.historyDetailList[i].score}/${(variant ? 30 : 25)} points`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(this.historyDetailList[i].ts)
                .addClass('table-attr history-ts'));

        const button = $('<button>').text('Watch Replay').attr('type', 'button');
        button.attr('id', `replay-${this.historyDetailList[i].id}`);

        button.on('click', function startReplayClick(event) {
            event.preventDefault();

            self.gameID = parseInt(this.id.slice(7), 10);

            self.send_msg({
                type: 'start_replay',
                resp: {
                    id: self.gameID,
                },
            });
        });

        attrs.append($('<li>').append(button).addClass('table-attr'));

        const button2 = $('<button>').text('Share Replay').attr('type', 'button');
        button2.attr('id', `replay-${this.historyDetailList[i].id}`);

        button2.on('click', function createSharedReplayClick(event) {
            event.preventDefault();

            self.gameID = parseInt(this.id.slice(7), 10);

            self.send_msg({
                type: 'create_shared_replay',
                resp: {
                    id: self.gameID,
                },
            });

            // Click the "Return to Tables" button
            $('#game-history-details').hide();
            $('#game-history').hide();
            $('#table-area').show();
        });

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

    this.gameID = data.table_id;
};

HanabiLobby.prototype.tableLeft = function tableLeft(data) {
    this.drawTables();

    $('#table-area').show();
    $('#joined-table').hide();
};

HanabiLobby.prototype.setGame = function setGame(data) {
    this.game.name = data.name;
    this.game.numPlayers = data.num_players;
    this.game.maxPlayers = data.max_players;
    this.game.variant = data.variant;
    this.game.running = data.running;
    this.game.allowSpec = data.allowSpec;
    this.game.timed = data.timed;
    this.reorderCards = data.reorderCards;
    this.game.shared_replay = data.shared_replay;

    this.game.players.length = this.game.numPlayers;

    this.showJoined();
};

HanabiLobby.prototype.setGamePlayer = function setGamePlayer(data) {
    this.game.players[data.index] = {
        name: data.name,
        num_played: data.num_played,
        averageScore: data.average_score,
        strikeoutRate: data.strikeout_rate,
        present: data.present,
    };

    if (data.you) {
        this.game.ourIndex = data.index;
    }

    this.showJoined();
};

HanabiLobby.prototype.showJoined = function showJoined() {
    let html = `<p><b>${$('<a>').text(this.game.name).html()}</b></p>`;

    html += `<p>Players: <b>${this.game.numPlayers}</b>/<b>${this.game.maxPlayers}</b></p>`;
    html += `<p>Variant: <b>${variantNames[this.game.variant]}</p></b>`;
    html += `<p>Allow Spectators: <b>${(this.game.allowSpec ? 'Yes' : 'No')}</b></p>`;
    html += `<p>Timed Game: <b>${(this.game.timed ? 'Yes' : 'No')}</b></p>`;
    html += `<p>Reorder Cards: <b>${(this.game.reorderCards ? 'Yes' : 'No')}</b></p>`;

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
        html += `<td><b>${this.game.players[i].num_played}</b></td>`;
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

    this.hide_pregame();
    this.show_game();

    this.ui = new HanabiUI(this, this.gameID);

    this.ui.set_backend(this.conn);
};

HanabiLobby.prototype.gameEnded = function gameEnded(data) {
    this.ui.destroy();

    this.hide_game();
    this.show_pregame();

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
            self.hide_login();
            self.resetLobby();
            self.show_lobby();
        } else if (msgType === 'denied') {
            self.loginFailed(msgData.reason);
        } else if (msgType === 'error') {
            alert(`Error: ${msgData.error}`);
        } else if (msgType === 'user') {
            self.addUser(msgData);
        } else if (msgType === 'user_left') {
            self.removeUser(msgData);
        } else if (msgType === 'table') {
            self.addTable(msgData);
        } else if (msgType === 'table_gone') {
            self.removeTable(msgData);
        } else if (msgType === 'chat') {
            self.add_chat(msgData);
        } else if (msgType === 'joined') {
            self.tableJoined(msgData);
        } else if (msgType === 'left') {
            self.tableLeft(msgData);
        } else if (msgType === 'game') {
            self.setGame(msgData);
        } else if (msgType === 'game_player') {
            self.setGamePlayer(msgData);
        } else if (msgType === 'table_ready') {
            self.setTableReady(msgData);
        } else if (msgType === 'game_start') {
            self.gameStarted(msgData);
        } else if (msgType === 'game_history') {
            self.addHistory(msgData);
        } else if (msgType === 'history_detail') {
            self.addHistoryDetail(msgData);
        } else if (msgType === 'game_error') {
            alert('Server error');
            self.gameEnded(msgData);
        } else if (msgType === 'sound') {
            if (self.sendTurnSound) {
                self.playSound(msgData.file);
            }
        } else if (msgType === 'name') {
            self.randomName = msgData.name;
        } else if (self.ui) {
            self.ui.handle_message(msg);
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
        console.err('SocketIO error:', err);
    });

    conn.on('disconnect', () => {
        self.hideLobby();
        self.hide_game();
        self.hideCreateDialog();
        self.show_pregame();
        self.reset_login();
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
        console.log('attempting to reconnect');
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
            console.err('Recieved error:', err);
        }
    };
};

HanabiLobby.prototype.send_msg = function sendMsg(msg) {
    if (showDebugMessages) {
        console.log(`%cSent ${msg.type}:`, 'color: green;');
        console.log(msg.resp);
    }
    this.conn.emit('message', msg);
};

HanabiLobby.prototype.loadSettings = function loadSettings() {
    const self = this;
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
        let val = localStorage[settingsList[i][1]];
        if (val !== undefined) {
            val = (val === 'true');
            $(`#${settingsList[i][0]}`).attr('checked', val);
            this[settingsList[i][1]] = val;
        }

        $(`#${settingsList[i][0]}`).change(function changeSettingsList() {
            const name = $(this).attr('id');
            for (let j = 0; i < settingsList.length; i++) {
                if (settingsList[j][0] === name) {
                    self[settingsList[j][1]] = $(this).is(':checked');
                    localStorage[settingsList[j][1]] = $(this).is(':checked');
                }
            }

            if (self.sendTurnNotify || self.sendChatNotify) {
                self.test_notifications();
            }
        });
    }
};

HanabiLobby.prototype.test_notifications = () => {
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
