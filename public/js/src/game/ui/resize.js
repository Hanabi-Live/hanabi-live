/*
    We want to redraw the stage if the user resizes their browser window
*/

// This below code block deals with automatic resizing
// (this is commented out because it is currently broken)
// Runs each time the DOM window resize event fires
// Resets the canvas dimensions to match window,
// then draws the new borders accordingly

/*
// window.addEventListener('resize', resizeCanvas, false);

const resizeCanvas = () => {
    $('canvas').each((index, canvas) => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        $(canvas).css('width', window.innerWidth);
        $(canvas).css('height', window.innerHeight);
    });
    redraw();
}

const redraw = () => {
    const self = globals.lobby.ui;

    // Unbind duplicateable keybindings
    // (commented out because this would unbind the lobby hotkeys)
    // $(document).off('keydown');

    // Remove drawn elements to prep for a redraw
    globals.stage.destroy();
    globals.stage = new graphics.Stage({
        container: 'game',
    });

    // Reset stage to new window size
    sizeStage(globals.stage);

    winW = globals.stage.getWidth();
    winH = globals.stage.getHeight();

    // Rebuild UI elements and cards to new scaling
    self.drawCards();
    self.drawUI();

    self.reset();

    // This resets all the messages so that everything shows up again,
    // since the server doesn't replay them and the client only draws streamed
    // information and doesn't maintain a full game state
    if (globals.replay) {
        rebuildReplay();
    } else {
        // Rebuilds for a game
        let msg;
        let whoseTurn = 0;

        // Iterate over all moves to date
        for (let i = 0; i < globals.replayLog.length; i++) {
            msg = globals.replayLog[i];

            // Rebuild all notifies; this will correctly position cards and text
            ui.handleNotify(msg);

            // Correctly record and handle whose turn it is
            if (msg.type === 'turn') {
                whoseTurn = msg.who;
            }
        }

        // If it's your turn, setup the clue area
        if (whoseTurn === globals.playerUs && !globals.spectating) {
            ui.handleAction(globals.lastAction);
        }

        // Setup the timers
        // (TODO fix this to "timer.update()" and test)
        // self.handleClock.call(self, self.activeClockIndex);
    }

    // Restore Drag and Drop Functionality
    self.animateFast = false;

    // Restore Replay Button if applicable
    if (!globals.replay && globals.replayMax > 0) {
        replayButton.show();
    }

    // Restore Shared Replay Button if applicable
    if (globals.sharedReplay) {
        commands.replayLeader({
            name: globals.sharedReplayLeader,
        });
    }

    // Restore the spectator icon
    if (self.lastSpectators) {
        commands.spectators(self.lastSpectators);
    }

    // Restore message text and prompts
    actionLog.refreshText();
    fullActionLog.refreshText();

    // Redraw all layers
    for (const layer of globals.layers) {
        layer.batchDraw();
    }
}
*/
