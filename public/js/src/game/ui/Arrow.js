/*
    The arrow class is a more simplified version of the card arrow
    (it is only used for indication on UI objects in shared replays)
*/

// Imports
const graphics = require('./graphics');

class Arrow extends graphics.Group {
    constructor(config) {
        config.offset = {
            x: config.x,
            y: config.y,
        };
        config.visible = false;
        config.listening = false;
        super(config);

        const border = new graphics.Arrow({
            points: [
                config.x,
                0,
                config.x,
                config.y * 0.8,
            ],
            pointerLength: 20,
            pointerWidth: 20,
            fill: 'black',
            stroke: 'black',
            strokeWidth: 40,
            shadowBlur: 75,
            shadowOpacity: 1,
        });
        this.add(border);

        const edge = new graphics.Line({
            points: [
                config.x - 20,
                0,
                config.x + 20,
                0,
            ],
            fill: 'black',
            stroke: 'black',
            strokeWidth: 15,
        });
        this.add(edge);

        this.base = new graphics.Arrow({
            points: [
                config.x,
                0,
                config.x,
                config.y * 0.8,
            ],
            pointerLength: 20,
            pointerWidth: 20,
            fill: 'white',
            stroke: 'white',
            strokeWidth: 25,
        });
        this.add(this.base);
    }
}

module.exports = Arrow;
