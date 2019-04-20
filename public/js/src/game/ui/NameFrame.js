// Imports
const constants = require('../../constants');
const globals = require('./globals');
const graphics = require('./graphics');
const tooltips = require('./tooltips');
const ui = require('./ui');

class NameFrame extends graphics.Group {
    constructor(config) {
        config.listening = true;
        super(config);

        // Class variables
        this.playerIndex = config.playerIndex;

        this.name = new graphics.Text({
            x: config.width / 2,
            y: 0,
            height: config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: config.height,
            text: config.name,
            fill: constants.LABEL_COLOR,
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

        this.name.on('click tap', function click(event) {
            const username = this.getText();
            if (event.evt.which === 1) { // Left-click
                // Left-click on the name frame to see a log of only their actions
                globals.elements.fullActionLog.showPlayerActions(username);
            } else if (event.evt.which === 3) { // Right-click
                if (!globals.replay && globals.spectating) {
                    // As a spectator,
                    // right-click on the name frame to spectate the game from their perspective
                    setTimeout(() => {
                        globals.lobby.conn.send('gameSpectate', {
                            gameID: globals.id,
                            player: username,
                        });
                    }, 20);
                    ui.backToLobby();
                } else if (globals.sharedReplay) {
                    // In a shared replay,
                    // right-click on the name frame to pass the replay leader to them
                    giveLeader(username);
                }
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
            stroke: constants.LABEL_COLOR,
            strokeWidth: 1,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0,
            listening: false,
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
            stroke: constants.LABEL_COLOR,
            strokeWidth: 1,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0,
            listening: false,
        });
        this.add(this.rightline);

        // Draw the tooltips on the player names that show the time
        // (we don't use the "tooltip.init()" function because we need the extra condition in the
        // "mousemove" and "mouseout" event)
        this.tooltipName = `player-${this.playerIndex}`;
        this.on('mousemove', function mouseMove() {
            globals.activeHover = this;

            // Don't do anything if we are in a solo/shared replay
            if (globals.replay) {
                return;
            }

            tooltips.show(this);
        });
        this.on('mouseout', () => {
            globals.activeHover = null;

            // Don't do anything if we are in a solo/shared replay
            if (globals.replay) {
                return;
            }

            const tooltip = $(`#tooltip-${this.tooltipName}`);
            tooltip.tooltipster('close');
        });
    }

    setActive(active) {
        this.leftline.setStrokeWidth(active ? 3 : 1);
        this.rightline.setStrokeWidth(active ? 3 : 1);

        this.name.setShadowOpacity(active ? 0.6 : 0);
        this.leftline.setShadowOpacity(active ? 0.6 : 0);
        this.rightline.setShadowOpacity(active ? 0.6 : 0);

        this.name.setFontStyle(active ? 'bold' : 'normal');
    }

    setConnected(connected) {
        const color = connected ? constants.LABEL_COLOR : '#e8233d'; // Red for disconnected players

        this.leftline.setStroke(color);
        this.rightline.setStroke(color);
        this.name.setFill(color);
    }
}

module.exports = NameFrame;

/*
    Misc. functions
*/

// Transfer leadership of the shared replay to another player
const giveLeader = (username) => {
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
