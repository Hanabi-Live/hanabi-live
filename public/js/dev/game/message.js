
/*
HanabiUI.prototype.handleMessage = function handleMessage(msgType, msgData) {
    const msg = {};
    msg.type = msgType;
    msg.resp = msgData;

    if (msgType === 'message') {
        this.replayLog.push(msg);

        if (!this.replay) {
            this.setMessage.call(this, msgData);
        }
    } else if (msgType === 'init') {
        this.playerUs = msgData.seat;
        this.playerNames = msgData.names;
        this.variant = constants.VARIANT_INTEGER_MAPPING[msgData.variant];
        this.replay = msgData.replay;
        this.replayOnly = msgData.replay;
        this.spectating = msgData.spectating;
        this.timedGame = msgData.timed;
        this.sharedReplay = msgData.sharedReplay;
        this.reorderCards = msgData.reorderCards;

        if (this.replayOnly) {
            this.replayTurn = -1;
        }

        this.loadImages();
    } else if (msgType === 'advanced') {
        this.replayAdvanced();
    } else if (msgType === 'connected') {
        this.showConnected(msgData.list);
    } else if (msgType === 'notify') {
        this.saveReplay(msg);

        if (!this.replay || msgData.type === 'reveal' || msgData.type === 'boot') {
            this.handleNotify(msgData);
        }
    } else if (msgType === 'action') {
        this.lastAction = msgData;
        this.handleAction.call(this, msgData);

        if (this.animateFast) {
            return;
        }

        if (this.lobby.sendTurnNotify) {
            this.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        this.lastSpectators = msgData;
        // This is used to update the names of the people currently spectating the game
        this.handleSpectators.call(this, msgData);
    } else if (msgType === 'clock') {
        if (msgData.active === -1) {
            msgData.active = null;
        }

        // This is used for timed games
        this.stopLocalTimer();
        this.playerTimes = msgData.times;
        this.activeClockIndex = msgData.active;
        this.handleClock.call(this, msgData.active);
    } else if (msgType === 'note') {
        // This is used for spectators
        this.handleNote.call(this, msgData);
    } else if (msgType === 'notes') {
        // This is a list of all of your notes, sent upon reconnecting to a game
        this.handleNotes.call(this, msgData);
    } else if (msgType === 'replayLeader') {
        // This is used in shared replays
        this.handleReplayLeader.call(this, msgData);
    } else if (msgType === 'replayTurn') {
        // This is used in shared replays
        this.handleReplayTurn.call(this, msgData);
    } else if (msgType === 'replayIndicator') {
        // This is used in shared replays
        this.handleReplayIndicator.call(this, msgData);
    }
};
*/
