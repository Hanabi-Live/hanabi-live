const showDebugMessages = true;
const fadeTime = 350; // Vanilla Keldon is 800
const browserIsFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

$(document).ready(() => {
    // Initialize the lobby code
    window.lobby = new HanabiLobby();
});

function HanabiLobby() {
    const self = this;

    // Lists containing the things in the lobby tables
    this.userList = {};
    this.tableList = {};
    this.historyList = {};
    this.historyDetailList = [];

    // Set in the "setGame()" function after receiving a "game" message
    // All we need to do is initialize the players to an empty array to avoid some errors elsewhere
    this.game = {
        players: [],
    };

    // Upon connecting, the server will only send us the last 10 games that we played
    // If the user clicks on the "Show More History" button,
    // then the server will send us more games
    this.historyClicked = false;

    // Misc. other variables
    this.username = null;
    this.pass = null;
    this.gameID = null;
    this.randomName = '';
    this.errorOccured = false;

    // The lobby settings found in the gear sub-menu
    this.sendTurnNotify = false;
    this.sendTurnSound = true; // We want sounds by default
    this.sendTimerSound = true; // We want sounds by default
    this.sendChatNotify = false;
    this.sendChatSound = false;
    this.showBGAUI = false;
    this.showColorblindUI = false;
    this.showTimerInUntimed = false;
    this.reverseHands = false;
    this.speedrunPreplay = false;
    this.speedrunHotkeys = false;

    // Initialize the modals
    $('#password-modal-submit').click(() => {
        $('#password-modal').fadeOut(fadeTime);
        $('#lobby').fadeTo(fadeTime, 1);

        const gameID = parseInt($('#password-modal-id').val(), 10); // The server expects this as a number
        const passwordPlaintext = $('#password-modal-password').val();
        const password = hex_sha256(`Hanabi game password ${passwordPlaintext}`);
        self.connSend({
            type: 'gameJoin',
            resp: {
                gameID,
                password,
            },
        });
    });
    $('#password-modal-cancel').click(() => {
        $('#password-modal').fadeOut(fadeTime);
        $('#lobby').fadeTo(fadeTime, 1);
    });
    $('#warning-modal-button').click(() => {
        $('#warning-modal').fadeOut(fadeTime);
        if ($('#lobby').is(':visible')) {
            $('#lobby').fadeTo(fadeTime, 1);
        }
        if ($('#game').is(':visible')) {
            $('#game').fadeTo(fadeTime, 1);
        }
    });
    $('#error-modal-button').click(() => {
        window.location.reload();
    });

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
        // The "create-game" tooltip is too large for very small resolutions and will wrap off the screen
        // We can use a Tooltipster plugin to automatically create a scroll bar for it
        // From: https://github.com/louisameline/tooltipster-scrollableTip
        plugins: ['sideTip', 'scrollableTip'],
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

    // Map the escape key to close all tooltips / modals
    $(document).keydown((event) => {
        if (event.key === 'Escape') {
            event.preventDefault();

            this.closeAllTooltips();

            if ($('#password-modal').is(':visible')) {
                $('#password-modal-cancel').click();
            }
        }
    });

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

        if (this.username.startsWith('test')) {
            $('#create-game-name').val('test game');
        }

        // Fill in the "Variant" dropdown
        let variant = localStorage.getItem('createTableVariant');
        if (typeof variant !== 'string') {
            variant = 'No Variant';
        }
        $('#create-game-variant').val(variant);

        // Fill in the "Timed" checkbox
        let timed;
        try {
            timed = JSON.parse(localStorage.getItem('createTableTimed'));
        } catch (err) {
            timed = false;
        }
        if (typeof timed !== 'boolean') {
            timed = false;
        }
        $('#create-game-timed').prop('checked', timed);
        $('#create-game-timed').change();

        // Fill in the "Base Time" box
        let baseTimeMinutes;
        try {
            // We don't want to do "JSON.parse()" here because it may not be a whole number
            baseTimeMinutes = localStorage.getItem('baseTimeMinutes');
        } catch (err) {
            baseTimeMinutes = 2;
        }
        if (baseTimeMinutes < 0) {
            baseTimeMinutes = 2;
        }
        $('#base-time-minutes').val(baseTimeMinutes);

        // Fill in the "Time Per Turn" box
        let timePerTurnSeconds;
        try {
            timePerTurnSeconds = JSON.parse(localStorage.getItem('timePerTurnSeconds'));
        } catch (err) {
            timePerTurnSeconds = 20;
        }
        if (typeof timePerTurnSeconds !== 'number' || timePerTurnSeconds < 0) {
            timePerTurnSeconds = 20;
        }
        $('#time-per-turn-seconds').val(timePerTurnSeconds);

        // Fill in the "Allow Bottom-Deck Blind Plays" checkbox
        let deckPlays;
        try {
            deckPlays = JSON.parse(localStorage.getItem('createTableDeckPlays'));
        } catch (err) {
            deckPlays = false;
        }
        if (typeof deckPlays !== 'boolean') {
            deckPlays = false;
        }
        $('#create-game-deck-plays').prop('checked', deckPlays);

        // Fill in the "Allow Empty Clues" checkbox
        let emptyClues;
        try {
            emptyClues = JSON.parse(localStorage.getItem('createTableEmptyClues'));
        } catch (err) {
            emptyClues = false;
        }
        if (typeof emptyClues !== 'boolean') {
            emptyClues = false;
        }
        $('#create-game-empty-clues').prop('checked', emptyClues);

        // Fill in the "Detrimental Character Assignments" checkbox
        let characterAssignments;
        try {
            characterAssignments = JSON.parse(localStorage.getItem('createTableCharacterAssignments'));
        } catch (err) {
            characterAssignments = false;
        }
        if (typeof characterAssignments !== 'boolean') {
            characterAssignments = false;
        }
        $('#create-game-character-assignments').prop('checked', characterAssignments);

        // Fill in the "Password" box
        const password = localStorage.getItem('createTablePassword');
        $('#create-game-password').val(password);

        // Fill in the "Alert people" box
        let alertWaiters;
        try {
            alertWaiters = JSON.parse(localStorage.getItem('createTableAlertWaiters'));
        } catch (err) {
            alertWaiters = false;
        }
        if (typeof alertWaiters !== 'boolean') {
            alertWaiters = false;
        }
        $('#create-game-alert-waiters').prop('checked', alertWaiters);

        // Focus the "Name" box
        // (we have to wait 1 millisecond or it won't work due to the nature of the above code)
        setTimeout(() => {
            $('#create-game-name').focus();
        }, 1);
    });

    const discordContent = 'Discord is a voice and text chat application that you can run in a browser.<br />If the server is down, you can probably find out why in the Hanabi server / chat room.';
    $('#title-discord').tooltipster({
        theme: 'tooltipster-shadow',
        delay: 0,
        content: discordContent,
        contentAsHTML: true,
    });

    // Initialize tooltips for the card notes in-game
    const tooltipThemes = [
        'tooltipster-shadow',
        'tooltipster-shadow-big',
    ];
    const tooltipOptions = {
        animation: 'grow',
        contentAsHTML: true,
        delay: 0,
        interactive: true, // So that users can update their notes
        theme: tooltipThemes,
        trigger: 'custom',
        updateAnimation: null,
    };
    for (let i = 0; i < 5; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        const newThemes = tooltipThemes.slice();
        newThemes.push('align-center');
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);

        $('#game-tooltips').append(`<div id="tooltip-character-assignment-${i}"></div>`);
        $(`#tooltip-character-assignment-${i}`).tooltipster(tooltipOptions);
        $(`#tooltip-character-assignment-${i}`).tooltipster('instance').option('theme', newThemes);
    }
    $('#tooltip-spectators').tooltipster(tooltipOptions);
    $('#tooltip-leader').tooltipster(tooltipOptions);
    for (let i = 0; i < 60; i++) { // Matches card.order
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }
    $('#tooltip-chat').tooltipster({
        animationDuration: 0,
        arrow: false,
        contentAsHTML: true,
        delay: 0,
        distance: 0,
        interactive: true,
        theme: tooltipThemes,
        trigger: 'custom',
    });

    /*
        Display the login screen
    */

    this.closeAllTooltips();
    this.showLogin();
    this.loadSettings();

    // Check to see if we have accepted the Firefox warning
    if (browserIsFirefox && getCookie('acceptedFirefoxWarning') !== 'true') { // Cookies are strings
        $('#sign-in').hide();
        $('#firefox-warning').show();
    }
    $('#firefox-warning-button').click(() => {
        setCookie('acceptedFirefoxWarning', 'true');
        $('#firefox-warning').hide();
        $('#sign-in').show();
    });

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
    const rooms = ['lobby', 'game'];
    for (const room of rooms) {
        const input = $(`#${room}-chat-input`);
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
                    room,
                },
            });
        });
    }

    // By default, submitting a form will reload the page, so stop this from happening
    $('#lobby-chat-form').submit((event) => {
        event.preventDefault();
    });
    $('#lobby-chat-game-form').submit((event) => {
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

        const name = $('#create-game-name').val();

        const variant = $('#create-game-variant').val();
        localStorage.setItem('createTableVariant', variant);

        const timed = document.getElementById('create-game-timed').checked;
        localStorage.setItem('createTableTimed', timed);

        const baseTimeMinutes = $('#base-time-minutes').val();
        localStorage.setItem('baseTimeMinutes', baseTimeMinutes);

        const timePerTurnSeconds = $('#time-per-turn-seconds').val();
        localStorage.setItem('timePerTurnSeconds', timePerTurnSeconds);

        const deckPlays = document.getElementById('create-game-deck-plays').checked;
        localStorage.setItem('createTableDeckPlays', deckPlays);

        const emptyClues = document.getElementById('create-game-empty-clues').checked;
        localStorage.setItem('createTableEmptyClues', emptyClues);

        const characterAssignments = document.getElementById('create-game-character-assignments').checked;
        localStorage.setItem('createTableCharacterAssignments', characterAssignments);

        let password = $('#create-game-password').val();
        localStorage.setItem('createTablePassword', password);
        if (password !== '') {
            password = hex_sha256(`Hanabi game password ${password}`);
        }

        const alertWaiters = document.getElementById('create-game-alert-waiters').checked;
        localStorage.setItem('createTableAlertWaiters', alertWaiters);

        self.connSend({
            type: 'gameCreate',
            resp: {
                name,
                variant,
                timed,
                baseTimeMinutes: parseFloat(baseTimeMinutes), // The server expects this as an float64
                timePerTurnSeconds: parseInt(timePerTurnSeconds, 10), // The server expects this as an integer
                deckPlays,
                emptyClues,
                characterAssignments,
                password,
                alertWaiters,
            },
        });

        self.closeAllTooltips();
    });

    $('#nav-buttons-game-start').on('click', (event) => {
        event.preventDefault();

        if ($('#nav-buttons-game-start').hasClass('disabled')) {
            return;
        }

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

    // The "Return to Lobby" button (from the "Pre-Game" screen)
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

    // The "Show History" button
    $('#nav-buttons-games-history').on('click', (event) => {
        event.preventDefault();

        $('#lobby-top-half').hide();
        $('#lobby-separator').hide();
        $('#lobby-bottom-half').hide();
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
        const subtype = event.currentTarget.getAttribute('data-display');
        const replayID = window.prompt(`What is the ID of the game you want to ${subtype}?`);
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

    // The "Return to Lobby" button (from the "History" and "History Details" screen)
    $('.nav-return-table').on('click', (event) => {
        event.preventDefault();
        self.returnToLobbyFromHistory();
    });

    $('#return-history').on('click', (event) => {
        event.preventDefault();

        $('#lobby-history-details').hide();
        $('#lobby-history').show();
    });

    $('#lobby-history-show-more').on('click', (event) => {
        self.historyClicked = true;
        self.connSend({
            type: 'historyGet',
            resp: {
                offset: Object.keys(this.historyList).length,
                amount: 10,
            },
        });
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
        } else if (event.altKey && event.key === 'w') { // Alt + w
            // Click on the "Watch Replay by ID" button
            $('a.nav-buttons-history-by-id[data-replayType="replayCreate"]').click();
        } else if (event.altKey && event.key === 'e') { // Alt + e
            // Click on the "Share Replay by ID" button
            $('a.nav-buttons-history-by-id[data-replayType="sharedReplayCreate"]').click();
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
        'buzz',
        'fail',
        'sad',
        'tone',
        'turn_other',
        'turn_us',
    ];
    for (const file of soundFiles) {
        const audio = new Audio(`public/sounds/${file}.mp3`);
        audio.load();
    }
};

HanabiLobby.prototype.automaticallyLogin = function automaticallyLogin() {
    // Don't automatically login if they are on Firefox and have not confirmed the warning dialog
    if (browserIsFirefox && getCookie('acceptedFirefoxWarning') !== 'true') { // Cookies are strings
        return;
    }

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
    $('#lobby-history').hide(); // We can't hide this element by default in "index.html" or else the "No game history" text will not be centered
    this.showNav('games');
    $('#lobby-chat-input').focus();
};

HanabiLobby.prototype.closeAllTooltips = function closeAllTooltips() {
    // From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
    const instances = $.tooltipster.instances();
    $.each(instances, (i, instance) => {
        if (instance.status().open) {
            instance.close();
        }
    });
};

HanabiLobby.prototype.showHistoryDetails = function showHistoryDetails() {
    $('#lobby-history').hide();
    $('#lobby-history-details').show();

    this.historyDetailList = [];
    this.drawHistoryDetails();
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
    $('#lobby-users-num').text(Object.keys(this.userList).length);

    const tbody = $('#lobby-users-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // Add all of the users
    for (const user of Object.values(this.userList)) {
        const row = $('<tr>');

        let { name } = user;
        name = `<a href="/profile/${name}" target="_blank" rel="noopener noreferrer">${name}</a>`;
        if (user.name === this.username) {
            name = `<strong>${name}</strong>`;
        }
        $('<td>').html(name).appendTo(row);

        const { status } = user;
        $('<td>').html(status).appendTo(row);

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
};

HanabiLobby.prototype.removeTable = function removeTable(data) {
    delete this.tableList[data.id];
    this.drawTables();
};

// Populate the variant dropdown in the "Create Game" tooltip
$(document).ready(() => {
    for (const variant of Object.keys(constants.VARIANTS)) {
        const option = new Option(variant, variant);
        $('#create-game-variant').append($(option));
    }
});

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
    for (const table of Object.values(this.tableList)) {
        const row = $('<tr>');

        // Column 1 - Name
        $('<td>').html(table.name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(table.numPlayers).appendTo(row);

        // Column 3 - Variant
        $('<td>').html(table.variant).appendTo(row);

        // Column 4 - Timed
        let timed = 'No';
        if (table.timed) {
            timed = `${timerFormatter(table.baseTime)} + ${timerFormatter(table.timePerTurn)}`;
        }
        $('<td>').html(timed).appendTo(row);

        // Column 5 - Status
        let status;
        if (table.sharedReplay) {
            status = 'Shared Replay';
        } else if (table.running && table.joined) {
            if (table.ourTurn) {
                status = '<strong>Your Turn</strong>';
            } else {
                status = 'Waiting';
            }
        } else if (table.running) {
            status = 'Running';
        } else {
            status = 'Not Started';
        }
        if (status !== 'Not Started') {
            status += ` (${table.progress}%)`;
        }
        $('<td>').html(status).appendTo(row);

        // Column 6 - Action
        const button = $('<button>').attr('type', 'button').addClass('button small margin0');
        if (table.sharedReplay || (!table.joined && table.running)) {
            button.html('<i class="fas fa-eye lobby-button-icon"></i>');
            button.attr('id', `spectate-${table.id}`);
            button.on('click', (event) => {
                event.preventDefault();

                self.gameID = table.id;
                self.connSend({
                    type: 'gameSpectate',
                    resp: {
                        gameID: table.id,
                    },
                });

                self.drawTables();
            });
        } else if (!table.joined) {
            button.html('<i class="fas fa-sign-in-alt lobby-button-icon"></i>');
            button.attr('id', `join-${table.id}`);
            if (table.numPlayers >= 5) {
                button.addClass('disabled');
            }
            button.on('click', (event) => {
                event.preventDefault();

                if (table.password) {
                    self.passwordShow(table.id);
                } else {
                    self.gameID = table.id;
                    self.connSend({
                        type: 'gameJoin',
                        resp: {
                            gameID: table.id,
                        },
                    });

                    self.drawTables();
                }
            });
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>');
            button.attr('id', `resume-${table.id}`);

            button.on('click', (event) => {
                event.preventDefault();

                self.gameID = table.id;
                self.connSend({
                    type: 'gameReattend',
                    resp: {
                        gameID: table.id,
                    },
                });

                self.drawTables();
            });
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Abandon
        let button2 = 'n/a';
        if (table.joined && (table.owned || table.running) && !table.sharedReplay) {
            button2 = $('<button>').attr('type', 'button').addClass('button small margin0');
            button2.html('<i class="fas fa-times lobby-button-icon"></i>');
            button2.attr('id', `abandon-${table.id}`);
            button2.on('click', (event) => {
                event.preventDefault();

                if (table.running) {
                    if (!window.confirm('Are you sure? This will cancel the game for all players.')) {
                        return;
                    }
                }

                self.gameID = null;
                self.connSend({
                    type: 'gameAbandon',
                    resp: {
                        gameID: table.id,
                    },
                });
            });
        }
        $('<td>').html(button2).appendTo(row);

        // Column 8 - Players
        $('<td>').html(table.players).appendTo(row);

        // Column 9 - Spectators
        $('<td>').html(table.spectators).appendTo(row);

        row.appendTo(tbody);
    }
};

HanabiLobby.prototype.addChat = function addChat(data) {
    let chat;
    if (data.room === 'lobby') {
        chat = $('#lobby-chat-text');
    } else {
        chat = $('#game-chat-text');
    }

    // Convert any Discord emotes
    data.msg = this.fillEmotes(data.msg);

    // Get the hours and minutes from the time
    const datetime = dateTimeFormatter2.format(new Date(data.datetime));

    let line = `<span>[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
        line += `${$('<a>').html(data.msg).html()}`;
    } else {
        line += `<strong>${$('<a>').html(data.msg).html()}</strong>`;
    }
    line += '</span><br />';

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
    while (true) {
        const match = message.match(/&lt;:(.+?):(\d+?)&gt;/);
        if (!match) {
            break;
        }
        const emoteTag = `<img src="https://cdn.discordapp.com/emojis/${match[2]}.png" title="${match[1]}" height=28 />`;
        message = message.replace(match[0], emoteTag);
    }

    return message;
};

HanabiLobby.prototype.addHistory = function addHistory(data) {
    this.historyList[data.id] = data;
};

HanabiLobby.prototype.makeReplayButton = function makeReplayButton(id, text, msgType, returnsToLobby) {
    const self = this;
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    if (text === 'Watch Replay') {
        text = '<i class="fas fa-eye lobby-button-icon"></i>';
    } else if (text === 'Share Replay') {
        text = '<i class="fas fa-users lobby-button-icon"></i>';
    }
    button.html(text);
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
            self.returnToLobbyFromHistory();
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

    // Handle if the user has no history
    const ids = Object.keys(this.historyList);
    if (ids.length === 0) {
        $('#lobby-history-no').show();
        $('#lobby-history').addClass('align-center-v');
        $('#lobby-history-table-container').hide();
        return;
    }
    $('#lobby-history-no').hide();
    $('#lobby-history').removeClass('align-center-v');
    $('#lobby-history-table-container').show();

    // Sort the game IDs in reverse order
    // (so that the most recent ones are near the top)
    ids.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    ids.reverse();

    // Add all of the history
    for (let i = 0; i < ids.length; i++) {
        const gameData = this.historyList[ids[i]];
        const { maxScore } = constants.VARIANTS[gameData.variant];

        const row = $('<tr>');

        // Column 1 - Game ID
        $('<td>').html(`#${ids[i]}`).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(gameData.numPlayers).appendTo(row);

        // Column 3 - Score
        $('<td>').html(`${gameData.score}/${maxScore}`).appendTo(row);

        // Column 4 - Variant
        $('<td>').html(gameData.variant).appendTo(row);

        // Column 5 - Time Completed
        const timeCompleted = dateTimeFormatter.format(new Date(gameData.datetime));
        $('<td>').html(timeCompleted).appendTo(row);

        // Column 6 - Watch Replay
        const watchReplayButton = this.makeReplayButton(ids[i], 'Watch Replay', 'replayCreate', false);
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 7 - Share Replay
        const shareReplayButton = this.makeReplayButton(ids[i], 'Share Replay', 'sharedReplayCreate', true);
        $('<td>').html(shareReplayButton).appendTo(row);

        // Column 8 - Other Scores
        const otherScoresButton = this.makeHistoryDetailsButton(ids[i], gameData.numSimilar);
        $('<td>').html(otherScoresButton).appendTo(row);

        // Column 9 - Other Players
        $('<td>').html(gameData.otherPlayerNames).appendTo(row);

        row.appendTo(tbody);
    }

    // Don't show the "Show More History" if we don't have 10 games played
    // (there is a small bug here where if a user has exactly 10 games played
    // then the button will erroneously show and not do anything when clicked)
    if (ids.length < 10) {
        $('#lobby-history-show-more').hide();
    } else {
        $('#lobby-history-show-more').show();
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
        .map(v => constants.VARIANTS[v])[0];

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
        const watchReplayButton = this.makeReplayButton(gameData.id, 'Watch Replay', 'replayCreate', false);
        $('<td>').html(watchReplayButton).appendTo(row);

        // Column 5 - Share Replay
        const shareReplayButton = this.makeReplayButton(gameData.id, 'Share Replay', 'sharedReplayCreate', false);
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
    this.game = JSON.parse(JSON.stringify(data));

    // This comes from the server in minutes, so convert it to milliseconds
    this.game.baseTime = data.baseTime * 1000 * 60;

    // This comes from the server in seconds, so convert it to milliseconds
    this.game.timePerTurn = data.timePerTurn * 1000;

    // Reset some client-side variables that do not come in the vanilla "game" object
    this.game.ourIndex = 0;
    this.game.players = [];
    this.game.players.length = this.game.numPlayers;

    this.showJoined();
};

HanabiLobby.prototype.setGamePlayer = function setGamePlayer(data) {
    this.game.players[data.index] = JSON.parse(JSON.stringify(data));

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
    $('#lobby-game-variant').text(this.game.variant);

    const optionsTitle = $('#lobby-game-options-title');
    optionsTitle.text('Options:');
    const options = $('#lobby-game-options');
    options.text('');
    if (this.game.timed) {
        const text = `Timed (${timerFormatter(this.game.baseTime)} + ${timerFormatter(this.game.timePerTurn)})`;
        $('<li>').html(text).appendTo(options);
    }
    if (this.game.deckPlays) {
        const text = 'Bottom-deck Blind Plays';
        $('<li>').html(text).appendTo(options);
    }
    if (this.game.emptyClues) {
        const text = 'Empty Clues';
        $('<li>').html(text).appendTo(options);
    }
    if (this.game.characterAssignments) {
        const text = 'Character Assignments';
        $('<li>').html(text).appendTo(options);
    }
    if (this.game.password) {
        const text = 'Password-protected';
        $('<li>').html(text).appendTo(options);
    }
    if (options.text() === '') {
        optionsTitle.text('');
    }

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
        const averageScoreVariant = Math.round(player.stats.averageScoreVariant * 100) / 100; // Round it to 2 decimal places
        let strikeoutRateVariant = player.stats.strikeoutRateVariant * 100; // Turn it into a percent
        strikeoutRateVariant = Math.round(strikeoutRateVariant * 100) / 100; // Round it to 2 decimal places

        let html = `
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
                    ${strikeoutRateVariant}%
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

    $('#page-wrapper').hide(); // We can't fade this out as it will overlap
    $('#game').fadeIn(fadeTime);

    this.ui = new HanabiUI(this, this.gameID);
    this.ui.setBackend(this.conn);
};

HanabiLobby.prototype.gameEnded = function gameEnded(data) {
    this.ui.destroy();
    this.ui = null;

    $('#game').hide(); // We can't fade this out as it will overlap
    $('#page-wrapper').fadeIn(fadeTime);

    // Make sure there are not any game-related tooltips showing
    this.closeAllTooltips();

    // Scroll to the bottom of the lobby
    const chat = document.getElementById('lobby-chat-text');
    chat.scrollTop = chat.scrollHeight;
};

HanabiLobby.prototype.returnToLobbyFromHistory = function returnToLobbyFromHistory() {
    $('#lobby-history').hide();
    $('#lobby-history-details').hide();
    $('#lobby-top-half').show();
    $('#lobby-separator').show();
    $('#lobby-bottom-half').show();
    this.showNav('games');
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
    conn.on('close', (event) => {
        console.log('WebSocket connection disconnected / closed.');
        this.errorShow('Disconnected from the server. Either your Internet hiccuped or the server restarted.');
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

        // The server sent us more games because
        // we clicked on the "Show More History" button
        if (self.historyClicked) {
            self.historyClicked = false;
            self.drawHistory();
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
                self.ui.handleMessage('notify', action);
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

    conn.on('replayMorph', (data) => {
        if (self.ui) {
            self.ui.handleMessage('replayMorph', data);
        }
    });

    conn.on('replaySound', (data) => {
        if (self.ui) {
            self.ui.handleMessage('replaySound', data);
        }
    });

    conn.on('boot', (data) => {
        if (self.ui) {
            self.ui.handleMessage('boot', data);
        }
    });

    conn.on('warning', (data) => {
        // Log the warning message
        console.warn(data.warning);

        // Show the warning modal
        self.warningShow(data.warning);
    });

    conn.on('error', (data) => {
        // Log the error message
        console.error(data.error);

        // Disconnect from the server, if connected
        if (!self.conn) {
            self.conn.close();
        }

        self.errorShow(data.error);
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
            });
        } catch (err) {
            console.error('Failed to transmit the error to the server:', err);
        }
    };
};

// Show the password modal
HanabiLobby.prototype.passwordShow = function passwordShow(gameID) {
    $('#password-modal-id').val(gameID);
    $('#password-modal').fadeIn(fadeTime);
    $('#lobby').fadeTo(fadeTime, 0.25);
    this.closeAllTooltips();
    $('#password-modal-password').focus();
};

// Show a warning
HanabiLobby.prototype.warningShow = function warningShow(msg) {
    $('#warning-modal-description').html(msg);
    $('#warning-modal').fadeIn(fadeTime);
    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(fadeTime, 0.25);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(fadeTime, 0.25);
    }
    this.closeAllTooltips();
};

// Show the error modal
HanabiLobby.prototype.errorShow = function errorShow(msg) {
    // Do nothing if we are already showing the error modal
    if (this.errorOccured) {
        return;
    }
    this.errorOccured = true;

    // Clear out the top navigation buttons
    this.showNav('nothing');

    $('#error-modal-description').html(msg);
    $('#error-modal').fadeIn(fadeTime);
    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(fadeTime, 0.1);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(fadeTime, 0.1);
    }
    this.closeAllTooltips();
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
            // Show desktop notifications when your name is mentioned in chat
            'send-chat-notification',
            'sendChatNotify',
        ],
        [
            // Play a sound when your name is mentioned in chat
            'send-chat-sound',
            'sendChatSound',
        ],
        [
            // Enable Board Game Arena mode (hands grouped together)
            'show-bga-ui',
            'showBGAUI',
        ],
        [
            // Enable colorblind mode
            'show-colorblind-ui',
            'showColorblindUI',
        ],
        [
            // Show turn timers in untimed games
            'show-timer-in-untimed',
            'showTimerInUntimed',
        ],
        [
            // Reverse hand direction (new cards go on the right)
            'reverse-hands',
            'reverseHands',
        ],
        [
            // Enable pre-playing cards
            'speedrun-preplay',
            'speedrunPreplay',
        ],
        [
            // Enable speedrun keyboard hotkeys
            'speedrun-hotkeys',
            'speedrunHotkeys',
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
    const path = `public/sounds/${file}.mp3`;
    const audio = new Audio(path);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then((_) => {
            // Audio playback was successful; do nothing
        }).catch((error) => {
            // Audio playback failed; this is most likely due to the user not having interacted with the page yet
            // https://stackoverflow.com/questions/52807874/how-to-make-audio-play-on-body-onload
            console.error(`Failed to play "${path}":`, error);
        });
    }
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
    }

    if (jqXHR.responseText === '') {
        return 'An unknown error occured.';
    }

    return jqXHR.responseText;
}
