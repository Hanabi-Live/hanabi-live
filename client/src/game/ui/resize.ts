// We want to redraw the stage if the user resizes their browser window

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

    // Unbind game keybindings
    // (commented out because this would unbind the lobby hotkeys)
    // $(document).off('keydown');

    // Remove drawn elements to prep for a redraw
    globals.stage.destroy();
    globals.stage = new Konva.Stage({
        container: 'game',
    });

    // Reset stage to new window size
    sizeStage(globals.stage);

    winW = globals.stage.width();
    winH = globals.stage.height();

    // Rebuild UI elements and cards to new scaling
    self.drawCards();
    self.drawUI();

    self.reset();

    // This resets all the messages so that everything shows up again,
    // since the server doesn't replay them and the client only draws streamed
    // information and doesn't maintain a full game state
    if (globals.metadata.replay) {
        rebuildReplay();
    } else {
        // Rebuilds for a game
        let msg;
        let whoseTurn = 0;

        // Iterate over all moves to date
        for (let i = 0; i < globals.metadata.replayLog.length; i++) {
            msg = globals.metadata.replayLog[i];

            // Re-process all game actions; this will correctly position cards and text
            action(msg);

            // Correctly record and handle whose turn it is
            if (msg.type === 'turn') {
                whoseTurn = msg.who;
            }
        }

        // If it's your turn, setup the clue area
        if (whoseTurn === globals.metadata.ourPlayerIndex && !globals.metadata.spectating) {
            ui.handleAction();
        }

        // Setup the timers
        // (fix this to "timer.update()" and test)
        // self.handleClock.call(self, self.activeClockIndex);
    }

    // Restore Replay Button if applicable
    if (!globals.metadata.replay && globals.metadata.replayMax > 0) {
        replayButton.show();
    }

    // Restore Shared Replay Button if applicable
    if (globals.metadata.sharedReplay) {
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
