// Imports
const Button = require('./Button');
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');
const hypothetical = require('./hypothetical');
const replay = require('./replay');
const ToggleButton = require('./ToggleButton');

module.exports = () => {
    // Constants
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    const replayAreaValues = {
        x: 0.15,
        y: 0.51,
        w: 0.5,
    };
    if (!globals.lobby.settings.showKeldonUI) {
        replayAreaValues.x = 0.01;
        replayAreaValues.y = 0.49;
        replayAreaValues.w = 0.4;
    }

    globals.elements.replayArea = new graphics.Group({
        x: replayAreaValues.x * winW,
        y: replayAreaValues.y * winH,
        width: replayAreaValues.w * winW,
        height: 0.27 * winH,
    });

    // The thin black rectangle that the replay slider slides on
    const replayBar = new graphics.Rect({
        x: 0,
        y: 0.0425 * winH,
        width: replayAreaValues.w * winW,
        height: 0.01 * winH,
        fill: 'black',
        cornerRadius: 0.005 * winH,
    });
    globals.elements.replayArea.add(replayBar);

    // An invisible rectangle over the visible black rectangle above
    // (which is slightly bigger so that it is easier to click on)
    const replayBarClickRect = new graphics.Rect({
        x: 0,
        y: 0,
        width: replayAreaValues.w * winW,
        height: 0.05 * winH,
        opacity: 0,
        listening: true,
    });
    replayBarClickRect.on('click', replay.barClick);
    globals.elements.replayArea.add(replayBarClickRect);

    const shuttleValues = {
        x: 0,
        y: 0.0325,
        w: 0.03,
        h: 0.03,
        cornerRadius: 0.01,
        stroke: 3,
    };

    // The shared (white) replay shuttle
    // (we want it to be below the normal replay shuttle, so we define it first)
    globals.elements.replayShuttleShared = new graphics.Rect({
        x: shuttleValues.x,
        y: shuttleValues.y * winH,
        width: shuttleValues.w * winW,
        height: shuttleValues.h * winH,
        cornerRadius: shuttleValues.cornerRadius * winW,
        fill: '#d1d1d1', // Gray
        stroke: shuttleValues.stroke,
        visible: !globals.useSharedTurns,
        listening: true,
    });
    globals.elements.replayShuttleShared.on('click tap', () => {
        // This is needed because the shared replay shuttle will block the replay bar
        replay.goto(globals.sharedReplayTurn, true);
    });
    globals.elements.replayArea.add(globals.elements.replayShuttleShared);

    // This is the normal (blue) replay shuttle
    globals.elements.replayShuttle = new graphics.Rect({
        x: shuttleValues.x,
        y: shuttleValues.y * winH,
        width: shuttleValues.w * winW,
        height: shuttleValues.h * winH,
        fill: '#0000cc', // Blue
        cornerRadius: shuttleValues.cornerRadius * winW,
        draggable: true,
        dragBoundFunc: replay.barDrag,
        stroke: shuttleValues.stroke,
        listening: true,
    });
    globals.elements.replayArea.add(globals.elements.replayShuttle);

    replay.adjustShuttles();

    const replayButtonValues = {
        x: 0.05,
        y: 0.07,
        w: 0.06,
        h: 0.08,
        spacing: 0.02,
    };
    if (globals.lobby.settings.showKeldonUI) {
        replayButtonValues.x = 0.1;
    }

    {
        let { x } = replayButtonValues;

        // Go back to the beginning (the left-most button)
        globals.elements.replayBackFullButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-back-full',
        });
        globals.elements.replayBackFullButton.on('click tap', replay.backFull);
        globals.elements.replayArea.add(globals.elements.replayBackFullButton);

        // Go back one turn (the second left-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayBackButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-back',
        });
        globals.elements.replayBackButton.on('click tap', replay.back);
        globals.elements.replayArea.add(globals.elements.replayBackButton);

        // Go forward one turn (the second right-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayForwardButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-forward',
        });
        globals.elements.replayForwardButton.on('click tap', replay.forward);
        globals.elements.replayArea.add(globals.elements.replayForwardButton);

        // Go forward to the end (the right-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayForwardFullButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-forward-full',
        });
        globals.elements.replayForwardFullButton.on('click tap', replay.forwardFull);
        globals.elements.replayArea.add(globals.elements.replayForwardFullButton);
    }

    // The "Exit Replay" button
    const bottomButtonValues = {
        y: 0.17,
    };
    globals.elements.replayExitButton = new Button({
        x: (replayButtonValues.x + replayButtonValues.w + (replayButtonValues.spacing / 2)) * winW,
        y: bottomButtonValues.y * winH,
        width: ((replayButtonValues.w * 2) + (replayButtonValues.spacing * 2)) * winW,
        height: replayButtonValues.w * winH,
        text: 'Exit Replay',
        visible: !globals.replay,
    });
    globals.elements.replayExitButton.on('click tap', replay.exitButton);
    globals.elements.replayArea.add(globals.elements.replayExitButton);

    const extra = 0.05;
    const bottomLeftReplayButtonValues = {
        x: replayButtonValues.x - extra,
        y: bottomButtonValues.y,
        w: replayButtonValues.w * 2 + replayButtonValues.spacing + extra,
        h: 0.06,
    };

    // The "Pause Shared Turns"  / "Use Shared Turns" button
    // (this will be shown when the client receives the "replayLeader" command)
    globals.elements.toggleSharedTurnButton = new ToggleButton({
        width: bottomLeftReplayButtonValues.w * winW,
        height: bottomLeftReplayButtonValues.h * winH,
        text: 'Pause Shared Turns',
        text2: 'Use Shared Turns',
        initialState: !globals.useSharedTurns,
        visible: false,
    });
    // It will be centered if there is only 1 button (and moved left otherwise)
    const totalWidth = (replayButtonValues.w * 4) + (replayButtonValues.spacing * 3);
    globals.elements.toggleSharedTurnButton.setCenter = function setCenter() {
        const x = replayButtonValues.x + ((totalWidth - bottomLeftReplayButtonValues.w) / 2);
        this.setX(x * winW);
        this.setY(bottomLeftReplayButtonValues.y * winH);
    };
    globals.elements.toggleSharedTurnButton.setLeft = function setLeft() {
        this.setX(bottomLeftReplayButtonValues.x * winW);
        this.setY(bottomLeftReplayButtonValues.y * winH);
    };
    globals.elements.toggleSharedTurnButton.on('click tap', replay.toggleSharedTurns);
    globals.elements.replayArea.add(globals.elements.toggleSharedTurnButton);

    const bottomRightReplayButtonValues = {
        x: replayButtonValues.x + (replayButtonValues.w * 2) + (replayButtonValues.spacing * 2),
        y: bottomLeftReplayButtonValues.y,
        w: bottomLeftReplayButtonValues.w,
        h: bottomLeftReplayButtonValues.h,
    };

    // The "Enter Hypothetical" / "Exit Hypothetical" button
    globals.elements.toggleHypoButton = new ToggleButton({
        x: bottomRightReplayButtonValues.x * winW,
        y: bottomRightReplayButtonValues.y * winH,
        width: bottomRightReplayButtonValues.w * winW,
        height: bottomRightReplayButtonValues.h * winH,
        text: 'Enter Hypothetical',
        text2: 'Exit Hypothetical',
        initialState: globals.hypothetical,
        visible: globals.replay && globals.amSharedReplayLeader,
    });
    globals.elements.toggleHypoButton.on('click tap', hypothetical.toggle);
    globals.elements.replayArea.add(globals.elements.toggleHypoButton);

    // The "Hypothetical" circle that shows whether or not we are currently in a hypothetical
    globals.elements.hypoCircle = new graphics.Group({
        x: bottomRightReplayButtonValues.x * winW,
        y: bottomRightReplayButtonValues.y * winH,
        visible: globals.hypothetical && !globals.amSharedReplayLeader,
    });
    globals.elements.replayArea.add(globals.elements.hypoCircle);

    const circle = new graphics.Ellipse({
        x: 0.085 * winW,
        y: 0.03 * winH,
        radiusX: 0.08 * winW,
        radiusY: 0.03 * winH,
        fill: 'black',
        opacity: 0.5,
        stroke: 'black',
        strokeWidth: 4,
    });
    globals.elements.hypoCircle.add(circle);

    const text = new FitText({
        name: 'text',
        x: 0.027 * winW,
        y: 0.016 * winH,
        width: bottomRightReplayButtonValues.w * 0.65 * winW,
        fontSize: 0.5 * winH,
        fontFamily: 'Verdana',
        fill: 'yellow',
        align: 'center',
        text: 'Hypothetical',
    });
    globals.elements.hypoCircle.add(text);

    // Add the replay area to the UI
    globals.elements.replayArea.hide();
    globals.layers.UI.add(globals.elements.replayArea);
};
