const PIXI = require('pixi.js');
const globals = require('../globals');

let requestID;

const animate = () => {
    requestID = window.requestAnimationFrame(animate);
    globals.app.render();
    PIXI.tweenManager.update();
};
exports.animate = animate;

exports.stop = () => {
    window.cancelAnimationFrame(requestID);
};
