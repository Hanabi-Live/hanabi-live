// Imports
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');

class TimerDisplay extends graphics.Group {
    constructor(config) {
        config.listening = true;
        super(config);

        const rectangle = new graphics.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            fill: 'black',
            cornerRadius: config.cornerRadius,
            opacity: 0.2,
        });
        this.add(rectangle);

        this.timerText = new FitText({
            x: 0,
            y: config.spaceH,
            width: config.width,
            height: config.height,
            fontSize: config.fontSize,
            fontFamily: 'Verdana',
            align: 'center',
            text: '??:??',
            fill: globals.labelColor,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        this.add(this.timerText);

        this.labelText = new FitText({
            x: 0,
            y: 6 * config.spaceH,
            width: config.width,
            height: config.height,
            fontSize: config.labelFontSize || config.fontSize,
            fontFamily: 'Verdana',
            align: 'center',
            text: config.label,
            fill: globals.labelColor,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        this.add(this.labelText);

        this.on('click', (event) => {
            if (event.evt.which !== 3) { // Right-click
                // return;
            }

            /*
            let value = 'pause';
            if (!globals.ourTurn) {
                value = 'pause-queue'
            }
            globals.lobby.conn.send('pause', {
                value,
            });
            */
        });
    }

    setTimerText(text) {
        this.timerText.setText(text);
    }

    setLabelText(text) {
        this.labelText.setText(text);
    }
}

module.exports = TimerDisplay;
