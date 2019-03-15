// Imports
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

    const label = new graphics.Text({
        x: 0,
        y: 6 * config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.labelFontSize || config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: config.label,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(label);

    const text = new graphics.Text({
        x: 0,
        y: config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: '??:??',
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(text);

    this.setText = s => text.setText(s);
};
graphics.Util.extend(TimerDisplay, graphics.Group);

module.exports = TimerDisplay;
