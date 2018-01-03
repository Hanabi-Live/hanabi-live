const showDebugMessages = true;
const fadeTime = 200; // Vanilla Keldon is 800

$(document).ready(() => {
    // Initialize the lobby code
    window.lobby = new HanabiLobby();
});

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
    this.sendTimerSound = true;
    this.sendChatNotify = false;
    this.sendChatSound = false;
    this.showColorblindUI = false;
    this.hideTimerInUntimed = false;

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

    // Handle logging in from the home page
    $('#login-form').submit((event) => {
        // By default, the form will reload the page, so stop this from happening
        event.preventDefault();

        const user = $('#login-username').val();
        const pass = $('#login-password').val();

        if (!user) {
            self.loginFormError('You must provide a username.');
            return;
        }

        if (!pass) {
            self.loginFormError('You must provide a password.');
            return;
        }

        const hash = hex_sha256(`Hanabi password ${pass}`);

        setCookie('hanabiuser', user);
        setCookie('hanabipass', hash);

        self.username = user;
        self.pass = hash;

        self.sendLogin();
    });

    // Handle chatting in the lobby once logged in
    const input = $('#chat-input');
    input.on('keypress', (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        if (!input.val()) {
            return;
        }

        // Clear the chat box
        const msg = input.val();
        input.val('');

        // Check for special commands
        if (msg === '/debug') {
            self.connSend({
                type: 'debug',
                resp: {},
            });
            return;
        }

        // It is a normal chat message
        self.connSend({
            type: 'chat',
            resp: {
                msg,
            },
        });
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
        const baseTimeMinutes = $('#base-time-minutes').val();
        const timePerTurnSeconds = $('#time-per-turn-seconds').val();
        const reorderCards = document.getElementById('create-game-reorder-cards').checked;

        localStorage.setItem('createTableVariant', variant);
        localStorage.setItem('createTableTimed', timed);
        localStorage.setItem('createTableReorderCards', reorderCards);

        event.preventDefault();

        self.connSend({
            type: 'gameCreate',
            resp: {
                name: gameName,
                variant,
                timed,
                baseTimeMinutes: parseFloat(baseTimeMinutes), // The server expects this as an float64
                timePerTurnSeconds: parseInt(timePerTurnSeconds, 10), // The server expects this as an integer
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

        self.connSend({
            type: 'gameStart',
            resp: {},
        });
    });

    $('#leave-game').on('click', (event) => {
        event.preventDefault();

        self.connSend({
            type: 'gameLeave',
            resp: {},
        });
    });

    $('#unattend-table').on('click', (event) => {
        event.preventDefault();

        $('#joined-table').hide();
        $('#table-area').show();

        self.connSend({
            type: 'gameUnattend',
            resp: {},
        });
    });

    $('#show-history').on('click', (event) => {
        event.preventDefault();

        $('#table-area').hide();
        $('#game-history').show();

        self.drawHistory();
    });

    // "Log Out" button
    $('#logout').on('click', (event) => {
        deleteCookie('hanabiuser');
        deleteCookie('hanabipass');
        window.location.reload();
    });

    // Watch/Share Replay by ID buttons
    $('.custom-replay-start').on('click', (event) => {
        const replayID = window.prompt('What is the ID of the game you want?');
        if (replayID === null) {
            // The user clicked the "cancel" button, so do nothing else
            return;
        }

        self.connSend({
            type: event.currentTarget.getAttribute('data-replayType'),
            resp: {
                gameID: replayID,
            },
        });
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

    $(document).ready(() => {
        self.preloadSounds();
        self.automaticallyLogin();
    });
}

HanabiLobby.prototype.preloadSounds = function preloadSounds() {
    // Preload some sounds by playing them at 0 volume
    if (!this.sendTurnSound) {
        return;
    }

    const soundFiles = ['blind', 'fail', 'tone', 'turn_other', 'turn_us'];
    for (const file of soundFiles) {
        const audio = new Audio(`public/sounds/${file}.mp3`);
        audio.volume = 0;
        audio.play();
    }
};

HanabiLobby.prototype.automaticallyLogin = function automaticallyLogin() {
    // Automatically sign in to the WebSocket server if we have cached credentials
    this.username = getCookie('hanabiuser');
    this.pass = getCookie('hanabipass');
    if (this.username) {
        $('#login-username').val(this.username);
        $('#login-password').focus();
    }

    if (!this.username || !this.pass) {
        return;
    }
    console.log('Automatically logging in from cookie credentials.');
    this.sendLogin();
};

HanabiLobby.prototype.resetLobby = function resetLobby() {
    this.userList = {};
    this.tableList = {};
    this.historyList = {};
    this.historyDetailList = [];
    this.drawUsers();
    this.drawTables();
};

HanabiLobby.prototype.sendLogin = function sendLogin() {
    $('#login-button').addClass('disabled');
    $('#login-explanation').hide();
    $('#ajax-gif').show();

    // Send a login request to the server; if successful, we will get a cookie back
    let url = `${window.location.protocol}//${window.location.hostname}`;
    if (window.location.port !== '') {
        url += `:${window.location.port}`;
    }
    url += '/login';
    const postData = {
        username: this.username,
        password: this.pass,
    };
    const request = $.ajax({
        url,
        type: 'POST',
        data: postData,
    });
    console.log(`Sent a login request to: ${url}`);

    request.done((data) => {
        // We successfully got a cookie; attempt to establish a WebSocket connection
        this.connSet();
    });
    request.fail((jqXHR) => {
        this.loginFailed(getAjaxError(jqXHR));
    });
};

HanabiLobby.prototype.loginFailed = function loginFailed(reason) {
    this.loginFormError(`Login failed: ${reason}`);
};

HanabiLobby.prototype.loginFormError = (msg) => {
    // For some reason this has to be invoked asycnronously to work, JavaScript sucks
    setTimeout(() => {
        $('#ajax-gif').hide();
        $('#login-button').removeClass('disabled');

        $('#login-result').html(msg);
        $('#ajax-error').fadeIn(350);
    }, 0);
};

HanabiLobby.prototype.resetLogin = () => {
    $('#login-button').removeClass('disabled');
    $('#ajax-gif').hide();
    $('#login-result').html('');
    $('#ajax-error').hide();
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
    this.connSend({
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
    // The baseTime comes in minutes, so convert it to milliseconds
    data.baseTime *= 1000 * 60;

    // The timePerTurn comes in seconds, so convert it to milliseconds
    data.timePerTurn *= 1000;

    this.tableList[data.id] = data;
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
    'Black Suit (one of each)',
    'Rainbow Suit (all colors)',
    'Dual-color Suits',
    'Dual-color & Rainbow Suits',
    'Colorless & Rainbow Suits',
    'Wild & Crazy',
];
const variantNamesShort = [
    'No Variant',
    'Black',
    'Black (1oE)',
    'Rainbow',
    'Dual-color',
    'Dual & Rainbow',
    'White & Rainbow',
    'Wild & Crazy',
];

$(document).ready(() => {
    for (let i = 0; i < variantNames.length; i++) {
        const option = new Option(variantNames[i], i);
        $('#create-game-variant').append($(option));
    }
});

const timedDescription = 'Timed Game';
const reorderCardsDescription = 'Forced Chop Rotation';

const timerFormatter = function timerFormatter(milliseconds) {
    if (!milliseconds) {
        milliseconds = 0;
    }
    const time = new Date();
    time.setHours(0, 0, 0, milliseconds);
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${secondsFormatted}`;
};

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
                .text(`Variant: ${variantNamesShort[this.tableList[gameID].variant]}`)
                .addClass('table-attr table-variant'));

        const game = this.tableList[gameID];
        const timerRules = `${timerFormatter(game.baseTime)} + ${timerFormatter(game.timePerTurn)}`;
        const optionTexts = {
            reorderCards: {
                symbol: '⤨',
                title: reorderCardsDescription,
            },
            timed: {
                symbol: `⏰ (${timerRules})`,
                title: timedDescription,
            },
        };

        Object.keys(optionTexts).forEach((option) => {
            const elem = $('<li>')
                .text(optionTexts[option].symbol)
                .prop('title', optionTexts[option].title)
                .addClass('table-attr table-icon');
            if (!this.tableList[gameID][option]) {
                elem.css('visibility', 'hidden');
            }
            attrs.append(elem);
        });

        let status = 'Not Started';
        if (this.tableList[gameID].running && !this.tableList[gameID].joined) {
            status = 'Running';
            if (!this.tableList[gameID].sharedReplay) {
                status += ` (${this.tableList[gameID].progress}%)`;
            }
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
                self.connSend({
                    type: 'gameSpectate',
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

                self.connSend({
                    type: 'gameJoin',
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

                self.connSend({
                    type: 'gameReattend',
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
                    if (!window.confirm('Really abandon game? This will cancel the game for all players.')) {
                        return;
                    }
                }

                self.gameID = null;
                self.connSend({
                    type: 'gameAbandon',
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
    if (data.server) {
        line += '<b>[SERVER NOTICE]</b> ';
        line += data.msg;
    } else if (data.who) {
        line += `<i>${new Date().toLocaleTimeString()}</i>&nbsp;&nbsp;`;
        if (data.discord) {
            line += '&lt;<b>D</b>&gt; ';
        }
        line += `<b>${data.who}:</b> `;
        line += `${$('<a>').text(data.msg).html()}`;
    } else {
        line += `<b>${$('<a>').text(data.msg).html()}</b>`;
    }
    line += '<br />';

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
    this.historyList[data.id] = data;
};

HanabiLobby.prototype.makeReplayButton = function makeReplayButton(id, text, msgType, returnsToLobby) {
    const self = this;
    const button = $('<button>').text(text).attr('type', 'button');
    button.addClass('history-table');
    button.addClass('enter-history-game');
    button.attr('id', `replay-${id}`);

    button.on('click', (event) => {
        event.preventDefault();

        self.gameID = id;

        self.connSend({
            type: msgType,
            resp: {
                gameID: parseInt(self.gameID, 10), // The server expects this as an integer
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

HanabiLobby.prototype.makeHistoryDetailsButton = function makeHistoryDetailsButton(id, gameCount) {
    const self = this;
    const button = $('<button>')
        .text(`Other scores: ${gameCount - 1}`)
        .attr('type', 'button');
    button.addClass('history-table');
    button.addClass('history-others');
    button.attr('id', `history-details-${id}`);

    button.on('click', (event) => {
        event.preventDefault();

        self.gameID = id;

        self.connSend({
            type: 'historyDetails',
            resp: {
                gameID: self.gameID,
            },
        });

        self.showHistoryDetails();
    });

    return button;
};

const dateTimeFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    },
);

HanabiLobby.prototype.drawHistory = function drawHistory() {
    const div = $('#history-list');

    div.html('');

    const ids = Object.keys(this.historyList);
    ids.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    ids.reverse();

    for (let i = 0; i < ids.length; i++) {
        const gameData = this.historyList[ids[i]];
        const { maxScore } = constants.VARIANT_INTEGER_MAPPING[gameData.variant];
        const history = $('<li>').addClass('table-item');

        const attrs = $('<ul>')
            .append($('<li>')
                .text(`#${ids[i]}`)
                .addClass('table-attr history-id'))
            .append($('<li>')
                .text(`${gameData.numPlayers}p`)
                .addClass('table-attr history-players'))
            .append($('<li>')
                .text(`${gameData.score}/${maxScore}`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(`${variantNamesShort[gameData.variant]}`)
                .addClass('table-attr history-variant'))
            .append($('<li>')
                .text(dateTimeFormatter.format(new Date(gameData.datetime)))
                .addClass('table-attr history-ts'))
            .append($('<li>')
                .append(this.makeReplayButton(ids[i], 'Watch Replay', 'replayCreate', false))
                .addClass('table-attr'))
            .append($('<li>')
                .append(this.makeReplayButton(ids[i], 'Share Replay', 'sharedReplayCreate', true))
                .addClass('table-attr'))
            .append($('<li>')
                .append(this.makeHistoryDetailsButton(ids[i], gameData.numSimilar))
                .addClass('table-attr'))
            .append($('<li>')
                .text(gameData.otherPlayerNames)
                .addClass('table-attr table-otherPlayerNames table-otherPlayerNames-compact'));

        history.append(attrs);

        div.append(history);
    }
};

HanabiLobby.prototype.addHistoryDetail = function addHistoryDetail(data) {
    this.historyDetailList.push({
        id: data.id,
        score: data.score,
        us: data.you,
        datetime: data.datetime,
        otherPlayerNames: data.otherPlayerNames,
    });
    this.drawHistoryDetails();
};

// This function is called once for each new history element received from the server
// The last message is not marked, so each iteration redraws all historyDetailList items
HanabiLobby.prototype.drawHistoryDetails = function drawHistoryDetails() {
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
        const gameData = this.historyDetailList[i];
        const detail = $('<li>').addClass('table-item');
        const attrs = $('<ul>');

        if (gameData.us) {
            attrs.addClass('detail-us');
        }

        attrs
            .append($('<li>')
                .text(`#${gameData.id}`)
                .addClass('table-attr history-id'))
            .append($('<li>')
                .text(`${gameData.score}/${variant.maxScore}`)
                .addClass('table-attr history-score'))
            .append($('<li>')
                .text(dateTimeFormatter.format(new Date(gameData.datetime)))
                .addClass('table-attr history-ts'));

        const button = this.makeReplayButton(gameData.id, 'Watch Replay', 'replayCreate', false);

        attrs.append($('<li>').append(button).addClass('table-attr'));

        const button2 = this.makeReplayButton(gameData.id, 'Share Replay', 'sharedReplayCreate', true);

        attrs.append($('<li>').append(button2).addClass('table-attr'));

        attrs
            .append($('<li>')
                .text(gameData.otherPlayerNames)
                .addClass('table-attr table-otherPlayerNames'));

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
    this.game.baseTime = data.baseTime * 1000 * 60; // Convert minutes to milliseconds
    this.game.timePerTurn = data.timePerTurn * 1000; // Convert seconds to milliseconds
    this.game.reorderCards = data.reorderCards;
    this.game.sharedReplay = data.sharedReplay;

    this.game.players.length = this.game.numPlayers;

    this.showJoined();
};

HanabiLobby.prototype.setGamePlayer = function setGamePlayer(data) {
    this.game.players[data.index] = {
        name: data.name,
        present: data.present,
        stats: data.stats,
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

    if (this.game.timed) {
        const timerRules = `${timerFormatter(this.game.baseTime)} + ${timerFormatter(this.game.timePerTurn)}`;
        html += `<p>${timedDescription}: ${timerRules}</p>`;
    }

    if (this.game.reorderCards) {
        html += `<p>${reorderCardsDescription}</p>`;
    }

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

        const {
            numPlayed,
            numPlayedVariant,
            bestScoreVariant3,
            bestScoreVariant4,
            bestScoreVariant5,
        } = this.game.players[i].stats;
        let {
            averageScoreVariant,
            strikeoutRateVariant,
        } = this.game.players[i].stats;
        averageScoreVariant = Math.round(averageScoreVariant * 100) / 100; // Round it to 2 decimal places
        strikeoutRateVariant *= 100; // Turn it into a percent
        strikeoutRateVariant = Math.round(strikeoutRateVariant * 100) / 100; // Round it to 2 decimal places

        html += '<tr>';
        html += '<td>Total games:</td>';
        html += `<td><b>${numPlayed}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>...of this variant:</td>';
        html += `<td><b>${numPlayedVariant}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>Best scores of this variant with</td>';
        html += '</tr>';

        html += '<tr>';
        html += '<td>...three players:</td>';
        html += `<td><b>${bestScoreVariant3}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>...four players:</td>';
        html += `<td><b>${bestScoreVariant4}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>...five players:</td>';
        html += `<td><b>${bestScoreVariant5}</b></td>`;
        html += '</tr>';
        html += '<td>Average score:</td>';
        html += `<td><b>${averageScoreVariant}</b></td>`;
        html += '</tr>';

        html += '<tr>';
        html += '<td>Strikeout rate:</td>';
        html += `<td><b>${strikeoutRateVariant}%</b></td>`;
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

HanabiLobby.prototype.gameEnded = function gameEnded(data) {
    this.ui.destroy();

    this.hideGame();
    this.showPregame();

    this.ui = null;
};

HanabiLobby.prototype.connSet = function connSet(conn) {
    // Connect to the WebSocket server
    let websocketURL = 'ws';
    if (window.location.protocol === 'https:') {
        websocketURL += 's';
    }
    websocketURL += '://';
    websocketURL += window.location.hostname;
    if (window.location.port !== '') {
        websocketURL += ':';
        websocketURL += window.location.port;
    }
    websocketURL += '/ws';
    console.log('Connecting to websocket URL:', websocketURL);
    this.conn = new golem.Connection(websocketURL, true);
    // This will automatically use the cookie that we recieved earlier from the POST
    // If the second argument is true, debugging is turned on

    // Define event handlers
    this.connOpen(this.conn);
    this.connClose(this.conn);
    this.connError(this.conn); // socketError a.k.a. WebSocket.onerror
    this.connCommands(this.conn);
    this.connClientError(this.conn); // window.onerror
};

HanabiLobby.prototype.connOpen = function connOpen(conn) {
    conn.on('open', (event) => {
        // We will show the lobby upon recieving the "hello" command
        console.log('WebSocket connection established.');
    });
};

HanabiLobby.prototype.connClose = function connClose(conn) {
    const self = this;

    conn.on('close', (event) => {
        console.log('WebSocket connection closed.');

        // Go back to the login screen
        self.hideLobby();
        self.hideGame();
        self.hideCreateDialog();
        self.showPregame();
        self.resetLogin();
        self.showLogin();

        // TODO SHOW ERROR MESSAGE AND REFRESH
    });
};

HanabiLobby.prototype.connError = function connError(conn) {
    // "socketError" is defined in "golem.js" as mapping to the WebSocket "onerror" event
    conn.on('socketError', (event) => {
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            this.loginFormError('Failed to connect to the WebSocket server. The server might be down!');
        } else {
            // const error = 'Encountered a WebSocket error. The server might be down!';
            // TODO
        }
    });
};

HanabiLobby.prototype.connSend = function connSend(msg) {
    const command = msg.type;
    let data = msg.resp;
    if (typeof data === 'undefined') {
        data = {};
    }

    if (showDebugMessages) {
        console.log(`%cSent ${command}:`, 'color: green;');
        console.log(data);
    }
    this.conn.emit(command, data);
};

HanabiLobby.prototype.connCommands = function connCommands(conn) {
    const self = this;

    conn.on('hello', (data) => {
        self.username = data.username;
        self.hideLogin();
        self.resetLobby();
        self.showLobby();
    });

    conn.on('user', (data) => {
        self.addUser(data);
    });

    conn.on('userLeft', (data) => {
        self.removeUser(data);
    });

    conn.on('table', (data) => {
        self.addTable(data);
    });

    conn.on('tableGone', (data) => {
        self.removeTable(data);
    });

    conn.on('chat', (data) => {
        self.addChat(data);
    });

    conn.on('joined', (data) => {
        self.tableJoined(data);
    });

    conn.on('left', (data) => {
        self.tableLeft(data);
    });

    conn.on('game', (data) => {
        self.setGame(data);
    });

    conn.on('gamePlayer', (data) => {
        self.setGamePlayer(data);
    });

    conn.on('tableReady', (data) => {
        self.setTableReady(data);
    });

    conn.on('gameStart', (data) => {
        self.gameStarted(data);
    });

    conn.on('gameHistory', (data) => {
        // data will be an array of all of the games that we have previously played
        for (const history of data) {
            self.addHistory(history);
        }
    });

    conn.on('historyDetail', (data) => {
        self.addHistoryDetail(data);
    });

    conn.on('sound', (data) => {
        if (self.sendTurnSound) {
            self.playSound(data.file);
        }
    });

    conn.on('name', (data) => {
        self.randomName = data.name;
    });

    conn.on('message', (data) => {
        if (self.ui) {
            self.ui.handleMessage('message', data);
        }
    });

    conn.on('init', (data) => {
        if (self.ui) {
            self.ui.handleMessage('init', data);
        }
    });

    conn.on('advanced', (data) => {
        if (self.ui) {
            self.ui.handleMessage('advanced', data);
        }
    });

    conn.on('connected', (data) => {
        if (self.ui) {
            self.ui.handleMessage('connected', data);
        }
    });

    conn.on('notifyList', (data) => {
        if (self.ui) {
            // When the server has a bunch of notify actions to send, it will send them all in one array
            for (const action of data) {
                if (action.type === '') {
                    self.ui.handleMessage('message', action);
                } else {
                    self.ui.handleMessage('notify', action);
                }
            }
        }
    });

    conn.on('notify', (data) => {
        if (self.ui) {
            self.ui.handleMessage('notify', data);
        }
    });

    conn.on('action', (data) => {
        if (self.ui) {
            self.ui.handleMessage('action', data);
        }
    });

    conn.on('spectators', (data) => {
        if (self.ui) {
            self.ui.handleMessage('spectators', data);
        }
    });

    conn.on('clock', (data) => {
        if (self.ui) {
            self.ui.handleMessage('clock', data);
        }
    });

    conn.on('note', (data) => {
        if (self.ui) {
            self.ui.handleMessage('note', data);
        }
    });

    conn.on('notes', (data) => {
        if (self.ui) {
            self.ui.handleMessage('notes', data);
        }
    });

    conn.on('replayLeader', (data) => {
        if (self.ui) {
            self.ui.handleMessage('replayLeader', data);
        }
    });

    conn.on('replayTurn', (data) => {
        if (self.ui) {
            self.ui.handleMessage('replayTurn', data);
        }
    });

    conn.on('replayIndicator', (data) => {
        if (self.ui) {
            self.ui.handleMessage('replayIndicator', data);
        }
    });

    conn.on('boot', (data) => {
        if (self.ui) {
            self.ui.handleMessage('boot', data);
        }
    });

    conn.on('error', (data) => {
        alert(`Error: ${data.error}`);
    });
};

HanabiLobby.prototype.connClientError = function connClientError(conn) {
    // Send any client errors to the server for tracking purposes
    window.onerror = (message, url, lineno, colno, error) => {
        // We don't want to report errors if someone is doing local development
        if (window.location.hostname === 'localhost') {
            return;
        }

        try {
            conn.emit('clientError', {
                message,
                url,
                lineno,
                colno,
                stack: error && error.stack,
                modified: true,
            });
        } catch (err) {
            console.error('Failed to transmit the error to the server:', err);
        }
    };
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
            'send-timer-sound',
            'sendTimerSound',
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
        [
            'hide-timer-in-untimed',
            'hideTimerInUntimed',
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

function getAjaxError(jqXHR) {
    if (jqXHR.readyState === 0) {
        return 'A network error occured. The server might be down!';
    } else if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }

    return jqXHR.responseText;
}
