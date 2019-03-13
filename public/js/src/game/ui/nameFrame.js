// Imports
const globals = require('./globals');
const constants = require('../../constants');
const graphics = require('./graphics');

const NameFrame = function NameFrame(config) {
    graphics.Group.call(this, config);

    this.name = new graphics.Text({
        x: config.width / 2,
        y: 0,
        height: config.height,
        align: 'center',
        fontFamily: 'Verdana',
        fontSize: config.height,
        text: config.name,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0.9,
    });

    let w = this.name.getWidth();

    while (w > 0.65 * config.width && this.name.getFontSize() > 5) {
        this.name.setFontSize(this.name.getFontSize() * 0.9);

        w = this.name.getWidth();
    }

    this.name.setOffsetX(w / 2);
    const nameTextObject = this.name;

    // Left-click on the name frame to see a log of only their actions
    // Right-click on the name frame to pass the replay leader to them
    this.name.on('click tap', (event) => {
        const username = nameTextObject.getText();
        if (event.evt.which === 1) { // Left-click
            globals.elements.msgLogGroup.showPlayerActions(username);
        } else if (event.evt.which === 3) { // Right-click
            this.giveLeader(username);
        }
    });
    this.add(this.name);

    w *= 1.4;

    this.leftline = new graphics.Line({
        points: [
            0,
            0,
            0,
            config.height / 2,
            config.width / 2 - w / 2,
            config.height / 2,
        ],
        stroke: '#d8d5ef',
        strokeWidth: 1,
        lineJoin: 'round',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0,
    });

    this.add(this.leftline);

    this.rightline = new graphics.Line({
        points: [
            config.width / 2 + w / 2,
            config.height / 2,
            config.width,
            config.height / 2,
            config.width,
            0,
        ],
        stroke: '#d8d5ef',
        strokeWidth: 1,
        lineJoin: 'round',
        shadowColor: 'black',
        shadowBlur: 5,
        shadowOffset: {
            x: 0,
            y: 3,
        },
        shadowOpacity: 0,
    });

    this.add(this.rightline);

    // Draw the tooltips on the player names that show the time
    this.playerNum = config.playerNum;
    this.on('mousemove', function mouseMove() {
        // Don't do anything if we are already hovering on something
        if (globals.activeHover !== null) {
            return;
        }

        // Don't do anything if we are in a solo/shared replay
        if (globals.replay) {
            return;
        }

        globals.activeHover = this;

        const tooltipX = this.getWidth() / 2 + this.attrs.x;
        const tooltip = $(`#tooltip-player-${this.playerNum}`);
        tooltip.css('left', tooltipX);
        tooltip.css('top', this.attrs.y);
        tooltip.tooltipster('open');
    });
    this.on('mouseout', () => {
        globals.activeHover = null;

        // Don't do anything if we are in a solo/shared replay
        if (globals.replay) {
            return;
        }

        const tooltip = $(`#tooltip-player-${this.playerNum}`);
        tooltip.tooltipster('close');
    });

    /*
    // Define a pulsating animation that represents that it is this player's turn
    this.tween = new graphics.Tween({
        node: this.name,
        x: 280,
        easing: graphics.Easings.Linear,
        duration: 2,
    });
    */
};

graphics.Util.extend(NameFrame, graphics.Group);

// Transfer leadership of the shared replay to another player
NameFrame.prototype.giveLeader = function giveLeader(username) {
    // Only proceed if we are in a shared replay
    if (!globals.sharedReplay) {
        return;
    }

    // Only proceed if we are the replay leader
    if (!globals.amSharedReplayLeader) {
        return;
    }

    // Only proceed if we chose someone else
    if (username === globals.lobby.username) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.LEADER_TRANSFER,
        name: username,
    });
};

NameFrame.prototype.setActive = function setActive(active) {
    this.leftline.setStrokeWidth(active ? 3 : 1);
    this.rightline.setStrokeWidth(active ? 3 : 1);

    this.name.setShadowOpacity(active ? 0.6 : 0);
    this.leftline.setShadowOpacity(active ? 0.6 : 0);
    this.rightline.setShadowOpacity(active ? 0.6 : 0);

    this.name.setFontStyle(active ? 'bold' : 'normal');

    // this.tween.play();
};

NameFrame.prototype.setConnected = function setConnected(connected) {
    const color = connected ? '#d8d5ef' : '#e8233d';

    this.leftline.setStroke(color);
    this.rightline.setStroke(color);
    this.name.setFill(color);
};

module.exports = NameFrame;
