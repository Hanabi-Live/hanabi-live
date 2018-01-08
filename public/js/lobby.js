const showDebugMessages = true;
const fadeTime = 350; // Vanilla Keldon is 800

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

    /*
        Initialize the tooltips
    */

    this.tooltips = [
        'create-game',
        'resources',
        'settings',
    ];

    const tooltipsterOptions = {
        theme: 'tooltipster-shadow',
        trigger: 'click',
        interactive: true,
        delay: 0,
        functionBefore: () => {
            $('#lobby').fadeTo(fadeTime, 0.4);
        },
    };

    const tooltipsterClose = () => {
        // We want to fade in the background as soon as we start the tooltip closing animation,
        // so we have to hook to the "close" event
        // Furthermore, we don't want to fade in the background if we click from one tooltip to the other,
        // so we have to check to see how many tooltips are open
        // If one tooltip is open, then it is the one currently closing
        // If two tooltips are open, then we are clicking from one to the next
        let tooltipsOpen = 0;
        for (const tooltip of self.tooltips) {
            if ($(`#nav-buttons-games-${tooltip}`).tooltipster('status').open) {
                tooltipsOpen += 1;
            }
        }
        if (tooltipsOpen <= 1) {
            $('#lobby').fadeTo(fadeTime, 1);
        }
    };

    // The "close" event will not fire if we initialize this on the tooltip class for some reason, so we initialize all 3 individually
    for (const tooltip of this.tooltips) {
        $(`#nav-buttons-games-${tooltip}`).tooltipster(tooltipsterOptions).tooltipster('instance').on('close', tooltipsterClose);
    }

    $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', () => {
        // Fill in the "Name" box
        $('#create-game-name').val(self.randomName);

        // Get a new random name from the server for the next time we click the button
        self.connSend({
            type: 'getName',
        });

        // Fill in the "Variant" dropdown
        let variant = JSON.parse(localStorage.getItem('createTableVariant'));
        if (typeof variant !== 'number' || variant < 0 || variant >= variantNames.length) {
            variant = 0;
        }
        $('#create-game-variant').val(variant);

        // Fill in the "Timed" checkbox
        const timed = JSON.parse(localStorage.getItem('createTableTimed'));
        $('#create-game-timed').prop('checked', timed);
        $('#create-game-timed').change();

        // Fill in the "Base Time" box
        const baseTime = JSON.parse(localStorage.getItem('baseTime'));
        $('#base-time-minutes').val(baseTime)

        // Fill in the "Time Per Turn" box
        const timePerTurnSeconds = JSON.parse(localStorage.getItem('timePerTurnSeconds'));
        $('#time-per-turn-seconds').val(timePerTurnSeconds)

        // Fill in the "Reorder Cards" checkbox
        const reorderCards = JSON.parse(localStorage.getItem('createTableReorderCards'));
        $('#create-game-reorder-cards').prop('checked', reorderCards);

        // Focus the "Name" box
        // (we have to wait 1 millisecond or it won't work due to the nature of the above code)
        setTimeout(() => {
            $('#create-game-name').focus();
        }, 1);
    });

    discordContent = 'Discord is a voice and text chat application that you can run in a browser.<br />If the server is down, you can probably find out why in the Hanabi server / chat room.';
    $('#title-discord').tooltipster({
        theme: 'tooltipster-shadow',
        delay: 0,
        content: discordContent,
        contentAsHTML: true,
    });

    /*
        Display the login screen
    */

    this.hideLobby();
    this.closeAllTooltips();
    this.showLogin();
    this.loadSettings();

    // Handle logging in from the home page
    $('#login-button').click(() => {
        $('#login-form').submit();
    });
    $('#login-form').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#login-form').submit();
        }
    });
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
    const input = $('#lobby-chat-input');
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

        // It is a normal chat message
        self.connSend({
            type: 'chat',
            resp: {
                msg,
                room: 'lobby',
            },
        });
    });
    $('#lobby-chat-form').submit((event) => {
        // By default, the form will reload the page, so stop this from happening
        event.preventDefault();
    });

    /*
        Create a new game
    */

    $('#create-game-timed').change((data) => {
        if ($('#create-game-timed').prop('checked')) {
            $('#create-game-timed-option-1').show();
            $('#create-game-timed-option-2').show();
            $('#create-game-timed-option-3').show();
            $('#create-game-timed-option-4').show();
            $('#create-game-timed-option-padding').hide();
        } else {
            $('#create-game-timed-option-1').hide();
            $('#create-game-timed-option-2').hide();
            $('#create-game-timed-option-3').hide();
            $('#create-game-timed-option-4').hide();
            $('#create-game-timed-option-padding').show();
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });

    $('#create-game-tooltip').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#create-game-submit').click();
        }
    });

    $('#create-game-submit').on('click', (event) => {
        event.preventDefault();

        const gameName = $('#create-game-name').val();

        const variant = parseInt($('#create-game-variant').val(), 10);
        localStorage.setItem('createTableVariant', variant);

        const timed = document.getElementById('create-game-timed').checked;
        localStorage.setItem('createTableTimed', timed);

        const baseTimeMinutes = $('#base-time-minutes').val();
        localStorage.setItem('baseTimeMinutes', baseTimeMinutes);

        const timePerTurnSeconds = $('#time-per-turn-seconds').val();
        localStorage.setItem('timePerTurnSeconds', timePerTurnSeconds);

        const reorderCards = document.getElementById('create-game-reorder-cards').checked;
        localStorage.setItem('createTableReorderCards', reorderCards);

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

        self.closeAllTooltips();
    });

    $('#nav-buttons-game-start').on('click', (event) => {
        event.preventDefault();

        self.connSend({
            type: 'gameStart',
            resp: {},
        });
    });

    $('#nav-buttons-game-leave').on('click', (event) => {
        event.preventDefault();

        self.connSend({
            type: 'gameLeave',
            resp: {},
        });
    });

    $('#nav-buttons-game-unattend').on('click', (event) => {
        event.preventDefault();

        $('#lobby-game').hide();
        $('#lobby-games').show();
        self.showNav('games');

        self.connSend({
            type: 'gameUnattend',
            resp: {},
        });
    });

    $('#nav-buttons-games-history').on('click', (event) => {
        event.preventDefault();

        $('#lobby-games').hide();
        $('#lobby-history').show();
        self.showNav('history');

        self.drawHistory();
    });

    $('#nav-buttons-games-sign-out').on('click', (event) => {
        // Logout / Log out
        deleteCookie('hanabiuser');
        deleteCookie('hanabipass');
        window.location.reload();
    });

    // "Watch Replay by ID" and "Share Replay by ID" buttons
    $('.nav-buttons-history-by-id').on('click', (event) => {
        const replayID = window.prompt('What is the ID of the game you want?');
        if (replayID === null) {
            // The user clicked the "cancel" button, so do nothing else
            return;
        }

        self.connSend({
            type: event.currentTarget.getAttribute('data-replayType'),
            resp: {
                gameID: parseInt(replayID, 10),
            },
        });
    });

    $('.nav-return-table').on('click', (event) => {
        event.preventDefault();

        $('#lobby-history-details').hide();
        $('#lobby-history').hide();
        $('#lobby-games').show();
        self.showNav('games');
    });

    $('#return-history').on('click', (event) => {
        event.preventDefault();

        $('#lobby-history-details').hide();
        $('#lobby-history').show();
    });

    $('body').on('contextmenu', '#game', () => false);

    $(document).keydown((event) => {
        if (event.altKey && event.key === 'c') { // Alt + c
            // Click the "Create Game" button
            $('#nav-buttons-games-create-game').click();
        } else if (event.altKey && event.key === 'h') { // Alt + h
            // Click the "Show History" button
            $('#nav-buttons-games-history').click();
        } else if (event.altKey && event.key === 't') { // Alt + t
            // Click the "Settings" button
            $('#nav-buttons-games-settings').click();
        } else if (event.altKey && event.key === 'o') { // Alt + o
            // Click the "Sign Out" button
            $('#nav-buttons-games-sign-out').click();
        } else if (event.altKey && event.key === 's') { // Alt + s
            // Click on the "Start Game" button
            $('#nav-buttons-game-start').click();
        } else if (event.altKey && event.key === 'l') { // Alt + l
            // Click on the "Leave Game" button
            $('#nav-buttons-game-leave').click();
        } else if (event.altKey && event.key === 'r') { // Alt + r
            // Click on the "Return to Lobby" button
            // (either at the "game" screen or the "history" screen or the "scores" screen)
            if ($('#nav-buttons-game-unattend').is(':visible')) {
                $('#nav-buttons-game-unattend').click();
            } else if ($('#nav-buttons-history-return').is(':visible')) {
                $('#nav-buttons-history-return').click();
            } else if ($('#nav-buttons-return-table').is(':visible')) {
                $('#nav-buttons-return-table').click();
            }
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

    const soundFiles = [
        'blind1',
        'blind2',
        'blind3',
        'blind4',
        'fail',
        'tone',
        'turn_other',
        'turn_us',
    ];
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
    $('#login-ajax').show();

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
        $('#login-ajax').hide();
        $('#login-button').removeClass('disabled');
        $('#login-alert').html(msg);
        $('#login-alert').fadeIn(fadeTime);
    }, 0);
};

HanabiLobby.prototype.resetLogin = () => {
    $('#login-ajax').hide();
    $('#login-button').removeClass('disabled');
    $('#login-alert').html('');
    $('#login-alert').hide();
};

HanabiLobby.prototype.showLogin = () => {
    $('#login').show();
};

HanabiLobby.prototype.hideLogin = () => {
    $('#login').hide();
};

HanabiLobby.prototype.showLobby = function showLobby(fast) {
    $('#lobby').show();
    this.showNav('games');
    $('#lobby-chat-input').focus();
};

HanabiLobby.prototype.hideLobby = function hideLobby(fast) {
    // This has to be in a timeout to work for some reason
    setTimeout(() => {
        $('#lobby').hide();
    }, 1);

    this.showNav('nothing');
};

HanabiLobby.prototype.closeAllTooltips = function closeAllTooltips() {
    for (const tooltip of this.tooltips) {
        const tooltipID = `#nav-buttons-games-${tooltip}`;
        if ($(tooltipID).hasClass('tooltipstered')) {
            $(`#nav-buttons-games-${tooltip}`).tooltipster('close');
        }
    }
};

HanabiLobby.prototype.showHistoryDetails = function showHistoryDetails() {
    $('#lobby-history').hide();
    $('#lobby-history-details').show();

    this.historyDetailList = [];
    this.drawHistoryDetails();
};

HanabiLobby.prototype.showPregame = () => {
    $('#page-wrapper').fadeIn(fadeTime);
};

HanabiLobby.prototype.hidePregame = () => {
    $('#page-wrapper').hide();
};

HanabiLobby.prototype.showGame = () => {
    $('#game').fadeIn(fadeTime);

    // The scroll bars appear for some reason when showing the game, which is annoying and wastes space
    $('body').css('overflow', 'hidden');
};

HanabiLobby.prototype.hideGame = () => {
    $('#game').hide();

    // Change the scroll bars for the page back to the default value
    $('body').css('overflow', 'visible');
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
    $('#lobby-users-num').text(Object.keys(this.userList).length)

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const user of Object.values(this.userList)) {
        const row = $('<tr>');

        let name = user.name;
        if (name === this.username) {
            name = `<strong>${name}</strong>`;
        }
        $('<td>').html(name).appendTo(row);

        const status = user.status;
        $('<td>').html(status).appendTo(row)

        row.appendTo(tbody);
    }
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
    const tbody = $('#lobby-games-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    if (Object.keys(this.tableList).length === 0) {
        $('#lobby-games-no').show();
        $('#lobby-games').addClass('align-center-v');
        $('#lobby-games-table-container').hide();
        return;
    }
    $('#lobby-games-no').hide();
    $('#lobby-games').removeClass('align-center-v');
    $('#lobby-games-table-container').show();

    // Add all of the games
    for (const game of Object.values(this.tableList)) {
        const row = $('<tr>');

        // Column 1 - Name
        $('<td>').html(game.name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(game.numPlayers).appendTo(row);

        // Column 3 - Variant
        $('<td>').html(variantNamesShort[game.variant]).appendTo(row);

        // Column 4 - Timed
        let timed = 'No';
        if (game.timed) {
            timed = '<i class="far fa-clock"></i>&nbsp; ';
            timed += `(${timerFormatter(game.baseTime)} + ${timerFormatter(game.timePerTurn)})`;
        }
        $('<td>').html(timed).appendTo(row);

        // Column 5 - Status
        let status = 'Not Started';
        if (game.running && !game.joined) {
            status = 'Running';
            if (!game.sharedReplay) {
                status += ` (${game.progress}%)`;
            }
        } else if (game.running) {
            if (game.ourTurn) {
                status = '<strong>Your Turn</strong>';
            } else {
                status = 'Waiting';
            }
        }
        $('<td>').html(status).appendTo(row);

        // Column 6 - Action
        let button = $('<button>').attr('type', 'button').addClass('button fit margin0');
        if (!game.joined && game.running) {
            button.html('<i class="fas fa-eye lobby-button-icon"></i>&nbsp; Spectate');
            button.attr('id', `spectate-${game.id}`);
            button.on('click', function buttonClick(event) {
                event.preventDefault();

                self.gameID = game.id;
                self.connSend({
                    type: 'gameSpectate',
                    resp: {
                        gameID: game.id,
                    },
                });

                self.drawTables();
            });
        } else if (!game.joined) {
            button.html('<i class="fas fa-sign-in-alt lobby-button-icon"></i>&nbsp; Join');
            button.attr('id', `join-${game.id}`);
            if (game.numPlayers >= 5) {
                button.addClass('disabled');
            }
            button.on('click', function buttonClick(event) {
                event.preventDefault();

                self.gameID = game.id;
                self.connSend({
                    type: 'gameJoin',
                    resp: {
                        gameID: game.id,
                    },
                });

                self.drawTables();
            });
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>&nbsp; Resume');
            button.attr('id', `resume-${game.id}`);

            button.on('click', function reattendTableClick(event) {
                event.preventDefault();

                self.gameID = game.id;
                self.connSend({
                    type: 'gameReattend',
                    resp: {
                        gameID: game.id,
                    },
                });

                self.drawTables();
            });
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Abandon
        button2 = 'n/a';
        if (game.joined && (game.owned || game.running)) {
            button2 = $('<button>').attr('type', 'button').addClass('button fit margin0');
            button2.html('<i class="fas fa-times lobby-button-icon"></i>&nbsp; Abandon');
            button2.attr('id', `abandon-${game.id}`);
            button2.on('click', function buttonClick(event) {
                event.preventDefault();

                if (game.running) {
                    if (!window.confirm('Really abandon game? This will cancel the game for all players.')) {
                        return;
                    }
                }

                self.gameID = null;
                self.connSend({
                    type: 'gameAbandon',
                    resp: {
                        gameID: game.id,
                    },
                });
            });
        }
        $('<td>').html(button2).appendTo(row);

        row.appendTo(tbody);
    }
};

HanabiLobby.prototype.addChat = function addChat(data) {
    const chat = $('#lobby-chat-text');

    // Convert any Discord emotes
    data.msg = this.fillEmotes(data.msg)

    // Get the hours and minutes from the time
    const datetime = dateTimeFormatter2.format(new Date(data.datetime))

    let line = `[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<b>${data.who}</b>&gt;&nbsp; `;
        line += `${$('<a>').text(data.msg).html()}`;
    } else {
        line += `<b>${$('<a>').text(data.msg).html()}</b>`;
    }
    line += '<br />';

    chat.finish();
    chat.append(line);
    chat.animate({
        scrollTop: chat[0].scrollHeight,
    }, fadeTime);

    if (data.previous) {
        return;
    }

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

HanabiLobby.prototype.fillEmotes = function fillEmotes(message) {
    const emoteMapping = {
        '<:BibleThump:254683882601840641>': 'BibleThump',
        '<:PogChamp:254683883033853954>': 'PogChamp',
    }

    // Search through the text for each emote
    for (const emote of Object.keys(emoteMapping)) {
        if (message.indexOf(emote) === -1) {
            continue;
        }

        const emoteTag = `<img src="public/img/emotes/${emoteMapping[emote]}.png" title="${emoteMapping[emote]}" />`;
        message = message.replace(emote, emoteTag);
    }

    return message;
}

HanabiLobby.prototype.addHistory = function addHistory(data) {
    this.historyList[data.id] = data;
};

HanabiLobby.prototype.makeReplayButton = function makeReplayButton(id, text, msgType, returnsToLobby) {
    const self = this;
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    if (text == 'Watch Replay') {
        text = '<i class="fas fa-eye lobby-button-icon"></i>';
    } else if (text === 'Share Replay') {
        text = '<i class="fas fa-share-alt lobby-button-icon"></i>';
    }
    button.html(text)
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
            $('#lobby-history-details').hide();
            $('#lobby-history').hide();
            $('#lobby-games').show();
            self.showNav('games');
        }
    });

    return button;
};

HanabiLobby.prototype.makeHistoryDetailsButton = function makeHistoryDetailsButton(id, gameCount) {
    const self = this;
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    button.html(`<i class="fas fa-chart-bar lobby-button-icon"></i>&nbsp; ${gameCount - 1}`);
    if (gameCount - 1 === 0) {
        button.addClass('disabled');
    }
    button.attr('id', `history-details-${id}`);

    button.on('click', (event) => {
        event.preventDefault();

        self.gameID = id;

        self.connSend({
            type: 'historyDetails',
            resp: {
                gameID: parseInt(self.gameID, 10),
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
    },
);
const dateTimeFormatter2 = new Intl.DateTimeFormat(
    undefined,
    {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    },
);

HanabiLobby.prototype.drawHistory = function drawHistory() {
    const tbody = $('#lobby-history-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Sort the game IDs in reverse order
    // (so that the most recent ones are near the top)
    const ids = Object.keys(this.historyList);
    ids.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    ids.reverse();

    // Add all of the history
    for (let i = 0; i < ids.length; i++) {
        const gameData = this.historyList[ids[i]];
        const { maxScore } = constants.VARIANT_INTEGER_MAPPING[gameData.variant];

        const row = $('<tr>');

        // Column 1 - Game ID
        $('<td>').html(`#${ids[i]}`).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(gameData.numPlayers).appendTo(row);

        // Column 3 - Score
        $('<td>').html(`${gameData.score}/${maxScore}`).appendTo(row);

        // Column 4 - Variant
        $('<td>').html(variantNamesShort[gameData.variant]).appendTo(row);

        // Column 5 - Time Completed
        const timeCompleted = dateTimeFormatter.format(new Date(gameData.datetime))
        $('<td>').html(timeCompleted).appendTo(row);

        // Column 6 - Watch Replay
        const watchReplayButton = this.makeReplayButton(ids[i], 'Watch Replay', 'replayCreate', false)
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 7 - Share Replay
        const shareReplayButton = this.makeReplayButton(ids[i], 'Share Replay', 'sharedReplayCreate', true)
        $('<td>').html(shareReplayButton).appendTo(row);

        // Column 8 - Other Scores
        const otherScoresButton = this.makeHistoryDetailsButton(ids[i], gameData.numSimilar)
        $('<td>').html(otherScoresButton).appendTo(row);

        // Column 9 - Other Players
        $('<td>').html(gameData.otherPlayerNames).appendTo(row);

        row.appendTo(tbody);
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
    const tbody = $('#lobby-history-details-table-tbody');

    if (!this.historyDetailList.length) {
        tbody.text('Loading...');
        return;
    }


    // Clear all of the existing rows
    tbody.html('');

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

    // Add all of the games
    for (let i = 0; i < this.historyDetailList.length; i++) {
        const gameData = this.historyDetailList[i];

        const row = $('<tr>');

        // Column 1 - Game ID
        let id = `#${gameData.id}`;
        if (gameData.us) {
            id = `<strong>${id}</strong>`;
        }
        $('<td>').html(id).appendTo(row);

        // Column 2 - Score
        let score = `${gameData.score}/${variant.maxScore}`;
        if (gameData.us) {
            score = `<strong>${score}</strong>`;
        }
        $('<td>').html(score).appendTo(row);

        // Column 3 - Time Completed
        let dateTime = dateTimeFormatter.format(new Date(gameData.datetime));
        if (gameData.us) {
            dateTime = `<strong>${dateTime}</strong>`;
        }
        $('<td>').html(dateTime).appendTo(row);

        // Column 4 - Watch Replay
        let watchReplayButton = this.makeReplayButton(gameData.id, 'Watch Replay', 'replayCreate', false);
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 5 - Share Replay
        let shareReplayButton = this.makeReplayButton(gameData.id, 'Share Replay', 'sharedReplayCreate', false);
        $('<td>').html(shareReplayButton).appendTo(row);

        // Column 6 - Other Players
        let otherPlayers = gameData.otherPlayerNames;
        if (gameData.us) {
            otherPlayers = `<strong>${this.username}, ${otherPlayers}</strong>`;
        }
        $('<td>').html(otherPlayers).appendTo(row);

        row.appendTo(tbody);
    }
};

HanabiLobby.prototype.tableJoined = function tableJoined(data) {
    this.drawTables();

    $('#lobby-games').hide();
    $('#lobby-game').show();
    this.showNav('game');

    this.showJoined();

    this.gameID = data.gameID;
};

HanabiLobby.prototype.tableLeft = function tableLeft(data) {
    this.drawTables();

    $('#lobby-game').hide();
    $('#lobby-games').show();
    this.showNav('games');
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
    // Update the "Start Game" button
    $('#nav-buttons-game-start').addClass('disabled');

    // Update the information on the left-hand side of the screen
    $('#lobby-game-name').text(this.game.name);
    $('#lobby-game-variant').text(variantNames[this.game.variant]);
    let timed = 'No';
    if (this.game.timed) {
        timed = `Yes (${timerFormatter(this.game.baseTime)} + ${timerFormatter(this.game.timePerTurn)})`;
    }
    $('#lobby-game-timed').text(timed);

    // Draw the 5 players
    for (let i = 0; i < 5; i++) {
        const div = $(`#lobby-game-player-${(i + 1)}`);

        const player = this.game.players[i];
        if (!player) {
            div.html('');
            div.hide();
            continue;
        }

        div.show();

        // Calculate some stats
        let averageScoreVariant = Math.round(player.stats.averageScoreVariant * 100) / 100; // Round it to 2 decimal places
        let strikeoutRateVariant = player.stats.strikeoutRateVariant * 100; // Turn it into a percent
        strikeoutRateVariant = Math.round(strikeoutRateVariant * 100) / 100; // Round it to 2 decimal places

        html = `
            <p class="margin0 padding0p5">
                <strong>${player.name}</strong>
            </p>
            <div class="row 100%">
                <div class="10u">
                    Total games:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.numPlayed}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...of this variant:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.numPlayedVariant}
                </div>
            </div>
            Best scores with:
            <div class="row 100%">
                <div class="10u">
                    ...3 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant3}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...4 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant4}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    ...5 players:
                </div>
                <div class="2u align-right padding0">
                    ${player.stats.bestScoreVariant5}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    Average score:
                </div>
                <div class="2u align-right padding0">
                    ${averageScoreVariant}
                </div>
            </div>
            <div class="row 100%">
                <div class="10u">
                    Strikeout rate:
                </div>
                <div class="2u align-right padding0">
                    ${strikeoutRateVariant}
                </div>
            </div>
        `;
        if (!player.present) {
            html += '<p class="lobby-game-player-away"><strong>AWAY</strong></p>';
        }

        div.html(html);
    }
};

HanabiLobby.prototype.setTableReady = (data) => {
    if (data.ready) {
        $('#nav-buttons-game-start').removeClass('disabled');
    } else {
        $('#nav-buttons-game-start').addClass('disabled');
    }
};

HanabiLobby.prototype.gameStarted = function gameStarted(data) {
    if (!data.replay) {
        $('#lobby-game').hide();
        $('#lobby-games').show();
        this.showNav('games');
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
        console.log('WebSocket connection disconnected / closed.');

        alert('Disconnected from the server. Either your Internet hiccuped or the server restarted.')
        window.location.reload();

        /*
        // Go back to the login screen
        self.hideLobby();
        self.hideGame();
        self.closeAllTooltips();
        self.showPregame();
        self.resetLogin();
        self.showLogin();
        */
    });
};

HanabiLobby.prototype.connError = function connError(conn) {
    // "socketError" is defined in "golem.js" as mapping to the WebSocket "onerror" event
    conn.on('socketError', (event) => {
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            this.loginFormError('Failed to connect to the WebSocket server. The server might be down!');
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

    conn.on('chatList', (data) => {
        // Reverse the order of the chat messages
    	// (it is queried from the database from newest to oldest,
    	// but we want the oldest message to appear first)
        data.reverse();

        for (const line of data) {
            line.previous = true;
            self.addChat(line);
        }
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
            // Show desktop notifications when it reaches your turn
            'send-turn-notification',
            'sendTurnNotify',
        ],
        [
            // Play sounds when a move is made
            'send-turn-sound',
            'sendTurnSound',
        ],
        [
            // Play ticking sounds when timers are below 5 seconds
            'send-timer-sound',
            'sendTimerSound',
        ],
        [
            // Receive notifications when your name is mentioned in chat
            'send-chat-notification',
            'sendChatNotify',
        ],
        [
            // Play a sound when your name is mentioned in chat
            'send-chat-sound',
            'sendChatSound',
        ],
        [
            // Enable colorblind mode
            'show-colorblind-ui',
            'showColorblindUI',
        ],
        [
            // Hide the turn timers that tick up in untimed games
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

    /* eslint-disable no-new */
    new Notification(`Hanabi: ${msg}`, {
        tag,
    });
};

HanabiLobby.prototype.playSound = (file) => {
    const audio = new Audio(`public/sounds/${file}.mp3`);
    audio.play();
};

HanabiLobby.prototype.showNav = (target) => {
    const navTypes = [
        'games',
        'game',
        'history',
        'return',
    ];
    for (const navType of navTypes) {
        $(`#nav-buttons-${navType}`).hide();
    }

    if (target !== 'nothing') {
        $(`#nav-buttons-${target}`).show();
    }
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
