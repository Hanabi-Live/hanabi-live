// Imports
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');

const TimerDisplay = function TimerDisplay(config) {
    graphics.Group.call(this, config);

    const rectangle = new graphics.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: 'black',
        cornerRadius: config.cornerRadius,
        opacity: 0.2,
        listening: false,
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
        listening: false,
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
        listening: false,
    });
    this.add(this.labelText);
};
graphics.Util.extend(TimerDisplay, graphics.Group);

TimerDisplay.prototype.setTimerText = function setTimerText(s) {
    this.timerText.setText(s);
};

TimerDisplay.prototype.setLabelText = function setLabelText(s) {
    this.labelText.setText(s);
};

module.exports = TimerDisplay;
