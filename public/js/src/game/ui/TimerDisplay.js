// Imports
const constants = require('../../constants');
const FitText = require('./FitText');
const graphics = require('./graphics');

class TimerDisplay extends graphics.Group {
    constructor(config) {
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
            fill: constants.LABEL_COLOR,
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
            fill: constants.LABEL_COLOR,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });
        this.add(this.labelText);
    }

    setTimerText(text) {
        this.timerText.setText(text);
    }

    setLabelText(text) {
        this.labelText.setText(text);
    }
}

module.exports = TimerDisplay;
