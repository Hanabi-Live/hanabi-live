// Imports
const Button = require('./button');
const graphics = require('./graphics');

const ClueRecipientButton = function ClueRecipientButton(config) {
    Button.call(this, config);
    this.targetIndex = config.targetIndex;
};

graphics.Util.extend(ClueRecipientButton, Button);

module.exports = ClueRecipientButton;
