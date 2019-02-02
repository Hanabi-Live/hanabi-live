const NumberButton = function NumberButton(config) {
    Kinetic.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    const background = new Kinetic.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });

    this.add(background);

    const text = new Kinetic.Text({
        x: 0,
        y: 0.275 * h, // 0.25 is too high for some reason
        width: w,
        height: 0.5 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        text: config.number.toString(),
    });

    this.add(text);

    this.pressed = false;

    this.clue = config.clue;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().draw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().draw();

            background.off('mouseup');
            background.off('mouseout');
        };

        background.on('mouseout', () => {
            resetButton();
        });
        background.on('mouseup', () => {
            resetButton();
        });
    });
};

Kinetic.Util.extend(NumberButton, Kinetic.Group);

NumberButton.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = NumberButton;
