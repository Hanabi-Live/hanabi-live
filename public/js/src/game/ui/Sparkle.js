// Imports
const globals = require('./globals');
const graphics = require('./graphics');

class Sparkle extends graphics.Image {
    constructor(config) {
        config.image = globals.ImageLoader.get('sparkle');

        /*
        sceneFunc: (ctx) => {
            drawPips(suit, i)(ctx);
            ctx.closePath();
            ctx.fillStrokeShape(suitPip);
        },
        */

        config.listening = false;

        super(config);
    }

    /*
    draw(ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < this.options.count; i++) {
            const derpicle = this.particles[i];
            const modulus = Math.floor(Math.random() * 7);

            if (Math.floor(time) % modulus === 0) {
                derpicle.style = this.sprites[Math.floor(Math.random() * 4)];
            }

            ctx.save();
            ctx.globalAlpha = derpicle.opacity;
            ctx.drawImage(
                this.sprite,
                derpicle.style,
                0,
                7,
                7,
                derpicle.position.x,
                derpicle.position.y,
                7,
                7,
            );

            ctx.restore();
        }
    }
    */
}

module.exports = Sparkle;
