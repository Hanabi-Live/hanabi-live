// Imports
import Konva from 'konva';
import backToLobby from './backToLobby';
import { LABEL_COLOR, REPLAY_ACTION_TYPE } from '../../constants';
import globals from './globals';
import * as tooltips from './tooltips';

export default class NameFrame extends Konva.Group {
    playerIndex: number;
    tooltipName: string;

    playerName: Konva.Text;
    leftLine: Konva.Line;
    rightLine: Konva.Line;

    constructor(config: Konva.ContainerConfig) {
        super(config);
        this.listening(true);

        if (typeof config.width === 'undefined') {
            throw new Error('A NameFrame was initialized without a width.');
        }
        if (typeof config.height === 'undefined') {
            throw new Error('A NameFrame was initialized without a height.');
        }

        // Class variables
        this.playerIndex = config.playerIndex;
        this.tooltipName = `player-${this.playerIndex}`;

        this.playerName = new Konva.Text({
            x: config.width / 2,
            y: 0,
            height: config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: config.height,
            text: config.name,
            fill: LABEL_COLOR,
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0.9,
        });

        let w = this.playerName.width();
        while (w > 0.65 * config.width && this.playerName.fontSize() > 5) {
            this.playerName.fontSize(this.playerName.fontSize() * 0.9);
            w = this.playerName.width();
        }
        this.playerName.offsetX(w / 2);

        this.playerName.on('click tap', function click(event) {
            const username = this.text();
            if (event.evt.which === 1) { // Left-click
                // Left-click on the name frame to see a log of only their actions
                globals.elements.fullActionLog!.showPlayerActions(username);
            } else if (event.evt.which === 3) { // Right-click
                if (!globals.replay && globals.spectating) {
                    // As a spectator,
                    // right-click on the name frame to spectate the game from their perspective
                    setTimeout(() => {
                        globals.lobby.conn.send('tableSpectate', {
                            tableID: globals.lobby.tableID,
                            player: username,
                        });
                    }, 20);
                    backToLobby();
                } else if (globals.sharedReplay) {
                    // In a shared replay,
                    // right-click on the name frame to pass the replay leader to them
                    giveLeader(username);
                }
            }
        });
        this.add(this.playerName);

        w *= 1.4;

        this.leftLine = new Konva.Line({
            points: [
                0,
                0,
                0,
                config.height / 2,
                (config.width / 2) - (w / 2),
                config.height / 2,
            ],
            stroke: LABEL_COLOR,
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
        this.add(this.leftLine);

        this.rightLine = new Konva.Line({
            points: [
                (config.width / 2) + (w / 2),
                config.height / 2,
                config.width,
                config.height / 2,
                config.width,
                0,
            ],
            stroke: LABEL_COLOR,
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
        this.add(this.rightLine);

        // Draw the tooltips on the player names that show the time
        // (we don't use the "tooltip.init()" function because we need the extra condition in the
        // "mousemove" and "mouseout" event)
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

    setActive(active: boolean) {
        this.leftLine.strokeWidth(active ? 3 : 1);
        this.rightLine.strokeWidth(active ? 3 : 1);

        this.playerName.shadowOpacity(active ? 0.6 : 0);
        this.leftLine.shadowOpacity(active ? 0.6 : 0);
        this.rightLine.shadowOpacity(active ? 0.6 : 0);

        this.playerName.fontStyle(active ? 'bold' : 'normal');
    }

    setConnected(connected: boolean) {
        const color = connected ? LABEL_COLOR : '#e8233d'; // Red for disconnected players

        this.leftLine.stroke(color);
        this.rightLine.stroke(color);
        this.playerName.fill(color);
    }
}

/*
    Misc. functions
*/

// Transfer leadership of the shared replay to another player
const giveLeader = (username: string) => {
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
        type: REPLAY_ACTION_TYPE.LEADER_TRANSFER,
        name: username,
    });
};
