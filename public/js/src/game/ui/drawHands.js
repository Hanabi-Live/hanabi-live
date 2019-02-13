// Imports
const globals = require('./globals');
const CardLayout = require('./cardLayout');
const constants = require('../../constants');
const graphics = require('./graphics');
const HanabiNameFrame = require('./nameFrame');

module.exports = () => {
    // Constants
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();
    const numPlayers = globals.playerNames.length;

    // Local variables
    let rect;

    /* eslint-disable object-curly-newline */

    const handPos = {
        2: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
            { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0 },
        ],
        3: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
            { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78 },
            { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78 },
        ],
        4: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78 },
            { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78 },
        ],
        5: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90 },
            { x: 0.025, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.445, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.77, y: 0.22, w: 0.301, h: 0.18, rot: 90 },
        ],
    };

    const handPosBGA = {
        2: [],
        3: [],
        4: [],
        5: [],
    };

    const handPosBGAValues = {
        x: 0.44,
        y: 0.04,
        w: 0.34,
        h: 0.16,
        spacing: 0.24,
    };
    for (let i = 2; i <= 5; i++) {
        let handX = handPosBGAValues.x;
        let handY = handPosBGAValues.y;
        let handW = handPosBGAValues.w;
        let handSpacing = handPosBGAValues.spacing;
        if (i >= 4) {
            // The hands only have 4 cards instead of 5,
            // so we need to slightly reposition the hands horizontally
            handX += 0.03;
            handW -= 0.07;
        }
        if (i === 5) {
            handY -= 0.03;
            handSpacing -= 0.042;
        }

        for (let j = 0; j < i; j++) {
            handPosBGA[i].push({
                x: handX,
                y: handY + (handSpacing * j),
                w: handW,
                h: handPosBGAValues.h,
                rot: 0,
            });
        }
    }

    // Set the hand positions for 4-player and 5-player
    // (with 4 cards in the hand)
    const handPosBGAValues4 = {
        x: 0.47,
        y: handPosBGAValues.y,
        w: 0.27,
        h: handPosBGAValues.h,
        rot: handPosBGAValues.rot,
        spacing: handPosBGAValues.spacing,
    };
    for (let j = 0; j < 4; j++) {
        handPosBGA[4].push({
            x: handPosBGAValues4.x,
            y: handPosBGAValues4.y + (handPosBGAValues4.spacing * j),
            w: handPosBGAValues4.w,
            h: handPosBGAValues4.h,
            rot: handPosBGAValues4.rot,
        });
    }

    // This is the position for the white shade that shows where the new side of the hand is
    // (there is no shade on the Board Game Arena mode)
    const shadePos = {
        2: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
            { x: 0.185, y: 0.002, w: 0.43, h: 0.205, rot: 0 },
        ],
        3: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
            { x: 0.005, y: 0.718, w: 0.42, h: 0.205, rot: -78 },
            { x: 0.708, y: -0.008, w: 0.42, h: 0.205, rot: 78 },
        ],
        4: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.01, y: 0.708, w: 0.35, h: 0.205, rot: -78 },
            { x: 0.225, y: 0.002, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.718, y: 0.087, w: 0.35, h: 0.205, rot: 78 },
        ],
        5: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.026, y: 0.775, w: 0.311, h: 0.196, rot: -90 },
            { x: 0.02, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.44, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.774, y: 0.215, w: 0.311, h: 0.196, rot: 90 },
        ],
    };

    const namePosValues = {
        h: 0.02,
    };
    const namePos = {
        2: [
            { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
            { x: 0.18, y: 0.21, w: 0.44, h: namePosValues.h },
        ],
        3: [
            { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
            { x: 0.01, y: 0.765, w: 0.12, h: namePosValues.h },
            { x: 0.67, y: 0.765, w: 0.12, h: namePosValues.h },
        ],
        4: [
            { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
            { x: 0.01, y: 0.74, w: 0.13, h: namePosValues.h },
            { x: 0.22, y: 0.21, w: 0.36, h: namePosValues.h },
            { x: 0.66, y: 0.74, w: 0.13, h: namePosValues.h },
        ],
        5: [
            { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
            { x: 0.025, y: 0.775, w: 0.116, h: namePosValues.h },
            { x: 0.015, y: 0.199, w: 0.36, h: namePosValues.h },
            { x: 0.435, y: 0.199, w: 0.36, h: namePosValues.h },
            { x: 0.659, y: 0.775, w: 0.116, h: namePosValues.h },
        ],
    };

    const namePosBGAMod = {
        x: -0.01,
        y: 0.17,
        w: 0.02,
    };
    const namePosBGA = {
        2: [],
        3: [],
        4: [],
        5: [],
    };
    for (let i = 2; i <= 5; i++) {
        for (let j = 0; j < i; j++) {
            namePosBGA[i].push({
                x: handPosBGA[i][j].x + namePosBGAMod.x,
                y: handPosBGA[i][j].y + namePosBGAMod.y,
                w: handPosBGA[i][j].w + namePosBGAMod.w,
                h: namePosValues.h,
            });
        }
    }

    /* eslint-enable object-curly-newline */

    const isHandReversed = (j) => {
        // By default, the hand is not reversed
        let reverse = false;

        if (j === 0) {
            // Reverse the ordering of the cards for our own hand
            // (for our hand, the oldest card is the first card, which should be on the right)
            reverse = true;
        }
        if (globals.lobby.settings.showBGAUI) {
            // If Board Game Arena mode is on, then we need to reverse every hand
            reverse = true;
        }
        if (globals.lobby.settings.reverseHands) {
            // If the "Reverse hand direction" option is turned on,
            // then we need to flip the direction of every hand
            reverse = !reverse;
        }

        return reverse;
    };

    // Draw the hands
    for (let i = 0; i < numPlayers; i++) {
        let j = i - globals.playerUs;

        if (j < 0) {
            j += numPlayers;
        }

        let playerHandPos = handPos;
        if (globals.lobby.settings.showBGAUI) {
            playerHandPos = handPosBGA;
        }

        let invertCards = false;
        if (i !== globals.playerUs) {
            // We want to flip the cards for other players
            invertCards = true;
        }
        if (globals.lobby.settings.showBGAUI) {
            // On the BGA layout, all the hands should not be flipped
            invertCards = false;
        }

        globals.elements.playerHands[i] = new CardLayout({
            x: playerHandPos[numPlayers][j].x * winW,
            y: playerHandPos[numPlayers][j].y * winH,
            width: playerHandPos[numPlayers][j].w * winW,
            height: playerHandPos[numPlayers][j].h * winH,
            rotation: playerHandPos[numPlayers][j].rot,
            align: 'center',
            reverse: isHandReversed(j),
            invertCards,
        });
        globals.layers.card.add(globals.elements.playerHands[i]);

        // Draw the faded shade that shows where the "new" side of the hand is
        // (but don't bother drawing it in Board Game Arena mode since
        // all the hands face the same way)
        if (!globals.lobby.settings.showBGAUI) {
            rect = new graphics.Rect({
                x: shadePos[numPlayers][j].x * winW,
                y: shadePos[numPlayers][j].y * winH,
                width: shadePos[numPlayers][j].w * winW,
                height: shadePos[numPlayers][j].h * winH,
                rotation: shadePos[numPlayers][j].rot,
                cornerRadius: 0.01 * shadePos[numPlayers][j].w * winW,
                opacity: 0.4,
                fillLinearGradientStartPoint: {
                    x: 0,
                    y: 0,
                },
                fillLinearGradientEndPoint: {
                    x: shadePos[numPlayers][j].w * winW,
                    y: 0,
                },
                fillLinearGradientColorStops: [
                    0,
                    'rgba(0,0,0,0)',
                    0.9,
                    'white',
                ],
            });

            if (isHandReversed(j)) {
                rect.setFillLinearGradientColorStops([
                    1,
                    'rgba(0,0,0,0)',
                    0.1,
                    'white',
                ]);
            }

            globals.layers.background.add(rect);
        }

        let playerNamePos = namePos;
        if (globals.lobby.settings.showBGAUI) {
            playerNamePos = namePosBGA;
        }
        globals.elements.nameFrames[i] = new HanabiNameFrame({
            x: playerNamePos[numPlayers][j].x * winW,
            y: playerNamePos[numPlayers][j].y * winH,
            width: playerNamePos[numPlayers][j].w * winW,
            height: playerNamePos[numPlayers][j].h * winH,
            name: globals.playerNames[i],
            playerNum: i,
        });
        globals.layers.UI.add(globals.elements.nameFrames[i]);

        // Draw the "Detrimental Character Assignments" icon and tooltip
        if (globals.characterAssignments.length > 0) {
            const width2 = 0.03 * winW;
            const height2 = 0.03 * winH;
            const charIcon = new graphics.Text({
                width: width2,
                height: height2,
                x: playerNamePos[numPlayers][j].x * winW - width2 / 2,
                y: playerNamePos[numPlayers][j].y * winH - height2 / 2,
                fontSize: 0.03 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text: constants.CHARACTERS[globals.characterAssignments[i]].emoji,
                fill: 'yellow',
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 0,
                    y: 0,
                },
                shadowOpacity: 0.9,
            });
            globals.layers.UI.add(charIcon);

            charIcon.on('mousemove', function charIconMouseMove() {
                globals.activeHover = this;

                const tooltipX = this.getWidth() / 2 + this.attrs.x;
                const tooltip = $(`#tooltip-character-assignment-${i}`);
                tooltip.css('left', tooltipX);
                tooltip.css('top', this.attrs.y);

                const character = constants.CHARACTERS[globals.characterAssignments[i]];
                const metadata = globals.characterMetadata[i];
                let content = `<b>${character.name}</b>:<br />${character.description}`;
                if (content.includes('[random color]')) {
                    // Replace "[random color]" with the selected color
                    content = content.replace('[random color]', globals.variant.clueColors[metadata].name.toLowerCase());
                } else if (content.includes('[random number]')) {
                    // Replace "[random number]" with the selected number
                    content = content.replace('[random number]', metadata);
                } else if (content.includes('[random suit]')) {
                    // Replace "[random suit]" with the selected suit name
                    content = content.replace('[random suit]', globals.variant.suits[metadata].name);
                }
                tooltip.tooltipster('instance').content(content);

                tooltip.tooltipster('open');
            });
            charIcon.on('mouseout', () => {
                const tooltip = $(`#tooltip-character-assignment-${i}`);
                tooltip.tooltipster('close');
            });
        }
    }
};
