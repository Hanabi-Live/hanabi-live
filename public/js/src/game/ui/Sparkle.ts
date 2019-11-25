// Imports
import Konva from 'konva';

export default class Sparkle extends Konva.Image {
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
